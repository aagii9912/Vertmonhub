import { describe, expect, it } from 'vitest';
import {
    buildDailyReport, buildDailyReportChanges, configMetrics, dailyMetricLabel, dailyNoteLabel, dailyNotePatch, dailyNoteText, DailyReportConfigSchema,
    DEFAULT_DAILY_REPORT_CONFIG, defaultShortName, flattenDailyNotes, formalManagerName, formatDailyReportText, joinDailyGeneralNotes, meetingItemText,
    nextConfigKey, readDailyReportConfig, reportPeriodLabel, resolveReportManagers, SaveDailyReportSchema, sumDailyCounts,
    type BuildDailyReportInput, type DailyReportChangeRow, type DailyReportConfig,
} from '../daily-report';

const roster = [
    { name: 'Ариунбилэг.Нямхүү', is_active: true },
    { name: 'Чанцалдулам.Раднаа', is_active: true },
    { name: 'Хонгорзул.Мөнхгэрэл', is_active: true },
    { name: 'Батаа.Дорж', is_active: false },
];

/** Elysium-ийн загвар: хоёр шугам ангиллаар, хоёр чатын суваг. */
const elysium: DailyReportConfig = DailyReportConfigSchema.parse({
    title: '"Элизиум Ресиденс" баг',
    lines: [
        { key: 'l1', label: '7786-2222', categories: ['new', 'other'] },
        { key: 'l2', label: '8888/9008', categories: ['new', 'repeat', 'other'] },
    ],
    chats: [{ key: 'page', label: 'Пэйж Fb' }, { key: 'personal', label: 'Хувь чат' }],
    managers: [
        { name: 'Ариунбилэг.Нямхүү', short: 'Ари' },
        { name: 'Чанцалдулам.Раднаа', short: 'Чан' },
        { name: 'Хонгорзул.Мөнхгэрэл', short: 'Хон' },
    ],
});

const meeting = (id: string, manager: string | null, type: string | null, customer: string, notes: string | null = null, feedback: string | null = null) => ({
    id, manager, type, customer, property: null, notes, feedback, scheduled_at: `2026-09-30T0${id.length}:00:00Z`,
});

