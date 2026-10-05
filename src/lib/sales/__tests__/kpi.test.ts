import { describe, expect, it } from 'vitest';
import { KPI_ITEMS, KpiMonthInputSchema, kpiGrade, scoreKpi } from '../kpi';

describe('KPI v2 template', () => {
    it('weighs results 60, activity 25 and quality 15 (sum 100)', () => {
        const by = (group: string) => KPI_ITEMS.filter(item => item.group === group).reduce((sum, item) => sum + item.weight, 0);
        expect([by('result'), by('activity'), by('quality')]).toEqual([60, 25, 15]);
    });

    it('measures request resolution from the CRM and calls from the CRM with a manual override', () => {
        const item = (key: string) => KPI_ITEMS.find(row => row.key === key)!;
        expect(item('service_resolution')).toMatchObject({ group: 'quality', unit: 'pct', weight: 5, cap: 1, source: 'crm' });
        expect(item('management')).toMatchObject({ weight: 10 });
        expect(item('calls_chats')).toMatchObject({ source: 'crm', weight: 10 });
    });
});

describe('scoreKpi', () => {
    it('caps attainment per item and normalizes over the items that could be scored', () => {
        const result = scoreKpi({
            plans: { contract_amount: 1000, cash_collected: 500, new_meetings: 10 },
            actuals: { contract_amount: 2000, cash_collected: 250, new_meetings: 12, overdue_collected: 5, followup: null },
            management: 4,
        });
        const item = (key: string) => result.items.find(row => row.key === key)!;
        expect(item('contract_amount')).toMatchObject({ attainmentPct: 200, score: 37.5 }); // 25 × 1.5 cap
        expect(item('cash_collected')).toMatchObject({ attainmentPct: 50, score: 12.5 });
        expect(item('new_meetings')).toMatchObject({ attainmentPct: 120, score: 12 });
        expect(item('overdue_collected')).toMatchObject({ score: null, missing: 'plan' });
        expect(item('followup')).toMatchObject({ score: null, missing: 'actual' });
        expect(item('calls_chats')).toMatchObject({ score: null, missing: 'actual' });
        expect(item('service_resolution')).toMatchObject({ score: null, missing: 'actual' });
        expect(item('management')).toMatchObject({ plan: 5, actual: 4, score: 8 });
        // (37.5 + 12.5 + 12 + 8) / (25 + 25 + 10 + 10) = 70 / 70
        expect(result.coveredWeight).toBe(70);
        expect(result.total).toBe(100);
        expect(result.grade).toEqual({ label: 'Онцгой', tone: 'success' });
        expect(result.groups).toEqual([
            { group: 'result', label: 'Борлуулалтын үр дүн', weight: 60, score: 50 },
            { group: 'activity', label: 'Идэвх, сахилга', weight: 25, score: 12 },
            { group: 'quality', label: 'Чанар, үнэлгээ', weight: 15, score: 8 },
        ]);
        const resolution = scoreKpi({ plans: { service_resolution: 90 }, actuals: { service_resolution: 81 } }).items.find(row => row.key === 'service_resolution');
        expect(resolution).toMatchObject({ attainmentPct: 90, score: 4.5 });
    });

    it('never scores a missing plan or source as zero', () => {
        const empty = scoreKpi({ plans: {}, actuals: {} });
        expect(empty.total).toBeNull();
        expect(empty.coveredWeight).toBe(0);
        expect(empty.grade.label).toBe('Тооцоогүй');
        expect(scoreKpi({ plans: { contract_amount: 0 }, actuals: { contract_amount: 10 } }).items[0]).toMatchObject({ missing: 'plan', score: null });
    });

    it('grades', () => {
        expect([100, 85, 70, 69.9].map(total => kpiGrade(total).label)).toEqual(['Онцгой', 'Сайн', 'Хангалттай', 'Сайжруулах']);
    });
});

describe('KpiMonthInputSchema', () => {
    it('accepts known plans, manual calls and a 1–5 review only', () => {
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', plans: { contract_amount: 9e8 }, manual: { calls_chats: 40 }, review: { management: 4, note: 'Сайн' } }).success).toBe(true);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', plans: { bonus: 1 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', manual: { contract_amount: 1 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', review: { management: 6 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 13, manager: 'Номин' }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', plans: { contract_amount: -1 } }).success).toBe(false);
    });

    it('accepts daily call/meeting targets (null clears) and a cleared manual call count', () => {
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { calls: 20, meetings: 2 }, manual: { calls_chats: null } }).success).toBe(true);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { calls: null } }).success).toBe(true);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { calls: 0 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { calls: 2.5 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { meetings: 101 } }).success).toBe(false);
        expect(KpiMonthInputSchema.safeParse({ year: 2026, month: 10, manager: 'Номин', daily: { chats: 3 } }).success).toBe(false);
    });
});
