import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    activityRangeError, activityWeekStart, attributeCall, buildManagerActivity, buildPeriods, periodBounds, readDailyTargets,
    resolveActivityRange, shiftPeriod, targetDates, type ActivityRosterEntry, type BuildActivityInput,
} from '../activity';
import { weeklyReviewRange } from '@/lib/dashboard/weekly-review';

// Vercel UTC-ээр ажилладаг: өдрийн хил серверийн бүсээс үл хамаарах ёстой.
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = originalTz; });

const roster: ActivityRosterEntry[] = [
    { name: 'Номин', user_id: 'u-nomin', is_active: true },
    { name: 'Сараа', user_id: null, is_active: true },
    { name: 'Бат', user_id: 'u-bat', is_active: true },
    { name: 'Хуучин', user_id: null, is_active: false },
];
const input = (values: Partial<BuildActivityInput>): BuildActivityInput => ({
    from: '2026-10-05', to: '2026-10-05', group: 'day', now: new Date('2026-10-05T10:00:00Z'),
    roster, calls: [], meetings: [], requests: [], targets: [], ...values,
});

describe('activity periods', () => {
    it('uses the Wednesday meeting week (Лхагва–Мягмар), not the ISO week', () => {
        expect(activityWeekStart('2026-10-07')).toBe('2026-10-07'); // Лхагва
        expect(activityWeekStart('2026-10-13')).toBe('2026-10-07'); // Мягмар
        expect(activityWeekStart('2026-10-05')).toBe('2026-09-30'); // Даваа
        const meeting = weeklyReviewRange('2026-10-14');
        expect(periodBounds('2026-10-09', 'week')).toEqual(meeting);
        expect(periodBounds('2026-02-14', 'month')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
        expect(shiftPeriod('2026-10-09', 'week', -1)).toBe('2026-09-30');
        expect(shiftPeriod('2026-12-15', 'month', 1)).toBe('2027-01-01');
    });

    it('clips periods to the range and counts Mon–Fri target days up to today', () => {
        const periods = buildPeriods('2026-10-01', '2026-10-31', 'week', '2026-10-09');
        expect(periods.map(period => [period.from, period.to, period.targetDays])).toEqual([
            ['2026-10-01', '2026-10-06', 4], ['2026-10-07', '2026-10-13', 3], ['2026-10-14', '2026-10-20', 0],
            ['2026-10-21', '2026-10-27', 0], ['2026-10-28', '2026-10-31', 0],
        ]);
        expect(targetDates('2026-10-03', '2026-10-05', '2026-10-31')).toEqual(['2026-10-05']); // Бямба, Ням алгасна
        expect(buildPeriods('2026-10-01', '2026-11-15', 'month', '2026-10-01').map(period => period.label)).toEqual(['2026 оны 10-р сар', '2026 оны 11-р сар']);
        expect(activityRangeError('2026-10-05', '2026-10-04')).toContain('дараалл');
        expect(activityRangeError('2026-01-01', '2026-04-03')).toContain('92');
        expect(activityRangeError('2026-01-01', '2026-04-02')).toBeNull();
    });

    it('defaults a missing end to today and a missing start to the start of the end period', () => {
        const today = '2026-10-09';
        expect(resolveActivityRange(null, null, 'day', today)).toEqual({ from: today, to: today });
        expect(resolveActivityRange(undefined, undefined, 'week', today)).toEqual({ from: '2026-10-07', to: today });
        expect(resolveActivityRange(undefined, undefined, 'month', today)).toEqual({ from: '2026-10-01', to: today });
        // «9-р сарын 15-аас хойш» — өнөөдрийг хүртэл, нэг өдөр биш.
        expect(resolveActivityRange('2026-09-15', undefined, 'day', today)).toEqual({ from: '2026-09-15', to: today });
        expect(resolveActivityRange('2026-10-20', '', 'day', today)).toEqual({ from: '2026-10-20', to: '2026-10-20' });
        expect(resolveActivityRange(undefined, '2026-09-30', 'month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
        expect(resolveActivityRange(undefined, '2026-09-30', 'day', today)).toEqual({ from: '2026-09-30', to: '2026-09-30' });
    });
});

describe('call attribution', () => {
    it('prefers the account link over a profile-name mismatch and never takes a linked manager by name', () => {
        expect(attributeCall({ created_by: 'u-nomin', created_by_name: 'Номин Бат (профайл)' }, roster)).toBe('Номин');
        expect(attributeCall({ created_by: 'u-admin', created_by_name: 'Сараа' }, roster)).toBe('Сараа');
        expect(attributeCall({ created_by: 'u-admin', created_by_name: 'Бат' }, roster)).toBeNull();
        expect(attributeCall({ created_by: null, created_by_name: 'Бат' }, roster)).toBe('Бат');
        expect(attributeCall({ created_by: 'u-admin', created_by_name: 'Админ' }, roster)).toBeNull();
        expect(attributeCall({ created_by: 'u-dup', created_by_name: 'Сараа' }, [...roster, { name: 'A', user_id: 'u-dup', is_active: true }, { name: 'B', user_id: 'u-dup', is_active: true }])).toBeNull();
    });

    it('reads daily targets as positive integers only', () => {
        expect(readDailyTargets({ calls: 20, meetings: 0 })).toEqual({ calls: 20, meetings: null });
        expect(readDailyTargets(null)).toEqual({ calls: null, meetings: null });
        expect(readDailyTargets({ calls: '20' })).toEqual({ calls: null, meetings: null });
    });
});

describe('buildManagerActivity', () => {
    it('buckets by the Ulaanbaatar day (15:59Z vs 16:00Z) and counts meetings separately from no-shows', () => {
        const report = buildManagerActivity(input({
            from: '2026-10-05', to: '2026-10-06', now: new Date('2026-10-06T10:00:00Z'),
            calls: [
                { created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-05T15:59:00Z' }, // УБ 10-05 23:59
                { created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-05T16:00:00Z' }, // УБ 10-06 00:00
                { created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-04T15:59:00Z' }, // хугацаанаас өмнө
                { created_by: 'u-admin', created_by_name: 'Админ', created_at: '2026-10-05T03:00:00Z' },
            ],
            meetings: [
                { sales_manager_name: 'Номин', scheduled_at: '2026-10-05T02:00:00Z', status: 'completed', meeting_type: 'new_customer' },
                { sales_manager_name: 'Номин', scheduled_at: '2026-10-05T04:00:00Z', status: 'completed', meeting_type: 'repeat_customer' },
                { sales_manager_name: 'Номин', scheduled_at: '2026-10-06T02:00:00Z', status: 'no_show', meeting_type: 'new_customer' },
                { sales_manager_name: null, scheduled_at: '2026-10-06T02:00:00Z', status: 'completed', meeting_type: null },
            ],
            targets: [{ manager_name: 'Номин', year: 2026, month: 10, daily: { calls: 2, meetings: 1 } }],
        }));
        expect(report.periods.map(period => period.key)).toEqual(['2026-10-05', '2026-10-06']);
        expect(report.managers.map(row => row.manager)).toEqual(['Бат', 'Номин', 'Сараа']);
        const nomin = report.managers.find(row => row.manager === 'Номин')!;
        expect(nomin.rows.map(row => [row.calls, row.meetingsHeld, row.meetingsNew, row.noShows])).toEqual([[1, 2, 1, 0], [1, 0, 0, 1]]);
        expect(nomin.rows[0]).toMatchObject({ target: { calls: 2, meetings: 1 }, attainment: { calls: 50, meetings: 200 } });
        expect(nomin.totals).toMatchObject({ calls: 2, meetingsHeld: 2, target: { calls: 4, meetings: 2 }, attainment: { calls: 50, meetings: 100 } });
        expect(nomin.daily).toEqual({ calls: 2, meetings: 1 });
        // Зорилтгүй менежерт 0 биш null.
        expect(report.managers.find(row => row.manager === 'Сараа')!.totals).toMatchObject({ target: { calls: null, meetings: null }, attainment: { calls: null, meetings: null } });
        expect(report.unattributed).toEqual({ calls: 1, meetings: 1, requests: 0, openOverdue: 0 });
    });

    it('leaves weekend and future days without a target and does not guess a missing month target', () => {
        const weekend = buildManagerActivity(input({ from: '2026-10-03', to: '2026-10-04', now: new Date('2026-10-05T00:00:00Z'),
            targets: [{ manager_name: 'Номин', year: 2026, month: 10, daily: { calls: 2 } }] }));
        expect(weekend.targetDays).toBe(0);
        expect(weekend.managers.find(row => row.manager === 'Номин')!.totals.target.calls).toBeNull();
        const crossMonth = buildManagerActivity(input({ from: '2026-09-30', to: '2026-10-01', now: new Date('2026-10-01T05:00:00Z'),
            targets: [{ manager_name: 'Номин', year: 2026, month: 10, daily: { calls: 2 } }] }));
        expect(crossMonth.managers.find(row => row.manager === 'Номин')!.totals.target.calls).toBeNull();
        expect(crossMonth.managers.find(row => row.manager === 'Номин')!.rows[1].target.calls).toBe(2);
    });

    it('attributes requests by manager_name only (never by legacy assigned_to text), and shows only the own row in the personal view', () => {
        const now = new Date('2026-10-12T00:00:00Z');
        const request = (values: Record<string, unknown>) => ({ manager_name: 'Сараа', assigned_to: 'Сараа', priority: 'urgent', status: 'resolved', created_at: '2026-10-05T00:00:00Z', resolved_at: '2026-10-05T06:00:00Z', ...values });
        const report = buildManagerActivity(input({
            from: '2026-10-07', to: '2026-10-13', group: 'week', now,
            requests: [
                request({ created_at: '2026-10-07T00:00:00Z', resolved_at: '2026-10-07T12:00:00Z' }),
                request({ created_at: '2026-10-08T00:00:00Z', status: 'open', resolved_at: null }),
                // Хуучин мөр: assigned_to бүртгэлийн нэртэй (идэвхтэй/идэвхгүй) таарсан ч «Санал гомдол» хуудас шиг хариуцагчгүй.
                request({ manager_name: null, assigned_to: 'Номин', created_at: '2026-10-08T00:00:00Z', status: 'closed', resolved_at: '2026-10-11T00:00:00Z' }),
                request({ manager_name: null, assigned_to: 'Хуучин', created_at: '2026-10-08T00:00:00Z', status: 'open', resolved_at: null }),
                request({ manager_name: null, assigned_to: 'Профайлын нэр', created_at: '2026-10-08T00:00:00Z', status: 'open', resolved_at: null }),
                request({}), // өмнөх 7 хоногт шийдвэрлэсэн — энэ хугацаанд орохгүй
            ],
        }));
        const saraa = report.managers.find(row => row.manager === 'Сараа')!;
        expect(saraa.totals.requests).toEqual({ received: 2, resolved: 1, slaTotal: 2, slaMet: 1, onTimePct: 50, avgResolutionHours: 12 });
        expect(saraa.openOverdue).toBe(1);
        expect(report.managers.find(row => row.manager === 'Номин')!.totals.requests).toMatchObject({ received: 0, resolved: 0, slaTotal: 0 });
        expect(report.managers.find(row => row.manager === 'Номин')!.openOverdue).toBe(0);
        expect(report.managers.map(row => row.manager)).not.toContain('Хуучин');
        expect(report.unattributed).toMatchObject({ requests: 3, openOverdue: 2 });

        const personal = buildManagerActivity(input({ from: '2026-10-07', to: '2026-10-13', group: 'day', now, only: 'Сараа', requests: [request({ created_at: '2026-10-07T00:00:00Z', resolved_at: '2026-10-07T12:00:00Z' })] }));
        expect(personal.managers.map(row => row.manager)).toEqual(['Сараа']);
        expect(personal.managers[0].rows).toHaveLength(7);
        expect(personal.unattributed).toBeNull();
    });

    it('lists inactive or unregistered names only when they have activity', () => {
        const report = buildManagerActivity(input({
            meetings: [{ sales_manager_name: 'Хуучин', scheduled_at: '2026-10-05T02:00:00Z', status: 'completed', meeting_type: 'new_customer' },
                { sales_manager_name: 'Гадны нэр', scheduled_at: '2026-10-05T02:00:00Z', status: 'completed', meeting_type: 'new_customer' }],
        }));
        expect(report.managers.map(row => [row.manager, row.active, row.inRoster])).toEqual([
            ['Бат', true, true], ['Гадны нэр', false, false], ['Номин', true, true], ['Сараа', true, true], ['Хуучин', false, true],
        ]);
    });
});