const input = (overrides: Partial<BuildDailyReportInput> = {}): BuildDailyReportInput => ({
    date: '2026-09-30',
    title: '"Элизиум Ресиденс" баг',
    config: elysium,
    roster,
    counts: [
        { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.l1.new', value: 1 },
        { manager_name: 'Чанцалдулам.Раднаа', metric: 'call.l1.new', value: 2 },
        { manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'call.l1.new', value: 1 },
        { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.l2.new', value: 2 },
        { manager_name: 'Чанцалдулам.Раднаа', metric: 'call.l2.new', value: 4 },
        { manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'call.l2.new', value: 5 },
        { manager_name: 'Чанцалдулам.Раднаа', metric: 'chat.personal', value: 2 },
        { manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'chat.personal', value: 2 },
        // Загвараас хасагдсан шугамын хуучин тоо тайланд орохгүй.
        { manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'call.l9.total', value: 50 },
    ],
    meetings: [
        meeting('a', 'Чанцалдулам.Раднаа', 'new_customer', 'Бат', 'Б2-58м2 10-30%', 'үлдэгдэл банк'),
        meeting('bb', 'Хонгорзул.Мөнхгэрэл', 'new_customer', 'Сараа', 'Б1-89м2 бартер эсвэл УХН'),
        meeting('ccc', 'Хонгорзул.Мөнхгэрэл', 'new_customer', 'Дорж', 'Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв'),
    ],
    pendingMeetings: [],
    notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан' } },
    completed: { by: 'М. Хонгорзул', at: '2026-09-30T10:00:00Z' },
    only: null,
    ...overrides,
});

describe('daily report config', () => {
    it('falls back to the default template when nothing is saved or the saved one is broken', () => {
        expect(readDailyReportConfig(null)).toEqual({ config: DEFAULT_DAILY_REPORT_CONFIG, saved: false, invalid: false });
        expect(readDailyReportConfig({ lines: 'oops' })).toEqual({ config: DEFAULT_DAILY_REPORT_CONFIG, saved: true, invalid: true });
        expect(readDailyReportConfig({ lines: [{ key: 'l1', label: '7575-8000' }] }).config)
            .toEqual({ title: null, lines: [{ key: 'l1', label: '7575-8000', categories: [] }], chats: [], managers: null });
    });

    it('rejects duplicate keys, categories, managers and short labels', () => {
        const base = { lines: [], chats: [] };
        expect(DailyReportConfigSchema.safeParse({ ...base, lines: [{ key: 'l1', label: 'A' }, { key: 'l1', label: 'B' }] }).success).toBe(false);
        expect(DailyReportConfigSchema.safeParse({ ...base, lines: [{ key: 'l1', label: 'A', categories: ['new', 'new'] }] }).success).toBe(false);
        expect(DailyReportConfigSchema.safeParse({ ...base, managers: [{ name: 'A', short: 'Хон' }, { name: 'B', short: 'хон' }] }).success).toBe(false);
        expect(DailyReportConfigSchema.safeParse({ ...base, lines: [{ key: 'L-1', label: 'A' }] }).success).toBe(false);
        expect(DailyReportConfigSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    });

    it('uses Elysium’s project phone and separate personal calls without replacing saved templates', () => {
        const config = readDailyReportConfig(null, 'Elysium Residence').config;
        expect(config.lines).toEqual([
            { key: 'l1', label: 'Төслийн утас · 77862222', categories: [] },
            { key: 'personal', label: 'Менежерийн дуудлага', categories: [] },
        ]);
        expect(readDailyReportConfig(null, 'Mandala Garden').config.lines[0].label).toBe('Төслийн утас');
        expect(readDailyReportConfig(elysium, 'Elysium Residence').config).toEqual(elysium);
        const report = buildDailyReport(input({ config, counts: [
            { manager_name: roster[0].name, metric: 'call.l1.total', value: 3 },
            { manager_name: roster[0].name, metric: 'call.personal.total', value: 2 },
        ] }));
        expect(report.lines.map(line => line.total)).toEqual([3, 2]);
        expect(formatDailyReportText(report)).toContain('Төслийн утас · 77862222: Нийт 3 дуудлага ирсэн');
        expect(formatDailyReportText(report)).toContain('Менежерийн дуудлага: Нийт 2 дуудлага ирсэн');
    });

    it('lists the metrics a template accepts and picks the next free key', () => {
        expect([...configMetrics(elysium)]).toEqual([
            'call.l1.new', 'call.l1.other', 'call.l2.new', 'call.l2.repeat', 'call.l2.other', 'chat.page', 'chat.personal',
        ]);
        expect([...configMetrics(DEFAULT_DAILY_REPORT_CONFIG)]).toEqual(['call.l1.total', 'call.personal.total', 'chat.page', 'chat.personal']);
        expect(nextConfigKey(['l1', 'l3'], 'l')).toBe('l2');
    });
});

describe('manager names', () => {
    it('formats roster names like the paper report', () => {
        expect(formalManagerName('Чанцалдулам.Раднаа')).toBe('Р. Чанцалдулам');
        expect(formalManagerName('Р.Чанцалдулам')).toBe('Р. Чанцалдулам');
        expect(formalManagerName('Khongoroo')).toBe('Khongoroo');
        expect(defaultShortName('Чанцалдулам.Раднаа')).toBe('Чан');
        expect(defaultShortName('М.Хонгорзул')).toBe('Хон');
        expect(defaultShortName('Бархүү.Санждорж')).toBe('Бар');
    });

    it('uses the active roster by default, appends data-only names and an unassigned column', () => {
        const managers = resolveReportManagers(DEFAULT_DAILY_REPORT_CONFIG, roster, ['Батаа.Дорж', 'Гадны нэр', '']);
        expect(managers.map(manager => [manager.name, manager.short, manager.inRoster, manager.active])).toEqual([
            ['Ариунбилэг.Нямхүү', 'Ари', true, true],
            ['Хонгорзул.Мөнхгэрэл', 'Хон', true, true],
            ['Чанцалдулам.Раднаа', 'Чан', true, true],
            ['Батаа.Дорж', 'Бат', true, false],
            ['Гадны нэр', 'Гад', false, false],
            ['', '—', false, false],
        ]);
    });

    it('lengthens clashing default short labels', () => {
        const managers = resolveReportManagers(DEFAULT_DAILY_REPORT_CONFIG, [
            { name: 'Хонгорзул.Мөнхгэрэл', is_active: true }, { name: 'Хонгор.Бат', is_active: true },
        ]);
        expect(managers.map(manager => manager.short)).toEqual(['Хон', 'Хонг']);
    });
});

describe('buildDailyReport', () => {
    it('builds the Elysium grids, totals and meeting lists from counts and completed meetings', () => {
        const report = buildDailyReport(input());
        expect(report.weekday).toBe('Лхагва');
        expect(report.managers.map(manager => manager.short)).toEqual(['Ари', 'Чан', 'Хон']);

        const [first, second] = report.lines;
        expect(first.rows.map(row => [row.label, row.values['Ариунбилэг.Нямхүү'], row.values['Чанцалдулам.Раднаа'], row.values['Хонгорзул.Мөнхгэрэл'], row.total]))
            .toEqual([['Шинэ', 1, 2, 1, 4], ['Бусад', null, null, null, 0]]);
        expect(first.total).toBe(4);
        expect(first.note).toBe('Төслийн ерөнхий мэдээлэл авсан');
        expect(second.total).toBe(11);
        expect(second.rows.map(row => row.label)).toEqual(['Шинэ', 'Захиалагч, давтан', 'Бусад']);
        expect(report.chats.total).toBe(4);
        expect(report.chats.rows.map(row => row.total)).toEqual([0, 4]);

        expect(report.meetings.total).toBe(3);
        expect(report.meetings.byManager).toEqual({ 'Ариунбилэг.Нямхүү': 0, 'Чанцалдулам.Раднаа': 1, 'Хонгорзул.Мөнхгэрэл': 2 });
        expect(report.meetings.groups.map(group => [group.heading, group.count])).toEqual([['Шинэ уулзалт', 3], ['Давтан уулзалт', 0], ['Захиалагч', 0]]);
        expect(report.meetings.groups[0].items.map(item => item.text)).toEqual([
            'Бат — Б2-58м2 10-30%; үлдэгдэл банк',
            'Сараа — Б1-89м2 бартер эсвэл УХН',
            'Дорж — Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв',
        ]);
        expect(report.filled).toEqual(['Ариунбилэг.Нямхүү', 'Чанцалдулам.Раднаа', 'Хонгорзул.Мөнхгэрэл']);
        expect(report.missing).toEqual([]);
    });

    it('keeps blank cells blank, flags managers who entered nothing and buckets unclassified or unassigned meetings', () => {
        const report = buildDailyReport(input({
            counts: [{ manager_name: 'Чанцалдулам.Раднаа', metric: 'call.l1.new', value: 0 }],
            meetings: [meeting('a', null, null, 'Нэргүй харилцагч'), meeting('bb', 'Чанцалдулам.Раднаа', 'existing_buyer', 'Болд', '203-13 тоот ОС ЗХ', 'бартер+хувь лизинг')],
        }));
        expect(report.lines[0].rows[0].values['Чанцалдулам.Раднаа']).toBe(0);
        expect(report.lines[0].rows[0].values['Ариунбилэг.Нямхүү']).toBeNull();
        expect(report.filled).toEqual(['Чанцалдулам.Раднаа']);
        expect(report.missing).toEqual(['Ариунбилэг.Нямхүү', 'Хонгорзул.Мөнхгэрэл']);
        expect(report.managers.at(-1)).toMatchObject({ name: '', title: 'Оноогдоогүй' });
        expect(report.meetings.rows.map(row => [row.label, row.total])).toEqual([['Шинэ', 0], ['Давтан', 0], ['Захиалагч', 1], ['Ангилаагүй', 1]]);
        expect(report.meetings.total).toBe(2);
        expect(report.meetings.byManager['']).toBe(1);
    });

    it('shows only the manager’s own column in personal mode', () => {
        const report = buildDailyReport(input({ only: 'Хонгорзул.Мөнхгэрэл', notes: {}, completed: null }));
        expect(report.managers.map(manager => [manager.name, manager.short])).toEqual([['Хонгорзул.Мөнхгэрэл', 'Хон']]);
        expect(report.lines[1].total).toBe(5);
        expect(report.meetings.total).toBe(2);
        expect(report.meetings.groups[0].items.map(item => item.text)).not.toContain('Бат — Б2-58м2 10-30%; үлдэгдэл банк');
    });
});

describe('date range report', () => {
    it('sums each manager × metric over the days and keeps other cells apart', () => {
        expect(sumDailyCounts([
            { manager_name: 'Чан', metric: 'call.l1.new', value: 2 },
            { manager_name: 'Чан', metric: 'call.l1.new', value: 3 },
            { manager_name: 'Хон', metric: 'call.l1.new', value: 1 },
            { manager_name: 'Чан', metric: 'chat.personal', value: 0 },
        ])).toEqual([
            { manager_name: 'Чан', metric: 'call.l1.new', value: 5 },
            { manager_name: 'Хон', metric: 'call.l1.new', value: 1 },
            { manager_name: 'Чан', metric: 'chat.personal', value: 0 },
        ]);
    });

    it('joins each day’s general note with its date, in date order', () => {
        expect(joinDailyGeneralNotes([
            { date: '2026-09-30', general: 'Toyota LC150 бартерийн санал' },
            { date: '2026-09-28', general: '  ' },
            { date: '2026-09-29', general: 'МК төслүүдтэй танилцсан' },
        ])).toBe('2026.09.29: МК төслүүдтэй танилцсан\n2026.09.30: Toyota LC150 бартерийн санал');
    });

    it('labels the period, dates meeting items and counts confirmed days instead of one confirmer', () => {
        const report = buildDailyReport(input({
            date: '2026-09-24', to: '2026-09-30', completedDays: 3,
            meetings: [meeting('a', 'Чанцалдулам.Раднаа', 'new_customer', 'Бат', 'Б2-58м2'), { ...meeting('bb', 'Хонгорзул.Мөнхгэрэл', 'new_customer', 'Сараа'), scheduled_at: '2026-09-24T18:00:00Z' }],
        }));
        expect(report).toMatchObject({ date: '2026-09-24', to: '2026-09-30', days: 7, weekday: '7 өдөр', completed: null, completedDays: 3 });
        expect(reportPeriodLabel(report)).toBe('2026.09.24 – 2026.09.30');
        // Нүд олон өдрийн нийлбэр — «Оруулсан …» тэмдэггүй.
        expect([...report.lines.flatMap(line => line.rows), ...report.chats.rows].every(row => row.authors === undefined)).toBe(true);
        // 2026-09-24T18:00Z = 09-25 02:00 (УБ); жагсаалт уулзалтын цагаар.
        expect(report.meetings.groups[0].items.map(item => [item.text, item.day])).toEqual([['Сараа', '2026-09-25'], ['Бат — Б2-58м2', '2026-09-30']]);
        const text = formatDailyReportText(report);
        expect(text.split('\n')[0]).toBe('"ЭЛИЗИУМ РЕСИДЕНС" БАГ — 2026.09.24 – 2026.09.30 (7 өдөр)');
        expect(text).toContain('1. 09.25 Сараа');
        expect(text).toContain('2. 09.30 Бат — Б2-58м2');
        expect(text).toContain('Баталгаажсан өдөр: 3/7');
        expect(text).not.toContain('Тайлан хийж гүйцэтгэсэн');
    });

    it('keeps a single day unchanged', () => {
        const report = buildDailyReport(input({ to: '2026-09-30' }));
        expect(report).toMatchObject({ to: '2026-09-30', days: 1, weekday: 'Лхагва', completedDays: null });
        expect(report.completed?.by).toBe('М. Хонгорзул');
        expect(report.meetings.groups[0].items.every(item => item.day === null)).toBe(true);
    });
});

describe('formatDailyReportText', () => {
    it('includes the saved manager phone in the copy-ready report', () => {
        const report = buildDailyReport(input({ roster: roster.map((manager, index) => ({ ...manager, phone: index === 0 ? '99112233' : null })) }));
        expect(report.managers[0].phone).toBe('99112233');
        expect(formatDailyReportText(report)).toContain('Менежер: Н. Ариунбилэг (9911 2233), Р. Чанцалдулам, М. Хонгорзул');
    });

    it('produces the messenger text in the order of the paper report', () => {
        const text = formatDailyReportText(buildDailyReport(input()));
        expect(text).toBe([
            '"ЭЛИЗИУМ РЕСИДЕНС" БАГ — 2026.09.30',
            'Менежер: Н. Ариунбилэг, Р. Чанцалдулам, М. Хонгорзул',
            '',
            '7786-2222: Нийт 4 дуудлага ирсэн (Ари 1, Чан 2, Хон 1). Төслийн ерөнхий мэдээлэл авсан.',
            '  Шинэ: 4 (Ари 1, Чан 2, Хон 1)',
            '',
            '8888/9008: Нийт 11 дуудлага ирсэн (Ари 2, Чан 4, Хон 5).',
            '  Шинэ: 11 (Ари 2, Чан 4, Хон 5)',
            '',
            'Менежерийн чат: Нийт 4 чат харилцаа үүсгэсэн.',
            '  Хувь чат: 4 (Чан 2, Хон 2)',
            '',
            'Уулзалт: 3 (Чан 1, Хон 2)',
            'Шинэ уулзалт - 3',
            '1. Бат — Б2-58м2 10-30%; үлдэгдэл банк',
            '2. Сараа — Б1-89м2 бартер эсвэл УХН',
            '3. Дорж — Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв',
            'Давтан уулзалт - 0',
            'Захиалагч - 0',
            '',
            'Тайлан хийж гүйцэтгэсэн: М. Хонгорзул',
        ].join('\n'));
    });

    it('mentions meetings still waiting for an outcome', () => {
        const pendingMeetings = [
            { id: 'p1', manager: 'Хонгорзул.Мөнхгэрэл', type: 'new_customer', customer: 'Болд', scheduled_at: '2026-09-30T05:00:00Z' },
            { id: 'p2', manager: null, type: null, customer: 'Нэргүй харилцагч', scheduled_at: '2026-09-30T03:00:00Z' },
        ];
        expect(formatDailyReportText(buildDailyReport(input({ pendingMeetings })))).toContain('(Үр дүнгээ бүртгээгүй товлосон уулзалт: 2)');
    });
});

describe('meeting item text and save input', () => {
    it('joins property, notes and feedback once', () => {
        expect(meetingItemText({ customer: 'Загдсүрэн', property: null, notes: '10-50 хувь', feedback: '10-50 хувь' })).toBe('Загдсүрэн — 10-50 хувь');
        expect(meetingItemText({ customer: 'ТЕМ', property: null, notes: '  ', feedback: null })).toBe('ТЕМ');
    });

    it('validates cells, rejects duplicates, unknown metrics and future-proof bounds', () => {
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [{ manager: 'A', metric: 'call.l1.total', value: 3 }] }).success).toBe(true);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [
            { manager: 'A', metric: 'chat.page', value: 1 }, { manager: 'A', metric: 'chat.page', value: null },
        ] }).success).toBe(false);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [{ manager: 'A', metric: 'meeting.new', value: 1 }] }).success).toBe(false);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [{ manager: 'A', metric: 'chat.page', value: -1 }] }).success).toBe(false);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-02-30', cells: [] }).success).toBe(false);
    });
});

