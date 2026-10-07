import { ubDateStr, ubMonthKey, ubMonthRange, ubParts } from '@/lib/utils/date';
import { metaNumber } from './meta-result-groups';
import type { MetaLedgerRow } from './meta-ads-report';

/**
 * «Маркетингийн нөлөөлөл» (/dashboard/marketing-roi) — Улаанбаатарын сараар:
 *   - leads     — үүссэн лид (`leads.created_at`)
 *   - meetings  — товлосон уулзалт (`property_viewings.scheduled_at`, устгаагүй)
 *   - activity  — нийтэлсэн пост + акц / кампанит ажил (`marketing_campaigns`, цуцалснаас бусад) эхэлсэн
 *                 сараараа (`start_date`, эс бөгөөс бүртгэсэн огноо)
 *   - spend     — Meta зардал (`meta_daily_spend`, ROI тайлантай нэг ledger): өдрийн мөр бүр өөрийн (дансны
 *                 цагийн бүсийн) өдрийн сард. ₮ = мөр бүрийн хадгалсан ханшаар (`amount_mnt`); ханшгүй дүн
 *                 `pending`-д эх валютаар, ₮-д хэзээ ч нэмэхгүй. `ad_campaigns`-ийн 30 хоногийн snapshot ашиглахгүй.
 */
export interface TimelineMonthKey { key: string; label: string; year: number; monthIdx: number }

export interface TimelineMonth {
    month: string;
    label: string;
    leads: number;
    meetings: number;
    activity: number;
    /**
     * Сарын Meta зардал төгрөгөөр (хадгалсан ханштай мөрүүд). Зардал синк хийсэн өдөр огт байхгүй, эсвэл
     * сарын бүх зардал ханшгүй бол null («—», 0 биш).
     */
    spend: number | null;
    /** Ханшгүй (төгрөгт ороогүй) эх валютын дүн: валют → дүн. */
    pending: Record<string, number>;
    /** Зардал синк хийгдсэн өдрийн тоо (`meta_spend_coverage` ∪ зардалтай өдөр). */
    spendDays: number;
    /** Өнгөрсөн сарын зөвхөн зарим өдөр синк хийгдсэн — дүн бүтэн сарынх биш. */
    spendPartial: boolean;
}

export type TimelineSpendRow = Pick<MetaLedgerRow, 'spent_at' | 'native_amount' | 'currency' | 'amount_mnt'>;

export interface TimelineInput {
    leads: readonly { created_at: string | null }[];
    viewings: readonly { scheduled_at: string | null }[];
    posts: readonly { published_at: string | null }[];
    campaigns: readonly { start_date: string | null; created_at: string | null; status?: string | null }[];
    /** Хэрэглэгчийн харах эрхтэй Meta зардлын мөрүүд ба синк хийсэн өдрүүд. */
    spend: { rows: readonly TimelineSpendRow[]; coveredDays: readonly string[] };
}

const pad = (n: number) => String(n).padStart(2, '0');
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** Одоогийн УБ-ийн сарыг оруулаад сүүлийн `count` сар (эртээс хожуу руу). */
export function timelineMonths(now: Date = new Date(), count = 6): TimelineMonthKey[] {
    const { year, month } = ubParts(now);
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(year, month - count + i, 1));
        const monthIdx = d.getUTCMonth();
        return { key: `${d.getUTCFullYear()}-${pad(monthIdx + 1)}`, label: `${monthIdx + 1}-р сар`, year: d.getUTCFullYear(), monthIdx };
    });
}

/** Цонх: [эхний сарын УБ 1-ний шөнө дунд, дараагийн сарын УБ 1-ний шөнө дунд) ба DATE баганын эхний/сүүлийн өдөр. */
export function timelineWindow(months: readonly TimelineMonthKey[]) {
    const first = months[0], last = months[months.length - 1];
    const start = ubMonthRange(first.year, first.monthIdx).start;
    const end = ubMonthRange(last.year, last.monthIdx).end;
    return { start, end, firstDay: `${first.key}-01`, lastDay: ubDateStr(new Date(end.getTime() - 1)) };
}

const daysInMonth = (m: TimelineMonthKey) => new Date(Date.UTC(m.year, m.monthIdx + 1, 0)).getUTCDate();

export function buildMarketingTimeline(months: readonly TimelineMonthKey[], data: TimelineInput): TimelineMonth[] {
    const buckets = new Map(months.map(m => [m.key, {
        leads: 0, meetings: 0, activity: 0, mnt: 0, converted: false, pending: {} as Record<string, number>, days: new Set<string>(),
    }]));
    const bump = (key: string | null, field: 'leads' | 'meetings' | 'activity') => {
        const bucket = key ? buckets.get(key) : undefined;
        if (bucket) bucket[field] += 1;
    };
    for (const l of data.leads) bump(ubMonthKey(l.created_at), 'leads');
    for (const v of data.viewings) bump(ubMonthKey(v.scheduled_at), 'meetings');
    for (const p of data.posts) bump(ubMonthKey(p.published_at), 'activity');
    for (const c of data.campaigns) if (c.status !== 'cancelled') bump(ubMonthKey(c.start_date || c.created_at), 'activity');

    // Зардлын өдөр бол дансны өдөр (DATE) — сар нь тэр өдрийнх.
    for (const day of data.spend.coveredDays) buckets.get(day.slice(0, 7))?.days.add(day);
    for (const row of data.spend.rows) {
        const bucket = buckets.get(row.spent_at.slice(0, 7));
        if (!bucket) continue;
        bucket.days.add(row.spent_at);
        if (row.amount_mnt !== null && row.amount_mnt !== undefined) {
            bucket.mnt += metaNumber(row.amount_mnt);
            bucket.converted = true;
            continue;
        }
        const native = metaNumber(row.native_amount);
        if (native > 0) bucket.pending[row.currency] = round6((bucket.pending[row.currency] ?? 0) + native);
    }

    return months.map((m, index) => {
        const b = buckets.get(m.key)!;
        const spendDays = b.days.size;
        // Ханштай мөргүй, зөвхөн ханшгүй зардалтай сарын төгрөгийн дүн тодорхойгүй (0 биш).
        const unknownMnt = spendDays === 0 || (!b.converted && Object.keys(b.pending).length > 0);
        return {
            month: m.key, label: m.label, leads: b.leads, meetings: b.meetings, activity: b.activity,
            spend: unknownMnt ? null : Math.round(b.mnt),
            pending: b.pending,
            spendDays,
            // Сүүлийн (одоогийн) сар үргэлжилж байгаа тул хэсэгчилсэн гэж тэмдэглэхгүй.
            spendPartial: index < months.length - 1 && spendDays > 0 && spendDays < daysInMonth(m),
        };
    });
}
