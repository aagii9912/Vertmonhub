import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Борлуулалтын төлөвлөгөө (target) ба гүйцэтгэл (actual) тооцооны туслах модуль.
 *
 * • Төлөвлөгөө нь БАГААР (shop) сараар хадгалагдана (team_sales_targets);
 *   улирал/жил = сарын нийлбэр.
 * • Гүйцэтгэл нь manager_monthly_sales view (property_contracts)-оос ирнэ.
 * • Багийн гүйцэтгэл = ИДЭВХТЭЙ менежерүүдийн (sales_managers.is_active)
 *   борлуулалтын нийлбэр. Идэвхтэй жагсаалт өгөгдөөгүй бол бүх менежерийг авна.
 */

/** Тухайн сар (1-12) аль улиралд (1-4) хамаарахыг буцаана. */
export function quarterOfMonth(month: number): number {
    return Math.floor((month - 1) / 3) + 1;
}

/** [12] массивын тухайн улирлын (1-4) 3 сарын нийлбэр. */
export function sumQuarter(months: number[], quarter: number): number {
    const start = (quarter - 1) * 3;
    return (months[start] || 0) + (months[start + 1] || 0) + (months[start + 2] || 0);
}

/** [12] массивын жилийн нийлбэр. */
export function sumYear(months: number[]): number {
    return months.reduce((acc, v) => acc + (v || 0), 0);
}

/** Багийн 12 сарын төлөвлөгөө (₮). */
export async function getTeamTargets(
    supabase: SupabaseClient,
    shopId: string,
    year: number,
): Promise<number[]> {
    const { data } = await supabase
        .from('team_sales_targets')
        .select('month, target_amount')
        .eq('shop_id', shopId)
        .eq('year', year);

    const targets = Array(12).fill(0);
    for (const r of data || []) {
        if (r.month >= 1 && r.month <= 12) targets[r.month - 1] = Number(r.target_amount) || 0;
    }
    return targets;
}

/** Менежер бүрийн 12 сарын бодит борлуулалт (₮) + гэрээний тоо. */
export async function getMonthlyActualsByManager(
    supabase: SupabaseClient,
    shopId: string,
    year: number,
): Promise<Map<string, { actuals: number[]; counts: number[] }>> {
    const { data } = await supabase
        .from('manager_monthly_sales')
        .select('sales_manager, month, actual_amount, contract_count')
        .eq('shop_id', shopId)
        .eq('year', year);

    const map = new Map<string, { actuals: number[]; counts: number[] }>();
    for (const r of data || []) {
        if (!r.sales_manager) continue;
        let m = map.get(r.sales_manager);
        if (!m) {
            m = { actuals: Array(12).fill(0), counts: Array(12).fill(0) };
            map.set(r.sales_manager, m);
        }
        if (r.month >= 1 && r.month <= 12) {
            m.actuals[r.month - 1] = Number(r.actual_amount) || 0;
            m.counts[r.month - 1] = Number(r.contract_count) || 0;
        }
    }
    return map;
}

export interface TeamYearData {
    targets: number[]; // [12] багийн сарын төлөвлөгөө
    actuals: number[]; // [12] идэвхтэй менежерүүдийн борлуулалтын нийлбэр
    counts: number[];  // [12] гэрээний тоо
}

/**
 * Багийн жилийн төлөвлөгөө + гүйцэтгэл.
 * activeNames өгвөл (хоосон биш) зөвхөн тэдгээр менежерийн борлуулалтыг нийлбэрлэнэ.
 */
export async function getTeamYearData(
    supabase: SupabaseClient,
    shopId: string,
    year: number,
    activeNames?: string[],
): Promise<TeamYearData> {
    const [targets, byManager] = await Promise.all([
        getTeamTargets(supabase, shopId, year),
        getMonthlyActualsByManager(supabase, shopId, year),
    ]);

    const useFilter = Array.isArray(activeNames) && activeNames.length > 0;
    const allow = useFilter ? new Set(activeNames) : null;

    const actuals = Array(12).fill(0);
    const counts = Array(12).fill(0);
    for (const [name, m] of byManager) {
        if (allow && !allow.has(name)) continue;
        for (let i = 0; i < 12; i++) {
            actuals[i] += m.actuals[i];
            counts[i] += m.counts[i];
        }
    }

    return { targets, actuals, counts };
}
