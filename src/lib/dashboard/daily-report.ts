/**
 * «Өдрийн тайлан» — төслийн багийн өдөр бүрийн тайлан (Mandala Garden, Elysium-ийн загвар): утасны
 * шугам бүрийн ирсэн дуудлага, чат, уулзалтыг менежерээр нь хүснэгтлээд уулзалтын жагсаалт, тэмдэглэл,
 * «Тайлан хийж гүйцэтгэсэн»-ийг нэмнэ. Client-safe, pure (DB-гүй): сервер `daily-report-load.ts`.
 *
 * Эх сурвалж — ТААМАГЛАХГҮЙ:
 *  • Уулзалт = property_viewings `completed` (устгаагүй), уулзалтын УБ өдрөөр, `sales_manager_name`-ээр
 *    (менежерийн KPI-тай ижил дүрэм). Төрөл: Шинэ / Давтан / Захиалагч (`meeting_type`), төрөлгүй хуучин
 *    мөр «Ангилаагүй». Тэмдэглэл нь уулзалтын `agent_notes` + `customer_feedback`. Гараар засахгүй.
 *  • Утасны шугамын дуудлага, чат = менежерүүдийн өдөр бүр оруулсан тоо (`daily_report_counts`).
 *    CallPro-гийн экспорт менежерээр задрахгүй, хотын дугаарын ихэнх дуудлага лид болдоггүй тул CRM-ийн
 *    лидийн дуудлагаас (lead_activities) гаргахгүй. Оруулаагүй нүд хоосон (`null`) — 0 биш.
 *  • Загвар (шугам, ангилал, чатын суваг, менежерийн дараалал/товчлол) нь төсөл бүрийн тохиргоо.
 */
import { z } from 'zod';
import { formatStaffPhone } from '@/lib/admin/staff-profile';
import { MEETING_TYPE_META, MEETING_TYPES, WEEKDAYS_MN, type MeetingType } from '@/lib/viewings/labels';

export const CALL_CATEGORIES = ['new', 'repeat', 'other'] as const;
export type CallCategory = (typeof CALL_CATEGORIES)[number];
export const CALL_CATEGORY_LABEL: Record<CallCategory, string> = { new: 'Шинэ', repeat: 'Захиалагч, давтан', other: 'Бусад' };

/** Нэг нүдний дээд утга (оруулах алдаанаас сэргийлнэ; DB-ийн CHECK-тэй ижил). */
export const DAILY_COUNT_MAX = 10_000;
export const DAILY_LIMITS = { lines: 6, chats: 4, managers: 30, note: 1000, generalNote: 2000 } as const;
/** `call.<шугам>.<ангилал|total>` эсвэл `chat.<суваг>` — DB-ийн CHECK-тэй ижил. */
export const DAILY_METRIC_PATTERN = /^(call\.[a-z0-9]{1,16}\.(total|new|repeat|other)|chat\.[a-z0-9]{1,16})$/;
/** Хариуцагчгүй уулзалтын баганы түлхүүр. */
export const UNASSIGNED = '';

const KeySchema = z.string().regex(/^[a-z0-9]{1,16}$/, 'Түлхүүр буруу байна');
const LabelSchema = z.string().trim().min(1, 'Нэр хоосон байна').max(40, 'Нэр 40 тэмдэгтээс ихгүй');

