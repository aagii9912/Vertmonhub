import { describe, it, expect } from 'vitest';
import {
    monthlySpendSeries,
    spendByChannel,
    budgetStatus,
    buildBudgetOverview,
    daysUntil,
    allocateAnnualBudget,
    MarketingBudgetSchema,
    monthlySpendStatus,
    periodSpendStatus,
    spendRecorded,
    spendStatusThrough,
    budgetSpendCell,
    budgetSpendNote,
    budgetSpendPct,
} from '../budget';

describe('жилийн төсвийн хуваарилалт', () => {
    it('бүхэл төгрөгийн үлдэгдэлтэй ч 12 сарын нийлбэр жилийн дүнтэй тэнцэнэ', () => {
        const months = allocateAnnualBudget(1201);
        expect(months).toHaveLength(12);
        expect(months[0]).toEqual({ month: 1, amount: 101 });
        expect(months[11]).toEqual({ month: 12, amount: 100 });
        expect(months.reduce((sum, m) => sum + m.amount, 0)).toBe(1201);
        expect(allocateAnnualBudget(0).every(m => m.amount === 0)).toBe(true);
        expect(allocateAnnualBudget(5).reduce((sum, m) => sum + m.amount, 0)).toBe(5);
    });

    it('буруу мөнгөн дүн, давхардсан сар, жилийн дүнтэй зөрсөн хуваарилалтыг хориглоно', () => {
        for (const annualAmount of [-1, 1.5, Infinity, NaN, 100_000_000_000_000]) {
            expect(() => allocateAnnualBudget(annualAmount)).toThrow();
        }
        expect(MarketingBudgetSchema.safeParse({ year: 2026, annualAmount: 1201 }).success).toBe(true);
        expect(MarketingBudgetSchema.safeParse({ year: 2026 }).success).toBe(false);
        expect(MarketingBudgetSchema.safeParse({ year: 2026, months: [{ month: 1, amount: 1 }, { month: 1, amount: 2 }] }).success).toBe(false);
        expect(MarketingBudgetSchema.safeParse({ year: 2026, annualAmount: 1202, months: allocateAnnualBudget(1201) }).success).toBe(false);
        expect(MarketingBudgetSchema.safeParse({ year: 2026, annualAmount: 1201, months: allocateAnnualBudget(1201) }).success).toBe(true);
        expect(MarketingBudgetSchema.safeParse({ year: 2026, months: [{ month: 2, amount: 500 }] }).success).toBe(true);
    });
});

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
    it('огнооны сарын дугаарыг серверийн цагийн бүсээс үл хамааран ашиглана', () => {
        const original = process.env.TZ;
        try {
            process.env.TZ = 'America/Los_Angeles';
            const out = monthlySpendSeries([{ spent_at: '2026-01-01', amount: 100 }, { spent_at: '2026-13-01', amount: 1000 }], 2026);
            expect(out[0]).toBe(100);
            expect(out.reduce((sum, value) => sum + value, 0)).toBe(100);
        } finally { process.env.TZ = original; }
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

describe('зарцуулалтын төлөв — бүртгэлгүй ба ханшгүй зардал', () => {
    const entries = [
        { spent_at: '2026-01-31', amount: 500000, exclusion: null },
        // Ханшгүй Meta зардал: эх валютаар, ₮-д ороогүй.
        { spent_at: '2026-10-01', amount: 0, exclusion: 'missing_fx' as const, native_amount: 1000.5, currency: 'USD' },
        { spent_at: '2026-10-02', amount: 0, exclusion: 'missing_fx' as const, native_amount: '234.06', currency: 'USD' },
        // 0 USD = яг 0 ₮ (ханшаас үл хамаарна) — бүртгэлтэй.
        { spent_at: '2026-11-01', amount: 0, exclusion: 'missing_fx' as const, native_amount: 0, currency: 'USD' },
        // Давхардсан гар Meta мөр аль алинд нь орохгүй.
        { spent_at: '2026-12-01', amount: 100000, exclusion: 'manual_overlap' as const },
        { spent_at: '2025-10-01', amount: 900000, exclusion: null },
        { spent_at: '2026-09-15', amount: 200000, exclusion: null },
        { spent_at: '2026-09-20', amount: 0, exclusion: 'missing_fx' as const, native_amount: 10, currency: 'EUR' },
    ];

    it('сарын хилийг огнооны мөрөөр (серверийн UTC-ээс үл хамааран) тоолж, ханшгүй дүнг валютаар нь хуримтлуулна', () => {
        const previous = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
            const months = monthlySpendStatus(entries, 2026);
            expect(months[0]).toEqual({ month: 1, recorded: true, pending: {} });
            expect(months[1]).toEqual({ month: 2, recorded: false, pending: {} });
            expect(months[8]).toEqual({ month: 9, recorded: true, pending: { EUR: 10 } });
            expect(months[9]).toEqual({ month: 10, recorded: false, pending: { USD: 1234.56 } });
            expect(months[10]).toEqual({ month: 11, recorded: true, pending: {} });
            expect(months[11]).toEqual({ month: 12, recorded: false, pending: {} });
            expect(spendStatusThrough(months, 10)).toEqual({ recorded: true, pending: { EUR: 10, USD: 1234.56 } });
            expect(spendStatusThrough(months, 2)).toEqual({ recorded: true, pending: {} });
            expect(spendStatusThrough(months.map(month => ({ ...month, recorded: false })), 12).recorded).toBe(false);
        } finally {
            process.env.TZ = previous;
        }
    });

    it('Meta API-аар синк хийсэн өдөр мөргүй сар 0 ₮ бүртгэлтэй; зөвхөн ханшгүй зардалтай бол синктэй ч «—»', () => {
        const previous = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
            // 2-р сар: синктэй, зардалгүй (кампанит ажил зогссон) → 0 ₮; 10-р сар: синктэй ч зөвхөн ханшгүй USD → «—» хэвээр;
            // 12-р сар: гар Meta бүртгэл синктэй өдөрт давхардсан (manual_overlap) → Meta-гийн 0 ₮.
            const months = monthlySpendStatus(entries, 2026, ['2025-02-01', '2026-02-01', '2026-02-02', '2026-10-01', '2026-12-01']);
            expect(months[1]).toEqual({ month: 2, recorded: true, pending: {} });
            expect(months[9]).toEqual({ month: 10, recorded: false, pending: { USD: 1234.56 } });
            expect(months[11]).toEqual({ month: 12, recorded: true, pending: {} });
            expect(months[2]).toEqual({ month: 3, recorded: false, pending: {} });
            expect(monthlySpendStatus(entries, 2025, ['2025-02-01'])[1].recorded).toBe(true);
        } finally {
            process.env.TZ = previous;
        }
        expect(spendRecorded(false, 3, {})).toBe(true);
        expect(spendRecorded(false, 3, { USD: 412.57 })).toBe(false);
        expect(spendRecorded(false, 3, { USD: 0 })).toBe(true);
        expect(spendRecorded(false, 0, {})).toBe(false);
        expect(spendRecorded(true, 0, { USD: 5 })).toBe(true);
        expect(periodSpendStatus({ hasSpend: false }, { pendingCurrencies: {}, metaSyncedDays: 7 })).toEqual({ recorded: true, pending: {} });
        expect(periodSpendStatus({ hasSpend: false }, { pendingCurrencies: { USD: 412.57 } })).toEqual({ recorded: false, pending: { USD: 412.57 } });
    });

    it('бүртгэлгүй бол «—», зөвхөн ханшгүй бол «—» + эх валют, хэсэгчлэн бол ₮ + «+ ханшгүй» (хувь доод хязгаар)', () => {
        const format = (value: number) => `${value.toLocaleString('en-US')} ₮`;
        expect(budgetSpendCell(0, { recorded: false, pending: {} }, format)).toEqual({ value: '—', pending: null, known: false, lowerBound: false });
        const unconverted = budgetSpendCell(0, { recorded: false, pending: { USD: 1234.56 } }, format);
        expect(unconverted).toEqual({ value: '—', pending: 'Ханшгүй 1,234.56 USD (₮-д ороогүй)', known: false, lowerBound: false });
        expect(budgetSpendNote(unconverted, '0%')).toBe('Ханшгүй 1,234.56 USD (₮-д ороогүй)');
        const partial = budgetSpendCell(500000, { recorded: true, pending: { USD: 12.5, EUR: 0 } }, format);
        expect(partial).toEqual({ value: '500,000 ₮', pending: '+ ханшгүй 12.5 USD', known: true, lowerBound: true });
        expect(budgetSpendNote(partial, budgetSpendPct(500000, 1000000, partial.lowerBound))).toBe('+ ханшгүй 12.5 USD · 50%+');
        expect(budgetSpendCell(0, { recorded: true, pending: {} }, format)).toEqual({ value: '0 ₮', pending: null, known: true, lowerBound: false });
        expect(budgetSpendNote(budgetSpendCell(0, { recorded: false, pending: {} }, format))).toBe('Зарцуулалт бүртгээгүй');
        // Хуучин хариу (төлөвгүй): ₮-ийн дүн хэвээр.
        expect(budgetSpendCell(300, undefined, format).value).toBe('300 ₮');
        expect(budgetSpendPct(1, 0)).toBe('төсөвгүй');
    });
});
