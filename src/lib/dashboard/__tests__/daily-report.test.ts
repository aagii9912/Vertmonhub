import { describe, expect, it } from 'vitest';
import {
    buildDailyReport, configMetrics, DailyReportConfigSchema, DEFAULT_DAILY_REPORT_CONFIG, defaultShortName, formalManagerName,
    formatDailyReportText, meetingItemText, nextConfigKey, readDailyReportConfig, resolveReportManagers, SaveDailyReportSchema,
    type BuildDailyReportInput, type DailyReportConfig,
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
    pendingMeetings: 0,
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

    it('lists the metrics a template accepts and picks the next free key', () => {
        expect([...configMetrics(elysium)]).toEqual([
            'call.l1.new', 'call.l1.other', 'call.l2.new', 'call.l2.repeat', 'call.l2.other', 'chat.page', 'chat.personal',
        ]);
        expect([...configMetrics(DEFAULT_DAILY_REPORT_CONFIG)]).toEqual(['call.l1.total', 'chat.page', 'chat.personal']);
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

describe('formatDailyReportText', () => {
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
        expect(formatDailyReportText(buildDailyReport(input({ pendingMeetings: 2 })))).toContain('(Үр дүнгээ бүртгээгүй товлосон уулзалт: 2)');
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
