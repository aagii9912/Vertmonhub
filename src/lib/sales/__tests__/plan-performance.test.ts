import { describe, expect, it } from 'vitest';
import { emptyMonthlySales, type MonthlySalesMonth } from '../monthly';
import {
    buildPlanPerformance, contractPlanScope, countsTowardPlan, hasBlockPlan, planPctText, planValueText,
    type PlanContract, type PlanPerformanceInput,
} from '../plan-performance';

/**
 * Elysium-ийн HUB файлаас (c-plan-math FIXTURES) гаргасан сар × блокийн тоо, дүн ба 2026 оны төлөвлөгөө.
 * Нэр, тоот зохиомол; дүн, тоо, огноо файлынхтай ижил.
 */
type Bucket = 'b1' | 'b2' | 'parking' | 'industry';
const KIND: Record<Bucket, { product_type: string; block_name: string }> = {
    b1: { product_type: 'residential', block_name: 'Б1' },
    b2: { product_type: 'residential', block_name: 'Б2' },
    parking: { product_type: 'parking', block_name: 'Б1' },
    industry: { product_type: 'industry', block_name: 'Б1' },
};
// [сар, блок, тоо, нийт дүн, урьдчилгааны дүн, хоцролт (гэрээний тоо, дүн)]
const LIVE: Array<[string, Bucket, number, number, number, [number, number]?]> = [
    ['2025-12', 'b1', 12, 4_501_224_480, 2_108_133_984, [3, 320_021_563]],
    ['2026-01', 'b1', 6, 3_023_530_556.20, 1_402_608_878.10, [1, 264_661_770]],
    ['2026-02', 'b1', 3, 1_596_274_840, 798_137_420, [1, 397_977_420]],
    ['2026-03', 'b1', 1, 486_170_000, 243_085_000],
    ['2026-04', 'b1', 2, 806_948_000, 403_474_000],
    ['2026-05', 'b1', 2, 1_114_785_120, 557_392_560, [1, 388_531_560]],
    ['2026-06', 'b1', 8, 3_419_712_010, 1_368_772_405, [3, 434_799_300]],
    ['2026-07', 'parking', 4, 241_400_000, 147_950_000],
    ['2026-07', 'industry', 3, 30_300_000, 9_090_000],
    ['2026-08', 'b1', 3, 1_341_214_000, 353_390_200, [1, 70_960_080]],
    ['2026-08', 'parking', 10, 688_600_000, 337_900_000, [3, 91_750_000]],
    ['2026-08', 'industry', 2, 35_800_000, 10_740_000],
    ['2026-09', 'b1', 2, 1_180_484_000, 354_145_200, [2, 233_246_200]],
    ['2026-09', 'b2', 7, 3_643_228_000, 867_302_200, [3, 280_881_000]],
    ['2026-09', 'parking', 4, 270_000_000, 175_150_000],
    ['2026-09', 'industry', 4, 59_900_004.10, 17_970_001.23],
    ['2026-10', 'b2', 4, 2_195_395_000, 658_618_500],
    ['2026-10', 'parking', 1, 86_600_000, 25_980_000],
];
const PLAN: Record<number, [number, number | null, number]> = {
    1: [1_684_332_000, null, 180_000_000], 2: [2_245_776_000, null, 240_000_000], 3: [1_684_332_000, null, 180_000_000],
    4: [2_245_776_000, null, 120_000_000], 5: [2_245_776_000, 1_122_888_000, 120_000_000], 6: [2_245_776_000, 1_684_332_000, 180_000_000],
    7: [1_122_888_000, 1_122_888_000, 120_000_000], 8: [1_684_332_000, 1_122_888_000, 180_000_000], 9: [2_245_776_000, 1_684_332_000, 240_000_000],
    10: [2_807_220_000, 2_245_776_000, 300_000_000], 11: [2_245_776_000, 1_684_332_000, 360_000_000], 12: [1_684_332_000, 2_245_776_000, 360_000_000],
};
const LATEST_IMPORT = '2026-10-22';

/** Центээр хувааж, сүүлийнх нь үлдэгдлийг авна — нийлбэр яг файлынх. */
function split(total: number, count: number): number[] {
    const totalCents = Math.round(total * 100);
    const each = Math.floor(totalCents / count);
    return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalCents - each * (count - 1) : each) / 100);
}

