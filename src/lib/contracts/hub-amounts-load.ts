import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { hubRowsByContract, storedHubPaidRows, type HubPaidContract } from './list-import';
import { isMissingContractListSchema } from './live';

/** Гэрээний жагсаалтын «Бэлэн төлөлт», «Бартер»: сүүлийн HUB файлын дүн гэрээгээр (null = файлд хоосон). */
export interface HubListAmounts {
    /** Файлын огноо (`contract_list_imports.report_date`). */
    asOf: string;
    byContract: Map<string, { cash: number | null; barter: number | null }>;
}

/**
 * Сүүлийн HUB гэрээний жагсаалтын импортын хадгалсан мөрүүдээс («Бэлэн төлөлт» / хуучин «Нийт төлсөн дүн», «Бартер»)
 * гэрээ бүрийн дүнг гаргана — импортын тулгалтаар (`hubRowsByContract`), зөвхөн амьд мөр ↔ амьд гэрээ. Гэрээнд бичигдэхгүй,
 * дэлгэцэд л харагдана. Импортгүй төсөл, эсвэл файлд аль ч багана байхгүй бол null. Уншилтын алдаа шидэгдэнэ.
 */
export async function loadHubListAmounts(db: SupabaseClient, shopId: string): Promise<HubListAmounts | null> {
    const { data, error } = await db.from('contract_list_imports').select('report_date, rows')
        .eq('shop_id', shopId).order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) {
        if (isMissingContractListSchema(error)) return null;
        throw new Error(error.message);
    }
    const file = data as { report_date: string | null; rows: unknown } | null;
    if (!file?.report_date) return null;
    const rows = storedHubPaidRows(file.rows);
    if (!rows.some(row => row.paidTotal !== null || (row.barterTotal ?? null) !== null)) return null;
    const asOf = String(file.report_date).slice(0, 10);
    const contracts = await fetchAllRows<HubPaidContract>((from, to) => db.from('property_contracts')
        .select('id, product_type, unit_label, contract_status, contract_date, order_date')
        .eq('shop_id', shopId).is('deleted_at', null).order('id').range(from, to));
    const byContract = new Map([...hubRowsByContract(rows, contracts, asOf)]
        .map(([id, row]) => [id, { cash: row.paidTotal, barter: row.barterTotal ?? null }]));
    return { asOf, byContract };
}

/** Гэрээнүүдийн нийлбэр: мэдэгдэх дүнгийн нийлбэр ба дүн нь мэдэгдэх гэрээний тоо (хоосныг 0 гэж нэмэхгүй). */
export function sumHubAmounts(amounts: HubListAmounts, contractIds: readonly string[]) {
    let cash = 0, barter = 0, cashKnown = 0, barterKnown = 0;
    for (const id of contractIds) {
        const row = amounts.byContract.get(id);
        if (!row) continue;
        if (row.cash !== null) { cash += Math.round(row.cash * 100); cashKnown++; }
        if (row.barter !== null) { barter += Math.round(row.barter * 100); barterKnown++; }
    }
    return { cash: cashKnown ? cash / 100 : null, barter: barterKnown ? barter / 100 : null };
}
