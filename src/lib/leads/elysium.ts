/**
 * Elysium.mn сайтын лид — шууд дамжуулалт (push, `/api/integrations/elysium/leads`) ба
 * тулгалтын татан авалт (pull, `ElysiumLeadSync`)-ын нэгдсэн цэвэр дүрэм: тэмдэглэлийн
 * формат, эх мөрийг цэвэрлэх, давхардал таних. Хоёр зам эндээс ижил үр дүн авна.
 */
import { z } from 'zod';
import type { LeadSource } from '@/types/property';
import { normalizePhone } from '@/lib/utils/phone';
import {
    ELYSIUM_SITE_PAGE, ELYSIUM_SITE_PAGE_NAME, isLandingPurpose, isMetaUtmSource, landingLeadSource, type LandingPurpose,
} from './landing-attribution';

/** Сувгийн дохиогүй Elysium лидийн эх үүсвэр («Вэбсайт»). Бусад нь `elysiumLeadColumns`-оор. */
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

/**
 * Elysium-ийн `attribution` (маягтын линкийн UTM, Meta ID, fbclid, referrer-ийн домэйн + серверийн
 * тогтоосон хуудасны зориулалт, хаяг). Талбар бүрийг тусад нь шалгаж, буруу утгыг алгасна —
 * attribution-ы улмаас лид хэзээ ч татгалзагдахгүй.
 */
export interface ElysiumAttribution {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    utmId?: string;
    adsetId?: string;
    adId?: string;
    fbclid?: string;
    referrerHost?: string;
    pagePurpose?: LandingPurpose;
    pageUrl?: string;
}

const ATTR_TEXT_KEYS = ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'] as const;
const ATTR_ID_KEYS = ['utmId', 'adsetId', 'adId'] as const;

function pageUrlOf(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 500) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        return `${url.origin}${url.pathname}`;
    } catch {
        return null;
    }
}

export function parseElysiumAttribution(raw: unknown): ElysiumAttribution {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const input = raw as Record<string, unknown>;
    const out: ElysiumAttribution = {};
    for (const key of ATTR_TEXT_KEYS) {
        const value = text(input[key]);
        if (value && value.length <= 200 && !/\p{Cc}/u.test(value)) out[key] = value;
    }
    for (const key of ATTR_ID_KEYS) {
        const value = text(input[key]);
        if (value && /^\d{1,30}$/.test(value)) out[key] = value;
    }
    const fbclid = text(input.fbclid);
    if (fbclid && /^[A-Za-z0-9_-]{1,500}$/.test(fbclid)) out.fbclid = fbclid;
    const host = text(input.referrerHost)?.toLowerCase();
    if (host && /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) out.referrerHost = host;
    if (isLandingPurpose(input.pagePurpose)) out.pagePurpose = input.pagePurpose;
    const pageUrl = pageUrlOf(input.pageUrl);
    if (pageUrl) out.pageUrl = pageUrl;
    return out;
}

/** Маягт илгээсэн хуудас: `event/<slug>` (landing page) эсвэл үндсэн сайт (`elysium/…#хэсэг`). */
export function elysiumLandingPage(source: string | null | undefined, event: string | null | undefined):
    { key: string; name: string } | null {
    const value = text(source);
    const slug = value?.startsWith('event/') ? value.slice('event/'.length) : null;
    if (slug && /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/.test(slug)) return { key: `event/${slug}`, name: text(event)?.slice(0, 255) ?? slug };
    if (value?.startsWith('elysium/')) return { key: ELYSIUM_SITE_PAGE, name: ELYSIUM_SITE_PAGE_NAME };
    return null;
}

/**
 * Elysium лидийн суваг ба хуудасны баганууд (push, pull, нөхөх скрипт нэг дүрэм): `source`,
 * landing page, UTM, Meta ID (`utm_id` → `facebook_campaign_id`, trigger кампанит ажилтай холбоно).
 */
export function elysiumLeadColumns(input: { source?: string | null; event?: string | null; attribution: ElysiumAttribution }) {
    const a = input.attribution;
    const page = elysiumLandingPage(input.source, input.event);
    const signals = {
        utm_source: a.utmSource ?? null,
        utm_medium: a.utmMedium ?? null,
        utm_campaign: a.utmCampaign ?? null,
        utm_content: a.utmContent ?? null,
        utm_term: a.utmTerm ?? null,
        fbclid: a.fbclid ?? null,
        facebook_campaign_id: a.utmId && isMetaUtmSource(a.utmSource) ? a.utmId : null,
        facebook_adset_id: a.adsetId ?? null,
        facebook_ad_id: a.adId ?? null,
        referrer_host: a.referrerHost ?? null,
        landing_page_purpose: page ? a.pagePurpose ?? null : null,
    };
    return {
        ...signals,
        source: landingLeadSource(signals).source,
        landing_page: page?.key ?? null,
        landing_page_name: page?.name ?? null,
        landing_page_url: page ? a.pageUrl ?? null : null,
    };
}

/** `elysiumLeadNotes`-ийн анхны илгээлтийн хуудас ба эвентийг тэмдэглэлээс уншина (өмнөх лидийг нөхөх). */
export function elysiumNotesSubmission(notes: string | null | undefined): { source: string | null; event: string | null } {
    const line = (label: string) => notes?.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() || null;
    return { source: line('Сайтын эх сурвалж'), event: line('Арга хэмжээ') };
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
    /** Elysium migration 20261013120000-аас хойш; түүнээс өмнө байхгүй. */
    attribution: z.unknown().nullish(),
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
