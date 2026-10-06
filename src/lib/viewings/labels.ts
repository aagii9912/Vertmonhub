import { ubDateStr, ubLocalInputValue, ubParts } from '@/lib/utils/date';
import type { Tone } from '@/lib/leads/labels';

export type MeetingType = 'new_customer' | 'repeat_customer' | 'existing_buyer';
export type ViewingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const MEETING_TYPE_META: Record<MeetingType, { label: string; tone: Tone }> = {
    new_customer:    { label: 'Шинэ харилцагч', tone: 'info' },
    repeat_customer: { label: 'Давтан',          tone: 'info' },
    existing_buyer:  { label: 'Худалдан авагч',  tone: 'success' },
};
export const MEETING_TYPES = Object.keys(MEETING_TYPE_META) as MeetingType[];

export const VIEWING_STATUS_META: Record<ViewingStatus, { label: string; tone: Tone }> = {
    scheduled: { label: 'Товлосон',  tone: 'pending' },
    completed: { label: 'Болсон',    tone: 'success' },
    cancelled: { label: 'Цуцалсан',  tone: 'neutral' },
    no_show:   { label: 'Ирээгүй',   tone: 'danger' },
};

export function meetingTypeLabel(t: string | null | undefined): string {
    return (t && MEETING_TYPE_META[t as MeetingType]?.label) || '—';
}
export function viewingStatusLabel(s: string | null | undefined): string {
    return (s && VIEWING_STATUS_META[s as ViewingStatus]?.label) || s || '—';
}
export function viewingStatusTone(s: string | null | undefined): Tone {
    return (s && VIEWING_STATUS_META[s as ViewingStatus]?.tone) || 'neutral';
}

export const WEEKDAYS_MN = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

/* ── Улаанбаатарын өдөр ─────────────────────────────────────────────────────────────
 * Уулзалтын хуудас (өдрийн хуваарь, 7 хоногийн мөр) өдрийг УБ-ийн `YYYY-MM-DD`-ээр тоолно —
 * хөтөч, сервер (Vercel = UTC) аль цагийн бүст байхаас үл хамаарна. УБ-д зуны цаг байхгүй
 * тул 24 цаг нэмэхэд дараагийн УБ өдөр гарна.
 */

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` өдрийн гараг (0 = Ням). */
function weekdayOf(day: string): number {
    return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export interface DayLabel {
    /** «Өнөөдөр», «Маргааш», «Өчигдөр» эсвэл «Лхагва, 10-р сарын 8» (өөр онд «2027 · Баасан, 1-р сарын 1»). */
    title: string;
    /** Өнөөдөр/маргааш/өчигдөрт гараг ба огноо («Мягмар, 10-р сарын 6»); бусдад null. */
    detail: string | null;
    /** Нэг мөрөөр: «Өнөөдөр · Мягмар, 10-р сарын 6» эсвэл `title`. */
    full: string;
}

/** УБ-ийн өдрийн (`YYYY-MM-DD`) гарчиг — өдрийн бүлэг, 7 хоногийн мөр нэг дүрмээр. */
export function dayLabel(day: string, today: string): DayLabel {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { title: 'Огноо тодорхойгүй', detail: null, full: 'Огноо тодорхойгүй' };
    const [year, month, date] = day.split('-').map(Number);
    const base = `${WEEKDAYS_MN[weekdayOf(day)]}, ${month}-р сарын ${date}`;
    const diff = Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS);
    const relative = diff === 0 ? 'Өнөөдөр' : diff === 1 ? 'Маргааш' : diff === -1 ? 'Өчигдөр' : null;
    if (relative) return { title: relative, detail: base, full: `${relative} · ${base}` };
    const title = year === Number(today.slice(0, 4)) ? base : `${year} · ${base}`;
    return { title, detail: null, full: title };
}

/** «Өнөөдөр · Даваа, 9-р сарын 8» / «Маргааш · …» / «Мягмар, 9-р сарын 9» */
export function dayHeading(d: Date, now = new Date()): string {
    return dayLabel(ubDateStr(d), ubDateStr(now)).full;
}

/** Уулзалтын УБ өдөр (`YYYY-MM-DD`); огноо уншигдахгүй бол ''. */
export function viewingDay(scheduledAt: string): string {
    const t = Date.parse(scheduledAt);
    return Number.isNaN(t) ? '' : ubDateStr(new Date(t));
}

export interface UpcomingDay {
    /** УБ-ийн `YYYY-MM-DD`. */
    key: string;
    /** Гараг: «Мягмар». */
    weekday: string;
    /** Сарын өдөр (1–31). */
    day: number;
    label: DayLabel;
}

/** Өнөөдрөөс эхэлсэн `count` УБ өдөр (7 хоногийн мөр). */
export function upcomingDays(now: Date, count = 7): UpcomingDay[] {
    const today = ubDateStr(now);
    return Array.from({ length: count }, (_, i) => {
        const at = new Date(now.getTime() + i * DAY_MS);
        const key = ubDateStr(at);
        return { key, weekday: WEEKDAYS_MN[weekdayOf(key)], day: ubParts(at).day, label: dayLabel(key, today) };
    });
}

/** УБ өдөр бүрийн **товлосон** (status = scheduled) уулзалтын тоо. */
export function scheduledCountsByDay(viewings: readonly { scheduled_at: string; status: string }[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const v of viewings) {
        if (v.status !== 'scheduled') continue;
        const key = viewingDay(v.scheduled_at);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

/**
 * УБ өдрөөр бүлэглэнэ: өдрүүд жагсаалтад анх гарсан дарааллаараа (Удахгүй — өсөхөөр,
 * Өнгөрсөн — буурахаар), өдөр доторх уулзалт цагийн өсөхөөр. Уулзалт бүр яг нэг бүлэгт.
 */
export function groupViewingsByDay<T extends { scheduled_at: string }>(viewings: readonly T[]): { key: string; items: T[] }[] {
    const groups = new Map<string, T[]>();
    for (const v of viewings) {
        const key = viewingDay(v.scheduled_at);
        const list = groups.get(key);
        if (list) list.push(v);
        else groups.set(key, [v]);
    }
    return [...groups.entries()].map(([key, items]) => ({
        key,
        items: [...items].sort((a, b) => (Date.parse(a.scheduled_at) || 0) - (Date.parse(b.scheduled_at) || 0)),
    }));
}

/**
 * Товлох цонхны анхны цаг — УБ-ийн `datetime-local` утга. Өнөөдөр (эсвэл өдөр сонгоогүй) бол
 * дараагийн бүтэн цаг; ирээдүйн өдөр сонгосон бол тэр өдрийн 10:00.
 */
export function defaultMeetingWhen(now: Date, day?: string | null): string {
    if (day && day > ubDateStr(now)) return `${day}T10:00`;
    const HOUR_MS = 3_600_000;
    // УБ-ийн зөрүү бүтэн цаг (+08:00) тул UTC-ээр цаг тайрахад УБ-ийн бүтэн цаг гарна.
    return ubLocalInputValue(new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS));
}
