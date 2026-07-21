import { describe, it, expect } from 'vitest';
import {
    monthlySpendSeries,
    spendByChannel,
    budgetStatus,
    buildBudgetOverview,
    daysUntil,
} from '../budget';

describe('monthlySpendSeries', () => {
    it('оноор шүүж сар бүрийн нийлбэр гаргана', () => {
        const out = monthlySpendSeries(
            [
                { spent_at: '2026-01-15', amount: 100 },
                { spent_at: '2026-01-20', amount: 50 },
                { spent_at: '2026-07-01', amount: 30 },
                { spent_at: '2025-12-31', amount: 999 }, // өөр он — орохгүй
            ],
            2026,
        );
        expect(out[0]).toBe(150);
        expect(out[6]).toBe(30);
        expect(out[11]).toBe(0);
    });
});

describe('spendByChannel', () => {
    it('сувгаар нийлбэрлэж их→бага эрэмбэлнэ', () => {
        const out = spendByChannel([
            { spent_at: '2026-01-01', amount: 100, channel: 'radio' },
            { spent_at: '2026-01-02', amount: 300, channel: 'board' },
            { spent_at: '2026-01-03', amount: 50, channel: null },
        ]);
        expect(out[0]).toEqual({ channel: 'board', amount: 300 });
        expect(out[1]).toEqual({ channel: 'radio', amount: 100 });
        expect(out[2]).toEqual({ channel: 'other', amount: 50 });
    });
});

describe('budgetStatus — өнгөний дүрэм', () => {
    it('<80% = ok (ногоон)', () => {
        expect(budgetStatus(1000, 500)).toEqual({ status: 'ok', pct: 50 });
    });
    it('80–100% = warn (шар)', () => {
        expect(budgetStatus(1000, 800)).toEqual({ status: 'warn', pct: 80 });
        expect(budgetStatus(1000, 1000)).toEqual({ status: 'warn', pct: 100 });
    });
    it('>100% = over (улаан)', () => {
        expect(budgetStatus(1000, 1200)).toEqual({ status: 'over', pct: 120 });
    });
    it('төсөвгүй = none', () => {
        expect(budgetStatus(0, 500)).toEqual({ status: 'none', pct: null });
    });
});

describe('buildBudgetOverview', () => {
    it('сар бүрийн мөр + нэгдсэн дүн + ROI бодно', () => {
        const budgets = Array(12).fill(0);
        budgets[0] = 1000;
        budgets[1] = 1000;
        const spend = Array(12).fill(0);
        spend[0] = 500;
        spend[1] = 1100;
        const revenue = Array(12).fill(0);
        revenue[0] = 30000;

        const overview = buildBudgetOverview(budgets, spend, revenue);
        expect(overview.months[0].status).toBe('ok');
        expect(overview.months[1].status).toBe('over');
        expect(overview.months[2].status).toBe('none');
        expect(overview.totals.budget).toBe(2000);
        expect(overview.totals.spend).toBe(1600);
        expect(overview.totals.status).toBe('warn'); // 80%
        expect(overview.totals.roi).toBe(18.8); // 30000/1600 = 18.75 → 18.8
    });

    it('зарцуулалтгүй үед ROI null', () => {
        const overview = buildBudgetOverview(Array(12).fill(0), Array(12).fill(0), Array(12).fill(0));
        expect(overview.totals.roi).toBeNull();
        expect(overview.totals.status).toBe('none');
    });
});

describe('daysUntil', () => {
    const now = new Date(2026, 6, 21, 15, 30);
    it('өдрийн түвшинд тоолно', () => {
        expect(daysUntil('2026-07-28', now)).toBe(7);
        expect(daysUntil('2026-07-21', now)).toBe(0);
        expect(daysUntil('2026-07-20', now)).toBe(-1);
    });
    it('хоосон/буруу огноонд null', () => {
        expect(daysUntil(null, now)).toBeNull();
        expect(daysUntil('not-a-date', now)).toBeNull();
    });
});
