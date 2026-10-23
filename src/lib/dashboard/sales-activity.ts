/**
 * Лхагвын илтгэлийн «БОРЛУУЛАЛТЫН АЛБА — ТООН МЭДЭЭЛЭЛ» (багийн загварын 9-р слайд): утасны шугам, чат,
 * уулзалтыг 7 хоногоор ба сарын эхнээс, багийн сарын төлөвлөгөөтэй нь. Client-safe, pure (DB-гүй):
 * сервер `sales-activity-load.ts`.
 *
 * Эх сурвалж — ТААМАГЛАХГҮЙ (эзний шийдвэр W10, W11):
 *  • Дуудлага, чат = өдрийн тайлангийн гараар оруулсан тоо (`daily_report_counts`), ОДООГИЙН загварт байгаа
 *    үзүүлэлт л: шугам ангилалтай бол ангилал бүр, ангилалгүй бол «нийт» нүд (10/08-ны хуучин `total` нүд
 *    ангиллын нүдний хажууд байдаг тул давхар тоолохгүй). Төслийн утас («7786») = загварын эхний шугам,
 *    менежерийн дугаар («3374») = хоёр дахь шугам, чат = загварын бүх суваг. CRM-ийн дуудлагаас гаргахгүй.
 *  • Хугацаанд тухайн үзүүлэлтийн нэг ч нүд оруулаагүй бол null («—»), 0 биш (хэн ч 0 гэж бичдэггүй).
 *  • Шинэ / давтан уулзалт = `completed`, устгаагүй `property_viewings`-ийн `meeting_type`
 *    (`new_customer` / `repeat_customer`), уулзалтын УБ өдрөөр. Өөр төслийн худалдан авагчийг «Шинэ»-ээр
 *    бүртгэдэг (W10) тул тусгай дүрэмгүй. Уулзалтын бүртгэл эхэлсэн өдрөөс (`dataSince`) өмнө null; бүртгэл
 *    хугацааны дунд эхэлсэн бол тоо нь доод хязгаар («N+», `partial`), олдоогүй бол null, хувь нь null.
 *  • 7 хоног = Лхагва→Мягмар (W1), сарын хилээр тасална (`monthWeeks`), сар дамжина; сүүлийн 5 хэсэг.
 *  • Төлөвлөгөө = төслийн багийн сарын төлөвлөгөө (`team_sales_targets.activity_targets`). Хувь тэнцүүлсэн
 *    төлөвлөгөө = round(сарын × min(тайлант өдөр, 30) / 30), хувь = round(гүйцэтгэл / хувь тэнцүүлсэн × 100) (W11).
 */
import { z } from 'zod';
import { daySpan, shiftDate } from '@/lib/sales/activity';
import { chatMetric, configMetrics, lineMetrics, type DailyReportConfig, type DailyReportLine } from './daily-report';
import { monthWeeks } from './weekly-sales';
import { weeklyReviewRange } from './weekly-review';

export const ACTIVITY_METRICS = ['hotline', 'managerLine', 'newMeetings', 'repeatMeetings', 'chats'] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];
/** Анхдагч нэр (загварын шугамын нэрийг `lines`-аас харуулж болно). */
export const ACTIVITY_METRIC_LABEL: Record<ActivityMetric, string> = {
    hotline: 'Төслийн утас', managerLine: 'Менежерийн дугаар', newMeetings: 'Шинэ уулзалт', repeatMeetings: 'Давтан уулзалт', chats: 'Чат',
};
/** `team_sales_targets.activity_targets` jsonb-ийн түлхүүр. */
export const ACTIVITY_TARGET_KEY: Record<ActivityMetric, string> = {
    hotline: 'hotline', managerLine: 'manager_line', newMeetings: 'meetings_new', repeatMeetings: 'meetings_repeat', chats: 'chats',
};
export const SALES_ACTIVITY_BUCKETS = 5;
/** Хувь тэнцүүлэх сарын өдөр (багийн Excel-ийн томьёо: үргэлж 30). */
export const ACTIVITY_PLAN_DAYS = 30;
export const ACTIVITY_TARGET_MAX = 1_000_000;