export const DailyReportConfigSchema = z.object({
    /** Тайлангийн гарчиг («Мандала Гарден баг»); хоосон бол «<төсөл> баг». */
    title: z.string().trim().max(80).nullish().transform(value => value || null),
    lines: z.array(z.object({
        key: KeySchema,
        /** Утасны дугаар/нэр: «7575-8000», «****-7711». */
        label: LabelSchema,
        /** Хоосон = зөвхөн нийт тоо; эс бөгөөс ангиллаар (Шинэ / Захиалагч, давтан / Бусад). */
        categories: z.array(z.enum(CALL_CATEGORIES)).max(CALL_CATEGORIES.length).default([]),
    }).strict()).max(DAILY_LIMITS.lines).default([]),
    chats: z.array(z.object({ key: KeySchema, label: LabelSchema }).strict()).max(DAILY_LIMITS.chats).default([]),
    /** Баганын дараалал, товчлол. null = идэвхтэй бүх менежер нэрийн дарааллаар. */
    managers: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        short: z.string().trim().min(1, 'Товчлол хоосон байна').max(6, 'Товчлол 6 тэмдэгтээс ихгүй'),
    }).strict()).max(DAILY_LIMITS.managers).nullish().transform(value => value ?? null),
}).strict().superRefine((config, ctx) => {
    const duplicate = (values: string[]) => values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate(config.lines.map(line => line.key))) ctx.addIssue({ code: 'custom', message: 'Шугамын түлхүүр давхардсан байна' });
    if (duplicate(config.chats.map(chat => chat.key))) ctx.addIssue({ code: 'custom', message: 'Чатын сувгийн түлхүүр давхардсан байна' });
    if (config.lines.some(line => duplicate(line.categories))) ctx.addIssue({ code: 'custom', message: 'Ангилал давхардсан байна' });
    if (config.managers && duplicate(config.managers.map(manager => manager.name))) ctx.addIssue({ code: 'custom', message: 'Менежер давхардсан байна' });
    if (config.managers && duplicate(config.managers.map(manager => manager.short.toLowerCase()))) ctx.addIssue({ code: 'custom', message: 'Менежерийн товчлол давхардсан байна' });
});
export type DailyReportConfig = z.output<typeof DailyReportConfigSchema>;
export type DailyReportLine = DailyReportConfig['lines'][number];

/** Тохиргоо хадгалаагүй төслийн эхлэл: төслийн/менежерийн утас, хоёр чат, бүх менежер. */
export const DEFAULT_DAILY_REPORT_CONFIG: DailyReportConfig = {
    title: null,
    lines: [
        { key: 'l1', label: 'Төслийн утас', categories: [] },
        { key: 'personal', label: 'Менежерийн дуудлага', categories: [] },
    ],
    chats: [{ key: 'page', label: 'Пэйж FB' }, { key: 'personal', label: 'Хувь чат' }],
    managers: null,
};

/** Хадгалсан тохиргоо → загвар. Мөргүй бол анхдагч; эвдэрсэн бол анхдагч + `invalid`. */
export function readDailyReportConfig(raw: unknown, shopName = ''): { config: DailyReportConfig; saved: boolean; invalid: boolean } {
    const fallback = /elysium|элизиум/i.test(shopName) ? {
        ...DEFAULT_DAILY_REPORT_CONFIG,
        // l1 түлхүүр хэвээр: өмнө нь оруулсан төслийн утасны тоог хадгална.
        lines: DEFAULT_DAILY_REPORT_CONFIG.lines.map(line => line.key === 'l1' ? { ...line, label: 'Төслийн утас · 77862222' } : line),
    } : DEFAULT_DAILY_REPORT_CONFIG;
    if (raw === null || raw === undefined) return { config: fallback, saved: false, invalid: false };
    const parsed = DailyReportConfigSchema.safeParse(raw);
    return parsed.success
        ? { config: parsed.data, saved: true, invalid: false }
        : { config: fallback, saved: true, invalid: true };
}

export const callMetric = (line: string, category: CallCategory | 'total') => `call.${line}.${category}`;
export const chatMetric = (key: string) => `chat.${key}`;

/** Шугамын мөрүүд: ангилалгүй бол нэг «нийт» мөр. */
export function lineMetrics(line: Pick<DailyReportLine, 'key' | 'categories'>): string[] {
    return line.categories.length ? line.categories.map(category => callMetric(line.key, category)) : [callMetric(line.key, 'total')];
}
/** Загварт байгаа (оруулж болох) бүх үзүүлэлт. */
export function configMetrics(config: DailyReportConfig): Set<string> {
    return new Set([...config.lines.flatMap(lineMetrics), ...config.chats.map(chat => chatMetric(chat.key))]);
}

/** Тохиргооны шинэ шугам/сувгийн түлхүүр (хадгалсан тоо нь түлхүүрээр холбогдох тул нэр солиход хэвээр). */
export function nextConfigKey(existing: readonly string[], prefix: 'l' | 'c'): string {
    for (let index = 1; ; index += 1) if (!existing.includes(`${prefix}${index}`)) return `${prefix}${index}`;
}

/* ------------------------------------------------------------------ */
/* Менежерийн нэр                                                     */
/* ------------------------------------------------------------------ */