let sequence = 0;
function contract(over: Partial<PlanContract> & { bucket?: Bucket } = {}): PlanContract {
    const { bucket = 'b1', ...rest } = over;
    sequence++;
    return {
        id: `c${sequence}`, contract_date: '2026-09-01', contract_status: 'active', ...KIND[bucket], unit_label: `${KIND[bucket].block_name}-${sequence}`,
        total_price: 100, prepayment_due: 30, paid_amount: null, overdue_amount: 0, overdue_as_of: LATEST_IMPORT, ...rest,
    };
}

function elysiumContracts(): PlanContract[] {
    const rows: PlanContract[] = [];
    for (const [month, bucket, count, total, advance, overdue] of LIVE) {
        const totals = split(total, count);
        const advances = split(advance, count);
        const overdues = overdue ? split(overdue[1], overdue[0]) : [];
        totals.forEach((amount, index) => rows.push(contract({
            bucket, contract_date: `${month}-${String(10 + index).padStart(2, '0')}`, total_price: amount, prepayment_due: advances[index],
            overdue_amount: overdues[index] ?? 0, contract_status: bucket === 'parking' && index === 0 && (month === '2026-07' || month === '2026-08') ? 'closed' : 'active',
        })));
    }
    // Файлд байхгүй, огноогүй 10 гэрээ: Б1 6, Б2 1, зогсоол 2, агуулах 1 — нийт 4,180,533,000.
    const undated: Bucket[] = ['b1', 'b1', 'b1', 'b1', 'b1', 'b1', 'b2', 'parking', 'parking', 'industry'];
    split(4_180_533_000, undated.length).forEach((amount, index) => rows.push(contract({
        bucket: undated[index], contract_date: null, total_price: amount, overdue_amount: null, overdue_as_of: null,
    })));
    // Цуцлагдсан: 7 сар 3 / 705,511,000; 8 сар 1 / 413,350,000; 10 сар 1 / 384,675,000.
    for (const [month, count, total] of [['2026-07', 3, 705_511_000], ['2026-08', 1, 413_350_000], ['2026-10', 1, 384_675_000]] as const) {
        split(total, count).forEach(amount => rows.push(contract({ bucket: 'b2', contract_date: `${month}-05`, contract_status: 'cancelled', total_price: amount, overdue_amount: 50_000_000 })));
    }
    return rows;
}

function elysiumPlan(): MonthlySalesMonth[] {
    return emptyMonthlySales().map(row => {
        const [b1, b2, parking] = PLAN[row.month];
        const blocks = { b1: { target_amount: b1, cashflow_target_amount: b1 * 0.3 }, parking: { target_amount: parking, cashflow_target_amount: parking * 0.3 },
            ...(b2 === null ? {} : { b2: { target_amount: b2, cashflow_target_amount: b2 * 0.3 } }) };
        const total = b1 + (b2 ?? 0) + parking;
        return { ...row, revision: 1, target_amount: total, cashflow_target_amount: Math.round(total * 30) / 100, block_amounts: blocks };
    });
}

const base = (over: Partial<PlanPerformanceInput> = {}): PlanPerformanceInput => ({
    year: 2026, now: new Date('2026-10-22T04:00:00Z'), months: elysiumPlan(), planYears: [2026],
    contracts: elysiumContracts(), receipts: null, latestImportDate: LATEST_IMPORT, ...over,
});

describe('plan scope', () => {
    it('maps residential Б1/Б2 and parking into the plan; other residential joins only an unbroken-down plan', () => {
        expect(contractPlanScope({ product_type: 'residential', block_name: 'Б2' })).toBe('b2');
        expect(contractPlanScope({ product_type: 'residential', block_name: '1484' })).toBe('residential_other');
        expect(contractPlanScope({ product_type: 'industry', block_name: 'Б1' })).toBeNull();
        expect(countsTowardPlan('residential_other', true)).toBe(false);
        expect(countsTowardPlan('residential_other', false)).toBe(true);
        expect(countsTowardPlan('parking', true)).toBe(true);
        expect(countsTowardPlan(null, false)).toBe(false);
        expect(hasBlockPlan({ b1: { target_amount: 1 } })).toBe(true);
        expect(hasBlockPlan({ b1: { manual_contract_actual_amount: 1 } })).toBe(false);
        expect(hasBlockPlan({})).toBe(false);
    });
});

