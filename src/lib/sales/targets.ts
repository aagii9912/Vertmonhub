import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Борлуулалтын төлөвлөгөө (target) ба гүйцэтгэл (actual) тооцооны туслах модуль.
 * Төлөвлөгөө нь САРААР хадгалагдана (sales_targets); улирал/жил = сарын нийлбэр.
 * Гүйцэтгэл нь manager_monthly_sales view (property_contracts)-оос ирнэ.
 */

export interface ManagerYearData {
    sales_manager: string;
    user_id: string | null;
    targets: number[]; // [12] сарын төлөвлөгөө (₮), index 0 = 1-р сар
    actuals: number[]; // [12] сарын бодит борлуулалт (₮)
    counts: number[];  // [12] сарын гэрээний тоо
}

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

/**
 * Тухайн shop-ийн жилийн менежер бүрийн төлөвлөгөө + гүйцэтгэлийг цуглуулна.
 * managerFilter өгвөл зөвхөн тухайн менежерийн мөрийг татна.
 */
export async function getManagerYearData(
    supabase: SupabaseClient,
    shopId: string,
    year: number,
    managerFilter?: string,
): Promise<ManagerYearData[]> {
    let targetQuery = supabase
        .from('sales_targets')
        .select('sales_manager, user_id, month, target_amount')
        .eq('shop_id', shopId)
        .eq('year', year);
    if (managerFilter) targetQuery = targetQuery.eq('sales_manager', managerFilter);

    let actualQuery = supabase
        .from('manager_monthly_sales')
        .select('sales_manager, month, actual_amount, contract_count')
        .eq('shop_id', shopId)
        .eq('year', year);
    if (managerFilter) actualQuery = actualQuery.eq('sales_manager', managerFilter);

    const [{ data: targetRows }, { data: actualRows }] = await Promise.all([
        targetQuery,
        actualQuery,
    ]);

    const map = new Map<string, ManagerYearData>();
    const ensure = (name: string): ManagerYearData => {
        let m = map.get(name);
        if (!m) {
            m = {
                sales_manager: name,
                user_id: null,
                targets: Array(12).fill(0),
                actuals: Array(12).fill(0),
                counts: Array(12).fill(0),
            };
            map.set(name, m);
        }
        return m;
    };

    for (const r of targetRows || []) {
        const m = ensure(r.sales_manager);
        if (r.user_id) m.user_id = r.user_id;
        if (r.month >= 1 && r.month <= 12) m.targets[r.month - 1] = Number(r.target_amount) || 0;
    }
    for (const r of actualRows || []) {
        const m = ensure(r.sales_manager);
        if (r.month >= 1 && r.month <= 12) {
            m.actuals[r.month - 1] = Number(r.actual_amount) || 0;
            m.counts[r.month - 1] = Number(r.contract_count) || 0;
        }
    }

    return Array.from(map.values());
}
