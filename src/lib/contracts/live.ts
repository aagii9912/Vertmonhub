/**
 * Гэрээ уншигчдын нийтлэг дүрэм (AI, cron, KPI-ийн статистик):
 *  • «Амьд» гэрээ = устгаагүй (`deleted_at IS NULL`) ба цуцлаагүй (`contract_status IS DISTINCT FROM 'cancelled'`).
 *  • Төлбөр хоцролт ₮ (`overdue_amount`) нь HUB файлын огноотой snapshot: сүүлийн импортын огноотой
 *    (`overdue_as_of`) утга л мэдэгдэж буй гэж тооцогдоно (summary.ts-тэй нэг дүрэм).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST `.or()` шүүлт — `contract_status IS DISTINCT FROM 'cancelled'` (`.neq` дангаараа NULL төлөвийг хасдаг). */
export const NOT_CANCELLED_CONTRACT = 'contract_status.is.null,contract_status.neq.cancelled';

export interface LatestContractListImport {
    report_date: string;
    file_name: string | null;
    row_count: number;
}

/** Сүүлийн HUB гэрээний жагсаалтын импорт (файлын огноогоор). Импортгүй бол null; уншилтын алдааг дамжуулна. */
export async function loadLatestContractListImport(db: SupabaseClient, shopId: string): Promise<LatestContractListImport | null> {
    const { data, error } = await db.from('contract_list_imports')
        .select('report_date, file_name, row_count')
        .eq('shop_id', shopId)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { report_date: String(data.report_date), file_name: data.file_name ?? null, row_count: Number(data.row_count) || 0 };
}

export interface OverdueSource {
    overdue_amount?: number | string | null;
    overdue_as_of?: string | null;
    overdue_days?: number | string | null;
}

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * Хоцролттой эсэх: мэдэгдэж буй Төлбөр хоцролт ₮ (сүүлийн файлын огноотой; импортгүй төсөлд хадгалсан утга) байвал
 * түүгээр (> 0), үгүй бол төлбөрийн хуваарийн хоногоор (`overdue_days` > 0).
 */
export function isOverdueContract(row: OverdueSource, latestImportDate: string | null): boolean {
    const amount = toNumber(row.overdue_amount);
    if (amount !== null && (!latestImportDate || row.overdue_as_of === latestImportDate)) return amount > 0;
    return (toNumber(row.overdue_days) ?? 0) > 0;
}
