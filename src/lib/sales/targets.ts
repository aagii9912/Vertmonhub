import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserId } from '@/lib/auth/supabase-auth';
import {
    emptyMonthlySales, hasMonthlySalesExtras, MONTHLY_SALES_EXTRAS_UNAVAILABLE, MONTHLY_SALES_FIELDS, MONTHLY_SALES_STRETCH_FIELDS, MonthlySalesMonthSchema, MonthlySalesWriteSchema,
    SalesYearSchema, type MonthlySalesMonth, type MonthlySalesPatch,
} from './monthly';

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
    onError?: (error: unknown) => void,
): Promise<number[]> {
    const { data, error } = await supabase
        .from('team_sales_targets')
        .select('month, target_amount')
        .eq('shop_id', shopId)
        .eq('year', year);
    if (error) onError?.(error);

    const targets = Array(12).fill(0);
    for (const r of data || []) {
        if (r.month >= 1 && r.month <= 12) targets[r.month - 1] = Number(r.target_amount) || 0;
    }
    return targets;
}

function monthlyRow(row: Record<string, unknown>): MonthlySalesMonth {
    return MonthlySalesMonthSchema.parse({
        month: Number(row.month), revision: Number(row.revision),
        block_amounts: row.block_amounts ?? {},
        ...Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, row[field] == null ? null : Number(row[field])])),
        // Багана байхгүй (migration 20261023150000 ороогүй) бол null.
        ...Object.fromEntries(MONTHLY_SALES_STRETCH_FIELDS.map(field => [field, row[field] == null ? null : Number(row[field])])),
        activity_targets: row.activity_targets ?? null,
    });
}

const MONTHLY_COLUMNS = 'month, revision, target_amount, cashflow_target_amount, manual_contract_actual_amount, manual_cashflow_actual_amount, contract_count_target, manual_contract_count_actual, block_amounts';
const EXTRA_COLUMNS = 'stretch_target_amount, stretch_cashflow_target_amount, activity_targets';

/** Нэмэлт/идэвхжлийн төлөвлөгөөний багана байхгүй (migration 20261023150000 ороогүй). */
export function isMissingSalesExtrasSchema(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return ['42703', 'PGRST204'].includes(error.code ?? '') || /does not exist|could not find/i.test(error.message ?? '');
}

/**
 * Гэрээний тоо, гэрээ/орсон мөнгөний төлөвлөгөө ба гар гүйцэтгэл, сарын нэмэлт ба идэвхжлийн төлөвлөгөө.
 * CRM/ERP-ийн дүнг нэмэхгүй. Нэмэлт багана байхгүй бол тэдгээр нь null, `onExtrasUnavailable` дуудагдана.
 */
export async function getTeamMonthlySales(
    supabase: SupabaseClient, shopId: string, year: number, options: { onExtrasUnavailable?: () => void } = {},
): Promise<MonthlySalesMonth[]> {
    SalesYearSchema.parse(year);
    const read = (columns: string) => supabase.from('team_sales_targets').select(columns).eq('shop_id', shopId).eq('year', year);
    let { data, error } = await read(`${MONTHLY_COLUMNS}, ${EXTRA_COLUMNS}`);
    if (error && isMissingSalesExtrasSchema(error)) {
        ({ data, error } = await read(MONTHLY_COLUMNS));
        if (!error) options.onExtrasUnavailable?.();
    }
    if (error) throw error;
    const months = emptyMonthlySales();
    for (const row of (data || []) as unknown as Record<string, unknown>[]) {
        const parsed = monthlyRow(row);
        months[parsed.month - 1] = parsed;
    }
    return months;
}

/**
 * Service-only RPC: cell patch, stale revision check and monetary audit commit atomically.
 * Нэмэлт талбартай patch-ийг багана байхгүй үед илгээхгүй: `MONTHLY_SALES_EXTRAS_UNAVAILABLE` (API 503).
 */
export async function saveTeamMonthlySales(
    supabase: SupabaseClient, shopId: string, year: number, months: MonthlySalesPatch[], actorId: string,
): Promise<{ data: MonthlySalesMonth[] | null; error: { code?: string; message: string } | null }> {
    const input = MonthlySalesWriteSchema.parse({ shopId, year, months });
    if (input.months.some(hasMonthlySalesExtras)) {
        const probe = await supabase.from('team_sales_targets').select(EXTRA_COLUMNS).eq('shop_id', input.shopId).limit(1);
        if (probe.error && isMissingSalesExtrasSchema(probe.error)) {
            return { data: null, error: { code: MONTHLY_SALES_EXTRAS_UNAVAILABLE, message: 'Нэмэлт ба идэвхжлийн төлөвлөгөөний migration (20261023150000) ороогүй байна' } };
        }
    }
    const { data, error } = await supabase.rpc('save_team_monthly_sales', {
        p_shop_id: input.shopId, p_year: input.year, p_months: input.months, p_actor: actorId,
    });
    return { data: error ? null : ((data?.months || []) as Record<string, unknown>[]).map(monthlyRow), error };
}

/** Compatibility: the old amount updates ONLY the contract plan, never any other metric. */
export async function upsertTeamTargets(supabase: SupabaseClient, shopId: string, year: number, months: Array<{ month: number; amount: unknown }>, actorId?: string) {
    const current = await getTeamMonthlySales(supabase, shopId, year);
    const actor = actorId ?? await getUserId();
    if (!actor) throw new Error('Төлөвлөгөө хадгалах хэрэглэгч олдсонгүй');
    const patches = months.map(({ month, amount }) => ({
        month, expectedRevision: current.find(row => row.month === month)?.revision ?? 0,
        target_amount: amount as number | null,
    }));
    return saveTeamMonthlySales(supabase, shopId, year, patches, actor);
}

/** Менежер бүрийн 12 сарын бодит борлуулалт (₮) + гэрээний тоо. */
export async function getMonthlyActualsByManager(
    supabase: SupabaseClient,
    shopId: string,
    year: number,
    onError?: (error: unknown) => void,
): Promise<Map<string, { actuals: number[]; counts: number[] }>> {
    const { data, error } = await supabase
        .from('manager_monthly_sales')
        .select('sales_manager, month, actual_amount, contract_count')
        .eq('shop_id', shopId)
        .eq('year', year);
    if (error) onError?.(error);

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
