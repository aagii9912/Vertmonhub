import { describe, expect, it } from 'vitest';
import { DEFAULT_DAILY_REPORT_CONFIG, type DailyReportConfig } from '../daily-report';
import {
    activityBuckets, attainmentPct, buildSalesActivity, proratedPlan, readActivityTargets, salesActivityWindow,
    type SalesActivityCountRow, type SalesActivityInput,
} from '../sales-activity';
import { weeklyReviewRange } from '../weekly-review';

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

describe('activity buckets (whole 7-day weeks ending on the report day, never split at month ends)', () => {
    it('returns the last five whole Wednesday→Tuesday weeks ending at the report end, across the month boundary', () => {
        expect(activityBuckets('2026-10-20')).toEqual([
            { label: '09/16–09/22', from: '2026-09-16', to: '2026-09-22' },
            { label: '09/23–09/29', from: '2026-09-23', to: '2026-09-29' },
            { label: '09/30–10/06', from: '2026-09-30', to: '2026-10-06' },
            { label: '10/07–10/13', from: '2026-10-07', to: '2026-10-13' },
            { label: '10/14–10/20', from: '2026-10-14', to: '2026-10-20' },
        ]);
    });

    it('keeps a week that crosses the month end as one row (the team deck of 2026-11-18)', () => {
        // Өмнө нь 10/28–10/31 ба 11/01–11/03 гэж хоёр хуваагддаг байсан (борлуулалтын алба, 2026-11-15).
        expect(activityBuckets('2026-11-17').map(bucket => bucket.label)).toEqual(['10/14–10/20', '10/21–10/27', '10/28–11/03', '11/04–11/10', '11/11–11/17']);
        // Сонгосон хугацаа Даваа гарагт дуусвал 7 хоног Мягмар→Даваа.
        expect(activityBuckets('2026-11-16').map(bucket => bucket.label)).toEqual(['10/13–10/19', '10/20–10/26', '10/27–11/02', '11/03–11/09', '11/10–11/16']);
        // Он дамжина.
        expect(activityBuckets('2026-01-06', 2)).toEqual([
            { label: '12/24–12/30', from: '2025-12-24', to: '2025-12-30' },
            { label: '12/31–01/06', from: '2025-12-31', to: '2026-01-06' },
        ]);
    });

    it('reads one window from the first week or the month start to the report end', () => {
        expect(salesActivityWindow(weeklyReviewRange('2026-10-21'))).toMatchObject({
            range: { from: '2026-10-14', to: '2026-10-20' }, from: '2026-09-16', to: '2026-10-20',
            month: { month: '2026-10', from: '2026-10-01', to: '2026-10-20' },
        });
        // Сонгосон 14 хоногийн хугацаа: 7 хоногууд ба сар нь дуусах өдрөөрөө.
        expect(salesActivityWindow({ from: '2026-11-03', to: '2026-11-16' })).toMatchObject({
            range: { from: '2026-11-03', to: '2026-11-16' }, from: '2026-10-13', to: '2026-11-16',
            month: { month: '2026-11', from: '2026-11-01', to: '2026-11-16' },
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
            ['09/16–09/22', null, null, null],
            ['09/23–09/29', null, null, null],
            ['09/30–10/06', null, null, null],
            ['10/07–10/13', 2, 2, 3],
            ['10/14–10/20', 9, 4, 6],
        ]);
        expect(report.buckets[4]).toMatchObject({ confirmedDays: 1, knownDays: 2, days: 7 });
        expect(report.buckets[3]).toMatchObject({ confirmedDays: 1, knownDays: 1, days: 7 });
        // Мөр бүр бүтэн 7 хоног (сарын хилээр тасардаггүй).
        expect(report.buckets.every(bucket => bucket.days === 7)).toBe(true);
        expect(report.buckets[2]).toMatchObject({ from: '2026-09-30', to: '2026-10-06', confirmedDays: 0, knownDays: 0 });
        expect(report.month.metrics.hotline.actual).toBe(11);
        expect(report.month.metrics.chats.actual).toBe(9);
        expect(report.lines).toEqual({ hotline: '7786-2222', managerLine: '8888/9008', chats: ['Пэйж FB', 'Хувь чат'] });
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('байхгүй 2 нүдийг')]));
    });

    it('keeps the same figures after the template switches to one 7786 column, 8888/9008 without «Бусад» and one chat (2026-11-03)', () => {
        const team: DailyReportConfig = {
            ...elysium,
            lines: [{ key: 'l1', label: '7786-2222', categories: [] }, { key: 'l2', label: '8888/9008', categories: ['new', 'repeat'] }],
            chats: [{ key: 'all', label: 'Чат' }],
        };
        const counts = [
            cell('2026-10-08', 'call.l1.new', 2), cell('2026-10-08', 'call.l1.total', 2),
            cell('2026-10-08', 'call.l2.new', 2), cell('2026-10-08', 'call.l2.total', 3),
            cell('2026-10-08', 'chat.page', 3),
            cell('2026-10-15', 'call.l1.new', 5), cell('2026-10-15', 'call.l1.repeat', 1), cell('2026-10-15', 'call.l1.new', 3, 'Чанцалдулам.Раднаа'),
            cell('2026-10-16', 'call.l2.other', 4), cell('2026-10-16', 'chat.personal', 6),
        ];
        const report = buildSalesActivity(input({ config: team, counts, confirmedDates: ['2026-10-08', '2026-10-16'] }));
        expect(report.buckets.slice(3).map(bucket => [bucket.label, bucket.values.hotline, bucket.values.managerLine, bucket.values.chats])).toEqual([
            ['10/07–10/13', 2, 2, 3],
            ['10/14–10/20', 9, 4, 6],
        ]);
        expect(report.month.metrics.hotline.actual).toBe(11);
        expect(report.month.metrics.chats.actual).toBe(9);
        expect(report.lines.chats).toEqual(['Чат']);
        // Зөвхөн 10/08-ны 8888/9008-ийн хуучин «нийт» нүд тооцогдохгүй.
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('байхгүй 1 нүдийг')]));
        // Шинэ загвараар оруулсан чат тухайн өдөр хуучин сувгаас давамгайлна.
        const later = buildSalesActivity(input({ config: team, counts: [...counts, cell('2026-10-17', 'chat.all', 2), cell('2026-10-17', 'chat.page', 5)] }));
        expect(later.buckets[4].values.chats).toBe(8);
    });

    it('keeps a metric with no entered cell unknown even on days other metrics were entered', () => {
        const report = buildSalesActivity(input({ counts: [cell('2026-10-15', 'call.l1.new', 5)] }));
        expect(report.buckets[4].values).toMatchObject({ hotline: 5, managerLine: null, chats: null });
        expect(report.month.metrics.managerLine).toEqual({ actual: null, plan: null, planToDate: null, pct: null, partial: false });
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
        // 10/07-нд эхэлсэн хэсэг бүрэн мэдэгдэнэ.
        expect(report.buckets.every(bucket => !bucket.partial.newMeetings && !bucket.partial.repeatMeetings)).toBe(true);
        expect(report.dataSince).toBe('2026-10-07');
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('2026-10-07-нээс эхэлсэн')]));
        const none = buildSalesActivity(input({ meetings: [], meetingsSince: null }));
        expect(none.buckets.every(bucket => bucket.values.newMeetings === null)).toBe(true);
        expect(none.month.metrics.newMeetings.actual).toBeNull();
        expect(none.notes).toEqual(expect.arrayContaining(['Уулзалт бүртгэгдээгүй тул уулзалтын тоо тодорхойгүй.']));
    });

    it('treats days before the first daily-report count as unknown: earlier periods «—», straddling ones «N+» without a %', () => {
        const counts = [{ report_date: '2026-10-08', manager_name: 'A', metric: 'call.l1.new', value: 20 }, { report_date: '2026-10-15', manager_name: 'A', metric: 'chat.page', value: 5 }];
        const report = buildSalesActivity(input({ counts, countsSince: '2026-10-08', targets: { hotline: 550, chats: 85 } }));
        const before = report.buckets.find(bucket => bucket.to < '2026-10-08')!;
        expect(before.values.hotline).toBeNull();
        const straddle = report.buckets.find(bucket => bucket.from < '2026-10-08' && bucket.to >= '2026-10-08')!;
        expect([straddle.values.hotline, straddle.partial.hotline]).toEqual([20, true]);
        expect(report.month.metrics.hotline).toMatchObject({ actual: 20, partial: true, pct: null });
        expect(report.month.metrics.chats).toMatchObject({ actual: 5, partial: true, pct: null });
        expect(report.notes.join(' ')).toMatch(/Өдрийн тайлангийн тоо 2026-10-08-нээс эхэлсэн/);
        // Сарын эхнээс бүртгэсэн бол хувь тооцогдоно.
        const full = buildSalesActivity(input({ counts, countsSince: '2026-10-01', targets: { hotline: 550 } }));
        expect(full.month.metrics.hotline).toMatchObject({ actual: 20, partial: false });
        expect(full.month.metrics.hotline.pct).not.toBeNull();
        // Тоо огт бүртгэгдээгүй бол тодорхойгүй.
        expect(buildSalesActivity(input({ counts: [], countsSince: null })).month.metrics.hotline).toMatchObject({ actual: null, partial: false });
    });

    it('marks counts that straddle the first recorded meeting as lower bounds and drops their attainment', () => {
        // Elysium: анхны уулзалт 10/07; 10/21-ний хурлын сар 10/01–10/20 — 6 өдөр нь бүртгэлгүй.
        const meetings = [
            { day: '2026-10-07', type: 'new_customer' }, { day: '2026-10-09', type: 'repeat_customer' }, { day: '2026-10-15', type: 'new_customer' },
        ];
        const report = buildSalesActivity(input({ meetings, meetingsSince: '2026-10-07', targets: { meetings_new: 110, meetings_repeat: 30 } }));
        expect(report.month.metrics.newMeetings).toEqual({ actual: 2, plan: 110, planToDate: 73, pct: null, partial: true });
        expect(report.month.metrics.repeatMeetings).toEqual({ actual: 1, plan: 30, planToDate: 20, pct: null, partial: true });
        expect(report.month.metrics.hotline.partial).toBe(false);
        expect(report.notes).toEqual(expect.arrayContaining(['2026-10 сарын уулзалтын тоо 2026-10-07-нээс хойшхи бүртгэлээр тул биелэлтийн хувь «—».']));

        // Хэсгийн дунд эхэлсэн: олдсон бол «N+», олдоогүй бол null (0 биш); бүртгэлээс өмнө дууссан хэсэг null.
        const midBucket = buildSalesActivity(input({ meetings: [{ day: '2026-10-04', type: 'new_customer' }, ...meetings], meetingsSince: '2026-10-03' }));
        expect(midBucket.buckets[2]).toMatchObject({
            from: '2026-09-30', to: '2026-10-06',
            values: { newMeetings: 1, repeatMeetings: null }, partial: { newMeetings: true, repeatMeetings: false, hotline: false },
        });
        expect(midBucket.buckets[1].values.newMeetings).toBeNull();
        expect(midBucket.buckets[3]).toMatchObject({ values: { newMeetings: 1, repeatMeetings: 1 }, partial: { newMeetings: false, repeatMeetings: false } });

        // Бүртгэл сарын 1-нд эхэлсэн бол сар бүрэн, хувь тооцогдоно.
        const full = buildSalesActivity(input({ meetings, meetingsSince: '2026-10-01', targets: { meetings_new: 110 } }));
        expect(full.month.metrics.newMeetings).toEqual({ actual: 2, plan: 110, planToDate: 73, pct: 3, partial: false });
        expect(full.notes.join(' ')).not.toContain('биелэлтийн хувь «—»');
    });

    it('pro-rates the monthly team plan to the report end and computes attainment', () => {
        const report = buildSalesActivity(input({
            counts: [cell('2026-10-14', 'call.l1.new', 100), cell('2026-10-14', 'chat.page', 120)],
            meetings: [{ day: '2026-10-14', type: 'new_customer' }], meetingsSince: '2026-10-01',
            targets: { hotline: 550, manager_line: 300, meetings_new: 110, chats: 85 },
        }));
        // 10-20 → 20/30.
        expect(report.month.metrics.hotline).toEqual({ actual: 100, plan: 550, planToDate: 367, pct: 27, partial: false });
        expect(report.month.metrics.chats).toEqual({ actual: 120, plan: 85, planToDate: 57, pct: 211, partial: false });
        expect(report.month.metrics.newMeetings).toEqual({ actual: 1, plan: 110, planToDate: 73, pct: 1, partial: false });
        expect(report.month.metrics.repeatMeetings).toEqual({ actual: 0, plan: null, planToDate: null, pct: null, partial: false });
        expect(report.month.metrics.managerLine).toEqual({ actual: null, plan: 300, planToDate: 200, pct: null, partial: false });
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

    it('reports the chosen period: weeks end on its last day, the month card is that month and the range is returned', () => {
        // Хурал 11/18, сонгосон хугацаа 11/03 (Мягмар) – 11/16 (Даваа): 7 хоног Мягмар→Даваа, 10-р сарын 7 хоног ч бүтнээрээ.
        const report = buildSalesActivity(input({
            meetingDate: '2026-11-18', range: { from: '2026-11-03', to: '2026-11-16' }, today: '2026-11-15',
            counts: [cell('2026-10-28', 'call.l1.new', 4), cell('2026-11-02', 'call.l1.new', 6), cell('2026-11-16', 'call.l1.new', 3), cell('2026-11-17', 'call.l1.new', 50)],
            targets: { hotline: 500 },
        }));
        expect(report.range).toEqual({ from: '2026-11-03', to: '2026-11-16' });
        expect(report.buckets.map(bucket => [bucket.label, bucket.values.hotline])).toEqual([
            ['10/13–10/19', null], ['10/20–10/26', null], ['10/27–11/02', 10], ['11/03–11/09', null], ['11/10–11/16', 3],
        ]);
        // Сар = дуусах өдрийн сар, 11/16 хүртэл (11/17-ны 50 орохгүй): 6 + 3; төлөвлөгөө 500 × 16 / 30.
        expect(report.month).toMatchObject({ month: '2026-11', from: '2026-11-01', to: '2026-11-16' });
        expect(report.month.metrics.hotline).toMatchObject({ actual: 9, plan: 500, planToDate: 267 });
        expect(report.notes).toEqual(expect.arrayContaining(['Тайлант хугацаа (2026-11-03 – 2026-11-16) хараахан дуусаагүй байна.']));
    });
});