export interface ActivityBucket {
    label: string;
    from: string;
    to: string;
    values: Record<ActivityMetric, number | null>;
    /** Утга нь доод хязгаар («N+»): хэсэг бүртгэл эхлэхээс (уулзалт: `dataSince`) өмнө эхэлсэн. */
    partial: Record<ActivityMetric, boolean>;
    /** «Тайлан хийж гүйцэтгэсэн» гэж баталгаажуулсан өдөр. */
    confirmedDays: number;
    /** Аль нэг менежер ямар нэг нүд оруулсан өдөр. */
    knownDays: number;
    days: number;
}
/** `partial` — `actual` доод хязгаар («N+»; сар бүртгэл эхлэхээс өмнө эхэлсэн), тиймээс `pct` null. */
export interface ActivityMonthMetric { actual: number | null; plan: number | null; planToDate: number | null; pct: number | null; partial: boolean }
export interface SalesActivityReport {
    meetingDate: string;
    range: { from: string; to: string };
    /** Сүүлийн ≤ 5 Лхагва→Мягмар хэсэг (сарын хилээр тасалсан), range.to-оор дуусна, эрт → хожуу. */
    buckets: ActivityBucket[];
    month: { month: string; from: string; to: string; metrics: Record<ActivityMetric, ActivityMonthMetric> };
    /** Хадгалсан загварын нэр: эхний шугам, хоёр дахь шугам, чатын сувгууд. */
    lines: { hotline: string | null; managerLine: string | null; chats: string[] };
    /** Уулзалтын бүртгэл эхэлсэн УБ өдөр (үүнээс өмнөх уулзалт тодорхойгүй). */
    dataSince: string | null;
    notes: string[];
}

export interface SalesActivityCountRow { report_date: string; manager_name: string; metric: string; value: number }
export interface SalesActivityMeeting { /** Уулзалтын УБ өдөр. */ day: string; type: string | null }

export interface SalesActivityInput {
    meetingDate: string;
    config: DailyReportConfig;
    /** Загвар хадгалсан эсэх, хадгалсан нь уншигдсан эсэх (`readDailyReportConfig`). */
    configSaved: boolean;
    configInvalid: boolean;
    counts: readonly SalesActivityCountRow[];
    /** «Тайлан хийж гүйцэтгэсэн» өдрүүд. */
    confirmedDates: readonly string[];
    /** `completed`, устгаагүй уулзалт (цонхны хүрээнд). */
    meetings: readonly SalesActivityMeeting[];
    /** Анхны бүртгэлтэй уулзалтын УБ өдөр (устгаагүй, ямар ч төлөв); уулзалтгүй бол null. */
    meetingsSince: string | null;
    /** Тухайн сарын `activity_targets` (түүхий); `targetsAvailable: false` = багана алга. */
    targets: unknown;
    targetsAvailable: boolean;
    /** Өнөөдөр (УБ) — тайлант 7 хоног дуусаагүй бол тэмдэглэл нэмнэ. */
    today?: string;
}

const PlanValue = z.number().int().min(0).max(ACTIVITY_TARGET_MAX);
/** Сарын идэвхжлийн төлөвлөгөө: мэдэгдэх түлхүүр бүрийн бүхэл тоо (≥ 0); бусад/буруу утга → null. */
export function readActivityTargets(raw: unknown): Record<ActivityMetric, number | null> {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    return Object.fromEntries(ACTIVITY_METRICS.map(metric => {
        const parsed = PlanValue.safeParse(source[ACTIVITY_TARGET_KEY[metric]]);
        return [metric, parsed.success ? parsed.data : null];
    })) as Record<ActivityMetric, number | null>;
}

/** Хувь тэнцүүлсэн төлөвлөгөө: round(сарын × min(өдөр, 30) / 30); төлөвлөгөөгүй бол null. */
export function proratedPlan(monthly: number | null, cutoff: string): number | null {
    if (monthly === null) return null;
    const day = Math.min(Number(cutoff.slice(8, 10)), ACTIVITY_PLAN_DAYS);
    return Math.round(monthly * day / ACTIVITY_PLAN_DAYS);
}
/** Хувь: round(гүйцэтгэл / хувь тэнцүүлсэн × 100); аль нэг нь тодорхойгүй эсвэл төлөвлөгөө 0 бол null. */
export function attainmentPct(actual: number | null, planToDate: number | null): number | null {
    return actual === null || !planToDate ? null : Math.round(actual / planToDate * 100);
}

