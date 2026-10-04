/**
 * Лидийн нэр томьёо — НЭГ эх сурвалж (v2).
 * Статус, эх үүсвэр, сонирхол, урсгалын шат бүгд эндээс. Шинэ утга нэмбэл
 * ЗӨВХӨН энд нэмнэ; хуудсууд өөрсдийн map-гүй.
 */
import { z } from 'zod';
import type { LeadStatus, LeadSource } from '@/types/property';
import { propertyTypeLabel } from '@/lib/inventory/labels';
import { normalizePhone } from '@/lib/utils/phone';

export type Tone = 'info' | 'pending' | 'success' | 'danger' | 'neutral';

export const LEAD_STATUSES: LeadStatus[] = [
    'new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost',
];

export const STATUS_META: Record<LeadStatus, { label: string; tone: Tone; short: string }> = {
    new:               { label: 'Шинэ',             tone: 'info',    short: 'Шинэ' },
    contacted:         { label: 'Холбогдсон',       tone: 'info',    short: 'Холбогдсон' },
    viewing_scheduled: { label: 'Уулзалт товлосон', tone: 'pending', short: 'Уулзалт' },
    offered:           { label: 'Санал тавьсан',    tone: 'info',    short: 'Санал' },
    negotiating:       { label: 'Хэлэлцэж байна',   tone: 'pending', short: 'Хэлэлцээ' },
    closed_won:        { label: 'Амжилттай',        tone: 'success', short: 'Амжилттай' },
    closed_lost:       { label: 'Алдсан',           tone: 'neutral', short: 'Алдсан' },
};

export const ACTIVE_STATUSES: LeadStatus[] = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating'];

export function statusLabel(s: string | null | undefined): string {
    return (s && STATUS_META[s as LeadStatus]?.label) || s || '—';
}
export function statusTone(s: string | null | undefined): Tone {
    return (s && STATUS_META[s as LeadStatus]?.tone) || 'neutral';
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
    messenger: 'Messenger',
    facebook: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    tv: 'ТВ',
    radio: 'Радио',
    meeting: 'Уулзалт',
    event: 'Өдөрлөг',
    board: 'Билборд / Самбар',
    other: 'Бусад',
};
export const SOURCES = Object.keys(SOURCE_LABEL) as LeadSource[];

export function sourceLabel(s: string | null | undefined): string {
    return (s && SOURCE_LABEL[s as LeadSource]) || s || '—';
}

/** UTM болон гадны системийн нэршлийг толь бичгийн утгад буулгана. */
const SOURCE_ALIASES: Record<string, LeadSource> = {
    fb: 'facebook_ads', meta: 'facebook_ads', ig: 'instagram', google: 'google_ads', adwords: 'google_ads',
};

/**
 * Лид үүсгэх бүх зам (dashboard, нийтийн форм, AI …) эх үүсвэрийг энүүгээр хадгална:
 * толь бичгийн утга эсвэл танигдсан нэршил, бусад нь `fallback`. Түүхий UTM утга `utm_source`-д үлдэнэ.
 */
export function toLeadSource(raw: string | null | undefined, fallback: LeadSource = 'other'): LeadSource {
    const value = raw?.trim().toLowerCase() ?? '';
    if (Object.hasOwn(SOURCE_LABEL, value)) return value as LeadSource;
    return Object.hasOwn(SOURCE_ALIASES, value) ? SOURCE_ALIASES[value] : fallback;
}

/** Сонирхол: «3 өрөө» (preferred_rooms) эсвэл төрлийн нэр (preferred_type). */
export function interestLabel(lead: { preferred_rooms?: number | null; preferred_type?: string | null }): string {
    if (lead.preferred_rooms) return `${lead.preferred_rooms} өрөө`;
    return propertyTypeLabel(lead.preferred_type);
}

/** Түргэн бүртгэлийн «Сонирхол» чипүүд → DB утга. */
export const INTEREST_CHIPS: { label: string; rooms?: number; type?: string }[] = [
    { label: '1 өрөө', rooms: 1 },
    { label: '2 өрөө', rooms: 2 },
    { label: '3 өрөө', rooms: 3 },
    { label: '4 өрөө', rooms: 4 },
    { label: 'Оффис', type: 'office' },
];

export const ACTIVITY_LABEL: Record<string, string> = {
    note: 'Тэмдэглэл',
    call: 'Залгав',
    status: 'Статус',
    manager: 'Менежер',
    meeting: 'Уулзалт',
    contract: 'Гэрээ',
    system: 'Систем',
    quote: 'Үнийн санал',
};

/** Менежерийн Time-line-ийн сануулгын гарчиг (зөрчлийн төрөл: lib/leads/timeline.ts). */
export const TIMELINE_CONFLICT_LABEL: Record<string, string> = {
    quote_mismatch: 'Үнийн санал зөрүүтэй',
    duplicate_phone: 'Ижил утастай өөр лид',
    non_owner_contact: 'Хариуцагч биш менежер холбогдсон',
    parallel_managers: 'Олон менежер зэрэг холбогдсон',
};

/** Хадгалсан харагдац (таб) — сервер `view` параметрээр ойлгоно. */
export type LeadView = 'all' | 'mine' | 'new' | 'meetings' | 'active';
export const LEAD_VIEWS: { key: LeadView; label: string }[] = [
    { key: 'all', label: 'Бүгд' },
    { key: 'mine', label: 'Миний' },
    { key: 'new', label: 'Шинэ' },
    { key: 'meetings', label: 'Уулзалттай' },
    { key: 'active', label: 'Идэвхтэй' },
];

