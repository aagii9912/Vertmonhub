/**
 * Elysium.mn сайтын лид — шууд дамжуулалт (push, `/api/integrations/elysium/leads`) ба
 * тулгалтын татан авалт (pull, `ElysiumLeadSync`)-ын нэгдсэн цэвэр дүрэм: тэмдэглэлийн
 * формат, эх мөрийг цэвэрлэх, давхардал таних. Хоёр зам эндээс ижил үр дүн авна.
 */
import { z } from 'zod';
import type { LeadSource } from '@/types/property';
import { normalizePhone } from '@/lib/utils/phone';

/** Elysium-ээс ирсэн бүх лид «Вэбсайт» эх үүсвэртэй (push, түүхэн импорттой ижил). */
export const ELYSIUM_LEAD_SOURCE: LeadSource = 'website';
/** Лидийн түүхэнд харагдах системийн нэр. */
export const ELYSIUM_ACTOR_NAME = 'Elysium холболт';
export const ELYSIUM_IMPORT_NOTE = 'Elysium сайтаас татаж оруулав: шууд дамжуулалтаар ирээгүй хүсэлт.';
export const ELYSIUM_REPEAT_TITLE = 'Elysium сайтаас дахин хүсэлт ирлээ.';

const HOUR_MS = 60 * 60 * 1000;
/**
 * Давхардлын цонх: CRM-ийн лид эх хүсэлтээс 24 цагийн өмнө … 72 цагийн дараа үүссэн байж болно
 * (дамжуулалт дахин оролдлогоор хожуу амжилттай болсон). Татаж оруулсан лидийг дамжуулалтын
 * хамгаалалт 72 цаг хүртэл буцаадаг тул тэдгээрт өмнөх цонх мөн 72 цаг.
 */
export const ELYSIUM_MATCH_WINDOW = { beforeMs: 24 * HOUR_MS, afterMs: 72 * HOUR_MS, importedBeforeMs: 72 * HOUR_MS } as const;
/**
 * Утсанд шаардах доод цифрийн тоо. Түүнээс богино «утас» тулгахад ашиглагдахгүй тул
 * лидийн утас болгохгүй (тэмдэглэлд үлдэнэ): эс бөгөөс дамжуулалт ба татан авалт нэг
 * хүсэлтээс хоёр лид үүсгэнэ.
 */
export const ELYSIUM_MIN_PHONE_DIGITS = 6;

export interface ElysiumSubmission {
    message?: string | null;
    event?: string | null;
    source?: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value.trim() || null : null);

/** Лидийн `notes`: мессеж, «Арга хэмжээ», «Сайтын эх сурвалж» — хоосон мөргүйгээр. */
export function elysiumLeadNotes(input: ElysiumSubmission): string | null {
    const message = text(input.message);
    const event = text(input.event);
    const source = text(input.source);
    return [
        message,
        event ? `Арга хэмжээ: ${event}` : null,
        source ? `Сайтын эх сурвалж: ${source}` : null,
    ].filter(Boolean).join('\n\n') || null;
}

/** Elysium Supabase `event_leads`-ийн уншдаг баганууд. Хоосон талбарыг '' гэж хадгалдаг. */
export const EventLeadRowSchema = z.object({
    id: z.uuid(),
    created_at: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'created_at'),
    name: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    message: z.string().nullish(),
    source: z.string().nullish(),
    event_name: z.string().nullish(),
    event_slug: z.string().nullish(),
});
export type EventLeadRow = z.infer<typeof EventLeadRowSchema>;

export interface ContactKey {
    /** normalizePhone, ELYSIUM_MIN_PHONE_DIGITS-ээс цөөн цифртэй бол null. */
    phone: string | null;
    /** Жижиг үсгээр. */
    email: string | null;
}

export function contactKey(phone: string | null | undefined, email: string | null | undefined): ContactKey {
    const digits = normalizePhone(phone);
    return {
        phone: digits && digits.length >= ELYSIUM_MIN_PHONE_DIGITS ? digits : null,
        email: text(email)?.toLowerCase() ?? null,
    };
}

export type NormalizedEventLead =
    | {
        ok: true;
        name: string | null;
        phone: string | null;
        email: string | null;
        notes: string | null;
        message: string | null;
        event: string | null;
        createdAt: string;
        createdAtMs: number;
        key: ContactKey;
    }
    | { ok: false; detail: string };

const emailSchema = z.email().max(255);

/**
 * Эх мөрийг лидийн талбарт буулгана: '' → null, DB-ийн уртын хязгаар (нэр 255, утас 50,
 * и-мэйл 255). Буруу и-мэйл эсвэл 6-аас цөөн цифртэй/хэт урт утсыг алдахгүйн тулд
 * тэмдэглэлд нэмнэ. Тулгах боломжтой утас, и-мэйл хоёулаа байхгүй бол invalid.
 */