describe('team entry: cell authors and pending meetings', () => {
    const accounts = roster.map((entry, index) => ({ ...entry, user_id: index === 2 ? 'khon-user' : null }));

    it('marks who entered each call/chat cell and whether it was someone else than the column’s own account', () => {
        const report = buildDailyReport(input({
            roster: accounts,
            counts: [
                { manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'call.l1.new', value: 1, updated_by: 'khon-user', updated_by_name: 'М. Хонгорзул', updated_at: '2026-09-30T09:00:00Z' },
                { manager_name: 'Чанцалдулам.Раднаа', metric: 'call.l1.new', value: 2, updated_by: 'khon-user', updated_by_name: 'М. Хонгорзул', updated_at: '2026-09-30T09:01:00Z' },
                // Хуучин мөр: хэн оруулсан нь тодорхойгүй.
                { manager_name: 'Ариунбилэг.Нямхүү', metric: 'chat.page', value: 3 },
            ],
        }));
        const row = report.lines[0].rows[0];
        expect(row.authors).toEqual({
            'Хонгорзул.Мөнхгэрэл': { by: 'М. Хонгорзул', at: '2026-09-30T09:00:00Z', other: false },
            'Чанцалдулам.Раднаа': { by: 'М. Хонгорзул', at: '2026-09-30T09:01:00Z', other: true },
        });
        expect(report.lines[0].rows[1].authors).toEqual({});
        expect(report.chats.rows[0].authors).toEqual({ 'Ариунбилэг.Нямхүү': { by: null, at: null, other: false } });
        expect(report.meetings.rows.every(meetingRow => meetingRow.authors === undefined)).toBe(true);
        // Акаунтын id тайланд гарахгүй.
        expect(JSON.stringify(report)).not.toContain('khon-user');
    });

    it('lists pending meetings in time order with the canonical manager and keeps the count in step', () => {
        const report = buildDailyReport(input({
            pendingMeetings: [
                { id: 'p2', manager: 'Хонгорзул.Мөнхгэрэл', type: 'repeat_customer', customer: 'Болд', scheduled_at: '2026-09-30T06:00:00Z' },
                { id: 'p1', manager: null, type: null, customer: 'Нэргүй харилцагч', scheduled_at: '2026-09-30T03:00:00Z' },
                { id: 'p3', manager: 'Шинэ.Менежер', type: 'new_customer', customer: 'Сараа', scheduled_at: '2026-09-30T07:00:00Z' },
            ],
        }));
        expect(report.meetings.pending).toBe(3);
        expect(report.meetings.pendingItems).toEqual([
            { id: 'p1', manager: '', short: '—', customer: 'Нэргүй харилцагч', time: '2026-09-30T03:00:00Z', type: 'unclassified', assigned: true },
            { id: 'p2', manager: 'Хонгорзул.Мөнхгэрэл', short: 'Хон', customer: 'Болд', time: '2026-09-30T06:00:00Z', type: 'repeat_customer', assigned: true },
            { id: 'p3', manager: 'Шинэ.Менежер', short: 'Шин', customer: 'Сараа', time: '2026-09-30T07:00:00Z', type: 'new_customer', assigned: true },
        ]);
        // Товлосон уулзалт багана нэмэхгүй.
        expect(report.managers.map(manager => manager.short)).toEqual(['Ари', 'Чан', 'Хон']);
        expect(report.meetings.groups[0].items.map(item => item.managerName)).toEqual(['Чанцалдулам.Раднаа', 'Хонгорзул.Мөнхгэрэл', 'Хонгорзул.Мөнхгэрэл']);

        const own = buildDailyReport(input({ only: 'Хонгорзул.Мөнхгэрэл', pendingMeetings: [
            { id: 'p2', manager: 'Хонгорзул.Мөнхгэрэл', type: 'repeat_customer', customer: 'Болд', scheduled_at: '2026-09-30T06:00:00Z' },
            { id: 'p4', manager: 'Чанцалдулам.Раднаа', type: 'new_customer', customer: 'Дорж', scheduled_at: '2026-09-30T06:00:00Z' },
        ] }));
        expect(own.meetings.pendingItems.map(item => item.id)).toEqual(['p2']);
        expect(own.meetings.pending).toBe(1);
    });
});

