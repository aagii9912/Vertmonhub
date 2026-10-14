import { shiftReviewDate } from '@/lib/dashboard/weekly-review';
import { summarizeContentPlan, type ContentItem, type ContentPlanSummary } from './content-plan';

/**
 * Маркетингийн менежерийн нүүр самбар (`/dashboard`, маркетинг горим): контент төлөвлөгөөний
 * өнөөдрийн ажил, хоцорсон контент, ирэх 7 хоног, сарын гүйцэтгэл. Борлуулалтын менежерийн
 * «Өнөөдөр»-тэй ижил үүрэгтэй боловч лид, гэрээ, борлуулалтын хөрвөлтөөр ХЭМЖИХГҮЙ —
 * маркетинг өөрийн контент төлөвлөгөөгөөр (төлөвлөсөн → нийтэлсэн) ажилладаг.
 */
export const OVERDUE_LOOKBACK_DAYS = 30;
export const UPCOMING_DAYS = 7;

const lastDayOfMonth = (day: string) => {
    const [year, month] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

/** Нэг уншилтын хугацаа (контент төлөвлөгөөний API ≤ 93 өдөр): сар + хоцролтын 30 хоног + ирэх 7 хоног. */
export function marketingHomeWindow(today: string) {
    const month = { from: `${today.slice(0, 7)}-01`, to: lastDayOfMonth(today) };
    const lookbackFrom = shiftReviewDate(today, -OVERDUE_LOOKBACK_DAYS);
    const upcomingTo = shiftReviewDate(today, UPCOMING_DAYS);
    return {
        month,
        lookbackFrom,
        upcomingTo,
        fetch: { from: lookbackFrom < month.from ? lookbackFrom : month.from, to: upcomingTo > month.to ? upcomingTo : month.to },
    };
}

export interface MarketingHomeDay { day: string; items: ContentItem[] }

export interface MarketingHome {
    /** Нийтлээгүй, цуцлаагүй, огноо нь өнгөрсөн (сүүлийн 30 хоног) контент. */
    overdue: ContentItem[];
    /** Өнөөдрийн цуцлаагүй контент (нийтэлсэн нь мөн харагдана). */
    today: ContentItem[];
    /** Маргаашаас эхлэх 7 өдөр, контентгүй өдөр хоосон жагсаалттай. */
    upcoming: MarketingHomeDay[];
    emptyDays: number;
    month: ContentPlanSummary;
}

const isOpen = (item: ContentItem) => item.status !== 'published' && item.status !== 'cancelled';
const byDate = (a: ContentItem, b: ContentItem) => a.scheduled_date.localeCompare(b.scheduled_date)
    || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.title.localeCompare(b.title, 'mn');

/** Цэвэр: контентын мөрүүд → самбарын хэсгүүд. `today` = Улаанбаатарын өдөр (YYYY-MM-DD). */
export function buildMarketingHome(items: readonly ContentItem[], today: string): MarketingHome {
    const window = marketingHomeWindow(today);
    const live = items.filter(item => item.status !== 'cancelled');
    const upcoming = Array.from({ length: UPCOMING_DAYS }, (_, index) => {
        const day = shiftReviewDate(today, index + 1);
        return { day, items: live.filter(item => item.scheduled_date === day).sort(byDate) };
    });
    return {
        overdue: items.filter(item => isOpen(item) && item.scheduled_date < today && item.scheduled_date >= window.lookbackFrom).sort(byDate),
        today: live.filter(item => item.scheduled_date === today).sort(byDate),
        upcoming,
        emptyDays: upcoming.filter(day => !day.items.length).length,
        month: summarizeContentPlan(items, window.month, today),
    };
}

/** «Пүрэв 10.15» — долоо хоногийн өдөр + сар.өдөр. */
export function marketingDayLabel(day: string): string {
    const weekdays = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
    return `${weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${day.slice(5, 7)}.${day.slice(8)}`;
}
