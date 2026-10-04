import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpDataset } from '@/lib/erp/import';
import {
    blockOfCode, erpNumber, isProductsDataset, isSalesDataset, parseErpProduct, parseErpSale, PRODUCT_KIND_LABEL,
    productKind, readErpRecords, type ErpProduct,
} from '@/lib/erp/records';
import { inventoryStatusOf } from '@/lib/admin/import/units';
import type { InventoryStatus } from '@/lib/inventory/labels';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildWeeklySales, type ContractLine } from './weekly-sales';
import { shiftReviewDate, weeklyReviewRange } from './weekly-review';

type SnapshotMeta = { id: string; source: string; report_date: string; columns: string[] | null };
type CrmContract = {
    id: string; contract_number: string | null; contract_date: string | null; product_type: string | null; block_name: string | null;
    unit_label: string | null; unit_number: string | null; contracted_area: number | string | null; price_per_sqm: number | string | null;
    prepayment_condition: string | null; total_price: number | string | null; prepayment_due: number | string | null;
    paid_amount: number | string | null; sales_manager: string | null; sales_channel: string | null; contract_status: string | null; customer_name: string | null;
};
type CrmUnit = {
    code: string; block: string | null; floor: string | null; model: string | null; category: string | null; rooms: number | null;
    sale_area: number | string | null; updated_sale_area: number | string | null; status: string | null; raw_status: string | null;
    sales_channel: string | null; sales_manager: string | null; updated_at: string | null;
};

const money = (value: number | string | null) => value === null || value === '' ? null : erpNumber(String(value));
const INVENTORY_STATUSES = new Set<string>(['available', 'reserved', 'ordered', 'sold', 'handed_over']);

/**
 * Хурлын долоо хоногийн борлуулалтын тайлангийн эх өгөгдлийг уншина (нэг shop = нэг төсөл).
 * ERP snapshot-ыг багануудаар нь танина: гэрээ (`property.sale`) ба бүтээгдэхүүн. Уншилтын алдаа
 * тайланг бүхэлд нь унагаана — хоосон өгөгдлийг 0 гэж харуулахгүй.
 */
