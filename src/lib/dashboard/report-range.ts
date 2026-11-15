/**
 * Лхагва гарагийн хурлын тайлант хугацаа (client-safe, pure — хуудас, API, илтгэл нэг дүрэм).
 *
 *  • Анхдагч: хурлын өмнөх Лхагва → Мягмар 7 хоног (W1, `meetingWeekRange`).
 *  • Хэрэглэгч хурлын хуудсан дээр календараас өөр хугацаа (эхлэх–дуусах өдөр) сонгож болно (борлуулалтын алба,
 *    2026-11-15): борлуулалтын тайлан, хоёр борлуулалтын илтгэл, хуулах текст тэр хугацаагаар гарна. Маркетингийн
 *    хэсэг (контент, сошиал, Meta-гийн 7 хоногийн хадгалсан тайлан, төсөв) хурлын 7 хоногоор хэвээр.
 *  • Хязгаар (`resolveReportRange`): хоёр өдөр хоёулаа, жинхэнэ огноо, эхлэх ≤ дуусах, ≤ 92 өдөр, хурлын өдрөөс хойш
 *    дуусахгүй.
 *  • Харьцуулах хугацаа = өмнөх ижил урттай хугацаа (`previousReportRange`): 7 хоногт өмнөх хурлын 7 хоног.
 *  • 7 хоногийн хүснэгтүүд (дуудлага, уулзалт) = тайлант хугацааны сүүлийн өдрөөр дуусах бүтэн 7 хоногууд
 *    (`trailingWeeks`) — сарын хилээр тасалдаггүй, сар дамжина (борлуулалтын алба, 2026-11-15).
 */
import { WEEKDAYS_MN } from '@/lib/viewings/labels';

/** Type alias (interface биш): `new URLSearchParams(range)`-д шууд өгөхөд индекс гарын үсэг хэрэгтэй. */
export type ReportRange = { from: string; to: string };

/** Хурлын тайлант хугацааны дээд урт (өдөр) — өдрийн тайлангийн мужийн хязгаартай ижил. */
export const REPORT_RANGE_MAX_DAYS = 92;

const DAY = 86_400_000;
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
/** `YYYY-MM-DD`-г хоногоор шилжүүлнэ (календарийн, цагийн бүсгүй). */
export const shiftDay = (date: string, days: number) => new Date((dayIndex(date) + days) * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** Жинхэнэ хуанлийн өдөр (`2026-09-31` биш). */
export function isCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Хурлын анхдагч тайлант 7 хоног: өмнөх Лхагвагаас Мягмар дуустал (хоёр захыг оруулна). */
export function meetingWeekRange(meetingDate: string): ReportRange {
    return { from: shiftDay(meetingDate, -7), to: shiftDay(meetingDate, -1) };
}

/** [from, to] хоёр захыг оруулсан өдрийн тоо. */
export const reportRangeDays = (range: ReportRange) => dayIndex(range.to) - dayIndex(range.from) + 1;

export const sameRange = (a: ReportRange, b: ReportRange) => a.from === b.from && a.to === b.to;

/** Харьцуулах хугацаа: өмнөх ижил урттай хугацаа [from − урт, from − 1] (7 хоногт өмнөх хурлын 7 хоног). */
export function previousReportRange(range: ReportRange): ReportRange {
    return { from: shiftDay(range.from, -reportRangeDays(range)), to: shiftDay(range.from, -1) };
}

/** `to`-оор дуусах сүүлийн `count` бүтэн 7 хоног, эрт → хожуу. Сарын хилээр тасалдаггүй. */
export function trailingWeeks(to: string, count: number): ReportRange[] {
    return Array.from({ length: count }, (_, index) => {
        const end = shiftDay(to, -7 * (count - 1 - index));
        return { from: shiftDay(end, -6), to: end };
    });
}

/** `to`-оор дуусах 7 хоногийн гарагууд: «Лхагва–Мягмар» (анхдагч), «Мягмар–Даваа» г.м. */
export function weekSpanLabel(to: string): string {
    return `${WEEKDAYS_MN[weekday(shiftDay(to, -6))]}–${WEEKDAYS_MN[weekday(to)]}`;
}

/**
 * Тайлант хугацааны нэр шошгонд: яг 7 өдөр бол «7 хоног», бусад үед «хугацаа» (14 өдрийн хугацааг «7 хоног» гэж
 * бичихгүй). `of` — харьяалахын тийн ялгал («тайлант 7 хоногийн», «тайлант хугацааны»).
 */
export function reportPeriodName(range: ReportRange): { name: string; of: string } {
    return reportRangeDays(range) === 7 ? { name: '7 хоног', of: '7 хоногийн' } : { name: 'хугацаа', of: 'хугацааны' };
}

export type ReportRangeResult = { ok: true; range: ReportRange; custom: boolean } | { ok: false; error: string };

/**
 * Хурлын тайлант хугацааг шалгана (хуудас, API нэг дүрэм). Хоёр өдөр хоёулаа хоосон бол анхдагч 7 хоног.
 * `custom` — анхдагчаас өөр эсэх.
 */
export function resolveReportRange(meetingDate: string, from?: string | null, to?: string | null): ReportRangeResult {
    const fallback = meetingWeekRange(meetingDate);
    if (!from && !to) return { ok: true, range: fallback, custom: false };
    if (!from || !to) return { ok: false, error: 'Тайлант хугацааны эхлэх, дуусах өдрийг хоёуланг нь сонгоно уу.' };
    if (!isCalendarDate(from) || !isCalendarDate(to)) return { ok: false, error: 'Тайлант хугацааны огноо буруу байна.' };
    if (from > to) return { ok: false, error: 'Эхлэх өдөр дуусах өдрөөс хойш байж болохгүй.' };
    if (to > meetingDate) return { ok: false, error: 'Тайлант хугацаа хурлын өдрөөс хойш дуусах боломжгүй.' };
    if (reportRangeDays({ from, to }) > REPORT_RANGE_MAX_DAYS) return { ok: false, error: `Тайлант хугацаа ${REPORT_RANGE_MAX_DAYS} хоногоос урт байж болохгүй.` };
    const range = { from, to };
    return { ok: true, range, custom: !sameRange(range, fallback) };
}
