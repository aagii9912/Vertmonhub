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

export function getStartOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Get start of period for filtering
 * @param period - 'today', 'week', or 'month'
 */
export function getStartOfPeriod(period: 'today' | 'week' | 'month'): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      return date;
    case 'week':
      date.setDate(date.getDate() - 7);
      return date;
    case 'month':
      date.setDate(date.getDate() - 30);
      return date;
    default:
      return date;
  }
}
