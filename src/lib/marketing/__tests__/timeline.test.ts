import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMarketingTimeline, timelineMonths, timelineWindow, type TimelineInput } from '../timeline';

const empty: TimelineInput = { leads: [], viewings: [], posts: [], campaigns: [], spend: { currency: 'USD', rows: [], coveredDays: [] } };
const days = (from: string, to: string) => {
    const out: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
};

describe('marketing timeline (Ulaanbaatar months on a UTC server)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    // УБ-ийн 10-01 04:00 — UTC-ээр 09-30 хэвээр.
    const now = new Date('2026-09-30T20:00:00Z');
    const months = timelineMonths(now);

    it('ends the six-month window at the current Ulaanbaatar month', () => {
        expect(months.map(m => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        expect(months.map(m => m.label)).toEqual(['5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар']);
        expect(timelineWindow(months)).toEqual({
            start: new Date('2026-04-30T16:00:00.000Z'),
            end: new Date('2026-10-31T16:00:00.000Z'),
            firstDay: '2026-05-01',
            lastDay: '2026-10-31',
        });
        // Оны заагийг давна.
        expect(timelineMonths(new Date('2026-01-15T00:00:00Z'), 3).map(m => m.key)).toEqual(['2025-11', '2025-12', '2026-01']);
    });

    it('buckets timestamps by the Ulaanbaatar month and DATE columns by their own day', () => {
        const [, , , aug, sep, oct] = buildMarketingTimeline(months, {
            ...empty,
            leads: [
                { created_at: '2026-09-30T15:59:59Z' }, // УБ 09-30 23:59
                { created_at: '2026-09-30T16:00:00Z' }, // УБ 10-01 00:00
                { created_at: '2026-04-30T15:59:59Z' }, // УБ 04-30 — цонхноос гадна
            ],
            viewings: [{ scheduled_at: '2026-08-31T16:30:00Z' }, { scheduled_at: null }],
            posts: [{ published_at: '2026-08-01T00:00:00Z' }],
            campaigns: [
                { start_date: '2026-08-31', created_at: '2026-01-01T00:00:00Z' },
                { start_date: null, created_at: '2026-07-31T17:00:00Z' }, // УБ 08-01 01:00
            ],
        });
        expect([aug.leads, sep.leads, oct.leads]).toEqual([0, 1, 1]);
        expect([aug.meetings, sep.meetings]).toEqual([0, 1]);
        expect(aug.activity).toBe(3);
    });

    it('puts each day of Meta spend in its own month and leaves unsynced months empty, not zero', () => {
        const timeline = buildMarketingTimeline(months, {
            ...empty,
            spend: {
                currency: 'USD',
                rows: [
                    { spent_at: '2026-08-20', native_amount: '100.5', currency: 'USD' },
                    { spent_at: '2026-09-01', native_amount: 50.25, currency: 'USD' },
                    { spent_at: '2026-09-30', native_amount: 10, currency: 'USD' },
                    // Өөр валютын мөрийг хольж нэмэхгүй.
                    { spent_at: '2026-09-02', native_amount: 999, currency: 'EUR' },
                ],
                coveredDays: [...days('2026-08-17', '2026-09-30'), '2026-10-01'],
            },
        });
        expect(timeline.map(m => [m.month, m.spend, m.spendDays, m.spendPartial])).toEqual([
            ['2026-05', null, 0, false],
            ['2026-06', null, 0, false],
            ['2026-07', null, 0, false],
            ['2026-08', 100.5, 15, true],
            ['2026-09', 60.25, 30, false],
            // Одоогийн сар үргэлжилж байгаа: синк хийсэн, зардалгүй өдөр = 0.
            ['2026-10', 0, 1, false],
        ]);
    });

    it('counts a file-imported spend day without a coverage row as synced', () => {
        const timeline = buildMarketingTimeline(months, {
            ...empty,
            spend: { currency: 'USD', rows: [{ spent_at: '2026-06-03', native_amount: 7, currency: 'USD' }], coveredDays: [] },
        });
        expect(timeline[1]).toMatchObject({ month: '2026-06', spend: 7, spendDays: 1, spendPartial: true });
    });
});
