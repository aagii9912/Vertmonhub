// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMarketingTimeline, timelineMonths, timelineWindow, ubMonthKey } from '../timeline';

describe('marketing timeline', () => {
    const originalTz = process.env.TZ;
    // Vercel шиг UTC сервер: сарын хил Улаанбаатарын цагаар.
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    it('builds the last six Ulaanbaatar months even when UTC is still in the previous month', () => {
        // УБ 2026-10-01 01:00 = UTC 2026-09-30 17:00.
        const months = timelineMonths(new Date('2026-09-30T17:00:00Z'));
        expect(months.map(m => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        expect(months.at(-1)!.label).toBe('10-р сар');
        const window = timelineWindow(months);
        expect(window).toEqual({ start: new Date('2026-04-30T16:00:00Z'), firstDay: '2026-05-01', lastDay: '2026-10-31' });
        expect(timelineWindow(timelineMonths(new Date('2026-02-10T00:00:00Z'), 2)).lastDay).toBe('2026-02-28');
        expect(timelineMonths(new Date('2026-01-15T00:00:00Z'), 3).map(m => m.key)).toEqual(['2025-11', '2025-12', '2026-01']);
    });

    it('buckets timestamps by Ulaanbaatar month, DATE columns by their own month and keeps unconverted Meta spend apart', () => {
        expect(ubMonthKey('2026-09-30T16:30:00Z')).toBe('2026-10');
        expect(ubMonthKey('2026-09-30')).toBe('2026-09');
        const months = timelineMonths(new Date('2026-10-05T00:00:00Z'), 2);
        const series = buildMarketingTimeline(months, {
            leads: [{ created_at: '2026-09-30T16:30:00Z' }, { created_at: '2026-09-15T00:00:00Z' }, { created_at: null }],
            viewings: [{ scheduled_at: '2026-10-02T02:00:00Z' }],
            posts: [{ published_at: '2026-09-01T00:00:00Z' }],
            activities: [{ start_date: '2026-10-01', created_at: '2026-09-20T00:00:00Z' }, { start_date: '2026-10-02', created_at: null, status: 'cancelled' }],
            spend: [
                { spent_at: '2026-09-30', native_amount: '10', currency: 'USD', amount_mnt: '35000' },
                { spent_at: '2026-10-01', native_amount: '4', currency: 'USD', amount_mnt: null },
                { spent_at: '2026-10-01', native_amount: '2', currency: 'USD', amount_mnt: '7000' },
                { spent_at: '2026-08-31', native_amount: '99', currency: 'USD', amount_mnt: '346500' },
            ],
        });
        expect(series).toEqual([
            { month: '2026-09', label: '9-р сар', leads: 1, meetings: 0, activity: 1, spend: 35000, spendComplete: true, pending: {} },
            { month: '2026-10', label: '10-р сар', leads: 1, meetings: 1, activity: 1, spend: 7000, spendComplete: false, pending: { USD: 4 } },
        ]);
    });
});
