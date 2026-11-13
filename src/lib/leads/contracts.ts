import type { SupabaseClient } from '@supabase/supabase-js';

/** Хоосон stub болон цуцалсан гэрээг борлуулалт гэж тооцохгүй. */
export function hasRealContractFields(contract: {
    contract_number: string | null;
    total_price: number | string | null;
    contract_status: string | null;
}): boolean {
    return !!contract.contract_number?.trim()
        && Number.isFinite(Number(contract.total_price))
        && Number(contract.total_price) > 0
        && (contract.contract_status === 'active' || contract.contract_status === 'closed');
}

/**
 * «Гэрээ болсон» (лидийн төлөв `closed_won`) тэмдэглэгээг зөвшөөрөх эсэх — UI PATCH ба AI хоёулаа ЭНЭ дүрмийг хэрэглэнэ
 * (эзэмшигчийн шийдвэр 2026-11-13). Менежер гэрээ болсныг өөрөө тэмдэглэнэ: гэрээ нь HUB жагсаалтын импортоор тусдаа
 * орж ирдэг, лидтэй холбогддоггүй тул холбогдсон гэрээ шаардахгүй; тэмдэглэгээ гэрээний тоо, дүнд нөлөөлөхгүй.
 *
 * Ганц хориг: лидэд `conversion_value > 0` байгаад бодит гэрээ холбогдоогүй бол DB trigger
 * (`create_contract_on_lead_won`) дугааргүй stub гэрээ үүсгэж гэрээний тоо, дүнг өсгөнө (review H5) — татгалзана.
 * Буцаах утга: null = болно; мөр = хэрэглэгчид харуулах алдаа.
 */
export async function leadWonBlocker(db: SupabaseClient, shopId: string, leadId: string): Promise<string | null> {
    const lead = await db.from('leads').select('conversion_value').eq('id', leadId).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
    if (lead.error || !lead.data) return 'Лид шалгахад алдаа гарлаа';
    const amount = Number((lead.data as { conversion_value: number | string | null }).conversion_value);
    if (!(Number.isFinite(amount) && amount > 0)) return null;
    const contracts = await db.from('property_contracts').select('contract_number, total_price, contract_status')
        .eq('lead_id', leadId).eq('shop_id', shopId).is('deleted_at', null);
    if (contracts.error) return 'Гэрээ шалгахад алдаа гарлаа';
    const rows = (contracts.data ?? []) as Parameters<typeof hasRealContractFields>[0][];
    return rows.some(hasRealContractFields) ? null
        : 'Энэ лидэд гэрээний дүн бүртгэгдсэн боловч хүчинтэй гэрээ холбогдоогүй тул «Гэрээ болсон» гэж тэмдэглэхэд хоосон гэрээ үүснэ. Админд хандаж лидийн дүнг цэвэрлүүлнэ үү.';
}