describe('Elysium 2026 plan fulfilment (HUB fixtures)', () => {
    const report = buildPlanPerformance(base());
    const month = (number: number) => report.months[number - 1];

    it('compares in-plan contract amounts per month and block, with a lower bound while undated contracts exist', () => {
        const sep = month(9).total.metrics.contract!;
        expect(sep).toMatchObject({ plan: 4_170_108_000, actual: 5_093_712_000, pct: 122.1, lowerBound: true, source: 'auto' });
        expect(month(9).blocks.b1.metrics.contract).toMatchObject({ actual: 1_180_484_000, pct: 52.6, lowerBound: true });
        expect(month(9).blocks.b2.metrics.contract).toMatchObject({ actual: 3_643_228_000, pct: 216.3 });
        expect(month(9).blocks.parking.metrics.contract).toMatchObject({ actual: 270_000_000, pct: 112.5 });
        expect(month(10).total.metrics.contract).toMatchObject({ plan: 5_352_996_000, actual: 2_281_995_000, pct: 42.6, lowerBound: true });
        expect(month(10).blocks.b2.metrics.contract!.pct).toBe(97.8);
        expect(month(10).blocks.parking.metrics.contract!.pct).toBe(28.9);
        expect(month(1).total.metrics.contract).toMatchObject({ actual: 3_023_530_556.2, pct: 162.2 });
        expect(month(1).blocks.b1.metrics.contract!.pct).toBe(179.5);
        expect(month(7).total.metrics.contract).toMatchObject({ actual: 241_400_000, pct: 10.2 });
        expect(month(7).blocks.parking.metrics.contract!.pct).toBe(201.2);
        expect(month(8).total.metrics.contract!.pct).toBe(67.9);
        expect(month(8).blocks.b1.metrics.contract!.pct).toBe(79.6);
        expect(month(8).blocks.parking.metrics.contract!.pct).toBe(382.6);
    });

    it('shows an undated bucket with no contracts in the month as unknown, never 0', () => {
        // 1 сард зогсоолын гэрээ алга, огноогүй 2 зогсоол байгаа → «—», % тооцохгүй.
        expect(month(1).blocks.parking.metrics.contract).toMatchObject({ plan: 180_000_000, actual: null, pct: null });
        expect(month(10).blocks.b1.metrics.contract_count).toMatchObject({ actual: null, pct: null });
        expect(month(9).total.metrics.contract_count).toMatchObject({ actual: 13, lowerBound: true, plan: null, pct: null });
        expect(planValueText(month(9).total.metrics.contract_count!.actual, true, String)).toBe('13+');
        expect(planPctText(month(10).total.metrics.contract!.pct, true)).toBe('42.6%+');
        expect(report.undated).toMatchObject({ count: 10, amount: 4_180_533_000, byScope: { b1: 6, b2: 1, parking: 2, residential_other: 0, outside: 1 } });
        expect(report.undated.contracts).toHaveLength(10);
    });

    it('lists outside-plan contracts (storage) on their own line, never in the plan total', () => {
        expect(month(9).outside).toMatchObject({ count: 4, amount: 59_900_004.1, byType: [{ label: 'Агуулах', count: 4, amount: 59_900_004.1 }] });
        expect(month(7).outside).toMatchObject({ count: 3, amount: 30_300_000 });
        expect(month(8).outside).toMatchObject({ count: 2, amount: 35_800_000 });
        expect(month(9).total.metrics.contract_count!.actual).toBe(13);
    });

    it('marks the current month in progress and leaves future months without an actual', () => {
        expect(report.throughMonth).toBe(10);
        expect(month(10).status).toBe('current');
        expect(month(9).status).toBe('past');
        expect(month(11)).toMatchObject({ status: 'future' });
        expect(month(11).total.metrics.contract).toMatchObject({ plan: 4_290_108_000, actual: null, pct: null });
        expect(month(12).blocks.b2.metrics.contract!.actual).toBeNull();
    });

    it('sums the year to date against the same months and against the full-year plan', () => {
        expect(report.ytd.total.metrics.contract).toMatchObject({
            plan: 31_055_088_000, actual: 20_094_341_526.2, pct: 64.7, lowerBound: true, yearPlan: 39_635_304_000, yearPct: 50.7,
        });
        expect(report.ytd.blocks.b1.metrics.contract).toMatchObject({ actual: 12_969_118_526.2, plan: 20_211_984_000, pct: 64.2 });
        expect(report.ytd.blocks.b2.metrics.contract).toMatchObject({ actual: 5_838_623_000, plan: 8_983_104_000, pct: 65 });
        expect(report.ytd.blocks.parking.metrics.contract).toMatchObject({ actual: 1_286_600_000, plan: 1_860_000_000, pct: 69.2 });
        expect(report.ytd.total.metrics.contract_count).toMatchObject({ actual: 57, plan: null, pct: null });
    });

    it('keeps the advance owed under contract terms as information per month and block', () => {
        expect(month(9).blocks.b1.prepaymentDue).toBe(354_145_200);
        expect(month(10).total.prepaymentDue).toBe(684_598_500);
        expect(month(10).blocks.b1).toMatchObject({ prepaymentDue: null, prepaymentMissing: 0 });
    });

    it('sums the overdue stock of the latest file only, by block, and notes cancellations', () => {
        expect(report.overdue).toMatchObject({ available: true, amount: 2_482_828_893, count: 18, asOf: LATEST_IMPORT, stale: 0 });
        expect(report.overdue.byBlock).toEqual({
            b1: { amount: 2_110_197_893, count: 12 }, b2: { amount: 280_881_000, count: 3 }, parking: { amount: 91_750_000, count: 3 },
        });
        expect(month(7).cancelled).toEqual({ count: 3, amount: 705_511_000 });
        expect(month(10).cancelled).toEqual({ count: 1, amount: 384_675_000 });
        expect(report.cancelled).toEqual({ count: 5, amount: 1_503_536_000 });
        const stale = buildPlanPerformance(base({ contracts: [...elysiumContracts(), contract({ overdue_amount: 9_000_000, overdue_as_of: '2026-10-01' })] }));
        expect(stale.overdue).toMatchObject({ amount: 2_482_828_893, stale: 1 });
        expect(buildPlanPerformance(base({ overdueAvailable: false })).overdue).toMatchObject({ available: false, amount: null, count: 0 });
    });

    it('hides the whole cash section without finance permission and shows «—» when no paid amount is known', () => {
        expect(report.cash).toBeNull();
        expect(month(9).total.metrics.cashflow).toBeUndefined();
        const withFinance = buildPlanPerformance(base({ receipts: [] }));
        expect(withFinance.cash).toEqual({ availability: 'none', unknownPaid: 88, liveContracts: 88 });
        expect(withFinance.months[8].total.metrics.cashflow).toMatchObject({ plan: 1_251_032_400, actual: null, pct: null });
        expect(withFinance.ytd.total.metrics.cashflow).toMatchObject({ plan: 9_316_526_400, yearPlan: 11_890_591_200, actual: null });
    });

    it('offers 2025 for the December contracts without a plan', () => {
        expect(report.years).toEqual([2025, 2026]);
        const previous = buildPlanPerformance(base({ year: 2025, months: emptyMonthlySales() }));
        expect(previous.throughMonth).toBe(12);
        expect(previous.months[11].total.metrics.contract).toMatchObject({ plan: null, actual: 4_501_224_480, pct: null, lowerBound: true });
        expect(previous.months[11].blocks.b1.metrics.contract_count!.actual).toBe(12);
        expect(previous.ytd.total.metrics.contract).toMatchObject({ actual: 4_501_224_480, plan: null, pct: null });
        const future = buildPlanPerformance(base({ year: 2027, months: emptyMonthlySales() }));
        expect(future.throughMonth).toBeNull();
        expect(future.months.every(row => row.status === 'future')).toBe(true);
        expect(future.ytd.total.metrics.contract).toMatchObject({ actual: null, pct: null });
    });
});