/** Бүртгэлийн нэр («Чанцалдулам.Раднаа», «Р.Чанцалдулам», «Khongoroo») → [өөрийн нэр, эцгийн нэр]. */
function nameParts(name: string): [string, string | null] {
    const parts = name.split('.').map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) return [name.trim(), null];
    // «Р.Чанцалдулам» — эхэнд эцгийн нэрийн үсэг; «Чанцалдулам.Раднаа» — эхэнд өөрийн нэр.
    return parts[0].length <= 2 ? [parts.slice(1).join(' '), parts[0]] : [parts[0], parts.slice(1).join(' ')];
}
/** Тайлангийн толгойн нэр: «Р. Чанцалдулам». */
export function formalManagerName(name: string): string {
    const [given, father] = nameParts(name);
    return father ? `${father.charAt(0).toLocaleUpperCase('mn')}. ${given}` : given;
}
/** Баганын анхдагч товчлол: өөрийн нэрийн эхний 3 үсэг («Чан»). */
export function defaultShortName(name: string, length = 3): string {
    const [given] = nameParts(name);
    const short = given.slice(0, length);
    return short.charAt(0).toLocaleUpperCase('mn') + short.slice(1);
}

export interface DailyReportManager {
    /** Бүртгэлийн канон нэр; хариуцагчгүй уулзалтын баганад ''. */
    name: string;
    short: string;
    /** «Р. Чанцалдулам». */
    title: string;
    /** Холбосон акаунтын бүртгэлд хадгалсан хувийн утас. */
    phone: string | null;
    inRoster: boolean;
    active: boolean;
}
export interface DailyRosterEntry { name: string; is_active: boolean; phone?: string | null }

/** Давхардсан товчлолыг уртасгаж ялгана (Хон / Хонг). */
function withUniqueShorts(managers: Array<Omit<DailyReportManager, 'short'> & { short?: string }>): DailyReportManager[] {
    const used = new Set<string>();
    return managers.map(manager => {
        let short = manager.short || defaultShortName(manager.name);
        for (let length = 4; used.has(short.toLowerCase()) && length <= manager.name.length; length += 1) short = defaultShortName(manager.name, length);
        for (let index = 2; used.has(short.toLowerCase()); index += 1) short = `${defaultShortName(manager.name)}${index}`;
        used.add(short.toLowerCase());
        return { ...manager, short };
    });
}

/**
 * Тайлангийн багана: тохиргооны менежерүүд (эсвэл идэвхтэй бүх менежер), дээр нь тухайн өдрийн өгөгдөлд
 * гарсан бусад нэр (идэвхгүй, бүртгэлгүй), хариуцагчгүй уулзалт байвал «Оноогдоогүй». Нийт дүн багануудын
 * нийлбэртэй үргэлж таарна.
 */
export function resolveReportManagers(config: DailyReportConfig, roster: readonly DailyRosterEntry[], dataNames: readonly string[] = []): DailyReportManager[] {
    const byName = new Map(roster.map(entry => [entry.name, entry]));
    const base = config.managers
        ? config.managers.map(manager => ({ name: manager.name, short: manager.short }))
        : roster.filter(entry => entry.is_active).map(entry => ({ name: entry.name, short: undefined }))
            .sort((a, b) => a.name.localeCompare(b.name, 'mn'));
    const names = new Set(base.map(manager => manager.name));
    const extras = [...new Set(dataNames.filter(name => name !== UNASSIGNED && !names.has(name)))].sort((a, b) => a.localeCompare(b, 'mn'));
    const columns = withUniqueShorts([...base, ...extras.map(name => ({ name, short: undefined }))].map(manager => ({
        name: manager.name,
        short: manager.short,
        title: formalManagerName(manager.name),
        phone: byName.get(manager.name)?.phone ?? null,
        inRoster: byName.has(manager.name),
        active: !!byName.get(manager.name)?.is_active,
    })));
    if (dataNames.includes(UNASSIGNED)) columns.push({ name: UNASSIGNED, short: '—', title: 'Оноогдоогүй', phone: null, inRoster: false, active: false });
    return columns;
}

/* ------------------------------------------------------------------ */
/* Тайлан                                                             */
/* ------------------------------------------------------------------ */

