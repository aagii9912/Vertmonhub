import { describe, expect, it } from 'vitest';
import { emptyMonthlySales, type MonthlySalesMonth } from '../monthly';
import { buildPlanPerformance, type PlanContract, type PlanPerformanceInput } from '../plan-performance';

/**
 * W5/W6 (эзэмшигч 2026-10-22): HUB файлын «Нийт төлсөн дүн»-өөс тухайн сард захиалсан гэрээний cohort орсон мөнгө.
 * Тоо нь багийн 10-р сарын илтгэлийнх: Б2 161,844,800 · зогсоол 25,980,000 · нийт 187,824,800.
 */
const AS_OF = '2026-10-22';
const KIND = {
    b1: { product_type: 'residential', block_name: 'Б1' },
    b2: { product_type: 'residential', block_name: 'Б2' },
    parking: { product_type: 'parking', block_name: 'Б1' },
} as const;

let sequence = 0;
function contract(bucket: keyof typeof KIND, over: Partial<PlanContract> = {}): PlanContract {
    sequence++;
    return {
        id: `c${sequence}`, contract_date: '2026-10-10', contract_status: 'active', ...KIND[bucket], unit_label: `${KIND[bucket].block_name}-${sequence}`,
        total_price: 500_000_000, prepayment_due: 150_000_000, paid_amount: null, ...over,
    };
}

function plan(over: (row: MonthlySalesMonth) => Partial<MonthlySalesMonth> = () => ({})): MonthlySalesMonth[] {
    return emptyMonthlySales().map(row => ({
        ...row, revision: 1, target_amount: 5_352_996_000, cashflow_target_amount: 1_605_898_800,
        block_amounts: {
            b1: { target_amount: 2_807_220_000, cashflow_target_amount: 842_166_000 },
            b2: { target_amount: 2_245_776_000, cashflow_target_amount: 673_732_800 },
            parking: { target_amount: 300_000_000, cashflow_target_amount: 90_000_000 },
        },
        ...over(row),
    }));
}

function fixture() {
    const b2 = [contract('b2', { id: 'b2-1' }), contract('b2', { id: 'b2-2' }), contract('b2', { id: 'b2-3' })];
    const parking = contract('parking', { id: 'p-1', contract_date: '2026-10-04', total_price: 86_600_000, prepayment_due: 25_980_000 });
    const september = contract('b1', { id: 'b1-9', contract_date: '2026-09-16', prepayment_due: 177_400_200 });
    const cancelled = contract('b2', { id: 'b2-x', contract_status: 'cancelled', prepayment_due: 99_000_000 });
    const paid = new Map<string, number | null>([['b2-1', 43_981_200], ['b2-2', 72_604_800], ['b2-3', 45_258_800], ['p-1', 25_980_000], ['b1-9', 268_348_500], ['b2-x', 10]]);
    return { contracts: [...b2, parking, september, cancelled], paid };
}

const base = (over: Partial<PlanPerformanceInput> = {}): PlanPerformanceInput => {
    const { contracts, paid } = fixture();
    return {
        year: 2026, now: new Date('2026-10-22T04:00:00Z'), months: plan(), planYears: [2026], contracts,
        receipts: [], ledgerSince: null, latestImportDate: AS_OF, hubPaid: { asOf: AS_OF, paid }, ...over,
    };
};