describe('year totals per block', () => {
    it('leaves a block year plan unknown when a month has only a total plan', () => {
        const months = emptyMonthlySales().map(row => row.month === 1
            ? { ...row, target_amount: 1_000 }
            : { ...row, target_amount: 500, block_amounts: { b1: { target_amount: 500 } } });
        const report = buildPlanPerformance(base({ months, contracts: [contract({ contract_date: '2026-01-10', total_price: 400 }), contract({ total_price: 200 })] }));
        expect(report.ytd.total.metrics.contract).toMatchObject({ plan: 5_500, actual: 600, pct: 10.9 });
        // 1 сарын 1,000 нь блокоор задлаагүй — Б1-ийн жилийн төлөвлөгөөг 4,500 гэж тооцож 13.3% гаргахгүй.
        expect(report.ytd.blocks.b1.metrics.contract).toMatchObject({ plan: null, yearPlan: null, actual: 600, pct: null });
        expect(report.months[8].blocks.b1.metrics.contract).toMatchObject({ plan: 500, actual: 200, pct: 40 });
    });
});

describe('manual and system precedence (M1)', () => {
    it('adds a manual block to the system blocks instead of replacing the whole month', () => {
        const months = elysiumPlan();
        months[9] = { ...months[9], manual_contract_actual_amount: 2_000_000_000,
            block_amounts: { ...months[9].block_amounts, b2: { ...months[9].block_amounts!.b2, manual_contract_actual_amount: 2_000_000_000 } } };
        const october = buildPlanPerformance(base({ months })).months[9];
        expect(october.blocks.b2.metrics.contract).toMatchObject({ actual: 2_000_000_000, source: 'manual', lowerBound: false, auto: { value: 2_195_395_000, lowerBound: true } });
        expect(october.blocks.parking.metrics.contract).toMatchObject({ actual: 86_600_000, source: 'auto', lowerBound: true });
        expect(october.total.metrics.contract).toMatchObject({ actual: 2_086_600_000, source: 'mixed', lowerBound: true, pct: 39 });
    });

    it('uses a manual total without a breakdown as the total and marks the system blocks as outside it', () => {
        const months = elysiumPlan();
        months[8] = { ...months[8], manual_contract_actual_amount: 5_000_000_000 };
        const september = buildPlanPerformance(base({ months })).months[8];
        expect(september.total.metrics.contract).toMatchObject({ actual: 5_000_000_000, source: 'manual', lowerBound: false, auto: { value: 5_093_712_000 } });
        expect(september.blocks.b2.metrics.contract).toMatchObject({ actual: 3_643_228_000, source: 'auto', inTotal: false });
    });

    it('takes a manual total only from manual blocks when every block is entered (explicit zero stays zero)', () => {
        const months = elysiumPlan();
        months[8] = { ...months[8], block_amounts: {
            b1: { ...months[8].block_amounts!.b1, manual_contract_count_actual: 2 }, b2: { ...months[8].block_amounts!.b2, manual_contract_count_actual: 7 },
            parking: { ...months[8].block_amounts!.parking, manual_contract_count_actual: 0 },
        }, manual_contract_count_actual: 9, contract_count_target: 12 };
        const september = buildPlanPerformance(base({ months })).months[8];
        expect(september.total.metrics.contract_count).toMatchObject({ actual: 9, source: 'manual', lowerBound: false, plan: 12, pct: 75 });
        expect(september.blocks.parking.metrics.contract_count).toMatchObject({ actual: 0, source: 'manual' });
    });
});

