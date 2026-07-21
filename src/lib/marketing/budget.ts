/**
 * Маркетингийн төсвийн хяналтын PURE туслахууд (DB-гүй, unit-тестэд ордог).
 * Самбарын өнгөний дүрэм: зарцуулалт төсвийн <80% = ok (ногоон),
 * 80–100% = warn (шар), >100% = over (улаан), төсөвгүй сар = none.
 */

export type BudgetStatus = 'none' | 'ok' | 'warn' | 'over';

/** Зарцуулалтын гар бүртгэлийн канон сувгууд + монгол нэрс. */
export const SPEND_CHANNELS: Record<string, string> = {
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    board: 'Билборд / Самбар',
    radio: 'Радио',
    tv: 'ТВ',
    print: 'Хэвлэл',
    event: 'Өдөрлөг / Эвент',
    influencer: 'Инфлүүнсер',
    content: 'Контент',
    other: 'Бусад',
};

export interface SpendEntryLite {
    spent_at: string; // date
    amount: number | string | null;
    channel?: string | null;
}

/** Тухайн оны бүртгэлүүдийг [12] сарын нийлбэр болгоно. */
export function monthlySpendSeries(entries: SpendEntryLite[], year: number): number[] {
    const out = Array(12).fill(0);
    for (const entry of entries) {
        if (!entry.spent_at) continue;
        const d = new Date(entry.spent_at);
        if (d.getFullYear() !== year) continue;
        out[d.getMonth()] += Number(entry.amount) || 0;
    }
    return out;
}

/** Сувгаар нийлбэрлэнэ (их → бага эрэмбэтэй жагсаалт). */
export function spendByChannel(entries: SpendEntryLite[]): Array<{ channel: string; amount: number }> {
    const map = new Map<string, number>();
    for (const entry of entries) {
        const ch = entry.channel || 'other';
        map.set(ch, (map.get(ch) || 0) + (Number(entry.amount) || 0));
    }
    return Array.from(map.entries())
        .map(([channel, amount]) => ({ channel, amount }))
        .sort((a, b) => b.amount - a.amount);
}

/** Нэг сарын төсвийн төлөв (өнгөний дүрэм). */
export function budgetStatus(budget: number, spend: number): { status: BudgetStatus; pct: number | null } {
    if (!budget || budget <= 0) return { status: 'none', pct: null };
    const pct = Math.round((spend / budget) * 100);
    if (pct > 100) return { status: 'over', pct };
    if (pct >= 80) return { status: 'warn', pct };
    return { status: 'ok', pct };
}

export interface BudgetMonthRow {
    month: number; // 1-12
    budget: number;
    spend: number;
    revenue: number;
    pct: number | null;
    status: BudgetStatus;
}

export interface BudgetOverview {
    months: BudgetMonthRow[];
    totals: {
        budget: number;
        spend: number;
        revenue: number;
        pct: number | null;
        status: BudgetStatus;
        /** Орлого / зарцуулалт (маркетингийн өгөөж, х). Зарцуулалтгүй бол null. */
        roi: number | null;
    };
}

/** Жилийн тойм: сар бүрийн төсөв/зарцуулалт/орлого + нэгдсэн дүн. */
export function buildBudgetOverview(
    budgets: number[],
    spend: number[],
    revenue: number[],
): BudgetOverview {
    const months: BudgetMonthRow[] = [];
    for (let i = 0; i < 12; i++) {
        const b = budgets[i] || 0;
        const s = spend[i] || 0;
        const { status, pct } = budgetStatus(b, s);
        months.push({ month: i + 1, budget: b, spend: s, revenue: revenue[i] || 0, pct, status });
    }
    const totalBudget = months.reduce((a, m) => a + m.budget, 0);
    const totalSpend = months.reduce((a, m) => a + m.spend, 0);
    const totalRevenue = months.reduce((a, m) => a + m.revenue, 0);
    const { status, pct } = budgetStatus(totalBudget, totalSpend);
    return {
        months,
        totals: {
            budget: totalBudget,
            spend: totalSpend,
            revenue: totalRevenue,
            pct,
            status,
            roi: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 10) / 10 : null,
        },
    };
}

/** Гэрээ дуусахад үлдсэн хоног (өдрийн түвшинд; өнгөрсөн бол сөрөг). */
export function daysUntil(dateStr: string | null | undefined, now: Date): number | null {
    if (!dateStr) return null;
    const end = new Date(dateStr);
    if (Number.isNaN(end.getTime())) return null;
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Сувгийн гэрээний сануулга илгээх өдрүүд (дуусахаас өмнө). */
export const CONTRACT_REMINDER_DAYS = [7, 3, 1, 0] as const;