export const DailyReportNotesSchema = z.object({
    /** Шугам бүрийн тайлбар («Төслийн ерөнхий мэдээлэл авсан»). */
    lines: z.record(z.string().regex(/^[a-z0-9]{1,16}$/), z.string().trim().max(DAILY_LIMITS.note)).optional(),
    chats: z.string().trim().max(DAILY_LIMITS.note).optional(),
    general: z.string().trim().max(DAILY_LIMITS.generalNote).optional(),
}).strict();
export type DailyReportNotes = z.output<typeof DailyReportNotesSchema>;

export function readDailyReportNotes(raw: unknown): DailyReportNotes {
    const parsed = DailyReportNotesSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : {};
}

export interface DailyCountRow { manager_name: string; metric: string; value: number }
export interface DailyMeetingRow {
    id: string;
    manager: string | null;
    type: string | null;
    /** `leadDisplayName`-ээр гаргасан нэр. */
    customer: string;
    property: string | null;
    notes: string | null;
    feedback: string | null;
    scheduled_at: string;
}

export interface DailyGridRow {
    key: string;
    label: string;
    /** Менежер (баганын нэр) → тоо; оруулаагүй бол null. */
    values: Record<string, number | null>;
    total: number;
}
export interface DailyGridSection { rows: DailyGridRow[]; total: number; byManager: Record<string, number> }
export interface DailyLineSection extends DailyGridSection { key: string; label: string; categories: CallCategory[]; note: string }
export type MeetingKind = MeetingType | 'unclassified';
export interface DailyMeetingItem { id: string; manager: string; text: string }
export interface DailyMeetingGroup { type: MeetingKind; label: string; heading: string; count: number; items: DailyMeetingItem[] }

export interface DailyReport {
    date: string;
    weekday: string;
    title: string;
    managers: DailyReportManager[];
    lines: DailyLineSection[];
    chats: DailyGridSection & { note: string };
    meetings: DailyGridSection & { groups: DailyMeetingGroup[]; pending: number };
    /** Тухайн өдөр тоо оруулсан менежерүүд (0-ийг оруулсан ч тооцно). */
    filled: string[];
    /** Загварын менежерээс тоо оруулаагүй нь (идэвхтэй, бүртгэлтэй). */
    missing: string[];
    generalNote: string;
    completed: { by: string | null; at: string } | null;
}

export interface BuildDailyReportInput {
    date: string;
    title: string;
    config: DailyReportConfig;
    roster: readonly DailyRosterEntry[];
    counts: readonly DailyCountRow[];
    meetings: readonly DailyMeetingRow[];
    /** «Товлосон» хэвээр (үр дүн бүртгээгүй) уулзалтын тоо. */
    pendingMeetings: number;
    notes: DailyReportNotes;
    completed: { by: string | null; at: string } | null;
    /** Хувийн горим: зөвхөн энэ менежерийн багана. */
    only: string | null;
}