export async function loadWeeklySales(db: SupabaseClient, options: { shopId: string; meetingDate: string; canSeeCustomers: boolean }) {
    const { shopId, meetingDate } = options;
    const range = weeklyReviewRange(meetingDate);
    const month = range.to.slice(0, 7);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));

    // Хурлын өдөр хүртэлх сүүлийн snapshot-ууд (эхний sheet-ийн баганаар төрлийг танина).
    const { data: metas, error: metaError } = await db.from('erp_imports')
        .select('id, source, report_date, columns:datasets->0->columns')
        .eq('shop_id', shopId).lte('report_date', meetingDate)
        .order('report_date', { ascending: false }).order('sequence', { ascending: false })
        .range(0, 59);
    if (metaError) throw metaError;
    const kindOf = (meta: SnapshotMeta) => !Array.isArray(meta.columns) ? null
        : isSalesDataset({ columns: meta.columns }) ? 'sales' : isProductsDataset({ columns: meta.columns }) ? 'products' : null;
    const list = (metas ?? []) as SnapshotMeta[];
    const salesMeta = list.find(meta => kindOf(meta) === 'sales') ?? null;
    const previousMeta = salesMeta
        ? list.find(meta => kindOf(meta) === 'sales' && meta.report_date < salesMeta.report_date && meta.report_date <= shiftReviewDate(meetingDate, -7)) ?? null
        : null;
    const productsMeta = list.find(meta => kindOf(meta) === 'products') ?? null;

    const ids = [salesMeta, previousMeta, productsMeta].flatMap(meta => meta ? [meta.id] : []);
    const datasets = new Map<string, ErpDataset[]>();
    if (ids.length) {
        const { data, error } = await db.from('erp_imports').select('id, datasets').eq('shop_id', shopId).in('id', ids);
        if (error) throw error;
        for (const row of data ?? []) datasets.set(row.id as string, (row.datasets ?? []) as ErpDataset[]);
    }
    const snapshot = <T>(meta: SnapshotMeta | null, detect: (dataset: ErpDataset) => boolean, parse: (row: Record<string, string>) => T | null) =>
        meta ? { info: { date: meta.report_date, source: meta.source }, rows: readErpRecords(datasets.get(meta.id) ?? [], detect, parse) } : null;
    const sales = snapshot(salesMeta, isSalesDataset, parseErpSale);
    const previousSales = snapshot(previousMeta, isSalesDataset, parseErpSale);
    const products = snapshot(productsMeta, isProductsDataset, parseErpProduct);

    // ERP гэрээ алга бол CRM-ийн гэрээ (сар болон өмнөх долоо хоногийг хамруулна).
    let crmContracts: ContractLine[] | null = null;
    if (!sales) {
        const earliest = [`${month}-01`, shiftReviewDate(range.from, -7)].sort()[0];
        const rows = await fetchAllRows<CrmContract>((from, to) => db.from('property_contracts')
            .select('id, contract_number, contract_date, product_type, block_name, unit_label, unit_number, contracted_area, price_per_sqm, prepayment_condition, total_price, prepayment_due, paid_amount, sales_manager, sales_channel, contract_status, customer_name')
            .eq('shop_id', shopId).is('deleted_at', null).gte('contract_date', earliest).lte('contract_date', range.to)
            .order('contract_date').order('id').range(from, to));
        crmContracts = rows.filter(row => row.contract_status !== 'cancelled').map(row => {
            const kind = productKind(row.product_type === 'industry' ? 'Агуулах' : row.product_type === 'parking' ? 'Зогсоол'
                : row.product_type === 'commercial' ? 'Үйлчилгээ' : row.product_type === 'residential' ? 'Орон сууц' : row.product_type);
            return {
                key: row.id, contractNumber: row.contract_number, date: row.contract_date, kind, kindLabel: PRODUCT_KIND_LABEL[kind],
                block: row.block_name, unit: row.unit_label ?? row.unit_number, customer: row.customer_name,
                area: money(row.contracted_area), pricePerSqm: money(row.price_per_sqm), advanceCondition: row.prepayment_condition,
                total: money(row.total_price), advance: money(row.prepayment_due), paid: money(row.paid_amount),
                manager: row.sales_manager, channel: row.sales_channel, status: row.contract_status ?? '',
            };
        });
    }

    // Үлдэгдэл: ERP бүтээгдэхүүн, эс бөгөөс CRM-ийн байрны бүртгэл.
    let inventory: Parameters<typeof buildWeeklySales>[0]['inventory'] = products
        ? { info: { ...products.info, kind: 'erp' }, rows: products.rows }
        : null;
    if (!inventory) {
        const units = await fetchAllRows<CrmUnit>((from, to) => db.from('property_units')
            .select('code, block, floor, model, category, rooms, sale_area, updated_sale_area, status, raw_status, sales_channel, sales_manager, updated_at')
            .eq('shop_id', shopId).order('id').range(from, to));
        if (units.length) {
            const updated = units.map(unit => unit.updated_at ?? '').sort().at(-1)?.slice(0, 10) ?? '';
            inventory = {
                info: { date: updated, source: 'Байрны бүртгэл (CRM)', kind: 'crm' },
                rows: units.map((unit): ErpProduct => {
                    const kind = productKind(unit.category === 'industry' ? 'Агуулах' : unit.category === 'parking' ? 'Зогсоол'
                        : unit.category === 'commercial' ? 'Үйлчилгээ' : unit.category === 'residential' ? 'Орон сууц' : unit.category);
                    const status = (unit.status && INVENTORY_STATUSES.has(unit.status) ? unit.status : inventoryStatusOf(unit.raw_status)) as InventoryStatus | null;
                    return {
                        key: unit.code, code: unit.code, block: blockOfCode(unit.code) ?? unit.block, floor: erpNumber(unit.floor),
                        model: unit.model, kind, rooms: unit.rooms, area: money(unit.updated_sale_area) || money(unit.sale_area), price: null,
                        status, statusLabel: unit.raw_status ?? unit.status ?? '', barter: /бартер/i.test(unit.sales_channel ?? ''), manager: unit.sales_manager,
                    };
                }),
            };
        }
    }

    const { data: target, error: targetError } = await db.from('team_sales_targets')
        .select('target_amount').eq('shop_id', shopId).eq('year', year).eq('month', monthNumber).maybeSingle();
    if (targetError) throw targetError;

    const report = buildWeeklySales({
        range, sales, previousSales, crmContracts, inventory,
        monthTarget: target?.target_amount ? money(target.target_amount) : null,
    });
    // Захиалагчийн нэрийг зөвхөн гэрээ харах эрхтэй хүнд харуулна.
    if (!options.canSeeCustomers) report.week.lines = report.week.lines.map(line => ({ ...line, customer: null }));
    return { meetingDate, ...report };
}
