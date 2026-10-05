/**
 * «Санал гомдол»-ын шийдвэрлэх хугацааны (SLA) НЭГ дүрэм (client-safe, pure).
 *
 * • Зорилтот хугацаа чухлалаар: яаралтай 24ц, өндөр 48ц, дунд 120ц, бага 240ц (бүртгэсэн мөчөөс).
 * • Шийдвэрлэсэн мөч = resolved_at, зөвхөн resolved/closed төлөвтэй үед. Дахин нээгдсэн хуучин
 *   мөрийн resolved_at-г, мөн resolved_at-гүй хаагдсан хуучин мөрийг SLA-д тооцохгүй (мэдээлэлгүй).
 * • SLA-ийн үр дүн тодорхой болох мөч: хугацаандаа шийдвэрлэсэн бол шийдвэрлэсэн мөч (биелсэн),
 *   эс бөгөөд хугацаа дууссан мөч (биелээгүй — хожим шийдвэрлэсэн ч). Хүсэлт бүр яг нэг хугацаанд
 *   (өдөр/долоо хоног/сар) тооцогдоно; хугацаа нь болоогүй нээлттэй хүсэлт хараахан тооцогдохгүй.
 * • Хугацаандаа шийдвэрлэсэн хувь = биелсэн / үр дүн тодорхой болсон; хуваагч 0 бол null (0% биш).
 */
import { isClosedServiceStatus, type ServiceLogPriority } from './labels';

export const SLA_TARGET_HOURS: Record<ServiceLogPriority, number> = { urgent: 24, high: 48, medium: 120, low: 240 };
/** Хамгийн урт SLA — тайлангийн хугацаанаас өмнө бүртгэгдсэн хүсэлтийг хэр хол уншихыг тодорхойлно. */
export const MAX_SLA_HOURS = Math.max(...Object.values(SLA_TARGET_HOURS));

const HOUR = 3_600_000;

export interface SlaLog {
    priority: string | null;
    status: string | null;
    created_at: string;
    resolved_at: string | null;
}

export function slaTargetHours(priority: string | null | undefined): number {
    return priority && Object.hasOwn(SLA_TARGET_HOURS, priority) ? SLA_TARGET_HOURS[priority as ServiceLogPriority] : SLA_TARGET_HOURS.medium;
}

export function slaDeadline(log: Pick<SlaLog, 'priority' | 'created_at'>): Date {
    return new Date(Date.parse(log.created_at) + slaTargetHours(log.priority) * HOUR);
}

/** Шийдвэрлэсэн мөч — зөвхөн resolved/closed төлөвтэй, resolved_at-тай үед. */
export function resolvedMoment(log: SlaLog): Date | null {
    if (!isClosedServiceStatus(log.status) || !log.resolved_at) return null;
    const at = new Date(log.resolved_at);
    return Number.isNaN(at.getTime()) ? null : at;
}

/** SLA-ийн үр дүн (тодорхой болсон мөч, биелсэн эсэх); хараахан тодорхойгүй/мэдээлэлгүй бол null. */
export function slaOutcome(log: SlaLog, now: Date): { at: Date; met: boolean } | null {
    if (isClosedServiceStatus(log.status) && !log.resolved_at) return null;
    const deadline = slaDeadline(log);
    const resolved = resolvedMoment(log);
    if (resolved && resolved.getTime() <= deadline.getTime()) return { at: resolved, met: true };
    if (resolved || deadline.getTime() <= now.getTime()) return { at: deadline, met: false };
    return null;
}

/** Одоо нээлттэй бөгөөд SLA хэтэрсэн эсэх. */
export function isOpenOverdue(log: SlaLog, now: Date): boolean {
    return !isClosedServiceStatus(log.status) && slaDeadline(log).getTime() < now.getTime();
}

/** Жагсаалтын тэмдэг: нээлттэй хүсэлтийн хэтэрсэн/үлдсэн цаг (хаагдсан бол null). */
export function slaState(log: SlaLog, now: Date): { kind: 'overdue' } | { kind: 'open'; hoursLeft: number; warn: boolean } | null {
    if (isClosedServiceStatus(log.status)) return null;
    const target = slaTargetHours(log.priority);
    const hoursOpen = (now.getTime() - Date.parse(log.created_at)) / HOUR;
    if (hoursOpen > target) return { kind: 'overdue' };
    return { kind: 'open', hoursLeft: Math.max(0, Math.round(target - hoursOpen)), warn: hoursOpen > target * 0.75 };
}

/** Нэг хугацааны (менежер × өдөр г.м) шийдвэрлэлтийн нийлбэр. */
export interface ResolutionTally {
    received: number;
    resolved: number;
    resolutionHours: number;
    slaTotal: number;
    slaMet: number;
}

export interface ResolutionSummary {
    /** Хугацаанд бүртгэгдсэн хүсэлт. */
    received: number;
    /** Хугацаанд шийдвэрлэсэн (resolved/closed) хүсэлт. */
    resolved: number;
    /** SLA-ийн үр дүн хугацаанд тодорхой болсон хүсэлт. */
    slaTotal: number;
    /** Тэдгээрээс хугацаандаа шийдвэрлэсэн. */
    slaMet: number;
    onTimePct: number | null;
    avgResolutionHours: number | null;
}

export const emptyTally = (): ResolutionTally => ({ received: 0, resolved: 0, resolutionHours: 0, slaTotal: 0, slaMet: 0 });

export function addTally(target: ResolutionTally, source: ResolutionTally): ResolutionTally {
    target.received += source.received;
    target.resolved += source.resolved;
    target.resolutionHours += source.resolutionHours;
    target.slaTotal += source.slaTotal;
    target.slaMet += source.slaMet;
    return target;
}

export function toResolutionSummary(tally: ResolutionTally): ResolutionSummary {
    return {
        received: tally.received,
        resolved: tally.resolved,
        slaTotal: tally.slaTotal,
        slaMet: tally.slaMet,
        onTimePct: tally.slaTotal ? Math.round(tally.slaMet / tally.slaTotal * 1000) / 10 : null,
        avgResolutionHours: tally.resolved ? Math.round(tally.resolutionHours / tally.resolved * 10) / 10 : null,
    };
}

/**
 * Хүсэлтийн үйл явдлуудыг хугацааны түлхүүрээр тараана (`key(at)` null бол хугацаанаас гадуур).
 * Тайлангийн builder менежер × хугацаа бүрт дахин гүйлгэхгүйн тулд нэг дамжлагаар нэмнэ.
 */
export function tallyServiceLog(log: SlaLog, now: Date, key: (at: Date) => string | null, into: (periodKey: string) => ResolutionTally) {
    const created = key(new Date(log.created_at));
    if (created) into(created).received += 1;
    const resolved = resolvedMoment(log);
    const resolvedKey = resolved ? key(resolved) : null;
    if (resolved && resolvedKey) {
        const tally = into(resolvedKey);
        tally.resolved += 1;
        tally.resolutionHours += Math.max(0, resolved.getTime() - Date.parse(log.created_at)) / HOUR;
    }
    const outcome = slaOutcome(log, now);
    const outcomeKey = outcome ? key(outcome.at) : null;
    if (outcome && outcomeKey) {
        const tally = into(outcomeKey);
        tally.slaTotal += 1;
        if (outcome.met) tally.slaMet += 1;
    }
}
