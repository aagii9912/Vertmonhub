/**
 * Менежерийн өдөр тутмын идэвх — KPI v2-ийн өдрийн давхарга (client-safe, pure).
 *
 * • Дуудлага = CRM-д бүртгэсэн lead_activities 'call' мөр. Менежерт эхлээд created_by →
 *   sales_managers.user_id, дараа нь бүртгэлийн нэртэй яг таарсан created_by_name-ээр онооно.
 *   Таараагүйг «бүртгэлгүй дуудлага» гэж удирдлагад харуулна (таамаглаж оноохгүй).
 * • Болсон уулзалт = property_viewings 'completed' (бүх төрөл; «шинэ харилцагч»-ийг тусад нь),
 *   «ирээгүй» (no_show) тусдаа, оноонд орохгүй. Уулзалтын УБ өдрөөр (scheduled_at), sales_manager_name-ээр.
 * • Санал хүсэлт = service_logs, ЗӨВХӨН manager_name-ээр (assigned_to-гийн чөлөөт текстийг нэрээр
 *   таамаглаж оноохгүй — «Санал гомдол» хуудас ч мөн адил); SLA-ийн дүрэм lib/service-logs/sla.ts.
 * • Өдрийн зорилт (sales_kpi_months.daily) × зорилтот өдөр (Даваа–Баасан, өнөөдрийг хүртэл).
 *   Зорилтгүй сар орсон бол хугацааны зорилт null («зорилтгүй») — 0 биш.
 * • 7 хоног = Лхагва гарагийн хурлын долоо хоног (Лхагва–Мягмар), ISO долоо хоног биш.
 */
import { UB_OFFSET_MS, ubDateStr } from '@/lib/utils/date';
import { WEEKDAYS_MN } from '@/lib/viewings/labels';
import type { Tone } from '@/lib/leads/labels';
import {
    emptyTally, isOpenOverdue, tallyServiceLog, toResolutionSummary, addTally,
    type ResolutionSummary, type ResolutionTally, type SlaLog,
} from '@/lib/service-logs/sla';

export type ActivityGroup = 'day' | 'week' | 'month';
export const ACTIVITY_GROUPS: readonly ActivityGroup[] = ['day', 'week', 'month'];
export const ACTIVITY_GROUP_LABEL: Record<ActivityGroup, string> = { day: 'Өдөр', week: '7 хоног (Лхагва–Мягмар)', month: 'Сар' };
/** Нэг тайлангийн дээд хугацаа (өдөр). */
export const ACTIVITY_MAX_DAYS = 92;
/** Өдрийн зорилтын дээд хязгаар (оруулах алдаанаас сэргийлнэ). */
export const DAILY_TARGET_LIMITS = { calls: 1000, meetings: 100 } as const;

export interface DailyTargets { calls: number | null; meetings: number | null }

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;