describe('save input v2', () => {
    it('accepts expected values and partial notes with the texts the client saw', () => {
        const parsed = SaveDailyReportSchema.parse({
            date: '2026-09-30',
            cells: [{ manager: 'A', metric: 'call.l1.total', value: 3, expected: null }, { manager: 'B', metric: 'chat.page', value: null }],
            notes: { lines: { l1: ' Шинэ тайлбар ' }, general: '' },
            notesExpected: { lines: { l1: 'Хуучин' } },
        });
        expect(parsed.cells[0].expected).toBeNull();
        expect(parsed.cells[1].expected).toBeUndefined();
        expect(flattenDailyNotes(parsed.notes!, parsed.notesExpected)).toEqual([
            { key: 'line.l1', value: 'Шинэ тайлбар', expected: 'Хуучин' },
            { key: 'general', value: '' },
        ]);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [{ manager: 'A', metric: 'chat.page', value: 1, expected: 1.5 }] }).success).toBe(false);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', cells: [{ manager: 'A', metric: 'chat.page', value: 1, expected: 10_001 }] }).success).toBe(false);
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', notesExpected: { other: 'x' } }).success).toBe(false);
        const lines = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`l${index}`, 'x']));
        expect(SaveDailyReportSchema.safeParse({ date: '2026-09-30', notes: { lines } }).success).toBe(false);
    });

    it('reads and patches single note keys', () => {
        const notes = { lines: { l1: 'Мэдээлэл' }, chats: 'Чат' };
        expect(dailyNoteText(notes, 'line.l1')).toBe('Мэдээлэл');
        expect(dailyNoteText(notes, 'line.l2')).toBe('');
        expect(dailyNoteText(notes, 'chats')).toBe('Чат');
        expect(dailyNoteText(notes, 'general')).toBe('');
        expect(dailyNotePatch('line.l1', 'x')).toEqual({ lines: { l1: 'x' } });
        expect(dailyNotePatch('general', '')).toEqual({ general: '' });
    });
});

