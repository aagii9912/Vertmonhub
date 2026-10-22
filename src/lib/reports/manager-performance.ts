/**
 * Менежерийн гүйцэтгэл (manager_performance view + багийн зорилт) — API route ба AI tool
 * (`get_manager_performance`) хоёулаа энд дамжина.
 *
 * Менежерийн жагсаалт идэвхтэй роостероор; багийн төлөвлөгөөний биелэлт төслийн хэмжээнд (`loadPlanPerformance`-ийн
 * «Нийт» гэрээний дүн — Director, «Төлөвлөгөөний биелэлт»-тэй нэг тоо). Тодорхойгүй бол null (0 биш), огноогүй гэрээтэй бол «+».
 */

import { ubParts } from '@/lib/utils/date';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPlanPerformance } from '@/lib/sales/plan-performance-load';
import { logger } from '@/lib/utils/logger';
import { emptyTotals, type ManagerPerformanceTotals } from './manager-performance-totals';

export { emptyTotals, type ManagerPerformanceTotals };

export async function getManagerPerformance(supabase: SupabaseClient, shopId: string) {
    const { data, error } = await supabase
        .from('manager_performance')
        .select('*')
        .eq('shop_id', shopId)
        .order('total_sales', { ascending: false, nullsFirst: false });
    if (error) throw error;

    // Багийн жилийн төлөвлөгөө + идэвхтэй менежерийн бүртгэл
    const year = ubParts().year;
    const [plan, rosterRes] = await Promise.all([
        loadPlanPerformance(supabase, { shopId, year, canReadFinance: false }).catch((error: unknown) => {
            logger.warn('[manager-performance] plan performance unavailable', { message: error instanceof Error ? error.message : String(error) });
            return null;
        }),
        supabase.from('sales_managers').select('name, is_active').eq('shop_id', shopId),
    ]);
    if (rosterRes.error) throw rosterRes.error;
    const activeRoster = (rosterRes.data || []).filter((r) => r.is_active);
    const performanceByName = new Map((data || []).map((m) => [m.sales_manager, m]));

    const managers = activeRoster.map((r) => {
        const m = performanceByName.get(r.name);
        return {
            sales_manager: r.name,
            is_active: true,
            contract_count: Number(m?.contract_count) || 0,
            closed_count: Number(m?.closed_count) || 0,
            total_sales: Number(m?.total_sales) || 0,
            total_collected: Number(m?.total_collected) || 0,
            total_outstanding: Number(m?.total_outstanding) || 0,
            collection_rate_pct: Number(m?.collection_rate_pct) || 0,
            unique_customers: Number(m?.unique_customers) || 0,
        };
    }).sort((a, b) => b.total_sales - a.total_sales || a.sales_manager.localeCompare(b.sales_manager, 'mn'));

    // Багийн гүйцэтгэл (энэ он) = төслийн төлөвлөгөөнд хамаарах бүх гэрээ, аль ч менежер.
    const ytd = plan?.ytd.total.metrics.contract;
    const totals = managers.reduce(
        (acc, m) => {
            acc.managers += 1;
            acc.contracts += m.contract_count;
            acc.closed += m.closed_count;
            acc.sales += m.total_sales;
            acc.collected += m.total_collected;
            return acc;
        },
        {
            ...emptyTotals(),
            teamTarget: ytd?.plan ?? null,
            teamActual: ytd?.actual ?? null,
            teamLowerBound: !!ytd?.lowerBound,
            teamAttainmentPct: ytd?.pct ?? null,
            teamYearTarget: ytd?.yearPlan ?? null,
            teamYearPct: ytd?.yearPct ?? null,
        } satisfies ManagerPerformanceTotals,
    );


    return { managers, totals };
}