const monthEnd = (month: string) => shiftDate(`${shiftDate(`${month}-28`, 4).slice(0, 7)}-01`, -1);
/** «10/14–10/20»; нэг өдөр бол «10/01». */
export function activityRangeLabel(from: string, to: string): string {
    const day = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
    return from === to ? day(from) : `${day(from)}–${day(to)}`;
}

/**
 * range.to-оор дуусах сүүлийн `count` хэсэг: сар бүрийн Лхагва→Мягмар 7 хоног (`monthWeeks`, 1 өдрийн
 * эхний хэсгийг нийлүүлнэ), сар дамжина; range.to-оос хойшхийг тасална.
 */
export function activityBuckets(to: string, count = SALES_ACTIVITY_BUCKETS): Array<{ label: string; from: string; to: string }> {
    const segments: Array<{ from: string; to: string }> = [];
    for (let month = to.slice(0, 7); segments.length < count; month = shiftDate(`${month}-01`, -1).slice(0, 7)) {
        const weeks = monthWeeks(month).filter(week => week.from <= to).map(week => ({ from: week.from, to: week.to < to ? week.to : to }));
        segments.unshift(...weeks);
    }
    return segments.slice(-count).map(segment => ({ ...segment, label: activityRangeLabel(segment.from, segment.to) }));
}

/** Хурлын тайлангийн цонх: хэсгүүд, сар (сарын эхнээс тайлант өдөр хүртэл), уншиж буй муж. */
export function salesActivityWindow(meetingDate: string) {
    const range = weeklyReviewRange(meetingDate);
    const buckets = activityBuckets(range.to);
    const month = range.to.slice(0, 7);
    const end = monthEnd(month);
    const monthRange = { month, from: `${month}-01`, to: range.to < end ? range.to : end };
    const from = [buckets[0].from, monthRange.from].sort()[0];
    return { range, buckets, month: monthRange, from, to: range.to };
}

const emptyValues = (): Record<ActivityMetric, number | null> =>
    Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, null])) as Record<ActivityMetric, number | null>;
const completeValues = (): Record<ActivityMetric, boolean> =>
    Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, false])) as Record<ActivityMetric, boolean>;

