/**
 * «Санал гомдол» (service_logs) — төрөл, чухлал, төлөв, сувгийн НЭГ толь (client-safe).
 * Хуудас (customer-service), харилцагчийн дэлгэрэнгүй, API-ийн Zod schema бүгд эндээс уншина;
 * DB-ийн CHECK constraint-тай (20260416, 20260630150000) яг ижил утгууд.
 */
import type { Tone } from '@/lib/leads/labels';

export const SERVICE_LOG_TYPES = ['inquiry', 'complaint', 'suggestion', 'maintenance', 'handover', 'payment', 'other'] as const;
export const SERVICE_LOG_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const SERVICE_LOG_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const SERVICE_LOG_CHANNELS = ['facebook', 'instagram', 'phone', 'in_person', 'app', 'other'] as const;

export type ServiceLogType = typeof SERVICE_LOG_TYPES[number];
export type ServiceLogPriority = typeof SERVICE_LOG_PRIORITIES[number];
export type ServiceLogStatus = typeof SERVICE_LOG_STATUSES[number];
export type ServiceLogChannel = typeof SERVICE_LOG_CHANNELS[number];

export const SERVICE_LOG_TYPE_META: Record<ServiceLogType, { label: string; tone: Tone }> = {
    inquiry:     { label: 'Лавлагаа',  tone: 'info' },
    complaint:   { label: 'Гомдол',    tone: 'danger' },
    suggestion:  { label: 'Санал',     tone: 'info' },
    maintenance: { label: 'Засвар',    tone: 'pending' },
    handover:    { label: 'Хүлээлцэх', tone: 'success' },
    payment:     { label: 'Төлбөр',    tone: 'neutral' },
    other:       { label: 'Бусад',     tone: 'neutral' },
};

export const SERVICE_LOG_PRIORITY_META: Record<ServiceLogPriority, { label: string; tone: Tone }> = {
    low:    { label: 'Бага',     tone: 'neutral' },
    medium: { label: 'Дунд',     tone: 'info' },
    high:   { label: 'Өндөр',    tone: 'pending' },
    urgent: { label: 'Яаралтай', tone: 'danger' },
};

export const SERVICE_LOG_STATUS_META: Record<ServiceLogStatus, { label: string; tone: Tone }> = {
    open:        { label: 'Нээлттэй',      tone: 'info' },
    in_progress: { label: 'Ажиллаж буй',   tone: 'pending' },
    resolved:    { label: 'Шийдвэрлэсэн',  tone: 'success' },
    closed:      { label: 'Хаагдсан',      tone: 'neutral' },
};

export const SERVICE_LOG_CHANNEL_LABELS: Record<ServiceLogChannel, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    phone: 'Утас',
    in_person: 'Биечлэн',
    app: 'Апп',
    other: 'Бусад',
};

/** Шийдвэрлэгдсэн гэж тооцох төлвүүд (resolved_at тавигдана). */
export const CLOSED_SERVICE_STATUSES: readonly ServiceLogStatus[] = ['resolved', 'closed'];
/** Хариуцагчийн ажил үргэлжилж буй төлвүүд (идэвхийн loader нээлттэй бүх хүсэлтийг эдгээрээр уншина). */
export const OPEN_SERVICE_STATUSES: readonly ServiceLogStatus[] = SERVICE_LOG_STATUSES.filter(status => !CLOSED_SERVICE_STATUSES.includes(status));

export function isClosedServiceStatus(status: string | null | undefined): boolean {
    return (CLOSED_SERVICE_STATUSES as readonly string[]).includes(status ?? '');
}

/** Зөвхөн толийн өөрийн түлхүүр (прототипийн `toString` г.м биш). */
function own<T>(map: Record<string, T>, key: string | null | undefined): T | undefined {
    return key && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function serviceLogTypeLabel(type: string | null | undefined): string {
    return own(SERVICE_LOG_TYPE_META, type)?.label || type || '—';
}
export function serviceLogTypeTone(type: string | null | undefined): Tone {
    return own(SERVICE_LOG_TYPE_META, type)?.tone || 'neutral';
}
export function serviceLogStatusLabel(status: string | null | undefined): string {
    return own(SERVICE_LOG_STATUS_META, status)?.label || status || '—';
}
export function serviceLogChannelLabel(channel: string | null | undefined): string {
    return own(SERVICE_LOG_CHANNEL_LABELS, channel) || channel || '—';
}
