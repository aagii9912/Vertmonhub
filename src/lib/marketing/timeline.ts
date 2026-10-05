import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import { metaNumber } from './meta-result-groups';
import type { MetaLedgerRow } from './meta-ads-report';

/**
 * Маркетингийн нөлөөллийн сар бүрийн цуваа (Улаанбаатарын сараар):
 *   - leads     — үүссэн лид (`leads.created_at`)
 *   - meetings  — товлосон уулзалт (`property_viewings.scheduled_at`)
 *   - activity  — идэвхжүүлэлт: нийтэлсэн пост + эхэлсэн акц / кампанит ажил (`marketing_campaigns`, цуцалснаас бусад)
 *   - spend     — Meta зардал төгрөгөөр (`meta_daily_spend`, дансны өдрөөр); ханшгүй дүн `pending`-д эх валютаар
 */
export interface TimelineMonth {
    month: string; label: string;
    leads: number; meetings: number; activity: number;
    /** Ханштай Meta зардлын төгрөг. */
    spend: number;
    /** false = ханшгүй Meta зардалтай (төгрөгийн дүн дутуу). */
    spendComplete: boolean;
    /** Ханшгүй эх валютын дүн: валют → дүн. */
    pending: Record<string, number>;
}
export interface TimelineMonthKey { key: string; label: string; year: number; monthIdx: number }

const pad = (n: number) => String(n).padStart(2, '0');

/** Одоогийн УБ-ийн сар хүртэлх сүүлийн `count` сар (эрт → хожуу). */
export function timelineMonths(now: Date = new Date(), count = 6): TimelineMonthKey[] {
    const { year, month } = ubParts(now);
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(year, month - count + i, 1));
        return { key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, label: `${d.getUTCMonth() + 1}-р сар`, year: d.getUTCFullYear(), monthIdx: d.getUTCMonth() };
    });
}

/** Цонх: эхний сарын УБ-ийн 1-ний шөнө дунд (timestamp), `YYYY-MM-01` ба сүүлийн сарын эцсийн өдөр (DATE багана). */
export function timelineWindow(months: readonly TimelineMonthKey[]) {
    const first = months[0], last = months[months.length - 1];
    const lastEnd = ubMonthRange(last.year, last.monthIdx).end;
    return { start: ubMonthRange(first.year, first.monthIdx).start, firstDay: `${first.key}-01`, lastDay: ubDateStr(new Date(lastEnd.getTime() - 1)) };
}

/** Timestamp → УБ-ийн сар; `YYYY-MM-DD` (DATE) → тэр өдрийн сар. */
export function ubMonthKey(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const { year, month } = ubParts(date);
    return `${year}-${pad(month)}`;
}

export function buildMarketingTimeline(months: readonly TimelineMonthKey[], data: {
    leads: readonly { created_at: string | null }[];
    viewings: readonly { scheduled_at: string | null }[];
    posts: readonly { published_at: string | null }[];
    activities: readonly { start_date: string | null; created_at: string | null; status?: string | null }[];
    spend: readonly Pick<MetaLedgerRow, 'spent_at' | 'native_amount' | 'currency' | 'amount_mnt'>[];
}): TimelineMonth[] {
    const buckets = new Map<string, TimelineMonth>(months.map(m => [m.key, {
        month: m.key, label: m.label, leads: 0, meetings: 0, activity: 0, spend: 0, spendComplete: true, pending: {},
    }]));
    const bump = (key: string | null, field: 'leads' | 'meetings' | 'activity') => {
        const bucket = key ? buckets.get(key) : undefined;
        if (bucket) bucket[field] += 1;
    };
    for (const l of data.leads) bump(ubMonthKey(l.created_at), 'leads');
    for (const v of data.viewings) bump(ubMonthKey(v.scheduled_at), 'meetings');
    for (const p of data.posts) bump(ubMonthKey(p.published_at), 'activity');
    for (const a of data.activities) if (a.status !== 'cancelled') bump(ubMonthKey(a.start_date || a.created_at), 'activity');
    for (const row of data.spend) {
        const bucket = buckets.get(row.spent_at.slice(0, 7));
        if (!bucket) continue;
        const native = metaNumber(row.native_amount);
        if (row.amount_mnt !== null && row.amount_mnt !== undefined) bucket.spend += metaNumber(row.amount_mnt);
        else if (native > 0) {
            bucket.pending[row.currency] = Math.round(((bucket.pending[row.currency] ?? 0) + native) * 1e6) / 1e6;
            bucket.spendComplete = false;
        }
    }
    return [...buckets.values()].map(b => ({ ...b, spend: Math.round(b.spend) }));
}
