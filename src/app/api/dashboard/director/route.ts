import { NextRequest, NextResponse } from 'next/server';
import { ubParts, ubMonthRange, ubDateStr } from '@/lib/utils/date';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getTeamTargets, getMonthlyActualsByManager, sumYear } from '@/lib/sales/targets';
import {
    buildFunnel,
    buildLeaderboard,
    buildOverdue,
    countByUnitType,
    attainmentPct,
    momDeltaPct,
    type DirectorPayload,
    type BlockRemaining,
} from '@/lib/dashboard/director';

/**
 * GET /api/dashboard/director?year=2026&month=9
 *
 * Захирлын самбарын бүх өгөгдөл НЭГ дуудлагаар:
 *   sales        — сарын борлуулалт vs зорилт (₮ + байр), 12 сарын trend
 *   leaderboard  — менежер бүрийн сарын гэрээ / борлуулалт / уулзалт / лид
 *   funnel       — эх үүсвэр бүрээр лид → уулзалт → гэрээ
 *   receivables  — хугацаа хэтэрсэн төлбөр (payment_schedules) + нийт үлдэгдэл
 *   inventory    — блок бүрийн үлдэгдэл байр (property_block_summary)
 *
 * Эрх: admin / super_admin, эсвэл `reports` модультай хэрэглэгч.
 * Хүснэгт/багана дутуу орчинд (миграци хийгдээгүй) тухайн хэсэг хоосон буцаж
 * `missing`-д нэр нь орно — 500 хэзээ ч буцахгүй.
 */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const perms = await resolvePermissions();
        const role = perms?.role || 'viewer';
        const modules = perms?.permissions.modules || [];
        const allowed = role === 'admin' || role === 'super_admin' || modules.includes('reports');
        if (!allowed) return NextResponse.json({ error: 'Эрх хүрэлцэхгүй' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const now = new Date();
        // Улаанбаатарын он/сар (сервер UTC — сарын 1-ний 00:00–08:00 УБ өмнөх сард ордог байв)
        const ubNow = ubParts(now);
        const year = clampInt(searchParams.get('year'), ubNow.year, 2020, 2100);
        const month = clampInt(searchParams.get('month'), ubNow.month, 1, 12);
        const monthIdx = month - 1;

        const { start: monthStart, end: monthEnd } = ubMonthRange(year, monthIdx);
        const ms = monthStart.toISOString();
        const me = monthEnd.toISOString();
        const msDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const meDate = monthIdx === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

        const db = supabaseAdmin();
        const shopId = authShop.id;
        const missing: string[] = [];

        const [targets, byManager, roster, contracts, viewings, leads, schedules, blocks, outstanding] = await Promise.all([
            getTeamTargets(db, shopId, year),
            getMonthlyActualsByManager(db, shopId, year),
            safe('roster', missing, async () => {
                const { data, error } = await db.from('sales_managers').select('name, is_active').eq('shop_id', shopId);
                if (error) throw error;
                return (data || []) as { name: string; is_active: boolean }[];
            }, [] as { name: string; is_active: boolean }[]),
            safe('contracts', missing, async () => {
                const base = () =>
                    db
                        .from('property_contracts')
                        .select('id, sales_manager, total_price, contract_status, unit_type, lead_id, customer_name, contract_number')
                        .eq('shop_id', shopId)
                        .gte('contract_date', msDate)
                        .lt('contract_date', meDate);
                let { data, error } = await base().is('deleted_at', null);
                if (error) ({ data, error } = await base());
                if (error) throw error;
                return (data || []) as ContractRow[];
            }, [] as ContractRow[]),
            safe('viewings', missing, async () => {
                const base = () =>
                    db
                        .from('property_viewings')
                        .select('id, sales_manager_name, lead_id, status')
                        .eq('shop_id', shopId)
                        .gte('scheduled_at', ms)
                        .lt('scheduled_at', me)
                        .neq('status', 'cancelled');
                let { data, error } = await base().is('deleted_at', null);
                if (error) ({ data, error } = await base());
                if (error) throw error;
                return (data || []) as ViewingRow[];
            }, [] as ViewingRow[]),
            safe('leads', missing, async () => {
                const base = () =>
                    db
                        .from('leads')
                        .select('id, source, sales_manager_name')
                        .eq('shop_id', shopId)
                        .gte('created_at', ms)
                        .lt('created_at', me);
                let { data, error } = await base().is('deleted_at', null);
                if (error) ({ data, error } = await base());
                if (error) throw error;
                return (data || []) as LeadRow[];
            }, [] as LeadRow[]),
            safe('receivables', missing, async () => {
                const { data, error } = await db
                    .from('payment_schedules')
                    .select('contract_id, due_date, amount, paid_amount, status')
                    .eq('shop_id', shopId)
                    .in('status', ['pending', 'partial', 'overdue'])
                    .lt('due_date', ubDateStr(now))
                    .order('due_date', { ascending: true })
                    .limit(1000);
                if (error) throw error;
                return (data || []) as ScheduleRow[];
            }, [] as ScheduleRow[]),
            safe('inventory', missing, async () => {
                const { data, error } = await db
                    .from('property_block_summary')
                    .select('phase, block, total_units, available_units, sold_units, pending_units')
                    .eq('shop_id', shopId);
                if (error) throw error;
                return (data || []) as BlockRow[];
            }, [] as BlockRow[]),
            safe('outstanding', missing, async () => {
                const { data, error } = await db
                    .from('manager_performance')
                    .select('total_outstanding')
                    .eq('shop_id', shopId);
                if (error) throw error;
                return (data || []).reduce((t, r) => t + (Number(r.total_outstanding) || 0), 0);
            }, 0),
        ]);

        /* ---------- sales vs target ---------- */
        const activeNames = roster.filter((r) => r.is_active).map((r) => r.name);
        const allow = activeNames.length ? new Set(activeNames) : null;
        const trendActual = Array(12).fill(0) as number[];
        for (const [name, m] of byManager) {
            if (allow && !allow.has(name)) continue;
            for (let i = 0; i < 12; i++) trendActual[i] += m.actuals[i];
        }
        const actual = trendActual[monthIdx];
        const target = targets[monthIdx];
        const prevActual = monthIdx > 0 ? trendActual[monthIdx - 1] : 0;
        const liveContracts = contracts.filter((c) => c.contract_status !== 'cancelled');

        /* ---------- receivables ---------- */
        const scheduleContractIds = [...new Set(schedules.map((s) => s.contract_id))];
        const contractInfo = new Map<string, { customer: string | null; contractNumber: string | null }>();
        for (const c of contracts) contractInfo.set(c.id, { customer: c.customer_name, contractNumber: c.contract_number });
        const unknownIds = scheduleContractIds.filter((id) => !contractInfo.has(id));
        if (unknownIds.length) {
            const { data } = await db
                .from('property_contracts')
                .select('id, customer_name, contract_number')
                .in('id', unknownIds.slice(0, 500));
            for (const c of data || []) contractInfo.set(c.id, { customer: c.customer_name, contractNumber: c.contract_number });
        }
        const overdue = buildOverdue(schedules, contractInfo, now);

        /* ---------- inventory ---------- */
        const blockMap = new Map<string, BlockRemaining>();
        for (const b of blocks) {
            const key = `${b.phase ?? ''}|${b.block ?? ''}`;
            const cur = blockMap.get(key) ?? { phase: b.phase, block: b.block || '—', total: 0, available: 0, sold: 0, pending: 0 };
            cur.total += Number(b.total_units) || 0;
            cur.available += Number(b.available_units) || 0;
            cur.sold += Number(b.sold_units) || 0;
            cur.pending += Number(b.pending_units) || 0;
            blockMap.set(key, cur);
        }
        const blockList = [...blockMap.values()].sort((a, b) => b.available - a.available || b.total - a.total);
        const inventory = blockList.reduce(
            (t, b) => ({ ...t, total: t.total + b.total, available: t.available + b.available, sold: t.sold + b.sold, pending: t.pending + b.pending }),
            { total: 0, available: 0, sold: 0, pending: 0, blocks: blockList },
        );

        const payload: DirectorPayload = {
            year,
            month,
            sales: {
                actual,
                target,
                attainmentPct: attainmentPct(actual, target),
                momDeltaPct: momDeltaPct(actual, prevActual),
                units: liveContracts.length,
                unitsByType: countByUnitType(liveContracts),
                trendActual,
                trendTarget: targets,
                yearActual: sumYear(trendActual),
                yearTarget: sumYear(targets),
            },
            leaderboard: buildLeaderboard({
                rosterNames: activeNames,
                contracts: liveContracts,
                viewings,
                leads,
                teamTargetMonth: target,
            }),
            funnel: buildFunnel(
                leads,
                viewings.map((v) => v.lead_id).filter((x): x is string => !!x),
                liveContracts.map((c) => c.lead_id).filter((x): x is string => !!x),
            ),
            receivables: { ...overdue, outstandingTotal: Math.round(outstanding) },
            inventory,
            missing,
        };

        return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return safeErrorResponse(error, 'Захирлын самбар татахад алдаа гарлаа');
    }
}

/* ---------- row shapes ---------- */
interface ContractRow {
    id: string;
    sales_manager: string | null;
    total_price: number | null;
    contract_status: string | null;
    unit_type: string | null;
    lead_id: string | null;
    customer_name: string | null;
    contract_number: string | null;
}
interface ViewingRow { id: string; sales_manager_name: string | null; lead_id: string | null; status: string | null }
interface LeadRow { id: string; source: string | null; sales_manager_name: string | null }
interface ScheduleRow { contract_id: string; due_date: string; amount: number | null; paid_amount: number | null; status: string | null }
interface BlockRow { phase: string | null; block: string | null; total_units: number; available_units: number; sold_units: number; pending_units: number }

/** Хэсэг бүр тусдаа унаж болно — бусад нь хэвийн буцна. */
async function safe<T>(name: string, missing: string[], fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch {
        missing.push(name);
        return fallback;
    }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