const MEETING_KINDS: MeetingKind[] = [...MEETING_TYPES, 'unclassified'];
const meetingKind = (type: string | null): MeetingKind => (type && (MEETING_TYPES as string[]).includes(type) ? type as MeetingType : 'unclassified');
const meetingLabel = (kind: MeetingKind) => (kind === 'unclassified' ? 'Ангилаагүй' : MEETING_TYPE_META[kind].short);
const MEETING_HEADING: Record<MeetingKind, string> = {
    new_customer: 'Шинэ уулзалт', repeat_customer: 'Давтан уулзалт', existing_buyer: 'Захиалагч', unclassified: 'Ангилаагүй',
};
const clean = (value: string | null | undefined, max = 300) => {
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Уулзалтын жагсаалтын мөр: «Загдсүрэн — Aus-с ирсэн…; 10-50 хувь». */
export function meetingItemText(meeting: Pick<DailyMeetingRow, 'customer' | 'property' | 'notes' | 'feedback'>): string {
    const details = [meeting.property, meeting.notes, meeting.feedback].map(value => clean(value)).filter(Boolean);
    const unique = details.filter((value, index) => details.indexOf(value) === index);
    return unique.length ? `${clean(meeting.customer, 120)} — ${unique.join('; ')}` : clean(meeting.customer, 120);
}

function gridSection(rows: Array<{ key: string; label: string; values: Record<string, number | null> }>, managers: readonly DailyReportManager[]): DailyGridSection {
    const byManager: Record<string, number> = Object.fromEntries(managers.map(manager => [manager.name, 0]));
    const full = rows.map(row => {
        const values: Record<string, number | null> = {};
        let total = 0;
        for (const manager of managers) {
            const value = row.values[manager.name] ?? null;
            values[manager.name] = value;
            total += value ?? 0;
            byManager[manager.name] += value ?? 0;
        }
        return { ...row, values, total };
    });
    return { rows: full, total: full.reduce((sum, row) => sum + row.total, 0), byManager };
}

export function buildDailyReport(input: BuildDailyReportInput): DailyReport {
    const { config, only } = input;
    const counts = input.counts.filter(row => !only || row.manager_name === only);
    const meetings = input.meetings.filter(row => !only || row.manager === only).filter(row => row.id);
    const managers = only
        ? resolveReportManagers({ ...config, managers: [{ name: only, short: config.managers?.find(manager => manager.name === only)?.short ?? defaultShortName(only) }] }, input.roster)
        : resolveReportManagers(config, input.roster, [...counts.map(row => row.manager_name), ...meetings.map(row => row.manager ?? UNASSIGNED)]);

    const value = new Map<string, number>();
    for (const row of counts) value.set(`${row.manager_name}\u0000${row.metric}`, row.value);
    const valuesFor = (metric: string) => Object.fromEntries(managers.map(manager => [manager.name, value.get(`${manager.name}\u0000${metric}`) ?? null]));

    const lines: DailyLineSection[] = config.lines.map(line => {
        const rows = line.categories.length
            ? line.categories.map(category => ({ key: callMetric(line.key, category), label: CALL_CATEGORY_LABEL[category], values: valuesFor(callMetric(line.key, category)) }))
            : [{ key: callMetric(line.key, 'total'), label: 'Нийт', values: valuesFor(callMetric(line.key, 'total')) }];
        return { key: line.key, label: line.label, categories: line.categories, ...gridSection(rows, managers), note: clean(input.notes.lines?.[line.key], DAILY_LIMITS.note) };
    });
    const chats = gridSection(config.chats.map(chat => ({ key: chatMetric(chat.key), label: chat.label, values: valuesFor(chatMetric(chat.key)) })), managers);

    const sorted = [...meetings].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.id.localeCompare(b.id));
    const byKind = new Map<MeetingKind, DailyMeetingRow[]>(MEETING_KINDS.map(kind => [kind, []]));
    for (const meeting of sorted) byKind.get(meetingKind(meeting.type))!.push(meeting);
    const shownKinds = MEETING_KINDS.filter(kind => kind !== 'unclassified' || byKind.get(kind)!.length > 0);
    const meetingGrid = gridSection(shownKinds.map(kind => {
        const values: Record<string, number | null> = {};
        for (const meeting of byKind.get(kind)!) {
            const name = meeting.manager ?? UNASSIGNED;
            values[name] = (values[name] ?? 0) + 1;
        }
        return { key: kind, label: meetingLabel(kind), values };
    }), managers);
    const shortOf = new Map(managers.map(manager => [manager.name, manager.short]));
    const groups = shownKinds.map(kind => ({
        type: kind,
        label: meetingLabel(kind),
        heading: MEETING_HEADING[kind],
        count: byKind.get(kind)!.length,
        items: byKind.get(kind)!.map(meeting => ({ id: meeting.id, manager: shortOf.get(meeting.manager ?? UNASSIGNED) ?? '', text: meetingItemText(meeting) })),
    }));

    const filled = [...new Set(counts.map(row => row.manager_name))].filter(name => managers.some(manager => manager.name === name));
    const expectsCounts = config.lines.length + config.chats.length > 0;
    const missing = expectsCounts
        ? managers.filter(manager => manager.inRoster && manager.active && !filled.includes(manager.name)).map(manager => manager.name)
        : [];

    return {
        date: input.date,
        weekday: WEEKDAYS_MN[new Date(`${input.date}T00:00:00Z`).getUTCDay()],
        title: input.title,
        managers,
        lines,
        chats: { ...chats, note: clean(input.notes.chats, DAILY_LIMITS.note) },
        meetings: { ...meetingGrid, groups, pending: input.pendingMeetings },
        filled,
        missing,
        // Мөр шилжилтийг хадгална (бусад тайлбар нэг мөрөнд).
        generalNote: (input.notes.general ?? '').trim().slice(0, DAILY_LIMITS.generalNote),
        completed: input.completed,
    };
}

