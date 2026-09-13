import { z } from 'zod';
import { ACTIVE_STATUSES, sourceLabel } from '@/lib/leads/labels';
import { getLeadWorkQueues } from '@/lib/leads/work-queue';
import { formatMNT } from '@/lib/utils/currency';
import { ubDateStr, ubMonthRange } from '@/lib/utils/date';

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
    deleted_at?: string | null;
}
export interface OperationsTransaction {
    txn_date: string;
    type: string;
    amount: Amount;
    method: string | null;
    contract_id: string | null;
    receipt_kind?: string | null;
}
export interface OperationsTarget { year: number; month: number; target_amount: Amount }

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
}) {
    const { range, now } = input;
    const within = (date: string | null) => !!date && date >= range.from && date <= range.to;
    const contracts = input.contracts.filter(c => !c.deleted_at && c.contract_status !== 'cancelled');
    const periodContracts = contracts.filter(c => within(c.contract_date));
    let contractValue = 0;
    let missingContractAmounts = 0;
    for (const c of periodContracts) {
        const value = amount(c.total_price);
        if (value === null) missingContractAmounts++;
        else contractValue += value;
    }
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
        contracts: { count: periodContracts.length, value: contractValue, missingAmounts: missingContractAmounts, undatedCount: contracts.filter(c => !c.contract_date).length },
        target: { amount: targetAmount, completeMonths: !!months, configuredMonths: targetValues?.filter(t => t !== null).length ?? 0, expectedMonths: months?.length ?? 0,
            attainmentPct: targetAmount && !missingContractAmounts ? Math.round(contractValue / targetAmount * 100) : null },
        cash,
        // Stored contract/import snapshot. New ledger receipts do not update this field.
        advanceSnapshot: { amount: snapshots.some(n => n !== null) ? snapshots.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null,
            recordedContracts: snapshots.filter(n => n !== null).length, totalContracts: contracts.length },
        leads: { newCount: newLeads.length, bySource: [...bySource].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count), health: leadHealth },
    };
}

export type OperationsReport = ReturnType<typeof buildOperationsReport> & { shopName: string };

export function formatOperationsReportText(report: OperationsReport): string {
    const { range, contracts, target, cash, advanceSnapshot: advance, leads } = report;
    return [
        `${report.shopName} · Үйл ажиллагааны тайлан`,
        `Хугацаа: ${range.from} – ${range.to} (Улаанбаатар)`,
        `Гаргасан: ${ubDateStr(new Date(report.generatedAt))}`,
        `Гэрээ: ${contracts.count} · бүртгэлтэй дүн ${formatMNT(contracts.value)}`,
        `Дүн дутуу гэрээ: ${contracts.missingAmounts} · огноогүй гэрээ (хугацаанд ороогүй): ${contracts.undatedCount}`,
        target.amount !== null ? `Гэрээний зорилт: ${formatMNT(target.amount)} · биелэлт ${target.attainmentPct === null ? 'тооцох боломжгүй' : `${target.attainmentPct}%`}` : 'Гэрээний зорилт: сонгосон хугацаанд бүрэн тохируулаагүй эсвэл бүтэн сар сонгоогүй',
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
        `Одоогийн идэвхтэй лид: ${leads.health.active}; эзэнгүй ${leads.health.ownerless}; анхны холбоо бүртгээгүй ${leads.health.awaitingContact}; дараагийн алхамгүй ${leads.health.noNextStep}; холбоо барих эсвэл уулзалтын хугацаа хэтэрсэн ${leads.health.overdue}. Ангиллууд давхцаж болно.`,
    ].join('\n');
}