export function buildSalesActivity(input: SalesActivityInput): SalesActivityReport {
    const { config } = input;
    const window = salesActivityWindow(input.meetingDate);
    const notes: string[] = [];

    // Шугам: эхний = төслийн утас, хоёр дахь = менежерийн дугаар (W10); чат = бүх суваг.
    const [hotlineLine, managerLine] = config.lines as Array<DailyReportLine | undefined>;
    const keysOf = (line: DailyReportLine | undefined) => new Set(line ? lineMetrics(line) : []);
    const metricKeys: Record<'hotline' | 'managerLine' | 'chats', Set<string>> = {
        hotline: keysOf(hotlineLine),
        managerLine: keysOf(managerLine),
        chats: new Set(config.chats.map(chat => chatMetric(chat.key))),
    };
    if (!input.configSaved) notes.push('Өдрийн тайлангийн загвар хадгалаагүй тул анхдагч загвараар тооцов.');
    if (input.configInvalid) notes.push('Хадгалсан өдрийн тайлангийн загвар уншигдсангүй — анхдагч загвараар тооцов.');
    if (!hotlineLine) notes.push('Загварт утасны шугам алга — төслийн утасны дуудлага тодорхойгүй.');
    if (!managerLine) notes.push('Загварт хоёр дахь утасны шугам алга — менежерийн дугаарын дуудлага тодорхойгүй.');
    if (!config.chats.length) notes.push('Загварт чатын суваг алга — чатын тоо тодорхойгүй.');
    const allowed = configMetrics(config);
    const ignored = input.counts.filter(row => !allowed.has(row.metric)).length;
    if (ignored) notes.push(`Одоогийн загварт байхгүй ${ignored} нүдийг (хуучин «нийт» г.м.) тооцоогүй.`);

    const sumCounts = (keys: Set<string>, from: string, to: string): number | null => {
        let found = false;
        let total = 0;
        for (const row of input.counts) {
            if (row.report_date < from || row.report_date > to || !keys.has(row.metric)) continue;
            found = true;
            total += row.value;
        }
        return found ? total : null;
    };
    const since = input.meetingsSince;
    /**
     * Уулзалт: бүртгэл эхлэхээс өмнө дууссан хугацаа → null. Бүртгэл хугацааны дунд эхэлсэн бол эхэлснээс хойшхи
     * тоо нь доод хязгаар («N+», `partial`); нэг ч олдоогүй бол null (өмнөх өдрүүд тодорхойгүй тул 0 биш).
     */
    const countMeetings = (type: string, from: string, to: string): { value: number | null; partial: boolean } => {
        if (!since || to < since) return { value: null, partial: false };
        const count = input.meetings.filter(meeting => meeting.type === type && meeting.day >= from && meeting.day <= to).length;
        if (from >= since) return { value: count, partial: false };
        return count ? { value: count, partial: true } : { value: null, partial: false };
    };
    const valuesFor = (from: string, to: string) => {
        const fresh = countMeetings('new_customer', from, to);
        const repeat = countMeetings('repeat_customer', from, to);
        const values: Record<ActivityMetric, number | null> = {
            ...emptyValues(),
            hotline: sumCounts(metricKeys.hotline, from, to),
            managerLine: sumCounts(metricKeys.managerLine, from, to),
            newMeetings: fresh.value,
            repeatMeetings: repeat.value,
            chats: sumCounts(metricKeys.chats, from, to),
        };
        return { values, partial: { ...completeValues(), newMeetings: fresh.partial, repeatMeetings: repeat.partial } };
    };
    if (!since) notes.push('Уулзалт бүртгэгдээгүй тул уулзалтын тоо тодорхойгүй.');
    else if (since > window.from) notes.push(`Уулзалтын бүртгэл ${since}-нээс эхэлсэн — түүнээс өмнөх уулзалт тодорхойгүй, тэр өдрийг агуулсан хугацааны тоо доод хязгаар («N+»).`);
    if (since && since > window.month.from && since <= window.month.to) {
        notes.push(`${window.month.month} сарын уулзалтын тоо ${since}-нээс хойшхи бүртгэлээр тул биелэлтийн хувь «—».`);
    }
    if (input.today && window.range.to > input.today) notes.push(`Тайлант 7 хоног (${window.range.from} – ${window.range.to}) хараахан дуусаагүй байна.`);

    const countDates = new Set(input.counts.map(row => row.report_date));
    const buckets: ActivityBucket[] = window.buckets.map(bucket => {
        const inBucket = (date: string) => date >= bucket.from && date <= bucket.to;
        return {
            ...bucket,
            ...valuesFor(bucket.from, bucket.to),
            confirmedDays: new Set(input.confirmedDates.filter(inBucket)).size,
            knownDays: [...countDates].filter(inBucket).length,
            days: daySpan(bucket.from, bucket.to),
        };
    });

    const targets = input.targetsAvailable ? readActivityTargets(input.targets) : emptyValues();
    if (!input.targetsAvailable) notes.push('Идэвхжлийн төлөвлөгөөний талбар хараахан нэмэгдээгүй (шинэчлэл суулгаагүй) — төлөвлөгөө «—».');
    else if (ACTIVITY_METRICS.every(metric => targets[metric] === null)) notes.push(`${window.month.month} сарын идэвхжлийн төлөвлөгөө оруулаагүй.`);
    const actual = valuesFor(window.month.from, window.month.to);
    const metrics = Object.fromEntries(ACTIVITY_METRICS.map(metric => {
        const plan = targets[metric];
        const planToDate = proratedPlan(plan, window.month.to);
        const partial = actual.partial[metric];
        // Доод хязгаарыг бүтэн сарын хувь тэнцүүлсэн төлөвлөгөөнд хуваавал биелэлт дутуу харагдана — хувь «—».
        const pct = partial ? null : attainmentPct(actual.values[metric], planToDate);
        return [metric, { actual: actual.values[metric], plan, planToDate, pct, partial }];
    })) as Record<ActivityMetric, ActivityMonthMetric>;

    return {
        meetingDate: input.meetingDate,
        range: window.range,
        buckets,
        month: { ...window.month, metrics },
        lines: { hotline: hotlineLine?.label ?? null, managerLine: managerLine?.label ?? null, chats: config.chats.map(chat => chat.label) },
        dataSince: since,
        notes,
    };
}
