import type { SupabaseClient } from '@supabase/supabase-js';
import { blockOfCode, erpNumber, parseErpProduct, type ErpProduct, type ProductKind } from '@/lib/erp/records';
import { listErpSnapshots, loadErpDatasets, snapshotRecords, type ErpSnapshotMeta } from '@/lib/erp/snapshots';
import { inventoryStatusOf } from '@/lib/admin/import/units';
import { NOT_CANCELLED_CONTRACT, readLatestContractListImport } from '@/lib/contracts/live';
import type { InventoryStatus } from '@/lib/inventory/labels';
import { fetchAllRows } from '@/lib/utils/pagination';

/**
 * Тайлангийн байрны үлдэгдэл — Лхагвын тайлан (давхрын зураглал, блокийн үлдэгдэл) ба AI `list_properties`-ийн нэг дүрэм.
 *
 *  1. HUB гэрээний жагсаалтын сүүлийн импорт ERP бүтээгдэхүүний экспортоос шинэ (эсвэл экспорт алга) бол байрны
 *     бүртгэл (`property_units`) дээр амьд гэрээг давхарлана (эзний шийдвэр W14, 2026-10-22): амьд гэрээтэй байр
 *     зарагдсан, гэрээгүй байр бүртгэлийн төлөвөөрөө, харин «зарагдсан/хүлээлгэсэн» гэсэн ч амьд гэрээгүй бол худалдаанд.
 *     Менежер, гэрээлсэн талбайг гэрээнээс; цуцалсан борлуулалтын хуучин менежер сул байранд гарахгүй.
 *  2. Үгүй бол хамгийн сүүлийн ERP бүтээгдэхүүний экспорт.
 *  3. Аль нь ч алга бол байрны бүртгэл (төлөвөөрөө) — `unitsFallback: false` бол null.
 *
 * Гэрээ ба байрыг `${product_type}|${unit_label-ийн эхний хэсэг}` = `${category}|${code}`-оор холбоно (код нь ангилал
 * дамжин давтагддаг: «Б1-13 (01)» зогсоол ба агуулах). Гэрээ, байр одоогийн төлөвөөрөө (өнгөрсөн хурлын тайланд ч).
 * Уншилтын алдаа шидэгдэнэ — хоосон нөөц гэж үзэхгүй.
 */
export type ReportInventorySourceKind = 'erp' | 'crm' | 'contracts';

export interface ReportInventory {
    info: { date: string; source: string; kind: ReportInventorySourceKind };
    rows: ErpProduct[];
    /** `contracts` горимд үнийг ERP экспортоос кодоор тааруулсан бол тэр экспортын огноо. */
    priceAsOf: string | null;
    /** `contracts` горимд байр нь олдоогүй амьд гэрээ (тоонд ороогүй). */
    unmatchedContracts: number;
}

type UnitRow = {
    code: string; block: string | null; floor: string | null; model: string | null; category: string | null; rooms: number | null;
    sale_area: number | string | null; updated_sale_area: number | string | null; status: string | null; raw_status: string | null;
    sales_channel: string | null; sales_manager: string | null; updated_at: string | null;
};
type ContractRow = {
    id: string; product_type: string | null; unit_label: string | null; contract_status: string | null; contract_date: string | null;
    sales_manager: string | null; sales_channel: string | null; contracted_area: number | string | null;
};

const UNIT_FIELDS = 'code, block, floor, model, category, rooms, sale_area, updated_sale_area, status, raw_status, sales_channel, sales_manager, updated_at';
const INVENTORY_STATUSES = new Set<string>(['available', 'reserved', 'ordered', 'sold', 'handed_over']);
const KINDS = new Set<string>(['residential', 'parking', 'industry', 'commercial']);
const unitKind = (category: string | null): ProductKind => category && KINDS.has(category) ? category as ProductKind : 'other';
const number = (value: number | string | null) => value === null || value === '' ? null : erpNumber(String(value));
const isBarter = (channel: string | null | undefined) => /бартер/i.test(channel ?? '');
const unitStatus = (unit: UnitRow) => (unit.status && INVENTORY_STATUSES.has(unit.status) ? unit.status : inventoryStatusOf(unit.raw_status)) as InventoryStatus | null;
/** Гэрээний байрны түлхүүр (`property_units_with_buyer`-тэй ижил: unit_label-ийн таслалаас өмнөх хэсэг). */
export const contractUnitKey = (productType: string | null, unitLabel: string | null) =>
    unitLabel ? `${productType ?? ''}|${unitLabel.split(',')[0].trim()}` : null;

/** Нэг байранд хэд хэдэн амьд гэрээ байвал хаасан → идэвхтэй → хамгийн сүүлийн огноотой (view-тэй ижил дараалал). */
function preferContract(a: ContractRow, b: ContractRow) {
    const rank = (row: ContractRow) => row.contract_status === 'closed' ? 2 : row.contract_status === 'active' ? 1 : 0;
    return rank(b) - rank(a) || (b.contract_date ?? '').localeCompare(a.contract_date ?? '');
}

function unitProduct(unit: UnitRow, status: InventoryStatus | null, extra: Partial<ErpProduct> = {}): ErpProduct {
    return {
        key: `${unit.category ?? ''}|${unit.code}`, code: unit.code, block: blockOfCode(unit.code) ?? unit.block, floor: erpNumber(unit.floor),
        model: unit.model, kind: unitKind(unit.category), rooms: unit.rooms, area: number(unit.updated_sale_area) || number(unit.sale_area), price: null,
        status, statusLabel: unit.raw_status ?? unit.status ?? '', barter: isBarter(unit.sales_channel), manager: unit.sales_manager,
        ...extra,
    };
}

