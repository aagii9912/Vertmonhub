import { describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_REPORT_CONFIG, type DailyReportConfig } from '../daily-report';
import {
    activityBuckets, attainmentPct, buildSalesActivity, proratedPlan, readActivityTargets, salesActivityWindow,
    type SalesActivityCountRow, type SalesActivityInput,
} from '../sales-activity';

// Elysium-ийн хадгалсан загвар (2026-10-17): l1 «7786-2222», l2 «8888/9008» ангиллаар; Пэйж FB + Хувь чат.
const elysium: DailyReportConfig = {
    title: null,
    lines: [
        { key: 'l1', label: '7786-2222', categories: ['new', 'repeat', 'other'] },
        { key: 'l2', label: '8888/9008', categories: ['new', 'repeat', 'other'] },
    ],
    chats: [{ key: 'page', label: 'Пэйж FB' }, { key: 'personal', label: 'Хувь чат' }],
    managers: null,
};
const cell = (report_date: string, metric: string, value: number, manager_name = 'Khongoroo'): SalesActivityCountRow => ({ report_date, manager_name, metric, value });
const input = (overrides: Partial<SalesActivityInput> = {}): SalesActivityInput => ({
    meetingDate: '2026-10-21', config: elysium, configSaved: true, configInvalid: false,
    counts: [], confirmedDates: [], meetings: [], meetingsSince: null, targets: null, targetsAvailable: true, ...overrides,
});

describe('activity buckets (Wednesday→Tuesday, split at month ends)', () => {
    it('returns the last five segments ending at the report end, across the month boundary', () => {
        expect(activityBuckets('2026-10-20')).toEqual([
            { label: '09/23–09/29', from: '2026-09-23', to: '2026-09-29' },
            { label: '09/30', from: '2026-09-30', to: '2026-09-30' },
            { label: '10/01–10/06', from: '2026-10-01', to: '2026-10-06' },
            { label: '10/07–10/13', from: '2026-10-07', to: '2026-10-13' },
            { label: '10/14–10/20', from: '2026-10-14', to: '2026-10-20' },
        ]);
    });

    it('cuts a merged first-of-month week at the report end', () => {
        // 2026-09-01 is a Tuesday: monthWeeks merges it into 09-01..09-08, the report ends on 09-01.
        expect(activityBuckets('2026-09-01').map(bucket => [bucket.from, bucket.to])).toEqual([
            ['2026-08-05', '2026-08-11'], ['2026-08-12', '2026-08-18'], ['2026-08-19', '2026-08-25'], ['2026-08-26', '2026-08-31'], ['2026-09-01', '2026-09-01'],
        ]);
    });

    it('reads one window from the first bucket or the month start to the report end', () => {
        expect(salesActivityWindow('2026-10-21')).toMatchObject({
            range: { from: '2026-10-14', to: '2026-10-20' }, from: '2026-09-23', to: '2026-10-20',
            month: { month: '2026-10', from: '2026-10-01', to: '2026-10-20' },
        });
    });
});

describe('W11 pro-rating', () => {
    it('pro-rates by day/30 and divides the actual by the pro-rated plan (the team deck figures)', () => {
        expect([550, 300, 110, 30, 85].map(plan => proratedPlan(plan, '2026-10-19'))).toEqual([348, 190, 70, 19, 54]);
        expect(attainmentPct(145, 348)).toBe(42);
        expect(attainmentPct(142, 190)).toBe(75);
        expect(attainmentPct(4, 19)).toBe(21);
        expect(attainmentPct(109, 54)).toBe(202);
        // 31-нд 30 өдрөөр тасална — сарын бүтэн төлөвлөгөө.
        expect(proratedPlan(550, '2026-10-31')).toBe(550);
    });

    it('keeps unknown plans and actuals unknown, never 0%', () => {
        expect(proratedPlan(null, '2026-10-19')).toBeNull();
        expect(attainmentPct(null, 348)).toBeNull();
        expect(attainmentPct(10, null)).toBeNull();
        expect(attainmentPct(10, 0)).toBeNull();
    });

    it('reads only known whole-number targets', () => {
        expect(readActivityTargets({ hotline: 550, manager_line: 300, meetings_new: 110, meetings_repeat: 30, chats: 85, other: 4 }))
            .toEqual({ hotline: 550, managerLine: 300, newMeetings: 110, repeatMeetings: 30, chats: 85 });
        expect(readActivityTargets({ hotline: -1, manager_line: 1.5, meetings_new: '110', chats: 0 }))
            .toEqual({ hotline: null, managerLine: null, newMeetings: null, repeatMeetings: null, chats: 0 });
        expect(readActivityTargets([550])).toEqual({ hotline: null, managerLine: null, newMeetings: null, repeatMeetings: null, chats: null });
        expect(readActivityTargets(null).hotline).toBeNull();
    });
});

