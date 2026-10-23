import { describe, expect, it } from 'vitest';
import { emptyMonthlySales } from '../monthly';
import { buildPlanPerformance, type PlanPerformanceInput } from '../plan-performance';

const input = (over: Partial<PlanPerformanceInput> = {}): PlanPerformanceInput => {
    const months = emptyMonthlySales();
    months[8] = { ...months[8], stretch_target_amount: 6_000_000_000.5, stretch_cashflow_target_amount: 1_800_000_000 };
    months[9] = { ...months[9], target_amount: 5_352_996_000, stretch_target_amount: 7_152_996_000, stretch_cashflow_target_amount: 2_145_898_800 };
    months[11] = { ...months[11], stretch_target_amount: 1 };
    return { year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], contracts: [], receipts: [], latestImportDate: null, ...over };
};

describe('stretch plan pass-through', () => {
    it('exposes each month stretch plan and year-to-date sums of the entered months only', () => {
        const report = buildPlanPerformance(input());
        expect(report.months[9].stretch).toEqual({ contract: 7_152_996_000, cashflow: 2_145_898_800 });
        expect(report.months[0].stretch).toEqual({ contract: null, cashflow: null });
        // Ирээдүйн сарын төлөвлөгөө ч харагдана (төлөвлөгөө, гүйцэтгэл биш).
        expect(report.months[11].stretch).toEqual({ contract: 1, cashflow: null });
        // Он эхнээс 1–10 сар: 9, 10 сарын нийлбэр (12 сар орохгүй).
        expect(report.ytd.stretch).toEqual({ contract: 13_152_996_000.5, cashflow: 3_945_898_800 });
        // Үндсэн төлөвлөгөөтэй нэмэгдэхгүй.
        expect(report.months[9].total.metrics.contract?.plan).toBe(5_352_996_000);
    });

    it('hides the stretch cash plan without finance access and is unknown when nothing is entered', () => {
        const hidden = buildPlanPerformance(input({ receipts: null }));
        expect(hidden.months[9].stretch).toEqual({ contract: 7_152_996_000, cashflow: null });
        expect(hidden.ytd.stretch.cashflow).toBeNull();
        const empty = buildPlanPerformance(input({ months: emptyMonthlySales() }));
        expect(empty.ytd.stretch).toEqual({ contract: null, cashflow: null });
        expect(buildPlanPerformance(input({ year: 2027 })).ytd.stretch).toEqual({ contract: null, cashflow: null });
    });
});