/* ── Нэргүй лид ──────────────────────────────────────────────────────────
 * Нэргүй лид = `leads.customer_name IS NULL`. Харагдах нэр нь энэ НЭГ шошго;
 * хуудас, тайлан, экспорт, AI бүгд `leadDisplayName`-ээр харуулна. Шошгыг DB,
 * гэрээ, харилцагчид хэзээ ч бичихгүй — бичих зам бүр `normalizeLeadName`-ээр орно.
 */
export const ANONYMOUS_LEAD_LABEL = 'Нэргүй харилцагч';

/**
 * Нэр биш орлуулагч утгууд (экспортын «-», хуучин «Facebook lead», шошго өөрөө).
 * Ганц «Нэргүй» энд БАЙХГҮЙ: энэ нь жинхэнэ монгол нэр тул нэр хэвээр хадгалагдана.
 */
const LEAD_NAME_PLACEHOLDERS = new Set([
    '-', '—', 'нэргүй лид', 'нэргүй харилцагч', 'тодорхойгүй', 'facebook lead',
]);

/** Бичих бүх зам: хоосон эсвэл орлуулагч нэр → null; бусдыг trim хийж давхар зайг нэг болгоно. */
export function normalizeLeadName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().replace(/\s+/g, ' ');
    return !value || LEAD_NAME_PLACEHOLDERS.has(value.toLowerCase()) ? null : value;
}

export function isAnonymousLead(lead: { customer_name?: string | null } | null | undefined): boolean {
    return !normalizeLeadName(lead?.customer_name);
}

/** Харагдах нэр: жинхэнэ нэр эсвэл `ANONYMOUS_LEAD_LABEL`. Лид эсвэл нэрийг шууд авна. */
export function leadDisplayName(lead: { customer_name?: string | null } | string | null | undefined): string {
    const raw = typeof lead === 'string' || lead == null ? lead : lead.customer_name;
    return normalizeLeadName(raw) ?? ANONYMOUS_LEAD_LABEL;
}

/** Нэргүй лидийг хайлтад НЭМЖ оруулах түлхүүр үгс («нэргүй», «нэргүй х…», бүтэн шошго). */
const ANONYMOUS_QUERY_TERMS = ['нэргүй харилцагч', 'нэргүй лид'];

/**
 * Хайлт нь «нэргүй»-ээс эхэлсэн шошгын эхлэл бол (ж: «Нэргүй», «нэргүй харилцагч») true.
 * «Нэргүйбаатар» шиг нэр энд орохгүй. Хайлт нэмэлт: нэрээр таарсан лид (жинхэнэ нэр
 * «Нэргүй») хэвээр олдоно, нэргүй лидүүд (`anonymousLeadOrFilter`) нэмэгдэнэ.
 */
export function isAnonymousLeadQuery(q: string | null | undefined): boolean {
    const value = (q ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return value.startsWith('нэргүй') && ANONYMOUS_QUERY_TERMS.some((term) => term.startsWith(value));
}

/**
 * PostgREST `.or()`-д нэмэх нөхцөл: `leadDisplayName` нь шошго гаргадаг бүх мөр — NULL, хоосон,
 * хуучин орлуулагч нэр («Facebook lead», «-» …). Хайлтын бусад нөхцөлтэй таслалаар нийлүүлнэ.
 */
export function anonymousLeadOrFilter(column = 'customer_name'): string {
    return [`${column}.is.null`, `${column}.eq.""`, ...[...LEAD_NAME_PLACEHOLDERS].map((name) => `${column}.ilike.${name}`)].join(',');
}

/** Ажилтны сувгийн нэргүй лидийн дүрэм (сервер: LeadService.resolveLeadIdentity, client формууд). */
export const LEAD_NAME_OR_ANONYMOUS = 'Харилцагчийн нэрийг оруулах эсвэл «Нэр тодорхойгүй»-г сонгоно уу';
export const ANONYMOUS_LEAD_CONTACT = 'Нэргүй лидэд утасны дугаар (8+ орон) эсвэл и-мэйл оруулна уу';
/** Уулзалтын хуудсанд и-мэйл талбаргүй тул нэргүй шинэ харилцагчид утас заавал. */
export const ANONYMOUS_MEETING_PHONE = 'Нэргүй харилцагчийн утасны дугаарыг (8 орон) оруулна уу';

/** Нэргүй лидийг дахин олох холбоо: 8+ оронтой утас эсвэл зөв и-мэйл. */
export function hasAnonymousLeadContact(phone: string | null | undefined, email: string | null | undefined): boolean {
    if ((normalizePhone(phone)?.length ?? 0) >= 8) return true;
    return !!email && z.email().safeParse(email.trim()).success;
}

/**
 * Уулзалтын мөрийн харилцагч: лидийн жинхэнэ нэр, нэргүй лид бол шошго, лидгүй бол null.
 * Тайлангийн мөр `customer_name`-д шошго бичихгүй — `anonymous_lead` тугаар ялгана.
 */
export function meetingCustomerName(row: { customer_name?: string | null; anonymous_lead?: boolean | null }): string | null {
    return normalizeLeadName(row.customer_name) ?? (row.anonymous_lead ? ANONYMOUS_LEAD_LABEL : null);
}
