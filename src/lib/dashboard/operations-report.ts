import { z } from 'zod';
import { ACTIVE_STATUSES, UNCATEGORIZED_LABEL, categoryOptionLabel, sourceLabel, type LeadCategoryOption } from '@/lib/leads/labels';
import { unitCategoryLabel } from '@/lib/inventory/labels';
import { getLeadWorkQueues } from '@/lib/leads/work-queue';
import { formatMNT } from '@/lib/utils/currency';
import { ubDateStr, ubMonthRange } from '@/lib/utils/date';
import { MONTHLY_SALES_FIELDS, MONTHLY_SALES_LABELS, type MonthlySalesMonth } from '@/lib/sales/monthly';

export const OperationsRangeSchema = z.object({
    from: z.iso.date(),
    to: z.iso.date(),
}).refine(({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86_400_000, {
    message: 'Эхлэх, дуусах огноог зөв сонгоно уу. Хугацаа 367 өдрөөс урт байж болохгүй.',
});

export type OperationsRange = z.infer<typeof OperationsRangeSchema>;
type Amount = number | string | null;
export interface OperationsContract {
    id: string;
    contract_date: string | null;
    contract_status: string | null;
    total_price: Amount;
    prepayment_paid_cash: Amount;
    product_type?: string | null;
    deleted_at?: string | null;
}
export interface OperationsViewing {
    scheduled_at: string;
    status: string | null;
    meeting_type?: string | null;
    deleted_at?: string | null;
}
export interface OperationsLead {
    created_at: string;
    status: string;
    source: string | null;
    sales_manager_name: string | null;
    last_contact_at: string | null;
    next_followup_at: string | null;
    viewing_scheduled_at: string | null;
    category_id?: string | null;
    deleted_at?: string | null;
}
/** Төслийн лидийн ангилал (архивласан нь орно) — «Ангиллаар» задаргааны нэр, эрэмбэ. */
export type OperationsLeadCategory = Pick<LeadCategoryOption, 'id' | 'name' | 'is_active'>;
export interface OperationsTransaction {
    txn_date: string;
    type: string;
    amount: Amount;
    method: string | null;
    contract_id: string | null;
    receipt_kind?: string | null;
}
export interface OperationsTarget {
    year: number; month: number; target_amount: Amount;
    cashflow_target_amount?: Amount; manual_contract_actual_amount?: Amount; manual_cashflow_actual_amount?: Amount;
    revision?: number;
}

function amount(value: Amount): number | null {
    if (value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error('Тайлангийн мөнгөн дүн буруу байна');
    return n;
}

/** Only complete calendar months have comparable stored monthly targets. */
export function targetMonths({ from, to }: OperationsRange): string[] | null {
    const [year, month, day] = from.split('-').map(Number);
    const [endYear, endMonth] = to.split('-').map(Number);
    const end = ubMonthRange(endYear, endMonth - 1).end;
    if (day !== 1 || ubDateStr(new Date(end.getTime() - 1)) !== to) return null;
    const months: string[] = [];
    for (let index = year * 12 + month - 1; index <= endYear * 12 + endMonth - 1; index++) {
        months.push(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
    }
    return months;
}

export interface MonthlyPerformance {
    months: (MonthlySalesMonth & { year: number })[];
    completeMonths: boolean;
    cashflowVisible: boolean;
}

/** Management input is shown separately; missing months remain unknown and partial months are never prorated. */
export function buildMonthlyPerformance(targets: OperationsTarget[], range: OperationsRange, cashflowVisible: boolean): MonthlyPerformance {
    const months = targetMonths(range);
    const byMonth = new Map(targets.map(row => [`${row.year}-${String(row.month).padStart(2, '0')}`, row]));
    return { completeMonths: months !== null, cashflowVisible, months: (months ?? []).map(key => {
        const [year, month] = key.split('-').map(Number);
        const row = byMonth.get(key);
        return { year, month, revision: row?.revision ?? 0,
            target_amount: amount(row?.target_amount ?? null),
            manual_contract_actual_amount: amount(row?.manual_contract_actual_amount ?? null),
            cashflow_target_amount: cashflowVisible ? amount(row?.cashflow_target_amount ?? null) : null,
            manual_cashflow_actual_amount: cashflowVisible ? amount(row?.manual_cashflow_actual_amount ?? null) : null };
    }) };
}

/** Cash-basis meaning is shared by the operations report and finance dashboard/AI. */
export function summarizeCashTransactions(transactions: OperationsTransaction[], range: OperationsRange, receiptClassificationAvailable = true) {
    const cash = {
        receipts: 0, receiptCount: 0, contractReceipts: 0, disbursements: 0, disbursementCount: 0,
        barterReceipts: 0, barterDisbursements: 0, unclassifiedReceipts: 0, unclassifiedDisbursements: 0, unclassifiedCount: 0, net: 0,
        advanceReceipts: 0, advanceReceiptCount: 0, installmentReceipts: 0, otherReceipts: 0,
        unclassifiedCashReceipts: 0, unclassifiedCashReceiptCount: 0, receiptClassificationAvailable,
    };
    for (const t of transactions) {
        if (t.txn_date < range.from || t.txn_date > range.to) continue;
        const value = amount(t.amount);
        if (value === null) throw new Error('Гүйлгээний дүн дутуу байна');
        if (['cash', 'bank', 'bank_transfer', 'mortgage'].includes(t.method || '')) {
            if (t.type === 'receipt') {
                cash.receipts += value;
                cash.receiptCount++;
                if (t.contract_id) cash.contractReceipts += value;
                if (t.receipt_kind === 'advance') {
                    cash.advanceReceipts += value;
                    cash.advanceReceiptCount++;
                } else if (t.receipt_kind === 'installment') cash.installmentReceipts += value;
                else if (t.receipt_kind === 'other') cash.otherReceipts += value;
                else {
                    cash.unclassifiedCashReceipts += value;
                    cash.unclassifiedCashReceiptCount++;
                }
            } else if (t.type === 'disbursement') {
                cash.disbursements += value;
                cash.disbursementCount++;
            }
        } else if (t.method === 'barter') {
            if (t.type === 'receipt') cash.barterReceipts += value;
            else if (t.type === 'disbursement') cash.barterDisbursements += value;
        } else {
            cash.unclassifiedCount++;
            if (t.type === 'receipt') cash.unclassifiedReceipts += value;
            else if (t.type === 'disbursement') cash.unclassifiedDisbursements += value;
        }
    }
    cash.net = cash.receipts - cash.disbursements;
    return cash;
}

export function buildOperationsReport(input: {
    range: OperationsRange;
    now: string;
    contracts: OperationsContract[];
    leads: OperationsLead[];
    transactions: OperationsTransaction[] | null;
    targets: OperationsTarget[];
    receiptClassificationAvailable?: boolean;
    viewings?: OperationsViewing[];
    meetingClassificationAvailable?: boolean;
    /** Ангилалгүй төсөлд задаргаа хоосон. */
    categories?: OperationsLeadCategory[];
}) {
    const { range, now } = input;
    const within = (date: string | null) => !!date && date >= range.from && date <= range.to;
    const contracts = input.contracts.filter(c => !c.deleted_at && c.contract_status !== 'cancelled');
    const periodContracts = contracts.filter(c => within(c.contract_date));
    let contractValue = 0;
    let missingContractAmounts = 0;
    const products = new Map<string, { productType: string; label: string; count: number; value: number; missingAmounts: number }>();
    for (const c of periodContracts) {
        const value = amount(c.total_price);
        const productType = c.product_type?.trim() || 'unknown';
        const product = products.get(productType) || { productType, label: productType === 'unknown' ? 'Төрөл тодорхойгүй' : unitCategoryLabel(productType), count: 0, value: 0, missingAmounts: 0 };
        product.count++;
        if (value === null) product.missingAmounts++;
        else product.value += value;
        products.set(productType, product);
        if (value === null) missingContractAmounts++;
        else contractValue += value;
    }
    const periodViewings = input.viewings?.filter(v => !v.deleted_at && within(ubDateStr(new Date(v.scheduled_at))));
    const completedViewings = periodViewings?.filter(v => v.status === 'completed');
    const classifiedTypes = ['new_customer', 'repeat_customer', 'existing_buyer'];
    const meetings = periodViewings && completedViewings ? {
        count: periodViewings.length,
        completed: completedViewings.length,
        newCustomer: completedViewings.filter(v => v.meeting_type === 'new_customer').length,
        repeatCustomer: completedViewings.filter(v => v.meeting_type === 'repeat_customer').length,
        existingBuyer: completedViewings.filter(v => v.meeting_type === 'existing_buyer').length,
        unclassified: completedViewings.filter(v => !classifiedTypes.includes(v.meeting_type || '')).length,
        scheduled: periodViewings.filter(v => v.status === 'scheduled').length,
        cancelled: periodViewings.filter(v => v.status === 'cancelled').length,
        noShow: periodViewings.filter(v => v.status === 'no_show').length,
        unknownStatus: periodViewings.filter(v => !['completed', 'scheduled', 'cancelled', 'no_show'].includes(v.status || '')).length,
        classificationAvailable: input.meetingClassificationAvailable !== false,
        basis: 'Улаанбаатарын цагаар тайлант хугацаанд товлосон, болсон гэж тэмдэглэсэн уулзалтын бүртгэл. Давтан уулзалтыг тусдаа тоолно. Энэ нь давхардалгүй хүний тоо биш.',
    } : null;
    const snapshots = contracts.map(c => amount(c.prepayment_paid_cash));
    const months = targetMonths(range);
    const targets = new Map(input.targets.map(t => [`${t.year}-${String(t.month).padStart(2, '0')}`, amount(t.target_amount)]));
    const targetValues = months?.map(m => targets.get(m) ?? null);
    const targetAmount = targetValues?.length && targetValues.every(t => t !== null)
        ? targetValues.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;

    const leads = input.leads.filter(l => !l.deleted_at);
    const active = leads.filter(l => ACTIVE_STATUSES.some(status => status === l.status));
    const newLeads = leads.filter(l => within(ubDateStr(new Date(l.created_at))));
    const bySource = new Map<string, number>();
    for (const lead of newLeads) bySource.set(lead.source || 'other', (bySource.get(lead.source || 'other') || 0) + 1);
    // Ангиллаар: тохиргооны эрэмбээр, дараа нь «Ангилалгүй». Тоо 0 ангиллыг харуулахгүй.
    const categories = input.categories ?? [];
    const byCategory = categories.length ? [
        ...categories.map(category => ({ categoryId: category.id as string | null, name: categoryOptionLabel(category), count: newLeads.filter(lead => lead.category_id === category.id).length })),
        { categoryId: null, name: UNCATEGORIZED_LABEL, count: newLeads.filter(lead => !lead.category_id || !categories.some(category => category.id === lead.category_id)).length },
    ].filter(row => row.count > 0) : [];
    const leadQueues = active.map(lead => getLeadWorkQueues(lead, new Date(now)));
    const leadHealth = {
        active: active.length,
        ownerless: leadQueues.filter(queues => queues.includes('unassigned')).length,
        awaitingContact: leadQueues.filter(queues => queues.includes('uncontacted')).length,
        noNextStep: leadQueues.filter(queues => queues.includes('no_followup')).length,
        overdue: leadQueues.filter(queues => queues.includes('overdue')).length,
    };

    // Cash is dated ledger activity only. Contract snapshots and barter are never cash inflow.
    const cash = input.transactions === null ? null : summarizeCashTransactions(input.transactions, range, input.receiptClassificationAvailable !== false);

    return {
        range, generatedAt: now,
        contracts: { count: periodContracts.length, value: contractValue, missingAmounts: missingContractAmounts, undatedCount: contracts.filter(c => !c.contract_date).length,
            byProduct: [...products.values()].sort((a, b) => b.count - a.count || a.productType.localeCompare(b.productType)) },
        meetings,
        target: { amount: targetAmount, completeMonths: !!months, configuredMonths: targetValues?.filter(t => t !== null).length ?? 0, expectedMonths: months?.length ?? 0,
            attainmentPct: targetAmount && !missingContractAmounts ? Math.round(contractValue / targetAmount * 100) : null },
        cash,
        // Stored contract/import snapshot. New ledger receipts do not update this field.
        advanceSnapshot: { amount: snapshots.some(n => n !== null) ? snapshots.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null,
            recordedContracts: snapshots.filter(n => n !== null).length, totalContracts: contracts.length },
        leads: { newCount: newLeads.length, bySource: [...bySource].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count), byCategory, health: leadHealth },
    };
}

export type OperationsReport = ReturnType<typeof buildOperationsReport> & { shopName: string; monthlyPerformance?: MonthlyPerformance | null };

export function formatOperationsReportText(report: OperationsReport): string {
    const { range, contracts, target, cash, advanceSnapshot: advance, leads, meetings } = report;
    return [
        `${report.shopName} · Үйл ажиллагааны тайлан`,
        `Хугацаа: ${range.from} – ${range.to} (Улаанбаатар)`,
        `Гаргасан: ${ubDateStr(new Date(report.generatedAt))}`,
        `Гэрээ: ${contracts.count} · бүртгэлтэй дүн ${formatMNT(contracts.value)}`,
        `Дүн дутуу гэрээ: ${contracts.missingAmounts} · огноогүй гэрээ (хугацаанд ороогүй): ${contracts.undatedCount}`,
        ...(contracts.byProduct || []).map(product => `  ${product.label}: ${product.count} гэрээ · бүртгэлтэй дүн ${formatMNT(product.value)}${product.missingAmounts ? ` · дүн дутуу ${product.missingAmounts}` : ''}`),
        ...(meetings ? [
            `Болсон уулзалтын бүртгэл: ${meetings.completed} · шинэ харилцагч ${meetings.classificationAvailable ? meetings.newCustomer : '—'} · давтан ${meetings.classificationAvailable ? meetings.repeatCustomer : '—'} · худалдан авагч ${meetings.classificationAvailable ? meetings.existingBuyer : '—'} · төрөл тодорхойгүй ${meetings.unclassified}`,
            `Тайлант хугацааны товлосон уулзалт: хүлээгдэж буй ${meetings.scheduled} · цуцалсан ${meetings.cancelled} · ирээгүй ${meetings.noShow} · төлөв тодорхойгүй ${meetings.unknownStatus}`,
            meetings.basis,
            ...(!meetings.classificationAvailable ? ['Уулзалтын төрлийн ангилал системд хараахан нэвтрээгүй. Болсон уулзалтыг төрөл тодорхойгүйгээр харуулав.'] : []),
        ] : ['Уулзалтын мэдээлэл энэ тайланд байхгүй.']),
        target.amount !== null ? `Гэрээний зорилт: ${formatMNT(target.amount)} · биелэлт ${target.attainmentPct === null ? 'тооцох боломжгүй' : `${target.attainmentPct}%`}` : 'Гэрээний зорилт: сонгосон хугацаанд бүрэн тохируулаагүй эсвэл бүтэн сар сонгоогүй',
        ...(report.monthlyPerformance ? [
            'Сарын төлөвлөгөө ба гараар оруулсан гүйцэтгэл (системийн бүртгэлтэй нэмж нийлүүлэхгүй):',
            ...(!report.monthlyPerformance.completeMonths ? ['Сарын мэдээллийг харьцуулахдаа бүтэн сар сонгоно уу.'] : []),
            ...report.monthlyPerformance.months.map(row => `${row.year}-${String(row.month).padStart(2, '0')}: ${MONTHLY_SALES_FIELDS
                .filter(field => report.monthlyPerformance!.cashflowVisible || !field.includes('cashflow'))
                .map(field => `${MONTHLY_SALES_LABELS[field]} ${row[field] === null ? 'Оруулаагүй' : formatMNT(row[field])}`).join(' · ')}`),
        ] : []),
        ...(cash ? [
            `Мөнгөөр орсон бүртгэл: ${cash.receiptCount} гүйлгээ · ${formatMNT(cash.receipts)}`,
            `Үүнээс гэрээтэй холбоотой: ${formatMNT(cash.contractReceipts)}`,
            cash.receiptClassificationAvailable
                ? `Үүнээс урьдчилгаа гэж ангилсан мөнгөн орлого: ${formatMNT(cash.advanceReceipts)} (${cash.advanceReceiptCount} гүйлгээ); ангилаагүй мөнгөн орлого: ${formatMNT(cash.unclassifiedCashReceipts)} (${cash.unclassifiedCashReceiptCount} гүйлгээ)`
                : 'Хугацааны урьдчилгаа мөнгө: орлогын ангилал системд хараахан нэвтрээгүй тул тооцоогүй',
            `Мөнгөөр гарсан бүртгэл: ${cash.disbursementCount} гүйлгээ · ${formatMNT(cash.disbursements)}`,
            `Бүртгэсэн цэвэр мөнгөн урсгал: ${formatMNT(cash.net)}`,
            `Бартер орлого (мөнгөн урсгалд ороогүй): ${formatMNT(cash.barterReceipts)}`,
            `Төлбөрийн хэлбэр тодорхойгүй: ${cash.unclassifiedCount} гүйлгээ; орлого ${formatMNT(cash.unclassifiedReceipts)} (мөнгөн урсгалд ороогүй)`,
            'Эх үүсвэр: системд огноогоор бүртгэсэн гүйлгээ. Банкны хуулгатай тулгаагүй; бүртгээгүй төлбөр орохгүй. Ангилаагүй орлогыг урьдчилгаа гэж таамаглаагүй.',
        ] : ['Мөнгөн урсгал: санхүүгийн эрх шаардлагатай']),
        `Гэрээнд хадгалсан урьдчилгаа мөнгө: ${advance.amount === null ? 'бүртгэлгүй' : formatMNT(advance.amount)} (${advance.recordedContracts}/${advance.totalContracts} гэрээнд дүн бүртгэлтэй). Энэ нь сонгосон хугацааны орлого биш. Импорт/өмнөх бүртгэлийн энэ дүнг шинэ гүйлгээ автоматаар өөрчлөхгүй; хугацааны урьдчилгаатай нэмж нийлбэрлэхгүй.`,
        `Шинэ лид: ${leads.newCount}`,
        ...leads.bySource.map(r => `  ${sourceLabel(r.source)}: ${r.count}`),
        ...(leads.byCategory?.length ? [`Ангиллаар: ${leads.byCategory.map(r => `${r.name} ${r.count}`).join(' · ')}`] : []),
        `Одоогийн идэвхтэй лид: ${leads.health.active}; эзэнгүй ${leads.health.ownerless}; анхны холбоо бүртгээгүй ${leads.health.awaitingContact}; дараагийн алхамгүй ${leads.health.noNextStep}; холбоо барих эсвэл уулзалтын хугацаа хэтэрсэн ${leads.health.overdue}. Ангиллууд давхцаж болно.`,
    ].join('\n');
}