/** Байрны бүртгэл дээр амьд гэрээг давхарлана (цэвэр функц). */
export function overlayContracts(units: UnitRow[], contracts: ContractRow[]): { rows: ErpProduct[]; unmatched: number } {
    const byUnit = new Map<string, ContractRow>();
    for (const contract of contracts) {
        const key = contractUnitKey(contract.product_type, contract.unit_label);
        if (!key) continue;
        const current = byUnit.get(key);
        if (!current || preferContract(contract, current) < 0) byUnit.set(key, contract);
    }
    const matched = new Set<string>();
    const rows = units.map(unit => {
        const key = `${unit.category ?? ''}|${unit.code}`;
        const contract = byUnit.get(key);
        const status = unitStatus(unit);
        if (contract) {
            matched.add(key);
            return unitProduct(unit, status === 'handed_over' ? 'handed_over' : 'sold', {
                statusLabel: contract.contract_status === 'closed' ? 'Гэрээ хаасан' : 'Гэрээтэй',
                barter: isBarter(unit.sales_channel) || isBarter(contract.sales_channel),
                manager: contract.sales_manager ?? unit.sales_manager,
                area: number(contract.contracted_area) || number(unit.updated_sale_area) || number(unit.sale_area),
            });
        }
        const barter = isBarter(unit.sales_channel);
        // Амьд гэрээгүй тул «зарагдсан» биш (бартерыг төлөвөөр нь үлдээнэ); хуучин менежерийн нэрийг харуулахгүй.
        const sold = status === 'sold' || status === 'handed_over';
        return unitProduct(unit, sold && !barter ? 'available' : status, {
            statusLabel: sold && !barter ? `${unit.raw_status ?? unit.status} · амьд гэрээгүй` : unit.raw_status ?? unit.status ?? '',
            manager: null,
        });
    });
    return { rows, unmatched: [...byUnit.keys()].filter(key => !matched.has(key)).length };
}

export async function loadReportInventory(db: SupabaseClient, shopId: string, upTo: string, options: {
    /** Урьдчилан уншсан snapshot-ын мета (Лхагвын тайлан нэг уншилтаар авдаг). */
    metas?: ErpSnapshotMeta[];
    /** `contracts` горимд ERP экспортын үнийг кодоор нэмэх (AI — эрхтэй хэрэглэгчид үнэ харуулна). */
    withErpPrice?: boolean;
    unitsFallback?: boolean;
} = {}): Promise<ReportInventory | null> {
    const [metas, hub] = await Promise.all([
        options.metas ?? listErpSnapshots(db, shopId, upTo),
        readLatestContractListImport(db, shopId, { upTo }),
    ]);
    const productsMeta = metas.find(meta => meta.kind === 'products') ?? null;
    const latestHub = hub.latest;
    const readProducts = async () => productsMeta
        ? snapshotRecords(productsMeta, await loadErpDatasets(db, shopId, [productsMeta.id]), parseErpProduct)
        : null;

    if (latestHub && (!productsMeta || latestHub.report_date >= productsMeta.report_date)) {
        const [units, contracts, products] = await Promise.all([
            fetchAllRows<UnitRow>((from, to) => db.from('property_units').select(UNIT_FIELDS).eq('shop_id', shopId).order('id').range(from, to)),
            fetchAllRows<ContractRow>((from, to) => db.from('property_contracts')
                .select('id, product_type, unit_label, contract_status, contract_date, sales_manager, sales_channel, contracted_area')
                .eq('shop_id', shopId).is('deleted_at', null).or(NOT_CANCELLED_CONTRACT).order('id').range(from, to)),
            options.withErpPrice ? readProducts() : null,
        ]);
        const { rows, unmatched } = overlayContracts(units, contracts);
        const prices = new Map((products?.rows ?? []).map(product => [`${product.kind}|${product.code}`, product.price]));
        return {
            info: { date: latestHub.report_date, source: `HUB гэрээ${latestHub.file_name ? ` «${latestHub.file_name}»` : ''} + байрны бүртгэл`, kind: 'contracts' },
            rows: products ? rows.map(row => ({ ...row, price: prices.get(`${row.kind}|${row.code}`) ?? null })) : rows,
            priceAsOf: products?.info.date ?? null,
            unmatchedContracts: unmatched,
        };
    }

    const products = await readProducts();
    if (products) return { info: { ...products.info, kind: 'erp' }, rows: products.rows, priceAsOf: products.info.date, unmatchedContracts: 0 };
    if (options.unitsFallback === false) return null;

    const units = await fetchAllRows<UnitRow>((from, to) => db.from('property_units').select(UNIT_FIELDS).eq('shop_id', shopId).order('id').range(from, to));
    if (!units.length) return null;
    const updated = units.map(unit => unit.updated_at ?? '').sort().at(-1)?.slice(0, 10) ?? '';
    return {
        info: { date: updated, source: 'Байрны бүртгэл (CRM)', kind: 'crm' },
        rows: units.map(unit => unitProduct(unit, unitStatus(unit))),
        priceAsOf: null,
        unmatchedContracts: 0,
    };
}
