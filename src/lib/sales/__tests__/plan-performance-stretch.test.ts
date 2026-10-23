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

/** 1–10 сар бүгдэд нэмэлт төлөвлөгөөтэй (мөнгө нь 3 сард алга). */
const fullYearToDate = () => {
    const months = emptyMonthlySales().map((month, index) => index < 10
        ? { ...month, stretch_target_amount: 100 + index, stretch_cashflow_target_amount: index === 2 ? null : 10 }
        : month);
    months[11] = { ...months[11], stretch_target_amount: 999 };
    return months;
};

describe('stretch plan pass-through', () => {
    it('exposes each month stretch plan; the year-to-date sum is unknown unless every month 1–M has one (the base YTD plan rule)', () => {
        const report = buildPlanPerformance(input());
        expect(report.months[9].stretch).toEqual({ contract: 7_152_996_000, cashflow: 2_145_898_800 });
        expect(report.months[0].stretch).toEqual({ contract: null, cashflow: null });
        // Ирээдүйн сарын төлөвлөгөө ч харагдана (төлөвлөгөө, гүйцэтгэл биш).
        expect(report.months[11].stretch).toEqual({ contract: 1, cashflow: null });
        // 1–8 сард нэмэлт төлөвлөгөө алга: 9, 10 сарын хэсэгчилсэн нийлбэрийг 1–10 сарын гүйцэтгэлтэй харьцуулахгүй («—»),
        // үндсэн төлөвлөгөөний он эхнээсх дүрэмтэй адил (sumPlan).
        expect(report.ytd.stretch).toEqual({ contract: null, cashflow: null });
        expect(report.ytd.total.metrics.contract?.plan).toBeNull();
        // Үндсэн төлөвлөгөөтэй нэмэгдэхгүй.
        expect(report.months[9].total.metrics.contract?.plan).toBe(5_352_996_000);
    });

    it('sums 1–M when every month has a stretch plan, per metric, and never adds the months after M', () => {
        const report = buildPlanPerformance(input({ months: fullYearToDate() }));
        expect(report.throughMonth).toBe(10);
        // 100+101+…+109 = 1045; мөнгө 3 сард алга → тодорхойгүй.
        expect(report.ytd.stretch).toEqual({ contract: 1045, cashflow: null });
        const cash = fullYearToDate().map(month => ({ ...month, stretch_cashflow_target_amount: month.stretch_cashflow_target_amount ?? 0.5 }));
        expect(buildPlanPerformance(input({ months: cash })).ytd.stretch).toEqual({ contract: 1045, cashflow: 90.5 });
    });

    it('hides the stretch cash plan without finance access and is unknown when nothing is entered', () => {
        const hidden = buildPlanPerformance(input({ receipts: null }));
        expect(hidden.months[9].stretch).toEqual({ contract: 7_152_996_000, cashflow: null });
        expect(hidden.ytd.stretch.cashflow).toBeNull();
        const hiddenFull = buildPlanPerformance(input({ months: fullYearToDate().map(month => ({ ...month, stretch_cashflow_target_amount: 10 })), receipts: null }));
        expect(hiddenFull.ytd.stretch).toEqual({ contract: 1045, cashflow: null });
        const empty = buildPlanPerformance(input({ months: emptyMonthlySales() }));
        expect(empty.ytd.stretch).toEqual({ contract: null, cashflow: null });
        expect(buildPlanPerformance(input({ year: 2027 })).ytd.stretch).toEqual({ contract: null, cashflow: null });
    });
});