describe('projects without a block plan and cash receipts', () => {
    const mandala = (over: Partial<PlanContract> = {}) => contract({ product_type: 'residential', block_name: '1484', paid_amount: 10, ...over });

    it('counts other-block residential contracts toward an unbroken-down plan and keeps storage outside', () => {
        const months = emptyMonthlySales();
        months[8] = { ...months[8], target_amount: 1_000 };
        const report = buildPlanPerformance(base({ months, planYears: [2026], contracts: [
            mandala({ total_price: 400 }), mandala({ total_price: 100, block_name: '202' }), contract({ bucket: 'industry', total_price: 50, paid_amount: 0 }),
        ] }));
        const september = report.months[8];
        expect(september.blockPlanned).toBe(false);
        expect(september.otherResidential).toEqual({ count: 2, amount: 500, inTotal: true });
        expect(september.total.metrics.contract).toMatchObject({ plan: 1_000, actual: 500, pct: 50, lowerBound: false });
        expect(september.outside).toMatchObject({ count: 1, amount: 50, byType: [{ label: 'Агуулах', count: 1, amount: 50 }] });
        expect(report.months[7].total.metrics.contract).toMatchObject({ actual: 0, lowerBound: false });
    });

    it('lists other-block residential outside a block plan', () => {
        const report = buildPlanPerformance(base({ contracts: [mandala({ total_price: 400 }), contract({ total_price: 100 })] }));
        expect(report.months[8].total.metrics.contract!.actual).toBe(100);
        expect(report.months[8].outside).toMatchObject({ count: 1, amount: 400, byType: [{ label: 'Орон сууц · 1484', count: 1, amount: 400 }] });
    });

    it('uses ledger receipts by contract block only when every live paid amount is known', () => {
        const contracts = [contract({ id: 'k1', paid_amount: 50 }), contract({ id: 'k2', bucket: 'parking', paid_amount: 0 }), contract({ id: 'k3', bucket: 'industry', paid_amount: 5 })];
        const receipts = [
            { month: '2026-09', contractId: 'k1', amount: 30 }, { month: '2026-09', contractId: 'k2', amount: 20 },
            { month: '2026-09', contractId: null, amount: 7 }, { month: '2026-09', contractId: 'k3', amount: 5 },
        ];
        const full = buildPlanPerformance(base({ contracts, receipts }));
        expect(full.cash).toEqual({ availability: 'full', unknownPaid: 0, liveContracts: 3 });
        expect(full.months[8].blocks.b1.metrics.cashflow).toMatchObject({ actual: 30, lowerBound: false });
        expect(full.months[8].blocks.parking.metrics.cashflow).toMatchObject({ actual: 20 });
        // Гэрээгүй төлбөр нийтэд л, агуулахын төлбөр төлөвлөгөөнөөс гадуур.
        expect(full.months[8].total.metrics.cashflow).toMatchObject({ actual: 57, lowerBound: false });
        expect(full.months[8].outside.cash).toBe(5);
        expect(full.months[7].total.metrics.cashflow).toMatchObject({ actual: 0, lowerBound: false });

        const partial = buildPlanPerformance(base({ contracts: [...contracts, contract({ paid_amount: null })], receipts }));
        expect(partial.cash!.availability).toBe('partial');
        expect(partial.months[8].total.metrics.cashflow).toMatchObject({ actual: 57, lowerBound: true });
        expect(partial.months[7].total.metrics.cashflow).toMatchObject({ actual: null, lowerBound: true });
    });

    it('never counts unknown cash as zero next to a manual figure (lower bound instead)', () => {
        const months = elysiumPlan();
        // 9 сард зөвхөн Б1-ийн орсон мөнгийг гараар оруулсан; Б2, зогсоолынх бүртгэлгүй (бүх гэрээний төлсөн дүн NULL).
        months[8] = { ...months[8], block_amounts: { ...months[8].block_amounts, b1: { ...months[8].block_amounts!.b1, manual_cashflow_actual_amount: 300_000_000 } } };
        months[0] = { ...months[0], manual_cashflow_actual_amount: 100_000_000 };
        const report = buildPlanPerformance(base({ months, receipts: [] }));
        expect(report.months[8].blocks.b1.metrics.cashflow).toMatchObject({ actual: 300_000_000, source: 'manual', lowerBound: false });
        expect(report.months[8].blocks.b2.metrics.cashflow).toMatchObject({ actual: null });
        expect(report.months[8].total.metrics.cashflow).toMatchObject({ actual: 300_000_000, source: 'mixed', lowerBound: true, pct: 24 });
        expect(report.months[0].total.metrics.cashflow).toMatchObject({ actual: 100_000_000, source: 'manual', lowerBound: false });
        // Он эхнээс: 1, 9 сарын гар дүн + бусад сар тодорхойгүй → доод хязгаар.
        expect(report.ytd.total.metrics.cashflow).toMatchObject({ actual: 400_000_000, lowerBound: true });
        // Б1-д гараар 0 оруулсан ч Б2, зогсоол тодорхойгүй бол нийт нь 0 биш «—».
        months[8] = { ...months[8], block_amounts: { ...months[8].block_amounts, b1: { ...months[8].block_amounts!.b1, manual_cashflow_actual_amount: 0 } } };
        expect(buildPlanPerformance(base({ months, receipts: [] })).months[8].total.metrics.cashflow).toMatchObject({ actual: null, pct: null });
    });

    it('never treats the advance owed or the overdue stock as cash', () => {
        const report = buildPlanPerformance(base({ receipts: [] }));
        for (const row of report.months) expect(row.total.metrics.cashflow!.actual).toBeNull();
        expect(report.months[9].total.prepaymentDue).toBe(684_598_500);
    });
});
