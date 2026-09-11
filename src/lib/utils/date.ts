/**
 * Date/Time utility functions
 */

/**
 * Format a date string to relative time (e.g., "5 мин өмнө", "2 цаг өмнө")
 * Uses Asia/Ulaanbaatar timezone for Mongolia
 */
export function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Саяхан';
  if (diffMins < 60) return `${diffMins} мин өмнө`;
  if (diffHours < 24) return `${diffHours} цаг өмнө`;
  return `${diffDays} өдрийн өмнө`;
}

/**
 * Format time for display (HH:MM format) using Mongolian timezone
 */
export function formatTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '—';
    // v2: 24 цагийн формат (10:00, 17:41) — Монголд AM/PM хэрэглэдэггүй, mono баганад тэгш.
    // Улаанбаатарын цагийн бүсээр (серверийн/хөтчийн бүсээс үл хамааран ижил).
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ulaanbaatar' }).format(d);
}

/**
 * Format a date string to localized date/time string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString('mn-MN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date to short date string (e.g., "2024.01.15")
 */
export function formatShortDate(date: string | Date): string {
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date)) : date;
    if (Number.isNaN(d.getTime())) return '—';
    // v2: ISO хэлбэр (2026-07-30) — mono баганад тэгш, монголчуудын бичдэг дараалал (он-сар-өдөр).
    // Огноо-л мөрийг (DATE багана) локал өдрөөр, timestamp-ийг Улаанбаатарын бүсээр.
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ulaanbaatar' }).format(d);
}

/**
 * Get start of today (midnight)
 */
/**
 * v2 хүснэгтийн «Сүүлд холбогдсон» багана: өнөөдөр / өчигдөр / 4 хоног / 3 сар.
 * Богино, mono баганад багтахаар.
 */
export function formatRelativeDays(date: string | Date | null | undefined): string {
    if (!date) return '—';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
    if (days <= 0) return 'өнөөдөр';
    if (days === 1) return 'өчигдөр';
    if (days < 30) return `${days} хоног`;
    if (days < 365) return `${Math.floor(days / 30)} сар`;
    return `${Math.floor(days / 365)} жил`;
}

// ============================================
// Улаанбаатарын цагийн бүс (Asia/Ulaanbaatar, UTC+8, DST-гүй)
// ============================================
// Сервер (Vercel) UTC-ээр ажилладаг тул `setHours(0,0,0,0)` нь УБ-ийн 08:00 болдог —
// «өнөөдөр» 00:00–08:00 УБ-д буруу өдөр гардаг байсан (2026-09 review H6).
// Бүх «өнөөдөр / энэ сар» хилийг серверт эдгээр helper-ээр л тооцно.

export const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** УБ-ийн он/сар/өдөр (сар 1–12). */
export function ubParts(d: Date = new Date()): { year: number; month: number; day: number } {
    const s = new Date(d.getTime() + UB_OFFSET_MS);
    return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate() };
}

/** УБ-ийн `YYYY-MM-DD` (DATE баганатай харьцуулахад). */
export function ubDateStr(d: Date = new Date()): string {
    return new Date(d.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Тухайн мөчийн УБ-ийн шөнө дунд (UTC instant-аар). */
export function ubStartOfDay(d: Date = new Date()): Date {
    const s = new Date(d.getTime() + UB_OFFSET_MS);
    s.setUTCHours(0, 0, 0, 0);
    return new Date(s.getTime() - UB_OFFSET_MS);
}

/** УБ-ийн өдрийн хил: [start, end) — end = маргаашийн шөнө дунд. */
export function ubDayRange(d: Date = new Date()): { start: Date; end: Date } {
    const start = ubStartOfDay(d);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** УБ-ийн сарын хил: [start, end) (monthIdx 0–11). */
export function ubMonthRange(year: number, monthIdx: number): { start: Date; end: Date } {
    return {
        start: new Date(Date.UTC(year, monthIdx, 1) - UB_OFFSET_MS),
        end: new Date(Date.UTC(year, monthIdx + 1, 1) - UB_OFFSET_MS),
    };
}

/** УБ-ийн өнөөдрийн эхлэл (хуучин нэр — хэвээр ашиглагдана). */
export function getStartOfToday(): Date {
    return ubStartOfDay();
}

/**
 * Get start of period for filtering (УБ-ийн өдрийн хилээр)
 * @param period - 'today', 'week', or 'month'
 */
export function getStartOfPeriod(period: 'today' | 'week' | 'month'): Date {
    const start = ubStartOfDay();
    switch (period) {
        case 'week':
            return new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'month':
            return new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'today':
        default:
            return start;
    }
}
