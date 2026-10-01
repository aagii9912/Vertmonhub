import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logMarketingSpend, upsertMarketingBudget } from '@/lib/services/MarketingOps';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadMarketingSpend } from '@/lib/marketing/spend-load';
import { dateSchema, spendQuality, SPEND_BASIS } from '@/lib/marketing/performance';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { ubParts } from '@/lib/utils/date';
import {
    monthlySpendSeries,
    spendByChannel,
    buildBudgetOverview,
    SPEND_CHANNELS,
    MarketingBudgetSchema,
    allocateAnnualBudget,
    budgetAmountSchema,
} from '@/lib/marketing/budget';

/**
 * GET/PUT/POST/DELETE /api/marketing/budget — маркетингийн төсвийн хяналт.
 *
 * GET ?year=&project= — жилийн тойм: байгууллага эсвэл сонгосон төслийн
 *   сар бүрийн төсөв vs бүртгэсэн зарцуулалт vs бодит гэрээний дүн,
 *   өнгөний төлөвтэй (ok/warn/over) + сувгийн задаргаа + Meta Ads нийт spend.
 * PUT { year, project_id?, annualAmount?, months? } — нэг хүсэлтээр 12 сарын төсөв.
 * POST { spentAt, amount, channel, note, project_id? } — зарцуулалт бүртгэх.
 * DELETE ?id= — зарцуулалтын мөрийг зөөлөн устгах (бичих эрх).
 * Миграци ороогүй орчинд GET хоосон + available:false, бичилт 503 (жишиг хэвээр).
 */

const SpendSchema = z.object({
    spentAt: dateSchema,
    amount: budgetAmountSchema.refine(v => v > 0, 'Зарцуулалт 0-ээс их байна'),
    project_id: z.string().uuid().nullable().optional(),
    channel: z.string().max(50).default('other'),
    note: z.string().max(1000).optional().nullable(),
});

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return /marketing_(?:project_)?budgets|marketing_spend_entries/i.test(error.message || '')
        && (error.code === '42P01' || error.code === 'PGRST205'
            || /does not exist|could not find .*table.*schema cache/i.test(error.message || ''));
}

const MIGRATION_HINT =
    'Төсвийн хүснэгтүүд үүсээгүй байна — 20260721140000_marketing_budget_indicators.sql миграцийг ажиллуулна уу';
const PROJECT_MIGRATION_HINT = 'Төслийн төсвийн хадгалалт бэлэн биш байна — 20261001120000_marketing_project_budgets.sql миграци шаардлагатай';