/** `YYYY-MM-DD` огноог хоногоор шилжүүлнэ (цагийн бүсгүй, календарийн). */
export function shiftDate(date: string, days: number): string {
    return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10);
}
/** [from, to] хоёр захыг оруулсан өдрийн тоо. */
export function daySpan(from: string, to: string): number {
    return dayNumber(to) - dayNumber(from) + 1;
}
/** УБ-ийн тухайн өдрийн шөнө дунд (UTC instant). */
export function ubDateStart(date: string): Date {
    return new Date(Date.parse(`${date}T00:00:00Z`) - UB_OFFSET_MS);
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** Зорилттой ажлын өдөр (Даваа–Баасан). */
export function isTargetDay(date: string): boolean {
    const weekday = weekdayOf(date);
    return weekday >= 1 && weekday <= 5;
}
/** Хурлын долоо хоногийн эхний өдөр (тухайн өдөр эсвэл өмнөх Лхагва). */
export function activityWeekStart(date: string): string {
    return shiftDate(date, -((weekdayOf(date) - 3 + 7) % 7));
}
export function periodKey(date: string, group: ActivityGroup): string {
    if (group === 'day') return date;
    if (group === 'week') return activityWeekStart(date);
    return date.slice(0, 7);
}

/** Анхны огноо, бүлэглэлээр тухайн хугацааны хил (картын сум товч). */
export function periodBounds(anchor: string, group: ActivityGroup): { from: string; to: string } {
    if (group === 'day') return { from: anchor, to: anchor };
    if (group === 'week') {
        const from = activityWeekStart(anchor);
        return { from, to: shiftDate(from, 6) };
    }
    const from = `${anchor.slice(0, 7)}-01`;
    const next = shiftDate(from, 32).slice(0, 7);
    return { from, to: shiftDate(`${next}-01`, -1) };
}
/** Өмнөх/дараах хугацааны анхны огноо. */
export function shiftPeriod(anchor: string, group: ActivityGroup, direction: -1 | 1): string {
    const { from, to } = periodBounds(anchor, group);
    return direction < 0 ? periodBounds(shiftDate(from, -1), group).from : shiftDate(to, 1);
}

export function periodLabel(from: string, to: string, group: ActivityGroup): string {
    if (group === 'day') return `${from.slice(5)} · ${WEEKDAYS_MN[weekdayOf(from)]}`;
    if (group === 'week') return `${from.slice(5)} – ${to.slice(5)}`;
    return `${from.slice(0, 4)} оны ${Number(from.slice(5, 7))}-р сар`;
}

/** Зорилтын биелэлтийн өнгө: ≥100% амжилттай, ≥70% анхааруулга, бусад нь муу; зорилтгүй бол саармаг. */
export function attainmentTone(pct: number | null): Tone {
    if (pct === null) return 'neutral';
    if (pct >= 100) return 'success';
    if (pct >= 70) return 'pending';
    return 'danger';
}

/** Хугацааны алдааны монгол мессеж (зөв бол null). */
export function activityRangeError(from: string, to: string): string | null {
    if (to < from) return 'Эхлэх, дуусах өдрөө зөв дарааллаар сонгоно уу';
    if (daySpan(from, to) > ACTIVITY_MAX_DAYS) return `Хугацаа ${ACTIVITY_MAX_DAYS} хоногоос ихгүй байна`;
    return null;
}

/**
 * Хугацааны анхдагч (API, AI tool нэг дүрэм): `to` өгөөгүй бол өнөөдөр (`from` ирээдүйд бол `from`);
 * `from` өгөөгүй бол `to`-гийн өдөр / хурлын 7 хоног / сарын эхэн. Шалгалтыг activityRangeError хийнэ.
 */
export function resolveActivityRange(from: string | null | undefined, to: string | null | undefined, group: ActivityGroup, today: string): { from: string; to: string } {
    const end = to || (from && from > today ? from : today);
    return { from: from || periodBounds(end, group).from, to: end };
}

/** [from, min(to, today)] доторх зорилтот (Даваа–Баасан) өдрүүд. */
export function targetDates(from: string, to: string, today: string): string[] {
    const last = to < today ? to : today;
    const dates: string[] = [];
    for (let date = from; date <= last; date = shiftDate(date, 1)) if (isTargetDay(date)) dates.push(date);
    return dates;
}

export interface ActivityRosterEntry { name: string; user_id: string | null; is_active: boolean }
export interface ActivityCall { created_by: string | null; created_by_name: string | null; created_at: string }
export interface ActivityMeeting { sales_manager_name: string | null; scheduled_at: string; status: string | null; meeting_type: string | null }
export interface ActivityRequest extends SlaLog { manager_name: string | null }
export interface DailyTargetRow { manager_name: string; year: number; month: number; daily: unknown }

/**
 * Дуудлагыг менежерт онооно: данс (user_id) давамгайлна; нэрийн таарц зөвхөн дансгүй бүртгэлд,
 * эсвэл бичсэн хэрэглэгч устсан (created_by null) үед — өөр дансанд холбосон менежерийг нэрээр авахгүй.
 */
export function attributeCall(call: Pick<ActivityCall, 'created_by' | 'created_by_name'>, roster: readonly ActivityRosterEntry[]): string | null {
    if (call.created_by) {
        const linked = roster.filter(entry => entry.user_id === call.created_by);
        if (linked.length === 1) return linked[0].name;
        if (linked.length > 1) return null;
    }
    const name = call.created_by_name?.trim();
    if (!name) return null;
    const entry = roster.find(row => row.name === name);
    if (!entry) return null;
    return !entry.user_id || !call.created_by ? entry.name : null;
}

/** sales_kpi_months.daily → {calls, meetings} (эерэг бүхэл тоо биш бол зорилтгүй). */
export function readDailyTargets(daily: unknown): DailyTargets {
    const value = daily && typeof daily === 'object' ? daily as Record<string, unknown> : {};
    const pick = (raw: unknown) => typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null;
    return { calls: pick(value.calls), meetings: pick(value.meetings) };
}

export interface ActivityPeriod { key: string; label: string; from: string; to: string; targetDays: number }

export interface ActivityRow {
    period: string;
    calls: number;
    meetingsHeld: number;
    meetingsNew: number;
    noShows: number;
    requests: ResolutionSummary;
    /** Хугацааны зорилт = өдрийн зорилт × зорилтот өдөр; зорилтгүй бол null. */
    target: { calls: number | null; meetings: number | null };
    /** Гүйцэтгэлийн хувь (хязгааргүй); зорилтгүй бол null. */
    attainment: { calls: number | null; meetings: number | null };
}

export interface ManagerActivity {
    manager: string;
    active: boolean;
    inRoster: boolean;
    /** Хугацааны сүүлийн сарын өдрийн зорилт (харуулах). */
    daily: DailyTargets;
    rows: ActivityRow[];
    totals: ActivityRow;
    /** Одоогийн байдлаар SLA хэтэрсэн нээлттэй хүсэлт. */
    openOverdue: number;
}

export interface ManagerActivityReport {
    from: string;
    to: string;
    group: ActivityGroup;
    today: string;
    targetDays: number;
    periods: ActivityPeriod[];
    managers: ManagerActivity[];
    /** Менежерт оноогдоогүй идэвх (зөвхөн багийн харагдацад; хувийн харагдацад null). */
    unattributed: { calls: number; meetings: number; requests: number; openOverdue: number } | null;
}

export interface BuildActivityInput {
    from: string;
    to: string;
    group: ActivityGroup;
    now: Date;
    roster: readonly ActivityRosterEntry[];
    calls: readonly ActivityCall[];
    meetings: readonly ActivityMeeting[];
    requests: readonly ActivityRequest[];
    targets: readonly DailyTargetRow[];
    /** Зөвхөн энэ менежер (хувийн харагдац). */
    only?: string | null;
}

interface Bucket { calls: number; meetingsHeld: number; meetingsNew: number; noShows: number; tally: ResolutionTally }
const emptyBucket = (): Bucket => ({ calls: 0, meetingsHeld: 0, meetingsNew: 0, noShows: 0, tally: emptyTally() });
const pct = (actual: number, target: number | null) => target ? Math.round(actual / target * 1000) / 10 : null;

export function buildPeriods(from: string, to: string, group: ActivityGroup, today: string): ActivityPeriod[] {
    const periods: ActivityPeriod[] = [];
    let start = from;
    while (start <= to) {
        const bounds = periodBounds(start, group);
        const end = bounds.to < to ? bounds.to : to;
        periods.push({ key: periodKey(start, group), label: periodLabel(start, end, group), from: start, to: end, targetDays: targetDates(start, end, today).length });
        start = shiftDate(end, 1);
    }
    return periods;
}

export function buildManagerActivity(input: BuildActivityInput): ManagerActivityReport {
    const { from, to, group, now } = input;
    const today = ubDateStr(now);
    const periods = buildPeriods(from, to, group, today);
    const periodOf = (at: Date) => {
        const date = ubDateStr(at);
        return date < from || date > to ? null : periodKey(date, group);
    };

    const rosterByName = new Map(input.roster.map(entry => [entry.name, entry]));
    const managers = new Map<string, { buckets: Map<string, Bucket>; openOverdue: number }>();
    const managerOf = (name: string) => {
        let entry = managers.get(name);
        if (!entry) managers.set(name, entry = { buckets: new Map(), openOverdue: 0 });
        return entry;
    };
    const bucketOf = (name: string, key: string) => {
        const { buckets } = managerOf(name);
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, bucket = emptyBucket());
        return bucket;
    };
    for (const entry of input.roster) if (entry.is_active) managerOf(entry.name);
    // Хувийн харагдац идэвхгүй бүртгэлтэй ч өөрийн (тэг) мөрөө харна.
    if (input.only) managerOf(input.only);
    const unattributed = { calls: 0, meetings: 0, requests: 0, openOverdue: 0 };

    for (const call of input.calls) {
        const key = periodOf(new Date(call.created_at));
        if (!key) continue;
        const name = attributeCall(call, input.roster);
        if (name) bucketOf(name, key).calls += 1;
        else unattributed.calls += 1;
    }
    for (const meeting of input.meetings) {
        const key = periodOf(new Date(meeting.scheduled_at));
        if (!key || (meeting.status !== 'completed' && meeting.status !== 'no_show')) continue;
        const name = meeting.sales_manager_name?.trim();
        if (!name) { if (meeting.status === 'completed') unattributed.meetings += 1; continue; }
        const bucket = bucketOf(name, key);
        if (meeting.status === 'no_show') bucket.noShows += 1;
        else {
            bucket.meetingsHeld += 1;
            if (meeting.meeting_type === 'new_customer') bucket.meetingsNew += 1;
        }
    }
    const unassignedTally = emptyTally();
    for (const request of input.requests) {
        const name = request.manager_name?.trim() || null;
        if (!name) {
            tallyServiceLog(request, now, at => periodOf(at), () => unassignedTally);
            if (isOpenOverdue(request, now)) unattributed.openOverdue += 1;
            continue;
        }
        tallyServiceLog(request, now, at => periodOf(at), key => bucketOf(name, key).tally);
        if (isOpenOverdue(request, now)) managerOf(name).openOverdue += 1;
    }
    unattributed.requests = unassignedTally.received;

    const targets = new Map(input.targets.map(row => [`${row.manager_name}|${row.year}-${String(row.month).padStart(2, '0')}`, readDailyTargets(row.daily)]));
    const dailyOf = (name: string, month: string) => targets.get(`${name}|${month}`) ?? { calls: null, meetings: null };
    const periodTarget = (name: string, dates: string[], field: keyof DailyTargets) => {
        if (!dates.length) return null;
        let sum = 0;
        for (const date of dates) {
            const daily = dailyOf(name, date.slice(0, 7))[field];
            if (daily === null) return null;
            sum += daily;
        }
        return sum;
    };
    const row = (name: string, period: string, bucket: Bucket, dates: string[]): ActivityRow => {
        const target = { calls: periodTarget(name, dates, 'calls'), meetings: periodTarget(name, dates, 'meetings') };
        return {
            period,
            calls: bucket.calls, meetingsHeld: bucket.meetingsHeld, meetingsNew: bucket.meetingsNew, noShows: bucket.noShows,
            requests: toResolutionSummary(bucket.tally),
            target,
            attainment: { calls: pct(bucket.calls, target.calls), meetings: pct(bucket.meetingsHeld, target.meetings) },
        };
    };

    const list = [...managers.entries()]
        .filter(([name]) => !input.only || name === input.only)
        .sort(([a], [b]) => a.localeCompare(b, 'mn'))
        .map(([name, data]): ManagerActivity => {
            const rows = periods.map(period => row(name, period.key, data.buckets.get(period.key) ?? emptyBucket(), targetDates(period.from, period.to, today)));
            const total = emptyBucket();
            for (const bucket of data.buckets.values()) {
                total.calls += bucket.calls;
                total.meetingsHeld += bucket.meetingsHeld;
                total.meetingsNew += bucket.meetingsNew;
                total.noShows += bucket.noShows;
                addTally(total.tally, bucket.tally);
            }
            const roster = rosterByName.get(name);
            return {
                manager: name,
                active: !!roster?.is_active,
                inRoster: !!roster,
                daily: dailyOf(name, to.slice(0, 7)),
                rows,
                totals: row(name, 'total', total, targetDates(from, to, today)),
                openOverdue: data.openOverdue,
            };
        });

    return {
        from, to, group, today,
        targetDays: targetDates(from, to, today).length,
        periods,
        managers: list,
        unattributed: input.only ? null : unattributed,
    };
}