describe('HUB paid cash cohort (W5/W6)', () => {
    it('sums the file paid-to-date of each month\'s live contracts per block, as of the file date', () => {
        const report = buildPlanPerformance(base());
        const october = report.months[9];
        expect(october.blocks.b2.metrics.cashflow).toMatchObject({ plan: 673_732_800, actual: 161_844_800, lowerBound: false, source: 'auto', pct: 24 });
        expect(october.blocks.parking.metrics.cashflow).toMatchObject({ actual: 25_980_000, lowerBound: false, pct: 28.9 });
        // Б1-д энэ сард гэрээ алга, огноогүй гэрээ алга — энэ сарын гэрээнээс орсон мөнгө 0 (мэдэгдэж буй).
        expect(october.blocks.b1.metrics.cashflow).toMatchObject({ actual: 0, lowerBound: false });
        expect(october.total.metrics.cashflow).toMatchObject({ actual: 187_824_800, lowerBound: false, source: 'auto' });
        // 9-р сарын Б1 гэрээний төлсөн дүн 9-р сард (захиалсан сар) — 10-р сард биш; цуцалсан гэрээ орохгүй.
        expect(report.months[8].blocks.b1.metrics.cashflow).toMatchObject({ actual: 268_348_500 });
        expect(report.months[10].total.metrics.cashflow).toMatchObject({ actual: null });
        expect(report.cash).toEqual({ availability: 'full', unknownPaid: 0, liveContracts: 5, ledgerSince: null, source: 'hub_paid', hubPaidAsOf: AS_OF });
        expect(report.ytd.blocks.b2.metrics.cashflow).toMatchObject({ actual: 161_844_800, lowerBound: false });
    });

    it('turns a block-month into a lower bound for a row without a number, an unmatched contract or an undated contract', () => {
        const { contracts, paid } = fixture();
        paid.set('b2-3', null);
        paid.delete('p-1');
        const report = buildPlanPerformance(base({ hubPaid: { asOf: AS_OF, paid }, contracts: [...contracts, contract('b1', { id: 'b1-undated', contract_date: null })] }));
        const october = report.months[9];
        expect(october.blocks.b2.metrics.cashflow).toMatchObject({ actual: 116_586_000, lowerBound: true, pct: 17.3 });
        // Зогсоолын ганц гэрээ файлд тулгагдаагүй — «—», 0 биш.
        expect(october.blocks.parking.metrics.cashflow).toMatchObject({ actual: null, lowerBound: true });
        // Огноогүй Б1 гэрээ аль ч сарынх байж болно: гэрээгүй сар «—», гэрээтэй сар «N+».
        expect(october.blocks.b1.metrics.cashflow).toMatchObject({ actual: null, lowerBound: true });
        expect(report.months[8].blocks.b1.metrics.cashflow).toMatchObject({ actual: 268_348_500, lowerBound: true });
        expect(october.total.metrics.cashflow).toMatchObject({ actual: 116_586_000, lowerBound: true });
        expect(report.cash).toMatchObject({ availability: 'partial', unknownPaid: 3, source: 'hub_paid' });
    });

    it('lets a manual block entry win (M1) and never mixes it with the file amount', () => {
        const months = plan(row => row.month === 10 ? { block_amounts: {
            b1: { target_amount: 2_807_220_000, cashflow_target_amount: 842_166_000, manual_cashflow_actual_amount: 0 },
            b2: { target_amount: 2_245_776_000, cashflow_target_amount: 673_732_800, manual_cashflow_actual_amount: 150_000_000 },
            parking: { target_amount: 300_000_000, cashflow_target_amount: 90_000_000 },
        } } : {});
        const october = buildPlanPerformance(base({ months })).months[9];
        expect(october.blocks.b2.metrics.cashflow).toMatchObject({ actual: 150_000_000, source: 'manual', auto: { value: 161_844_800, lowerBound: false } });
        expect(october.blocks.parking.metrics.cashflow).toMatchObject({ actual: 25_980_000, source: 'auto' });
        expect(october.total.metrics.cashflow).toMatchObject({ actual: 175_980_000, source: 'mixed', lowerBound: false });
    });

    it('ignores ledger receipts while the file has paid totals, and keeps the ledger rule without them', () => {
        const receipts = [{ month: '2026-10', contractId: 'b2-1', amount: 1_000 }, { month: '2026-10', contractId: null, amount: 7 }];
        const withHub = buildPlanPerformance(base({ receipts, ledgerSince: '2026-01-05' }));
        expect(withHub.months[9].total.metrics.cashflow).toMatchObject({ actual: 187_824_800, lowerBound: false });
        const { contracts } = fixture();
        const ledger = buildPlanPerformance(base({ receipts, ledgerSince: '2026-01-05', hubPaid: null, contracts: contracts.map(row => ({ ...row, paid_amount: 1 })) }));
        expect(ledger.cash).toMatchObject({ source: 'ledger', hubPaidAsOf: null, ledgerSince: '2026-01-05', availability: 'full' });
        expect(ledger.months[9].blocks.b2.metrics.cashflow).toMatchObject({ actual: 1_000 });
        expect(ledger.months[9].total.metrics.cashflow).toMatchObject({ actual: 1_007 });
    });

    it('hides the cash section without finance even when the file has paid totals', () => {
        const report = buildPlanPerformance(base({ receipts: null }));
        expect(report.cash).toBeNull();
        expect(report.months[9].total.metrics.cashflow).toBeUndefined();
    });

    it('keeps the month\'s advance (prepayment_due of live contracts) as information beside the cash', () => {
        const october = buildPlanPerformance(base()).months[9];
        // «Нийт» (W6, advanceOfMonth) = prepaymentDue: Б2 3 × 150,000,000 (цуцалсан хасагдана), зогсоол 25,980,000.
        expect(october.blocks.b2.prepaymentDue).toBe(450_000_000);
        expect(october.blocks.parking.prepaymentDue).toBe(25_980_000);
        expect(october.total.prepaymentDue).toBe(475_980_000);
    });
});