describe('change history', () => {
    it('labels metrics and notes from the template and falls back to raw keys', () => {
        expect(dailyMetricLabel(elysium, 'call.l1.new')).toBe('7786-2222 · Шинэ');
        expect(dailyMetricLabel(elysium, 'call.l2.repeat')).toBe('8888/9008 · Захиалагч, давтан');
        expect(dailyMetricLabel(DEFAULT_DAILY_REPORT_CONFIG, 'call.personal.total')).toBe('Менежерийн дуудлага');
        expect(dailyMetricLabel(elysium, 'chat.page')).toBe('Чат · Пэйж Fb');
        expect(dailyMetricLabel(elysium, 'call.l9.total')).toBe('call.l9.total');
        expect(dailyMetricLabel(elysium, 'chat.old')).toBe('chat.old');
        expect(dailyNoteLabel(elysium, 'line.l1')).toBe('Тэмдэглэл · 7786-2222');
        expect(dailyNoteLabel(elysium, 'chats')).toBe('Тэмдэглэл · Чат');
        expect(dailyNoteLabel(elysium, 'general')).toBe('Тэмдэглэл · Ерөнхий');
        expect(dailyNoteLabel(elysium, 'line.l9')).toBe('Тэмдэглэл · line.l9');
    });

    const CHAN = 'Чанцалдулам.Раднаа';
    const KHON = 'Хонгорзул.Мөнхгэрэл';
    const change = (id: number, overrides: Partial<DailyReportChangeRow>): DailyReportChangeRow => ({
        id, kind: 'count', manager_name: CHAN, metric: 'call.l1.new', note_key: null, old_value: null, new_value: null, old_text: null, new_text: null,
        restored_from: null, meta: {}, changed_by_name: 'М. Хонгорзул', changed_at: `2026-09-30T0${id}:00:00.000Z`, ...overrides,
    });

    it('orders newest first and lets only the latest, still-current change of an editable cell be restored', () => {
        const rows = [
            change(1, { old_value: null, new_value: 5 }),
            change(2, { old_value: 5, new_value: 3 }),
            change(3, { manager_name: KHON, metric: 'call.l9.total', old_value: 4, new_value: null }),
            change(4, { manager_name: KHON, old_value: null, new_value: 2, restored_from: 1 }),
            change(5, { kind: 'note', manager_name: null, metric: null, note_key: 'line.l1', old_text: null, new_text: 'Тайлбар' }),
            change(6, { kind: 'complete', manager_name: null, metric: null, old_text: null, new_text: 'М. Хонгорзул' }),
            change(7, { kind: 'meeting', manager_name: KHON, metric: null, old_text: CHAN, new_text: KHON, meta: { action: 'reassign' } }),
            change(8, { manager_name: KHON, metric: 'chat.page', old_value: 1, new_value: 9 }),
        ];
        const changes = buildDailyReportChanges(rows, {
            config: elysium,
            counts: [{ manager_name: CHAN, metric: 'call.l1.new', value: 3 }, { manager_name: KHON, metric: 'call.l1.new', value: 2 }, { manager_name: KHON, metric: 'chat.page', value: 7 }],
            notes: { lines: { l1: 'Тайлбар' } },
            editable: new Set([CHAN, KHON]),
            canEditNotes: true,
        });
        expect(changes.map(item => [item.id, item.label, item.restorable])).toEqual([
            [8, 'Чат · Пэйж Fb', false], // одоогийн утга 7 ≠ 9
            [7, 'Уулзалт', false],
            [6, 'Баталгаажуулалт', false],
            [5, 'Тэмдэглэл · 7786-2222', true],
            [4, '7786-2222 · Шинэ', true],
            [3, 'call.l9.total', false], // хуучин утга нь загварт алга
            [2, '7786-2222 · Шинэ', true],
            [1, '7786-2222 · Шинэ', false], // дараа нь дахин өөрчлөгдсөн
        ]);
        expect(changes[1]).toMatchObject({ kind: 'meeting', action: 'reassign', manager: KHON, managerTitle: 'М. Хонгорзул', oldText: CHAN, newText: KHON });
        expect(changes[4]).toMatchObject({
            manager: KHON, managerTitle: 'М. Хонгорзул', old: null, new: 2, by: 'М. Хонгорзул', at: '2026-09-30T04:00:00.000Z', action: null, restoredFrom: 1,
        });

        const readOnly = buildDailyReportChanges(rows, {
            config: elysium, counts: [{ manager_name: CHAN, metric: 'call.l1.new', value: 3 }], notes: { lines: { l1: 'Тайлбар' } }, editable: new Set([KHON]), canEditNotes: false,
        });
        expect(readOnly.filter(item => item.restorable).map(item => item.id)).toEqual([]);
    });
});