describe('buildSalesActivity', () => {
    it('sums only the current template metrics, so the 10/08 legacy total cells are not double counted', () => {
        const report = buildSalesActivity(input({
            counts: [
                cell('2026-10-08', 'call.l1.new', 2), cell('2026-10-08', 'call.l1.total', 2),
                cell('2026-10-08', 'call.l2.new', 2), cell('2026-10-08', 'call.l2.total', 3),
                cell('2026-10-08', 'chat.page', 3),
                cell('2026-10-15', 'call.l1.new', 5), cell('2026-10-15', 'call.l1.repeat', 1), cell('2026-10-15', 'call.l1.new', 3, 'Чанцалдулам.Раднаа'),
                cell('2026-10-16', 'call.l2.other', 4), cell('2026-10-16', 'chat.personal', 6),
            ],
            confirmedDates: ['2026-10-08', '2026-10-16'],
        }));
        expect(report.buckets.map(bucket => [bucket.label, bucket.values.hotline, bucket.values.managerLine, bucket.values.chats])).toEqual([
            ['09/23–09/29', null, null, null],
            ['09/30', null, null, null],
            ['10/01–10/06', null, null, null],
            ['10/07–10/13', 2, 2, 3],
            ['10/14–10/20', 9, 4, 6],
        ]);
        expect(report.buckets[4]).toMatchObject({ confirmedDays: 1, knownDays: 2, days: 7 });
        expect(report.buckets[3]).toMatchObject({ confirmedDays: 1, knownDays: 1, days: 7 });
        expect(report.buckets[1]).toMatchObject({ confirmedDays: 0, knownDays: 0, days: 1 });
        expect(report.month.metrics.hotline.actual).toBe(11);
        expect(report.month.metrics.chats.actual).toBe(9);
        expect(report.lines).toEqual({ hotline: '7786-2222', managerLine: '8888/9008', chats: ['Пэйж FB', 'Хувь чат'] });
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('байхгүй 2 нүдийг')]));
    });

    it('keeps a metric with no entered cell unknown even on days other metrics were entered', () => {
        const report = buildSalesActivity(input({ counts: [cell('2026-10-15', 'call.l1.new', 5)] }));
        expect(report.buckets[4].values).toMatchObject({ hotline: 5, managerLine: null, chats: null });
        expect(report.month.metrics.managerLine).toEqual({ actual: null, plan: null, planToDate: null, pct: null });
    });

    it('counts completed new and repeat meetings from the first recorded meeting onward', () => {
        const meetings = [
            { day: '2026-10-08', type: 'new_customer' }, { day: '2026-10-09', type: 'repeat_customer' },
            { day: '2026-10-15', type: 'new_customer' }, { day: '2026-10-16', type: 'new_customer' }, { day: '2026-10-16', type: 'existing_buyer' },
        ];
        const report = buildSalesActivity(input({ meetings, meetingsSince: '2026-10-07' }));
        expect(report.buckets.map(bucket => [bucket.values.newMeetings, bucket.values.repeatMeetings])).toEqual([
            [null, null], [null, null], [null, null], [1, 1], [2, 0],
        ]);
        expect(report.month.metrics.newMeetings.actual).toBe(3);
        expect(report.month.metrics.repeatMeetings.actual).toBe(1);
        expect(report.dataSince).toBe('2026-10-07');
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('2026-10-07-нээс эхэлсэн')]));

        // Бүртгэл хэсгийн дунд эхэлсэн бол тэр хэсгийн тоо (0 ч) гарна; бүртгэлгүй бол бүгд тодорхойгүй.
        const partial = buildSalesActivity(input({ meetings, meetingsSince: '2026-10-03' }));
        expect(partial.buckets[2].values.newMeetings).toBe(0);
        const none = buildSalesActivity(input({ meetings: [], meetingsSince: null }));
        expect(none.buckets.every(bucket => bucket.values.newMeetings === null)).toBe(true);
        expect(none.month.metrics.newMeetings.actual).toBeNull();
        expect(none.notes).toEqual(expect.arrayContaining(['Уулзалт бүртгэгдээгүй тул уулзалтын тоо тодорхойгүй.']));
    });

    it('pro-rates the monthly team plan to the report end and computes attainment', () => {
        const report = buildSalesActivity(input({
            counts: [cell('2026-10-14', 'call.l1.new', 100), cell('2026-10-14', 'chat.page', 120)],
            meetings: [{ day: '2026-10-14', type: 'new_customer' }], meetingsSince: '2026-10-01',
            targets: { hotline: 550, manager_line: 300, meetings_new: 110, chats: 85 },
        }));
        // 10-20 → 20/30.
        expect(report.month.metrics.hotline).toEqual({ actual: 100, plan: 550, planToDate: 367, pct: 27 });
        expect(report.month.metrics.chats).toEqual({ actual: 120, plan: 85, planToDate: 57, pct: 211 });
        expect(report.month.metrics.newMeetings).toEqual({ actual: 1, plan: 110, planToDate: 73, pct: 1 });
        expect(report.month.metrics.repeatMeetings).toEqual({ actual: 0, plan: null, planToDate: null, pct: null });
        expect(report.month.metrics.managerLine).toEqual({ actual: null, plan: 300, planToDate: 200, pct: null });
    });

    it('leaves plans unknown when the targets column is missing or the month has none', () => {
        const missing = buildSalesActivity(input({ targetsAvailable: false, targets: { hotline: 550 } }));
        expect(missing.month.metrics.hotline.plan).toBeNull();
        expect(missing.notes).toEqual(expect.arrayContaining([expect.stringContaining('шинэчлэл суулгаагүй')]));
        const empty = buildSalesActivity(input({ targets: null }));
        expect(empty.notes).toEqual(expect.arrayContaining(['2026-10 сарын идэвхжлийн төлөвлөгөө оруулаагүй.']));
    });

    it('uses the default template lines when none is saved and flags missing lines', () => {
        const report = buildSalesActivity(input({ config: DEFAULT_DAILY_REPORT_CONFIG, configSaved: false, counts: [cell('2026-10-15', 'call.personal.total', 7)] }));
        expect(report.lines).toEqual({ hotline: 'Төслийн утас', managerLine: 'Менежерийн дуудлага', chats: ['Пэйж FB', 'Хувь чат'] });
        expect(report.buckets[4].values.managerLine).toBe(7);
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('загвар хадгалаагүй')]));

        const bare = buildSalesActivity(input({ config: { ...elysium, lines: [], chats: [] }, counts: [cell('2026-10-15', 'call.l1.new', 5)] }));
        expect(bare.lines).toEqual({ hotline: null, managerLine: null, chats: [] });
        expect(bare.buckets[4].values).toMatchObject({ hotline: null, managerLine: null, chats: null });
        expect(bare.notes.join(' ')).toContain('утасны шугам алга');
    });

    it('notes an unfinished report week', () => {
        expect(buildSalesActivity(input({ today: '2026-10-17' })).notes).toEqual(expect.arrayContaining([expect.stringContaining('хараахан дуусаагүй')]));
        expect(buildSalesActivity(input({ today: '2026-10-21' })).notes.join(' ')).not.toContain('дуусаагүй');
    });
});
