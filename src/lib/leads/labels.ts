/**
 * Лидийн нэр томьёо — НЭГ эх сурвалж (v2).
 * Статус, эх үүсвэр, сонирхол, урсгалын шат бүгд эндээс. Шинэ утга нэмбэл
 * ЗӨВХӨН энд нэмнэ; хуудсууд өөрсдийн map-гүй.
 */
import type { LeadStatus, LeadSource } from '@/types/property';

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

const PROPERTY_TYPE_LABEL: Record<string, string> = {
    apartment: 'Орон сууц',
    house: 'Хаус',
    office: 'Оффис',
    land: 'Газар',
    commercial: 'Худалдаа',
};

/** Сонирхол: «3 өрөө» (preferred_rooms) эсвэл төрлийн нэр (preferred_type). */
export function interestLabel(lead: { preferred_rooms?: number | null; preferred_type?: string | null }): string {
    if (lead.preferred_rooms) return `${lead.preferred_rooms} өрөө`;
    const t = lead.preferred_type;
    if (!t) return '—';
    return PROPERTY_TYPE_LABEL[t] ?? t;
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
