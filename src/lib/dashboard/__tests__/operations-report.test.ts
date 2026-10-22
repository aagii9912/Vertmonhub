import { describe, expect, it } from 'vitest';
import {
    buildOperationsReport, buildMonthlyPerformance, formatOperationsReportText, OperationsRangeSchema, targetMonths,
    type OperationsContract, type OperationsLead, type OperationsTransaction, type OperationsViewing,
} from '../operations-report';
import { attainmentPct as directorPct } from '../director';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';

const range = { from: '2026-09-01', to: '2026-09-30' };
const now = '2026-09-13T04:00:00.000Z';
const contract = (over: Partial<OperationsContract> = {}): OperationsContract => ({
    id: 'c1', contract_date: '2026-09-01', contract_status: 'active', total_price: 200_000_000,
    prepayment_paid_cash: 50_000_000, product_type: 'residential', ...over,
});
const lead = (over: Partial<OperationsLead> = {}): OperationsLead => ({
    created_at: '2026-09-01T00:00:00Z', status: 'new', source: 'facebook', sales_manager_name: null,
    last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null, ...over,
});
const transaction = (over: Partial<OperationsTransaction> = {}): OperationsTransaction => ({
    txn_date: '2026-09-01', type: 'receipt', amount: 10_000_000, method: 'bank', contract_id: 'c1', ...over,
});
const base = { range, now, contracts: [] as OperationsContract[], leads: [] as OperationsLead[], transactions: [] as OperationsTransaction[] | null, targets: [] };

describe('manual monthly performance report', () => {
    it('preserves unknown versus zero across years and keeps computed contract/cash values separate', () => {
        const targets = [{ year: 2026, month: 9, target_amount: 100, manual_contract_actual_amount: 70,
            cashflow_target_amount: 40, manual_cashflow_actual_amount: 0 }];
        const monthlyPerformance = buildMonthlyPerformance(targets, range, true, [contract()]);
        const report = { ...buildOperationsReport({ ...base, contracts: [contract()], transactions: [transaction()], targets }), shopName: 'Тест', monthlyPerformance };
        expect(report.contracts.value).toBe(200_000_000);
        expect(report.cash?.receipts).toBe(10_000_000);
        expect(monthlyPerformance.months[0]).toMatchObject({ manual_contract_actual_amount: 70, manual_cashflow_actual_amount: 0 });
        const crossYear = buildMonthlyPerformance([], { from: '2026-12-01', to: '2027-01-31' }, true, []);
        expect(crossYear.months.map(row => [row.year, row.month, row.target_amount])).toEqual([[2026, 12, null], [2027, 1, null]]);
        expect(formatOperationsReportText(report)).toContain('гараар оруулсан гүйцэтгэл');
    });

    it('masks monetary management input without finance permission and never prorates partial months', () => {
        const targets = [{ year: 2026, month: 9, target_amount: 100, cashflow_target_amount: 12345, manual_cashflow_actual_amount: 98765 }];
        const monthlyPerformance = buildMonthlyPerformance(targets, range, false, []);
        expect(monthlyPerformance.months[0]).toMatchObject({ target_amount: 100, cashflow_target_amount: null, manual_cashflow_actual_amount: null });
        const text = formatOperationsReportText({ ...buildOperationsReport({ ...base, targets }), shopName: 'Тест', monthlyPerformance });
        expect(text).not.toContain('12,345');
        expect(text).not.toContain('98,765');
        expect(buildMonthlyPerformance(targets, { from: '2026-09-02', to: '2026-09-30' }, true, [])).toMatchObject({ completeMonths: false, months: [] });
    });

    it('shows the contract count plan and actual as whole contracts with attainment, also without finance permission', () => {
        const targets = [{ year: 2026, month: 9, target_amount: 100, contract_count_target: 40, manual_contract_count_actual: 30 }];
        const monthlyPerformance = buildMonthlyPerformance(targets, range, false, []);
        expect(monthlyPerformance.months[0]).toMatchObject({ contract_count_target: 40, manual_contract_count_actual: 30 });
        const text = formatOperationsReportText({ ...buildOperationsReport({ ...base, targets }), shopName: 'Тест', monthlyPerformance });
        expect(text).toContain('Гэрээний тооны төлөвлөгөө 40 гэрээ · Гэрээний тооны гүйцэтгэл 30 гэрээ (75%)');
        expect(text).not.toContain('40₮');
        expect(buildMonthlyPerformance([], range, true, []).months[0]).toMatchObject({ contract_count_target: null, manual_contract_count_actual: null });
    });
});