export function normalizeEventLead(row: EventLeadRow): NormalizedEventLead {
    const extra: string[] = [];
    let phone = text(row.phone);
    if (phone && (phone.length > 50 || (normalizePhone(phone)?.length ?? 0) < ELYSIUM_MIN_PHONE_DIGITS)) {
        extra.push(`Утас: ${phone}`);
        phone = null;
    }
    let email = text(row.email);
    if (email && !emailSchema.safeParse(email).success) {
        extra.push(`И-мэйл: ${email}`);
        email = null;
    }
    if (!phone && !email) return { ok: false, detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу' };

    const message = text(row.message);
    const event = text(row.event_name);
    const notes = [elysiumLeadNotes({ message, event, source: row.source }), ...extra].filter(Boolean).join('\n\n') || null;
    return {
        ok: true,
        name: text(row.name)?.slice(0, 255) ?? null,
        phone,
        email,
        notes,
        message,
        event,
        createdAt: row.created_at,
        createdAtMs: Date.parse(row.created_at),
        key: contactKey(phone, email),
    };
}

/** Давхардал шалгах CRM-ийн лид. */
export interface LeadCandidate {
    id: string;
    key: ContactKey;
    customerPhone: string | null;
    customerEmail: string | null;
    notes: string | null;
    createdAtMs: number;
    deleted: boolean;
    /** Татан авалтаар үүссэн лид (client_request_id = event_leads.id). */
    imported: boolean;
}

export interface CandidateLeadRow {
    id: string;
    customer_phone?: string | null;
    customer_email?: string | null;
    notes?: string | null;
    created_at: string;
    deleted_at?: string | null;
}

export function toCandidate(lead: CandidateLeadRow, imported = false): LeadCandidate {
    return {
        id: lead.id,
        key: contactKey(lead.customer_phone, lead.customer_email),
        customerPhone: lead.customer_phone ?? null,
        customerEmail: lead.customer_email ?? null,
        notes: lead.notes ?? null,
        createdAtMs: Date.parse(lead.created_at),
        deleted: !!lead.deleted_at,
        imported,
    };
}

/** Ижил утас (нормчилсон) эсвэл ижил и-мэйл (жижиг үсгээр), лид цонхон дотор үүссэн. */
export function matchesLead(
    submission: { key: ContactKey; createdAtMs: number },
    candidate: LeadCandidate,
    window: { beforeMs: number; afterMs: number; importedBeforeMs: number } = ELYSIUM_MATCH_WINDOW,
): boolean {
    const samePhone = !!submission.key.phone && submission.key.phone === candidate.key.phone;
    const sameEmail = !!submission.key.email && submission.key.email === candidate.key.email;
    if (!samePhone && !sameEmail) return false;
    const delta = candidate.createdAtMs - submission.createdAtMs;
    const before = candidate.imported ? Math.max(window.importedBeforeMs, window.beforeMs) : window.beforeMs;
    return delta >= -before && delta <= window.afterMs;
}

/** Хамгийн тохирох лид: устгаагүйг түрүүлж, дараа нь хугацаагаар хамгийн ойрыг. Устгасан лидийг ч тооцно (дахин сэргээхгүй). */
export function findMatchingLead(
    submission: { key: ContactKey; createdAtMs: number },
    candidates: LeadCandidate[],
    window = ELYSIUM_MATCH_WINDOW,
): LeadCandidate | null {
    let best: LeadCandidate | null = null;
    for (const candidate of candidates) {
        if (!matchesLead(submission, candidate, window)) continue;
        if (!best
            || (best.deleted && !candidate.deleted)
            || (best.deleted === candidate.deleted
                && Math.abs(candidate.createdAtMs - submission.createdAtMs) < Math.abs(best.createdAtMs - submission.createdAtMs))) {
            best = candidate;
        }
    }
    return best;
}

/**
 * Хүсэлтийн агуулга (мессеж, арга хэмжээ) аль хэдийн лидийн тэмдэглэл эсвэл өмнөх «дахин хүсэлт»
 * бичлэгт байгаа эсэх. Ажилтан тэмдэглэлд нэмж бичсэн байсан ч эх мессеж хэвээр бол ижил гэж үзнэ.
 */
export function submissionRecorded(texts: ReadonlyArray<string | null | undefined>, submission: { message: string | null; event: string | null }): boolean {
    if (!submission.message && !submission.event) return true;
    return texts.some((value) => !!value
        && (!submission.message || value.includes(submission.message))
        && (!submission.event || value.includes(`Арга хэмжээ: ${submission.event}`)));
}

/** Тохирсон лид дээрх «дахин хүсэлт» системийн бичлэг: шинэ агуулга, өөр утас/и-мэйл. */
export function elysiumRepeatInquiryText(
    submission: { notes: string | null; phone: string | null; email: string | null },
    lead: { customerPhone: string | null; customerEmail: string | null },
): string {
    const lines = [ELYSIUM_REPEAT_TITLE];
    if (submission.notes) lines.push(submission.notes);
    if (submission.phone && normalizePhone(submission.phone) !== normalizePhone(lead.customerPhone)) lines.push(`Утас: ${submission.phone}`);
    if (submission.email && submission.email.toLowerCase() !== (lead.customerEmail ?? '').trim().toLowerCase()) lines.push(`И-мэйл: ${submission.email}`);
    return lines.join('\n\n');
}
