/**
 * Гэрээ ба төлбөрийн нэр томьёо — НЭГ эх сурвалж (UI ба Excel экспорт).
 */
import type { Tone } from '@/lib/leads/labels';

export const CONTRACT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
    active: { label: 'Идэвхтэй', tone: 'info' },
    closed: { label: 'Хаагдсан', tone: 'success' },
    cancelled: { label: 'Цуцалсан', tone: 'danger' },
};
export const PAYMENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'Хүлээгдэж буй', tone: 'neutral' },
    paid: { label: 'Төлсөн', tone: 'success' },
    partial: { label: 'Хагас төлсөн', tone: 'pending' },
    overdue: { label: 'Хугацаа хэтэрсэн', tone: 'danger' },
    cancelled: { label: 'Цуцалсан', tone: 'neutral' },
};
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: 'Бэлэн',
    bank_transfer: 'Банк шилжүүлэг',
    barter: 'Бартер',
    mortgage: 'Ипотек',
};

export function contractStatusLabel(status: string | null | undefined): string {
    return (status && Object.hasOwn(CONTRACT_STATUS_META, status) && CONTRACT_STATUS_META[status].label) || status || '—';
}