async function checkProject(db: SupabaseClient, shopId: string, projectId?: string | null) {
    if (!projectId) return null;
    const { data, error } = await db.from('projects').select('id').eq('shop_id', shopId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    return data ? null : NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
}

export async function GET(request: NextRequest) {
    let year = ubParts().year;
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const params = new URL(request.url).searchParams;
        const filter = z.object({ year: z.coerce.number().int().min(2020).max(2100), project: z.string().uuid().optional() })
            .safeParse({ year: params.get('year') ?? year, project: params.get('project') || undefined });
        if (!filter.success) return NextResponse.json({ error: 'Он эсвэл төсөл буруу байна' }, { status: 400 });
        year = filter.data.year;
        const projectId = filter.data.project;
        const db = supabaseAdmin();
        const projects = await fetchAllRows<{ id: string; name: string }>((from, to) => db.from('projects')
            .select('id,name').eq('shop_id', authShop.id).order('id').range(from, to));
        if (projectId && !projects.some(p => p.id === projectId)) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        let budgetQuery = db.from(projectId ? 'marketing_project_budgets' : 'marketing_budgets')
            .select('month,amount').eq('shop_id', authShop.id).eq('year', year);
        if (projectId) budgetQuery = budgetQuery.eq('project_id', projectId);
        const budgetRes = await budgetQuery;

        if (budgetRes.error && isMissingTable(budgetRes.error)) {
            return NextResponse.json({ year, project_id: projectId ?? null, projects, available: false,
                error: projectId ? PROJECT_MIGRATION_HINT : MIGRATION_HINT });
        }
        if (budgetRes.error) throw budgetRes.error;

        const [shopEntries, revenue] = await Promise.all([
            loadMarketingSpend(db, authShop.id, `${year}-01-01`, `${year}-12-31`),
            (async () => {
                const series = Array(12).fill(0);
                if (projectId) {
                    const contracts = await fetchAllRows<{ contract_date: string; contract_number: string | null; total_price: number | string | null; contract_status: string | null }>((from, to) => db
                        .from('property_contracts').select('contract_date,contract_number,total_price,contract_status')
                        .eq('shop_id', authShop.id).eq('project_id', projectId).is('deleted_at', null)
                        .gte('contract_date', `${year}-01-01`).lte('contract_date', `${year}-12-31`).order('id').range(from, to));
                    for (const r of contracts.filter(hasRealContractFields)) {
                        const month = Number(r.contract_date.slice(5, 7));
                        if (month >= 1 && month <= 12) series[month - 1] += Number(r.total_price) || 0;
                    }
                } else {
                    const rows = await fetchAllRows<{ month: number; actual_amount: number | string }>((from, to) => db.from('manager_monthly_sales')
                        .select('month,actual_amount').eq('shop_id', authShop.id).eq('year', year).order('sales_manager').order('month').range(from, to));
                    for (const r of rows) if (r.month >= 1 && r.month <= 12) series[r.month - 1] += Number(r.actual_amount) || 0;
                }
                return series;
            })(),
        ]);
        const allEntries = shopEntries.filter(e => !projectId || e.project_id === projectId);
        const budgets = Array(12).fill(0);
        for (const r of budgetRes.data || []) {
            if (r.month >= 1 && r.month <= 12) budgets[r.month - 1] = Number(r.amount) || 0;
        }

        const entries = allEntries.filter(e => !e.exclusion);
        const spend = monthlySpendSeries(entries, year);

        return NextResponse.json({
            year,
            project_id: projectId ?? null,
            projects,
            unassignedSpendCount: projectId ? shopEntries.filter(e => !e.project_id).length : 0,
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
        const parsed = MarketingBudgetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const db = supabaseAdmin();
        const projectDenied = await checkProject(db, authShop.id, parsed.data.project_id);
        if (projectDenied) return projectDenied;
        const months = parsed.data.months ?? allocateAnnualBudget(parsed.data.annualAmount!);
        const { error } = await upsertMarketingBudget(db, authShop.id, parsed.data.year, months, parsed.data.project_id);

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json({ error: parsed.data.project_id ? PROJECT_MIGRATION_HINT : MIGRATION_HINT }, { status: 503 });
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

        const db = supabaseAdmin();
        const projectDenied = await checkProject(db, authShop.id, parsed.data.project_id);
        if (projectDenied) return projectDenied;
        const { data, error } = await logMarketingSpend(db, authShop.id, uid, parsed.data);

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
        const projectId = searchParams.get('project');
        if (!z.string().uuid().safeParse(id).success || (projectId && !z.string().uuid().safeParse(projectId).success)) {
            return NextResponse.json({ error: 'ID эсвэл төсөл буруу байна' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const projectDenied = await checkProject(db, authShop.id, projectId);
        if (projectDenied) return projectDenied;
        let query = db
            .from('marketing_spend_entries')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null);
        if (projectId) query = query.eq('project_id', projectId);
        const { data, error } = await query.select('id').maybeSingle();

        if (error) {
            logger.error('[MarketingBudget] spend delete error', { error: error.message });
            return NextResponse.json({ error: 'Устгах алдаа' }, { status: 500 });
        }
        if (!data) return NextResponse.json({ error: 'Зарцуулалт олдсонгүй' }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Устгах алдаа');
    }
}
