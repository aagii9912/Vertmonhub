import type { SupabaseClient } from '@supabase/supabase-js';
import { erpNumber, parseErpSale, PRODUCT_KIND_LABEL, productKind, type ProductKind } from '@/lib/erp/records';
import { listErpSnapshots, loadErpDatasets, snapshotRecords } from '@/lib/erp/snapshots';
import { loadReportInventory } from '@/lib/inventory/report-inventory';
import { fetchAllRows } from '@/lib/utils/pagination';
import { hasBlockPlan } from '@/lib/sales/plan-performance';
import { buildWeeklySales, type ContractLine } from './weekly-sales';
import { shiftReviewDate, weeklyReviewRange } from './weekly-review';

type CrmContract = {
    id: string; contract_number: string | null; contract_date: string | null; product_type: string | null; block_name: string | null;
    unit_label: string | null; unit_number: string | null; contracted_area: number | string | null; price_per_sqm: number | string | null;
    prepayment_condition: string | null; total_price: number | string | null; prepayment_due: number | string | null;
    paid_amount: number | string | null; sales_manager: string | null; sales_channel: string | null; contract_status: string | null; customer_name: string | null;
};

const money = (value: number | string | null) => value === null || value === '' ? null : erpNumber(String(value));
/** CRM-ийн `product_type` → ERP-ийн бүтээгдэхүүний төрөл (огноотой, огноогүй гэрээнд нэг дүрэм). */
const crmKind = (productType: string | null): ProductKind => productKind(productType === 'industry' ? 'Агуулах' : productType === 'parking' ? 'Зогсоол'
    : productType === 'commercial' ? 'Үйлчилгээ' : productType === 'residential' ? 'Орон сууц' : productType);

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
    const metas = await listErpSnapshots(db, shopId, meetingDate);
    const salesMeta = metas.find(meta => meta.kind === 'sales') ?? null;
    const previousMeta = salesMeta
        ? metas.find(meta => meta.kind === 'sales' && meta.report_date < salesMeta.report_date && meta.report_date <= shiftReviewDate(meetingDate, -7)) ?? null
        : null;
    const [datasets, inventory] = await Promise.all([
        loadErpDatasets(db, shopId, [salesMeta, previousMeta].flatMap(meta => meta ? [meta.id] : [])),
        // Үлдэгдэл: HUB гэрээ + байрны бүртгэл, ERP бүтээгдэхүүн эсвэл байрны бүртгэл (`lib/inventory/report-inventory.ts`).
        loadReportInventory(db, shopId, meetingDate, { metas }),
    ]);
    const sales = snapshotRecords(salesMeta, datasets, parseErpSale);
    const previousSales = snapshotRecords(previousMeta, datasets, parseErpSale);

    // ERP гэрээ алга бол CRM-ийн гэрээ (сар болон өмнөх долоо хоногийг хамруулна).
    let crmContracts: ContractLine[] | null = null;
    let crmUndated = 0;
    let crmUndatedLines: Array<{ kind: ProductKind; block: string | null }> = [];
    if (!sales) {
        // Огноогүй гэрээ (ERP байрны экспортоос үүссэн) хугацааны асуулгад орохгүй — тусад нь авч, тайланд «тодорхойгүй» гэнэ;
        // төрөл, блокоор нь төлөвлөгөөнд хамаарахыг ялгана.
        const undatedRows = await fetchAllRows<{ id: string; product_type: string | null; block_name: string | null }>((from, to) => db.from('property_contracts')
            .select('id, product_type, block_name')
            .eq('shop_id', shopId).is('deleted_at', null).is('contract_date', null).or('contract_status.is.null,contract_status.neq.cancelled')
            .order('id').range(from, to));
        crmUndated = undatedRows.length;
        crmUndatedLines = undatedRows.map(row => ({ kind: crmKind(row.product_type), block: row.block_name }));
        const earliest = [`${month}-01`, shiftReviewDate(range.from, -7)].sort()[0];
        const rows = await fetchAllRows<CrmContract>((from, to) => db.from('property_contracts')
            .select('id, contract_number, contract_date, product_type, block_name, unit_label, unit_number, contracted_area, price_per_sqm, prepayment_condition, total_price, prepayment_due, paid_amount, sales_manager, sales_channel, contract_status, customer_name')
            .eq('shop_id', shopId).is('deleted_at', null).gte('contract_date', earliest).lte('contract_date', range.to)
            .order('contract_date').order('id').range(from, to));
        crmContracts = rows.filter(row => row.contract_status !== 'cancelled').map(row => {
            const kind = crmKind(row.product_type);
            return {
                key: row.id, contractNumber: row.contract_number, date: row.contract_date, kind, kindLabel: PRODUCT_KIND_LABEL[kind],
                block: row.block_name, unit: row.unit_label ?? row.unit_number, customer: row.customer_name,
                area: money(row.contracted_area), pricePerSqm: money(row.price_per_sqm), advanceCondition: row.prepayment_condition,
                total: money(row.total_price), advance: money(row.prepayment_due), paid: money(row.paid_amount),
                manager: row.sales_manager, channel: row.sales_channel, status: row.contract_status ?? '',
            };
        });
    }

    const { data: target, error: targetError } = await db.from('team_sales_targets')
        .select('target_amount, block_amounts').eq('shop_id', shopId).eq('year', year).eq('month', monthNumber).maybeSingle();
    if (targetError) throw targetError;

    const report = buildWeeklySales({
        range, sales, previousSales, crmContracts, crmUndated, crmUndatedLines,
        inventory: inventory ? { info: inventory.info, rows: inventory.rows, unmatchedContracts: inventory.unmatchedContracts } : null,
        monthTarget: target?.target_amount ? money(target.target_amount) : null,
        monthBlockPlanned: hasBlockPlan(target?.block_amounts),
    });
    // Захиалагчийн нэрийг зөвхөн гэрээ харах эрхтэй хүнд харуулна.
    if (!options.canSeeCustomers) report.week.lines = report.week.lines.map(line => ({ ...line, customer: null }));
    return { meetingDate, ...report };
}
