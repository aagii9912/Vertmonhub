import type { Tone } from '@/lib/leads/labels';

export type MeetingType = 'new_customer' | 'repeat_customer' | 'existing_buyer';
export type ViewingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const MEETING_TYPE_META: Record<MeetingType, { label: string; tone: Tone }> = {
    new_customer:    { label: 'Шинэ харилцагч', tone: 'info' },
    repeat_customer: { label: 'Давтан',          tone: 'info' },
    existing_buyer:  { label: 'Худалдан авагч',  tone: 'success' },
};
export const MEETING_TYPES = Object.keys(MEETING_TYPE_META) as MeetingType[];

export const VIEWING_STATUS_META: Record<ViewingStatus, { label: string; tone: Tone }> = {
    scheduled: { label: 'Товлосон',  tone: 'pending' },
    completed: { label: 'Болсон',    tone: 'success' },
    cancelled: { label: 'Цуцалсан',  tone: 'neutral' },
    no_show:   { label: 'Ирээгүй',   tone: 'danger' },
};

export function meetingTypeLabel(t: string | null | undefined): string {
    return (t && MEETING_TYPE_META[t as MeetingType]?.label) || '—';
}
export function viewingStatusLabel(s: string | null | undefined): string {
    return (s && VIEWING_STATUS_META[s as ViewingStatus]?.label) || s || '—';
}
export function viewingStatusTone(s: string | null | undefined): Tone {
    return (s && VIEWING_STATUS_META[s as ViewingStatus]?.tone) || 'neutral';
}

export const WEEKDAYS_MN = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

/** «Өнөөдөр · Даваа, 9-р сарын 8» / «Маргааш · …» / «Мягмар, 9-р сарын 9» */
export function dayHeading(d: Date, now = new Date()): string {
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(d) - start(now)) / 86_400_000);
    const base = `${WEEKDAYS_MN[d.getDay()]}, ${d.getMonth() + 1}-р сарын ${d.getDate()}`;
    if (diff === 0) return `Өнөөдөр · ${base}`;
    if (diff === 1) return `Маргааш · ${base}`;
    if (diff === -1) return `Өчигдөр · ${base}`;
    return d.getFullYear() === now.getFullYear() ? base : `${d.getFullYear()} · ${base}`;
}