describe('operations report financial meaning', () => {
    it('separates dated cash, barter, unknown methods and cumulative advances', () => {
        const report = buildOperationsReport({ ...base,
            contracts: [contract(), contract({ id: 'old', contract_date: '2025-01-01', prepayment_paid_cash: 80_000_000 })],
            transactions: [transaction(), transaction({ method: 'barter', amount: 90_000_000 }), transaction({ method: null, amount: 5_000_000 }),
                transaction({ txn_date: '2026-08-31', amount: 500_000_000 }), transaction({ type: 'disbursement', amount: 3_000_000 }),
                transaction({ method: 'cash', contract_id: null, amount: 1_000_000 })],
        });
        expect(report.contracts.value).toBe(200_000_000);
        expect(report.cash).toMatchObject({ receipts: 11_000_000, contractReceipts: 10_000_000, receiptCount: 2, disbursements: 3_000_000,
            net: 8_000_000, barterReceipts: 90_000_000, unclassifiedReceipts: 5_000_000, unclassifiedCount: 1 });
        expect(report.advanceSnapshot.amount).toBe(130_000_000);
        const text = formatOperationsReportText({ ...report, shopName: 'Тест төсөл' });
        expect(text).toContain('Энэ нь сонгосон хугацааны орлого биш');
        expect(text).toContain('шинэ гүйлгээ автоматаар өөрчлөхгүй');
        expect(text).toContain('хугацааны урьдчилгаатай нэмж нийлбэрлэхгүй');
    });

    it('excludes deleted and cancelled contracts while preserving missing amounts and dates', () => {
        const report = buildOperationsReport({ ...base, contracts: [contract(), contract({ contract_status: 'cancelled' }), contract({ deleted_at: now }),
            contract({ total_price: null, prepayment_paid_cash: null }), contract({ contract_date: null, prepayment_paid_cash: null })],
            targets: [{ year: 2026, month: 9, target_amount: 400_000_000 }],
        });
        expect(report.contracts).toEqual({ count: 2, value: 200_000_000, missingAmounts: 1, undatedCount: 1,
            byProduct: [{ productType: 'residential', label: 'Орон сууц', count: 2, value: 200_000_000, missingAmounts: 1 }] });
        // Дүн дутуу, огноогүй гэрээ — «Төлөвлөгөөний биелэлт»-тэй адил мэдэгдэх дүнгийн доод хязгаар (50%+), 0 эсвэл бүтэн биш.
        expect(report.target).toMatchObject({ attainmentPct: 50, attainmentPartial: true, actual: { value: 200_000_000, lowerBound: true } });
        expect(report.advanceSnapshot).toEqual({ amount: 50_000_000, recordedContracts: 1, totalContracts: 3 });
    });

    it('does not fabricate monetary zeros for unreadable cash or absent advance snapshots', () => {
        const report = buildOperationsReport({ ...base, transactions: null, contracts: [contract({ prepayment_paid_cash: null })] });
        expect(report.cash).toBeNull();
        expect(report.advanceSnapshot.amount).toBeNull();
        expect(report.target.amount).toBeNull();
        expect(() => buildOperationsReport({ ...base, transactions: [transaction({ amount: null })] })).toThrow();
        expect(() => buildOperationsReport({ ...base, contracts: [contract({ total_price: 'invalid' })] })).toThrow();
    });

    it('counts only classified dated cash advances and exposes legacy classification gaps', () => {
        const report = buildOperationsReport({ ...base, transactions: [
            transaction({ receipt_kind: 'advance', amount: 40, method: 'bank_transfer' }),
            transaction({ receipt_kind: 'installment', amount: 30 }),
            transaction({ receipt_kind: 'other', amount: 20 }),
            transaction({ receipt_kind: null, amount: 10 }),
            transaction({ receipt_kind: 'advance', method: 'barter', amount: 100 }),
            transaction({ receipt_kind: 'advance', txn_date: '2026-08-31', amount: 200 }),
        ] });
        expect(report.cash).toMatchObject({ receipts: 100, advanceReceipts: 40, advanceReceiptCount: 1,
            installmentReceipts: 30, otherReceipts: 20, unclassifiedCashReceipts: 10, unclassifiedCashReceiptCount: 1 });
        expect(buildOperationsReport({ ...base, receiptClassificationAvailable: false }).cash?.receiptClassificationAvailable).toBe(false);
    });

    it('requires complete monthly targets and handles leap years / year boundaries', () => {
        expect(targetMonths({ from: '2024-02-01', to: '2024-02-29' })).toEqual(['2024-02']);
        expect(targetMonths({ from: '2026-12-01', to: '2027-01-31' })).toEqual(['2026-12', '2027-01']);
        expect(targetMonths({ from: '2026-09-01', to: '2026-09-13' })).toBeNull();
        const report = buildOperationsReport({ ...base, contracts: [contract()], targets: [{ year: 2026, month: 9, target_amount: 400_000_000 }] });
        expect(report.target.attainmentPct).toBe(50);
        expect(buildOperationsReport({ ...base, range: { from: '2026-08-01', to: '2026-09-30' }, targets: [{ year: 2026, month: 9, target_amount: 400_000_000 }] }).target.amount).toBeNull();
    });

    it('compares only in-plan contracts with the plan and marks a lower bound while undated contracts exist', () => {
        const targets = [{ year: 2026, month: 9, target_amount: 400_000_000, block_amounts: { b1: { target_amount: 300_000_000 }, parking: { target_amount: 100_000_000 } } }];
        const report = buildOperationsReport({ ...base, targets, contracts: [
            contract({ block_name: 'Б1' }),
            contract({ id: 'storage', product_type: 'industry', total_price: 50_000_000 }),
            contract({ id: 'other-block', block_name: '202', total_price: 70_000_000 }),
            contract({ id: 'undated', contract_date: null, product_type: 'parking' }),
        ] });
        expect(report.contracts).toMatchObject({ count: 3, value: 320_000_000, undatedCount: 1 });
        expect(report.target).toMatchObject({ amount: 400_000_000, attainmentPct: 50, attainmentPartial: true,
            planContracts: { count: 1, value: 200_000_000, outsideCount: 2 } });
        expect(formatOperationsReportText({ ...report, shopName: 'Тест' })).toContain('биелэлт 50%+ (төлөвлөгөөнд хамаарахгүй 2 гэрээг хассан)');

        // Хугацаанд төлөвлөгөөнд хамаарах гэрээ алга, огноогүй нь байгаа бол хувь тодорхойгүй — 0% биш.
        const unknown = buildOperationsReport({ ...base, targets, contracts: [contract({ id: 'undated', contract_date: null, product_type: 'parking' })] });
        expect(unknown.target.attainmentPct).toBeNull();
        expect(buildOperationsReport({ ...base, targets, contracts: [] }).target.attainmentPct).toBe(0);

        // Блокоор задлаагүй төлөвлөгөөнд бусад блокийн орон сууц орно, агуулах орохгүй.
        const total = buildOperationsReport({ ...base, targets: [{ year: 2026, month: 9, target_amount: 400_000_000 }],
            contracts: [contract({ block_name: '202' }), contract({ id: 'storage', product_type: 'industry' })] });
        expect(total.target).toMatchObject({ attainmentPct: 50, attainmentPartial: false });
    });
});

