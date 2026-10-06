import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dayHeading, dayLabel, defaultMeetingWhen, groupViewingsByDay, scheduledCountsByDay, upcomingDays, viewingDay } from '../labels';

it('groups and labels meetings by Ulaanbaatar day across midnight and year boundaries', () => {
    expect(dayHeading(new Date('2026-09-28T18:00:00Z'), new Date('2026-09-28T10:00:00Z'))).toBe('Маргааш · Мягмар, 9-р сарын 29');
    expect(dayHeading(new Date('2026-12-31T18:00:00Z'), new Date('2026-09-28T10:00:00Z'))).toBe('2027 · Баасан, 1-р сарын 1');
});

describe('Уулзалтын өдөр, 7 хоног (Улаанбаатарын хуанли, UTC сервер дээр)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    it('names today, tomorrow and yesterday, and other days by weekday and date', () => {
        expect(dayLabel('2026-10-06', '2026-10-06')).toEqual({ title: 'Өнөөдөр', detail: 'Мягмар, 10-р сарын 6', full: 'Өнөөдөр · Мягмар, 10-р сарын 6' });
        expect(dayLabel('2026-10-07', '2026-10-06').title).toBe('Маргааш');
        expect(dayLabel('2026-10-05', '2026-10-06').title).toBe('Өчигдөр');
        expect(dayLabel('2026-10-08', '2026-10-06')).toEqual({ title: 'Пүрэв, 10-р сарын 8', detail: null, full: 'Пүрэв, 10-р сарын 8' });
        expect(dayLabel('2027-01-01', '2026-12-30').title).toBe('2027 · Баасан, 1-р сарын 1');
        // Шинэ жилийн өмнөх өдөр: «Маргааш» хэвээр (оныг давхардуулахгүй).
        expect(dayLabel('2027-01-01', '2026-12-31').full).toBe('Маргааш · Баасан, 1-р сарын 1');
        expect(dayLabel('', '2026-10-06').title).toBe('Огноо тодорхойгүй');
    });

    it('builds the 7-day strip from the Ulaanbaatar date, not the UTC date', () => {
        // 2026-10-06 16:30 UTC = 10-р сарын 7, 00:30 УБ — UTC-ээр өчигдөр хэвээр.
        const days = upcomingDays(new Date('2026-10-06T16:30:00Z'));
        expect(days.map((d) => d.key)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
        expect(days.map((d) => d.weekday)).toEqual(['Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням', 'Даваа', 'Мягмар']);
        expect(days[0]).toMatchObject({ day: 7, label: { title: 'Өнөөдөр' } });
        expect(days[1].label.title).toBe('Маргааш');
        expect(days[2].label.title).toBe('Баасан, 10-р сарын 9');
    });

    it('crosses month ends in the strip', () => {
        const days = upcomingDays(new Date('2026-10-29T02:00:00Z'));
        expect(days.map((d) => d.key)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
        expect(days.map((d) => d.day)).toEqual([29, 30, 31, 1, 2, 3, 4]);
        expect(days[3].label.full).toBe('Ням, 11-р сарын 1');
    });

    it('counts only scheduled meetings per Ulaanbaatar day', () => {
        const counts = scheduledCountsByDay([
            { scheduled_at: '2026-10-06T15:59:00Z', status: 'scheduled' }, // УБ 10-06 23:59
            { scheduled_at: '2026-10-06T16:00:00Z', status: 'scheduled' }, // УБ 10-07 00:00
            { scheduled_at: '2026-10-07T11:00:00+08:00', status: 'scheduled' },
            { scheduled_at: '2026-10-07T12:00:00+08:00', status: 'cancelled' },
            { scheduled_at: '2026-10-07T13:00:00+08:00', status: 'completed' },
            { scheduled_at: 'not a date', status: 'scheduled' },
        ]);
        expect(Object.fromEntries(counts)).toEqual({ '2026-10-06': 1, '2026-10-07': 2 });
    });

    it('groups each meeting into exactly one Ulaanbaatar day, in list order with times ascending', () => {
        const rows = [
            { id: 'late', scheduled_at: '2026-10-07T09:00:00Z' },  // УБ 10-07 17:00
            { id: 'early', scheduled_at: '2026-10-06T16:30:00Z' }, // УБ 10-07 00:30
            { id: 'today', scheduled_at: '2026-10-06T02:00:00Z' }, // УБ 10-06 10:00
        ];
        const groups = groupViewingsByDay(rows);
        expect(groups.map((g) => g.key)).toEqual(['2026-10-07', '2026-10-06']);
        expect(groups[0].items.map((v) => v.id)).toEqual(['early', 'late']);
        expect(groups.flatMap((g) => g.items)).toHaveLength(rows.length);
        expect(viewingDay('2026-10-06T16:30:00Z')).toBe('2026-10-07');
        expect(viewingDay('')).toBe('');
    });

    it('defaults a new meeting to the next full hour in Ulaanbaatar, or 10:00 on a chosen later day', () => {
        expect(defaultMeetingWhen(new Date('2026-10-06T05:20:00Z'))).toBe('2026-10-06T14:00'); // УБ 13:20
        expect(defaultMeetingWhen(new Date('2026-10-06T15:30:00Z'))).toBe('2026-10-07T00:00'); // УБ 23:30
        expect(defaultMeetingWhen(new Date('2026-10-06T05:00:00Z'))).toBe('2026-10-06T14:00'); // яг 13:00 → 14:00
        expect(defaultMeetingWhen(new Date('2026-10-06T05:20:00Z'), '2026-10-09')).toBe('2026-10-09T10:00');
        expect(defaultMeetingWhen(new Date('2026-10-06T05:20:00Z'), '2026-10-06')).toBe('2026-10-06T14:00');
    });
});
