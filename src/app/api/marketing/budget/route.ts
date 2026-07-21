import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import {
    monthlySpendSeries,
    spendByChannel,
    buildBudgetOverview,
    SPEND_CHANNELS,
} from '@/lib/marketing/budget';

/**
 * GET/PUT/POST/DELETE /api/marketing/budget — маркетингийн төсвийн хяналт.
 *
 * GET ?year=  — жилийн тойм: сар бүрийн төсөв (marketing_budgets) vs
 *   зарцуулалт (marketing_spend_entries) vs борлуулалтын орлого
 *   (manager_monthly_sales — гэрээний дүн, самбартай ижил эх сурвалж),
 *   өнгөний төлөвтэй (ok/warn/over) + сувгийн задаргаа + Meta Ads нийт spend.
 * PUT  { year, months: [{month, amount}] } — төсвүүдийг upsert (бичих эрх).
 * POST { spentAt, amount, channel, note }  — зарцуулалт бүртгэх (бичих эрх).
 * DELETE ?id= — зарцуулалтын мөрийг зөөлөн устгах (бичих эрх).
 * Миграци ороогүй орчинд GET хоосон + available:false, бичилт 503 (жишиг хэвээр).
 */

const PutSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    months: z
        .array(z.object({ month: z.number().int().min(1).max(12), amount: z.number().min(0) }))
        .min(1)
        .max(12),
});

const SpendSchema = z.object({
    spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD форматтай байна'),
    amount: z.number().min(0),
    channel: z.string().max(50).default('other'),
    note: z.string().max(1000).optional().nullable(),
});

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || /marketing_budgets|marketing_spend_entries/i.test(error.message || '');
}

const MIGRATION_HINT =
    'Төсвийн хүснэгтүүд үүсээгүй байна — 20260721140000_marketing_budget_indicators.sql миграцийг ажиллуулна уу';

export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const now = new Date();
        const year = Math.min(2100, Math.max(2020, parseInt(searchParams.get('year') || '', 10) || now.getFullYear()));

        const db = supabaseAdmin();
        const [budgetRes, spendRes, revenueRes, adsRes] = await Promise.all([
            db.from('marketing_budgets').select('month, amount').eq('shop_id', authShop.id).eq('year', year),
            db
                .from('marketing_spend_entries')
                .select('id, spent_at, amount, channel, note, created_at')
                .eq('shop_id', authShop.id)
                .is('deleted_at', null)
                .gte('spent_at', `${year}-01-01`)
                .lte('spent_at', `${year}-12-31`)
                .order('spent_at', { ascending: false })
                .limit(500),
            db.from('manager_monthly_sales').select('month, actual_amount').eq('shop_id', authShop.id).eq('year', year),
            db.from('ad_campaigns').select('spend').eq('shop_id', authShop.id),
        ]);

        if (budgetRes.error && isMissingTable(budgetRes.error)) {
            return NextResponse.json({ year, available: false });
        }

        const budgets = Array(12).fill(0);
        for (const r of budgetRes.data || []) {
            if (r.month >= 1 && r.month <= 12) budgets[r.month - 1] = Number(r.amount) || 0;
        }

        const entries = spendRes.error ? [] : spendRes.data || [];
        const spend = monthlySpendSeries(entries, year);

        const revenue = Array(12).fill(0);
        for (const r of revenueRes.error ? [] : revenueRes.data || []) {
            if (r.month >= 1 && r.month <= 12) revenue[r.month - 1] += Number(r.actual_amount) || 0;
        }

        const metaAdsTotalSpend = (adsRes.error ? [] : adsRes.data || []).reduce(
            (a, c) => a + (Number(c.spend) || 0),
            0,
        );

        return NextResponse.json({
            year,
            available: true,
            overview: buildBudgetOverview(budgets, spend, revenue),
            byChannel: spendByChannel(entries),
            entries: entries.slice(0, 100),
            metaAdsTotalSpend,
            channels: SPEND_CHANNELS,
        });
    } catch (error) {
        return safeErrorResponse(error, 'Төсвийн мэдээлэл унших алдаа');
    }
}

export async function PUT(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = PutSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const db = supabaseAdmin();
        const rows = parsed.data.months.map((m) => ({
            shop_id: authShop.id,
            year: parsed.data.year,
            month: m.month,
            amount: m.amount,
            updated_at: new Date().toISOString(),
        }));
        const { error } = await db
            .from('marketing_budgets')
            .upsert(rows, { onConflict: 'shop_id,year,month' });

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
            }
            logger.error('[MarketingBudget] upsert error', { error: error.message });
            return NextResponse.json({ error: 'Төсөв хадгалах алдаа' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөв хадгалах алдаа');
    }
}

export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = SpendSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('marketing_spend_entries')
            .insert({
                shop_id: authShop.id,
                spent_at: parsed.data.spentAt,
                amount: parsed.data.amount,
                channel: SPEND_CHANNELS[parsed.data.channel] ? parsed.data.channel : 'other',
                note: parsed.data.note?.trim() || null,
                created_by: uid,
            })
            .select('id, spent_at, amount, channel, note, created_at')
            .single();

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
            }
            logger.error('[MarketingBudget] spend insert error', { error: error.message });
            return NextResponse.json({ error: 'Зарцуулалт бүртгэх алдаа' }, { status: 500 });
        }

        return NextResponse.json({ entry: data });
    } catch (error) {
        return safeErrorResponse(error, 'Зарцуулалт бүртгэх алдаа');
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });

        const db = supabaseAdmin();
        const { error } = await db
            .from('marketing_spend_entries')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', authShop.id);

        if (error) {
            logger.error('[MarketingBudget] spend delete error', { error: error.message });
            return NextResponse.json({ error: 'Устгах алдаа' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Устгах алдаа');
    }
}