/* ------------------------------------------------------------------ */
/* Текст (мессенжер/группт хуулах)                                     */
/* ------------------------------------------------------------------ */

export const reportDateLabel = (date: string) => date.replaceAll('-', '.');

/** «Зу 7, Ба 4, Но 7» — тоотой баганууд. */
function perManager(values: Record<string, number | null>, managers: readonly DailyReportManager[]): string {
    return managers.filter(manager => (values[manager.name] ?? 0) > 0).map(manager => `${manager.short} ${values[manager.name]}`).join(', ');
}
const detail = (values: Record<string, number | null>, managers: readonly DailyReportManager[]) => {
    const text = perManager(values, managers);
    return text ? ` (${text})` : '';
};
const sentence = (text: string) => (!text || /[.!?…]$/.test(text) ? text : `${text}.`);

/** Мессенжерийн бүлэгт хуулах текст — цаасан тайлангийн дарааллаар; 0 тоотой задаргааны мөр орохгүй. */
export function formatDailyReportText(report: DailyReport): string {
    const out: string[] = [];
    const { managers } = report;
    out.push(`${report.title.toLocaleUpperCase('mn')} — ${reportDateLabel(report.date)}`);
    const named = managers.filter(manager => manager.inRoster);
    if (named.length) out.push(`Менежер: ${named.map(manager => `${manager.title}${manager.phone ? ` (${formatStaffPhone(manager.phone)})` : ''}`).join(', ')}`);

    for (const line of report.lines) {
        out.push('', [`${line.label}: Нийт ${line.total} дуудлага ирсэн${detail(line.byManager, managers)}.`, sentence(line.note)].filter(Boolean).join(' '));
        if (line.categories.length) for (const row of line.rows) if (row.total > 0) out.push(`  ${row.label}: ${row.total}${detail(row.values, managers)}`);
    }
    if (report.chats.rows.length) {
        out.push('', [`Менежерийн чат: Нийт ${report.chats.total} чат харилцаа үүсгэсэн.`, sentence(report.chats.note)].filter(Boolean).join(' '));
        for (const row of report.chats.rows) if (row.total > 0) out.push(`  ${row.label}: ${row.total}${detail(row.values, managers)}`);
    }

    out.push('', `Уулзалт: ${report.meetings.total}${detail(report.meetings.byManager, managers)}`);
    for (const group of report.meetings.groups) {
        out.push(`${group.heading} - ${group.count}`);
        group.items.forEach((item, index) => out.push(`${index + 1}. ${item.text}`));
    }
    if (report.meetings.pending > 0) out.push(`(Үр дүнгээ бүртгээгүй товлосон уулзалт: ${report.meetings.pending})`);
    if (report.generalNote) out.push('', report.generalNote);
    if (report.completed?.by) out.push('', `Тайлан хийж гүйцэтгэсэн: ${report.completed.by}`);
    return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Хадгалах хүсэлт                                                    */
/* ------------------------------------------------------------------ */

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '2024-01-01';
}, 'Огноо буруу байна');
export const DailyReportDateSchema = DateSchema;

export const SaveDailyReportSchema = z.object({
    date: DateSchema,
    /** value = null бол тухайн нүдийг цэвэрлэнэ. */
    cells: z.array(z.object({
        manager: z.string().trim().min(1).max(120),
        metric: z.string().regex(DAILY_METRIC_PATTERN, 'Үзүүлэлт буруу байна'),
        value: z.number().int().min(0).max(DAILY_COUNT_MAX).nullable(),
    }).strict()).max(600).default([]),
    notes: DailyReportNotesSchema.optional(),
    /** true = «Тайлан хийж гүйцэтгэсэн» таны нэрээр; false = баталгаажуулалтыг цуцлах. */
    complete: z.boolean().optional(),
}).strict().superRefine((input, ctx) => {
    const keys = input.cells.map(cell => `${cell.manager}\u0000${cell.metric}`);
    if (keys.some((key, index) => keys.indexOf(key) !== index)) ctx.addIssue({ code: 'custom', message: 'Нэг нүдийг давхар илгээсэн байна' });
});
export type SaveDailyReportInput = z.output<typeof SaveDailyReportSchema>;
