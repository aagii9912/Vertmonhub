/**
 * Менежерийн гүйцэтгэл (manager_performance view + багийн зорилт) — API route ба AI tool
 * (`get_manager_performance`) хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeamTargets, getMonthlyActualsByManager, sumYear } from '@/lib/sales/targets';

export function emptyTotals() {
    return { managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0, teamTarget: 0, teamActual: 0, teamAttainmentPct: 0 };
}

export async function getManagerPerformance(supabase: SupabaseClient, shopId: string) {
    const { data, error } = await supabase
        .from('manager_performance')
        .select('*')
        .eq('shop_id', shopId)
        .order('total_sales', { ascending: false, nullsFirst: false });
    if (error) throw error;

    // Багийн жилийн төлөвлөгөө + идэвхтэй менежерийн бүртгэл
    const year = new Date().getFullYear();
    const [teamTargets, byManager, rosterRes] = await Promise.all([
        getTeamTargets(supabase, shopId, year),
        getMonthlyActualsByManager(supabase, shopId, year),
        supabase.from('sales_managers').select('name, is_active').eq('shop_id', shopId),
    ]);
    const rosterMap = new Map((rosterRes.data || []).map((r) => [r.name, r.is_active]));

    const managers = (data || []).map((m) => ({
        sales_manager: m.sales_manager,
        // Бүртгэлд байхгүй бол default идэвхтэй
        is_active: rosterMap.has(m.sales_manager) ? !!rosterMap.get(m.sales_manager) : true,
        contract_count: Number(m.contract_count) || 0,
        closed_count: Number(m.closed_count) || 0,
        total_sales: Number(m.total_sales) || 0,
        total_collected: Number(m.total_collected) || 0,
        total_outstanding: Number(m.total_outstanding) || 0,
        collection_rate_pct: Number(m.collection_rate_pct) || 0,
        unique_customers: Number(m.unique_customers) || 0,
    }));

    // Багийн гүйцэтгэл (энэ жил) = идэвхтэй менежерүүдийн нийлбэр
    const activeNames = new Set(managers.filter((m) => m.is_active).map((m) => m.sales_manager));
    let teamActualYear = 0;
    for (const [name, mm] of byManager) {
        if (activeNames.has(name)) teamActualYear += sumYear(mm.actuals);
    }
    const teamTargetYear = sumYear(teamTargets);

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
            managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0,
            teamTarget: teamTargetYear,
            teamActual: teamActualYear,
            teamAttainmentPct: teamTargetYear > 0 ? Math.round((teamActualYear / teamTargetYear) * 100) : 0,
        }
    );


    return { managers, totals };
}