describe('manual block precedence shared with the plan page (M1)', () => {
    // 10-р сар: зөвхөн Б2-ийн гүйцэтгэлийг гараар 2,000,000,000 оруулсан (мөрийн нийт = оруулсан блокуудын нийлбэр).
    const october = { from: '2026-10-01', to: '2026-10-31' };
    const target = { year: 2026, month: 10, target_amount: 5_352_996_000, manual_contract_actual_amount: 2_000_000_000, block_amounts: {
        b1: { target_amount: 2_807_220_000 }, b2: { target_amount: 2_245_776_000, manual_contract_actual_amount: 2_000_000_000 }, parking: { target_amount: 300_000_000 },
    } };
    const contracts: OperationsContract[] = [
        ...[0, 1, 2, 3].map(index => contract({ id: `b2-${index}`, contract_date: `2026-10-1${index}`, block_name: 'Б2', total_price: 548_848_750 })),
        contract({ id: 'p-1', contract_date: '2026-10-15', product_type: 'parking', block_name: 'Б1', total_price: 86_600_000 }),
        contract({ id: 'u-b1', contract_date: null, block_name: 'Б1' }), contract({ id: 'u-p', contract_date: null, product_type: 'parking', block_name: 'Б1' }),
        contract({ id: 'u-s', contract_date: null, product_type: 'industry', block_name: 'Б1' }),
    ];

    it('gives the operations %, the monthly table and the plan page / Director the same 2,086,600,000+ and 39%+', () => {
        const report = buildOperationsReport({ ...base, range: october, now: '2026-10-22T04:00:00.000Z', contracts, targets: [target] });
        expect(report.target).toMatchObject({ amount: 5_352_996_000, attainmentPct: 39, attainmentPartial: true, actual: { value: 2_086_600_000, lowerBound: true } });
        const monthly = buildMonthlyPerformance([target], october, false, contracts);
        expect(monthly.months[0].resolved.contract).toEqual({ value: 2_086_600_000, lowerBound: true, source: 'mixed' });
        expect(monthly.months[0].resolved.count).toEqual({ value: 5, lowerBound: true, source: 'auto' });

        const months = emptyMonthlySales();
        months[9] = { ...months[9], target_amount: target.target_amount, manual_contract_actual_amount: target.manual_contract_actual_amount, block_amounts: target.block_amounts };
        const plan = buildPlanPerformance({ year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], receipts: null, latestImportDate: null,
            contracts: contracts.map(row => ({ ...row, unit_label: row.id }) as PlanContract) });
        const cell = plan.months[9].total.metrics.contract!;
        expect(cell).toMatchObject({ actual: 2_086_600_000, lowerBound: true, source: 'mixed', pct: 39 });
        expect(directorPct(cell.actual, cell.plan)).toBe(39);
    });

    it('lets a whole-month manual total win when the month has no block breakdown', () => {
        const report = buildOperationsReport({ ...base, range: october, now: '2026-10-22T04:00:00.000Z', contracts,
            targets: [{ year: 2026, month: 10, target_amount: 5_000_000_000, manual_contract_actual_amount: 4_000_000_000 }] });
        expect(report.target).toMatchObject({ attainmentPct: 80, attainmentPartial: false });
    });
});

