import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logMarketingSpend } from '@/lib/services/MarketingOps';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadMarketingSpend } from '@/lib/marketing/spend-load';
import { spendQuality, SPEND_BASIS } from '@/lib/marketing/performance';
import { ubParts } from '@/lib/utils/date';
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
    return /marketing_budgets|marketing_spend_entries/i.test(error.message || '')
        && (error.code === '42P01' || error.code === 'PGRST205'
            || /does not exist|could not find .*table.*schema cache/i.test(error.message || ''));
}

const MIGRATION_HINT =
    'Төсвийн хүснэгтүүд үүсээгүй байна — 20260721140000_marketing_budget_indicators.sql миграцийг ажиллуулна уу';

export async function GET(request: NextRequest) {
    const year = Math.min(2100, Math.max(2020, parseInt(new URL(request.url).searchParams.get('year') || '', 10) || ubParts().year));
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const [budgetRes, allEntries, revenueRows] = await Promise.all([
            db.from('marketing_budgets').select('month, amount').eq('shop_id', authShop.id).eq('year', year),
            loadMarketingSpend(db, authShop.id, `${year}-01-01`, `${year}-12-31`),
            fetchAllRows((from, to) => db.from('manager_monthly_sales').select('month, actual_amount')
                .eq('shop_id', authShop.id).eq('year', year).order('sales_manager').order('month').range(from, to)),
        ]);

        if (budgetRes.error && isMissingTable(budgetRes.error)) {
            return NextResponse.json({ year, available: false });
        }
        if (budgetRes.error) throw budgetRes.error;

        const budgets = Array(12).fill(0);
        for (const r of budgetRes.data || []) {
            if (r.month >= 1 && r.month <= 12) budgets[r.month - 1] = Number(r.amount) || 0;
        }

        const entries = allEntries.filter(e => !e.exclusion);
        const spend = monthlySpendSeries(entries, year);

        const revenue = Array(12).fill(0);
        for (const r of revenueRows) {
            if (r.month >= 1 && r.month <= 12) revenue[r.month - 1] += Number(r.actual_amount) || 0;
        }

        return NextResponse.json({
            year,
            available: true,
            overview: buildBudgetOverview(budgets, spend, revenue),
            byChannel: spendByChannel(entries),
            entries: allEntries.slice(0, 100),
            metaAdsTotalSpend: entries.filter(e => e.source === 'meta').reduce((sum, e) => sum + Number(e.amount), 0),
            metaAdsSpendPeriod: 'daily_included',
            spendQuality: spendQuality(allEntries),
            spendBasis: SPEND_BASIS,
            channels: SPEND_CHANNELS,
        });
    } catch (error) {
        if (isMissingTable(error as { code?: string; message?: string } | null)) {
            return NextResponse.json({ year, available: false });
        }
        return safeErrorResponse(error, 'Төсвийн мэдээлэл унших алдаа');
    }
}

export async function PUT(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
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
        const denied = await requireModuleWrite('marketing-roi');
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

        const { data, error } = await logMarketingSpend(supabaseAdmin(), authShop.id, uid, parsed.data);

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
        const denied = await requireModuleDelete('marketing-roi');
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