describe('operations meetings and product breakdown', () => {
    it('counts meeting events by their recorded Ulaanbaatar date and completed status', () => {
        const viewing = (over: Partial<OperationsViewing> = {}): OperationsViewing => ({
            scheduled_at: '2026-09-15T00:00:00Z', status: 'completed', meeting_type: 'new_customer', ...over,
        });
        const report = buildOperationsReport({ ...base, viewings: [
            viewing({ scheduled_at: '2026-08-31T16:00:00Z' }), // September 1 in UB
            viewing({ scheduled_at: '2026-09-30T15:59:59.999Z', meeting_type: 'repeat_customer' }),
            viewing({ meeting_type: 'existing_buyer' }), viewing({ meeting_type: null }),
            viewing({ meeting_type: 'legacy_type' }), viewing({ status: 'scheduled' }),
            viewing({ status: 'cancelled' }), viewing({ status: 'no_show' }), viewing({ status: null }),
            viewing({ scheduled_at: '2026-08-31T15:59:59Z' }), viewing({ scheduled_at: '2026-09-30T16:00:00Z' }),
            viewing({ deleted_at: now }),
        ] });
        expect(report.meetings).toMatchObject({ count: 9, completed: 5, newCustomer: 1, repeatCustomer: 1, existingBuyer: 1,
            unclassified: 2, scheduled: 1, cancelled: 1, noShow: 1, unknownStatus: 1, classificationAvailable: true });
        expect(report.meetings?.basis).toContain('давхардалгүй хүний тоо биш');
        const text = formatOperationsReportText({ ...report, shopName: 'Тест' });
        expect(text).toContain('Болсон уулзалтын бүртгэл: 5');
        expect(text).toContain('төрөл тодорхойгүй 2');
    });

    it('distinguishes unprovided meeting data from a successfully read empty period', () => {
        expect(buildOperationsReport(base).meetings).toBeNull();
        expect(buildOperationsReport({ ...base, viewings: [] }).meetings?.completed).toBe(0);
        const report = buildOperationsReport({ ...base, viewings: [{ scheduled_at: now, status: 'completed' }], meetingClassificationAvailable: false });
        expect(report.meetings).toMatchObject({ completed: 1, unclassified: 1, classificationAvailable: false });
        const text = formatOperationsReportText({ ...report, shopName: 'Тест' });
        expect(text).toContain('төрлийн ангилал системд хараахан нэвтрээгүй');
        expect(text).toContain('шинэ харилцагч — · давтан — · худалдан авагч —');
    });

    it('reconciles products to the same valid dated contracts and preserves unknown/custom types', () => {
        const report = buildOperationsReport({ ...base, contracts: [
            contract(), contract({ product_type: 'parking', total_price: 50 }),
            contract({ product_type: 'industry', total_price: null }), contract({ product_type: 'commercial', total_price: 0 }),
            contract({ product_type: null, total_price: 25 }), contract({ product_type: 'custom', total_price: 10 }),
            contract({ product_type: '__proto__', total_price: 5 }), contract({ contract_status: 'cancelled', total_price: 999 }),
            contract({ contract_date: null, total_price: 999 }), contract({ contract_date: '2026-08-31', total_price: 999 }),
        ] });
        expect(report.contracts.byProduct.reduce((sum, product) => sum + product.count, 0)).toBe(report.contracts.count);
        expect(report.contracts.byProduct.reduce((sum, product) => sum + product.value, 0)).toBe(report.contracts.value);
        expect(report.contracts.byProduct).toContainEqual({ productType: 'industry', label: 'Агуулах', count: 1, value: 0, missingAmounts: 1 });
        expect(report.contracts.byProduct).toContainEqual({ productType: '__proto__', label: '__proto__', count: 1, value: 5, missingAmounts: 0 });
        expect(report.contracts.byProduct).toContainEqual({ productType: 'unknown', label: 'Төрөл тодорхойгүй', count: 1, value: 25, missingAmounts: 0 });
        expect(formatOperationsReportText({ ...report, shopName: 'Тест' })).toContain('Агуулах: 1 гэрээ');
    });
});

describe('operations lead scope and date validation', () => {
    it('counts lead creation by Ulaanbaatar dates and keeps live queues independent of range', () => {
        const report = buildOperationsReport({ ...base, leads: [
            lead({ created_at: '2026-08-31T16:00:00Z' }), // September 1 in UB
            lead({ created_at: '2026-08-31T15:59:59Z', status: 'contacted', sales_manager_name: 'Бат', last_contact_at: now, next_followup_at: '2026-09-12T00:00:00Z' }),
            lead({ status: 'viewing_scheduled', sales_manager_name: 'Бат', last_contact_at: now, viewing_scheduled_at: '2026-09-12T00:00:00Z' }),
            lead({ status: 'closed_won' }), lead({ deleted_at: now }),
        ] });
        expect(report.leads.newCount).toBe(3);
        expect(report.leads.health).toEqual({ active: 3, ownerless: 1, awaitingContact: 1, noNextStep: 1, overdue: 2 });
    });
    it.each([
        { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-09-10', to: '2026-09-01' },
        { from: '2020-01-01', to: '2026-09-01' }, { from: '', to: '2026-09-01' },
    ])('rejects an invalid or unbounded report range %j', input => {
        expect(OperationsRangeSchema.safeParse(input).success).toBe(false);
    });
});
