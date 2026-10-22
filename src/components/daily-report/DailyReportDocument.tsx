'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Plus, UserRoundPen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, ubDateStr } from '@/lib/utils/date';
import { formatStaffPhone } from '@/lib/admin/staff-profile';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import {
    DAILY_COUNT_MAX, DAILY_LIMITS, formalManagerName, phoneLeadChecks, reportDateLabel, reportPeriodLabel, UNASSIGNED,
    type DailyCellAuthor, type DailyGridRow, type DailyGridSection, type DailyMeetingItem, type DailyPendingMeeting, type DailyPhoneLeadCheck,
    type DailyReport, type DailyReportManager, type DailyReportNotes,
} from '@/lib/dashboard/daily-report';

export const cellKey = (manager: string, metric: string) => `${manager}\u0000${metric}`;

/** Нүдний ноорог → тоо: '' = цэвэрлэсэн (null); ноорог байхгүй эсвэл тоо биш бол undefined (хадгалсан утга). */
export function draftCount(raw: string | undefined): number | null | undefined {
    if (raw === undefined) return undefined;
    const text = raw.trim();
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Утасны лидийн шалгалт ноорогтой нь: засаж байхад анхааруулга шууд шинэчлэгдэнэ. */
export function draftPhoneLeadChecks(report: DailyReport, draft: Record<string, string> | null | undefined): DailyPhoneLeadCheck[] {
    return phoneLeadChecks(report, (manager, row: DailyGridRow) => {
        const value = draftCount(draft?.[cellKey(manager, row.key)]);
        return value !== undefined ? value : row.values[manager] ?? null;
    });
}

export interface DailyReportEditing {
    /** Засах боломжтой менежерүүд. */
    editable: ReadonlySet<string>;
    /** Хэрэглэгчийн өөрийн багана (тодруулна). */
    own?: string | null;
    /** Нүдний ноорог (cellKey → оруулсан текст); байхгүй бол хадгалсан утга. */
    draft: Record<string, string>;
    onCell: (manager: string, metric: string, value: string) => void;
    /** Багийн тэмдэглэл (null = засах эрхгүй). */
    notes: DailyReportNotes | null;
    onNotes: (notes: DailyReportNotes) => void;
}

/** Уулзалтын хэсгийн дэлгэцийн үйлдлүүд (хэвлэх, зурагт орохгүй). */
export interface DailyMeetingActions {
    /** «Уулзалт нэмэх» (null = эрхгүй). */
    onAdd: (() => void) | null;
    /** Товлосон уулзалтыг «Болсон» / «Ирээгүй» (null = эрхгүй). */
    onComplete: ((meeting: DailyPendingMeeting, status: 'completed' | 'no_show') => void) | null;
    /** Админ: болсон уулзалтын менежерийг солих. */
    reassign: { managers: readonly DailyReportManager[]; onChange: (item: DailyMeetingItem, manager: string) => void } | null;
    /** Хүсэлт явж буй уулзалт. */
    busy: string | null;
    /** Цаг нь болоогүй товлосон уулзалт (тэмдэглэхгүй). */
    isUpcoming: (meeting: DailyPendingMeeting) => boolean;
    /** Хариуцагчгүй/лидгүй уулзалтыг тэмдэглэх эрх (байгууллагын хэрэглэгч; менежерт сервер татгалзана). */
    completeUnassigned: boolean;
}

/** Тайлангийн өдрөөс өөр өдөр бол огноотой: «10:42» эсвэл «10.20 10:42» (УБ). */
export function changeTime(at: string, reportDate: string): string {
    const day = ubDateStr(new Date(at));
    return day === reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(day) ? formatTime(at) : `${day.slice(5).replace('-', '.')} ${formatTime(at)}`;
}

/** «Оруулсан: Б. Ариунаа · 10:42» — нүдний tooltip (тайлангийн дараа өдөр оруулсан бол огноотой). */
export function cellAuthorTitle(author: DailyCellAuthor, reportDate: string): string {
    return `Оруулсан: ${author.by || '—'}${author.at ? ` · ${changeTime(author.at, reportDate)}` : ''}`;
}

/** Өөр хүн оруулсан нүдний тэмдэг (зөвхөн дэлгэцэд). */
function AuthorDot({ className }: { className?: string }) {
    return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full bg-status-info print:hidden', className)} />;
}

/**
 * «Өдрийн тайлан»-гийн баримт (дэлгэц, хэвлэх/PDF ба зураг): толгой, шугам/уулзалт/чат/шинэ лидийн менежерийн хүснэгт,
 * товч дүгнэлт, уулзалтын жагсаалт, «Тайлан хийж гүйцэтгэсэн». `editing` өгвөл тооны нүд, тэмдэглэл засагдана;
 * `forImage` — PNG/JPEG: дэлгэцийн өргөн загвартай адил хүснэгтүүд 2 баганаар, холбоосгүй. Хэн оруулсны
 * тэмдэг, уулзалтын үйлдлүүд (`meetings`) зөвхөн дэлгэцэд — хэвлэх, зураг, хуулсан текстэд орохгүй.
 * Мужийн тайланд (`report.to > report.date`) огноо нь хугацаа, уулзалтын мөр өдөртэйгээ гарна.
 */
export function DailyReportDocument({ report, editing, forImage = false, meetings }: {
    report: DailyReport;
    editing?: DailyReportEditing | null;
    forImage?: boolean;
    meetings?: DailyMeetingActions | null;
}) {
    const managers = report.managers;
    const people = managers.filter(manager => manager.inRoster);
    const showAuthors = !forImage;
    const columns = new Set(managers.map(manager => manager.name));
    const marked = showAuthors && [...report.lines.flatMap(line => line.rows), ...report.chats.rows]
        .some(row => Object.entries(row.authors ?? {}).some(([name, author]) => author.other && columns.has(name)));
    const actions = forImage ? null : meetings ?? null;
    const titleOf = (name: string) => managers.find(manager => manager.name === name)?.title ?? (name ? formalManagerName(name) : 'Оноогдоогүй');
    // Утсаар бүртгэсэн лид дуудлагад орсон эсэх — оруулах туслах тул зөвхөн дэлгэцэд (хэвлэх, зурагт орохгүй).
    const phoneChecks = forImage ? [] : draftPhoneLeadChecks(report, editing?.draft);
    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-surface-2 px-5 py-4">
                <div>
                    <p className="text-xs text-muted-foreground">Өдрийн тайлан</p>
                    <h2 className="mt-1 text-xl font-semibold uppercase tracking-[0.06em]">{report.title}</h2>
                    <p className="num mt-1 text-2xl font-semibold tracking-tight">{reportPeriodLabel(report)} <span className="text-sm font-normal text-muted-foreground">· {report.weekday}</span></p>
                </div>
                {people.length > 0 && (
                    <ul className="space-y-0.5 text-right text-[13px] text-fg-2">
                        {people.map(manager => <li key={manager.name}>Менежер — {manager.title}{manager.phone && <span className="num ml-2">{formatStaffPhone(manager.phone)}</span>}</li>)}
                    </ul>
                )}
            </header>

            <div className="space-y-2">
                <section className={cn('grid items-start gap-4', forImage ? 'grid-cols-2' : 'lg:grid-cols-2 print:grid-cols-2 print:gap-3')} aria-label="Менежерийн тоон үзүүлэлт">
                    {report.lines.map(line => (
                        <CountTable key={line.key} title={line.label} caption="Дуудлага" section={line} managers={managers} editing={editing} showPhones={line.key === 'personal'} showAuthors={showAuthors} reportDate={report.date} />
                    ))}
                    {phoneChecks.length > 0 && <PhoneLeadCheckTable checks={phoneChecks} managers={managers} reportDate={report.date} />}
                    <CountTable title="Уулзалт" caption="Системээс" section={report.meetings} managers={managers} showAuthors={false} reportDate={report.date}
                        footer={forImage ? null : <Link href="/dashboard/viewings" className="inline-flex items-center gap-1 text-brand-strong hover:underline print:hidden">Уулзалт товлох<ArrowUpRight className="size-3.5" /></Link>} />
                    {report.chats.rows.length > 0 && <CountTable title="Чат" caption="Менежерийн чат" section={report.chats} managers={managers} editing={editing} showAuthors={showAuthors} reportDate={report.date} />}
                    <CountTable title="Шинэ лид" caption="Системээс · эх үүсвэрээр" section={report.leads} managers={managers} showAuthors={false} reportDate={report.date} />
                </section>
                {marked && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground print:hidden">
                        <AuthorDot />— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)
                    </p>
                )}
            </div>

            <section className="space-y-3 rounded-2xl border border-border p-5" aria-label="Товч дүгнэлт">
                <dl className="divide-y divide-border">
                    {report.lines.map(line => (
                        <SummaryRow key={line.key} label={line.label} text={<>Нийт <SummaryTotal value={line.total} /> дуудлага ирсэн.</>} note={line.note}
                            edit={editing?.notes ? {
                                value: editing.notes.lines?.[line.key] ?? '',
                                onChange: value => editing.onNotes({ ...editing.notes, lines: { ...editing.notes!.lines, [line.key]: value } }),
                            } : null} />
                    ))}
                    {report.chats.rows.length > 0 && (
                        <SummaryRow label="Менежерийн чат" text={<>Нийт <SummaryTotal value={report.chats.total} /> чат харилцаа үүсгэсэн.</>} note={report.chats.note}
                            edit={editing?.notes ? { value: editing.notes.chats ?? '', onChange: value => editing.onNotes({ ...editing.notes, chats: value }) } : null} />
                    )}
                    <SummaryRow label="Шинэ лид" text={<>Нийт <SummaryTotal value={report.leads.total} /> лид бүртгэгдсэн.</>} note="" edit={null} />
                </dl>
            </section>

            <section className="space-y-4" aria-label="Уулзалт">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="num whitespace-nowrap text-lg font-semibold">Уулзалт: {report.meetings.total}</h3>
                    {actions?.onAdd && (
                        <Button variant="secondary" size="sm" className="print:hidden" onClick={actions.onAdd}><Plus />Уулзалт нэмэх</Button>
                    )}
                </div>
                {report.meetings.groups.map(group => (
                    <div key={group.type} className="space-y-1.5">
                        <h4 className="num whitespace-nowrap text-[15px] font-semibold">{group.heading} — {group.count}</h4>
                        {group.items.length > 0 ? (
                            <ol className="list-decimal space-y-1 pl-6 text-sm leading-relaxed">
                                {group.items.map(item => (
                                    <li key={item.id}>
                                        {item.day && <span className="num mr-1.5 text-muted-foreground">{reportDateLabel(item.day).slice(5)}</span>}
                                        {item.text}{item.manager && managers.length > 1 && <span className="ml-1.5 text-xs text-muted-foreground" title={titleOf(item.managerName)}>({item.manager})</span>}
                                        {actions?.reassign && (
                                            <ReassignSelect item={item} managers={actions.reassign.managers} disabled={actions.busy === item.id}
                                                onChange={manager => actions.reassign!.onChange(item, manager)} />
                                        )}
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="pl-1 text-sm text-muted-foreground">—</p>}
                    </div>
                ))}
                {actions && report.meetings.pendingItems.length > 0 && (
                    <PendingMeetings items={report.meetings.pendingItems} actions={actions} titleOf={titleOf} />
                )}
            </section>

            {(editing?.notes || report.generalNote) && (
                <section className="space-y-2" aria-label="Нэмэлт тэмдэглэл">
                    <h3 className="text-[15px] font-semibold">Нэмэлт тэмдэглэл</h3>
                    {editing?.notes ? (
                        <Textarea aria-label="Нэмэлт тэмдэглэл" maxLength={DAILY_LIMITS.generalNote} value={editing.notes.general ?? ''}
                            placeholder="Өдрийн онцлох мэдээ, анхаарах асуудал…" onChange={event => editing.onNotes({ ...editing.notes, general: event.target.value })} />
                    ) : <p className="whitespace-pre-line text-sm leading-relaxed">{report.generalNote}</p>}
                </section>
            )}

            {report.completedDays !== null && (
                <footer className="border-t border-border pt-4 text-right text-sm">
                    Баталгаажсан өдөр: <span className="num font-medium">{report.completedDays}/{report.days}</span>
                </footer>
            )}
            {report.completed && (
                <footer className="border-t border-border pt-4 text-right text-sm">
                    Тайлан хийж гүйцэтгэсэн: <span className="font-medium">{report.completed.by || '—'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatTime(report.completed.at)}</span>
                </footer>
            )}
        </div>
    );
}

/** Админ: болсон уулзалтыг өөр менежерт тооцох (зөвхөн дэлгэцэд). */
function ReassignSelect({ item, managers, disabled, onChange }: {
    item: DailyMeetingItem;
    managers: readonly DailyReportManager[];
    disabled: boolean;
    onChange: (manager: string) => void;
}) {
    return (
        <Select value={item.managerName || undefined} disabled={disabled} onValueChange={value => { if (value !== item.managerName) onChange(value); }}>
            <SelectTrigger aria-label={`Менежер солих — ${item.text}`}
                className="ml-2 inline-flex h-7 w-auto gap-1 border-border px-2 align-middle text-xs text-muted-foreground print:hidden">
                <span className="inline-flex items-center gap-1"><UserRoundPen className="size-3.5" />Менежер солих</span>
            </SelectTrigger>
            <SelectContent>
                {managers.map(manager => <SelectItem key={manager.name} value={manager.name}>{manager.title}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

/** Тэр өдрийн товлосон, үр дүн бүртгээгүй уулзалт — «Болсон» / «Ирээгүй» (зөвхөн дэлгэцэд). */
function PendingMeetings({ items, actions, titleOf }: {
    items: readonly DailyPendingMeeting[];
    actions: DailyMeetingActions;
    titleOf: (name: string) => string;
}) {
    return (
        <div className="space-y-1.5 print:hidden" role="group" aria-label="Товлосон, үр дүн бүртгээгүй">
            <h4 className="text-[15px] font-semibold">Товлосон, үр дүн бүртгээгүй — <span className="num">{items.length}</span></h4>
            <ul className="divide-y divide-border rounded-xl border border-border">
                {items.map(item => {
                    const time = formatTime(item.time);
                    const upcoming = actions.isUpcoming(item);
                    const locked = !item.assigned && !actions.completeUnassigned;
                    const disabled = actions.busy !== null || upcoming || locked;
                    const reason = locked ? 'Хариуцагчгүй эсвэл лидгүй уулзалт — админ менежер оноосны дараа тэмдэглэнэ'
                        : upcoming ? 'Уулзалтын цаг болоогүй байна' : undefined;
                    return (
                        <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                            <span className="num w-11 shrink-0 text-muted-foreground">{time}</span>
                            <span className="w-14 shrink-0 truncate text-xs text-fg-2" title={titleOf(item.manager)}>{item.short}</span>
                            <span className="min-w-0 flex-1 truncate">{item.customer}</span>
                            {actions.onComplete && (
                                <span className="flex shrink-0 gap-1.5" title={reason}>
                                    <Button variant="secondary" size="sm" disabled={disabled} aria-label={`Болсон: ${item.customer} (${time})`}
                                        onClick={() => actions.onComplete!(item, 'completed')}><Check />Болсон</Button>
                                    <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Ирээгүй: ${item.customer} (${time})`}
                                        onClick={() => actions.onComplete!(item, 'no_show')}><X />Ирээгүй</Button>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Товч дүгнэлтийн нийт тоо — өгүүлбэр дундаас шууд харагдахаар тод. */
function SummaryTotal({ value }: { value: number }) {
    return <strong className="num text-[15px] font-bold">{value}</strong>;
}

function SummaryRow({ label, text, note, edit }: {
    label: string; text: ReactNode; note: string;
    edit: { value: string; onChange: (value: string) => void } | null;
}) {
    return (
        <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-semibold">{label}</dt>
            <dd className="text-sm leading-relaxed">
                {text}{!edit && note ? ` ${note}` : ''}
                {edit && (
                    <input aria-label={`${label} — тайлбар`} maxLength={DAILY_LIMITS.note} value={edit.value} onChange={event => edit.onChange(event.target.value)}
                        placeholder="Тайлбар (жишээ: Төслийн ерөнхий мэдээлэл авсан)"
                        className="mt-1.5 h-9 w-full rounded-lg border border-control bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground" />
                )}
            </dd>
        </div>
    );
}

/** «Дуудлага ба утасны лид»: менежер бүрийн бүх шугамд оруулсан дуудлага ↔ утсаар бүртгэсэн лид (зөвхөн дэлгэцэд). */
function PhoneLeadCheckTable({ checks, managers, reportDate }: { checks: readonly DailyPhoneLeadCheck[]; managers: readonly DailyReportManager[]; reportDate: string }) {
    const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const section: DailyGridSection = {
        rows: [
            { key: 'calls', label: 'Оруулсан дуудлага', values: Object.fromEntries(checks.map(check => [check.manager, check.calls])), total: sum(checks.map(check => check.calls)) },
            { key: 'phone', label: 'Утсаар бүртгэсэн лид', values: Object.fromEntries(checks.map(check => [check.manager, check.leads || null])), total: sum(checks.map(check => check.leads)) },
        ],
        total: 0,
        byManager: {},
    };
    const flags = Object.fromEntries(checks.filter(check => check.short).map(check => [cellKey(check.manager, 'calls'), check.calls === null
        ? `Утсаар ${check.leads} лид бүртгэсэн ч дуудлагын тоо оруулаагүй`
        : `Утсаар ${check.leads} лид бүртгэсэн ч бүх шугамд ${check.calls} дуудлага оруулсан`]));
    return (
        <CountTable title="Дуудлага ба утасны лид" caption="Шалгалт · бүх шугам" section={section} managers={managers} showAuthors={false} reportDate={reportDate}
            totalRow={false} flags={flags} screenOnly
            footer={<span className="text-muted-foreground">Утсаар бүртгэсэн лид бүр дуудлагын тоонд багтсан байх ёстой — автоматаар нэмэхгүй.</span>} />
    );
}

function CountTable({ title, caption, section, managers, editing, footer, showPhones = false, showAuthors, reportDate, totalRow = true, flags, screenOnly = false }: {
    title: string;
    caption: string;
    section: DailyGridSection;
    managers: readonly DailyReportManager[];
    editing?: DailyReportEditing | null;
    footer?: ReactNode;
    showPhones?: boolean;
    /** Өөр хүн оруулсан нүдний тэмдэг (зураг дээр false; хэвлэхэд CSS-ээр нуугдана). */
    showAuthors: boolean;
    reportDate: string;
    /** false = багануудын «Нийт» мөргүй (мөрүүд нь нийлэхгүй утгатай үед). */
    totalRow?: boolean;
    /** cellKey → анхааруулгын тайлбар (нүд тодорч, хоосон бол «—»). */
    flags?: Record<string, string>;
    /** Зөвхөн дэлгэцэд (хэвлэхэд нуугдана). */
    screenOnly?: boolean;
}) {
    const showTotalRow = totalRow && section.rows.length > 1;
    // «Оноогдоогүй» багана зөвхөн тоотой хүснэгтэд (хариуцагчгүй лид/уулзалт); дуудлага, чатад хэзээ ч хоосон.
    const columns = managers.filter(manager => manager.name !== UNASSIGNED || (section.byManager[UNASSIGNED] ?? 0) > 0);
    // Засах үед нийлбэр ноорогтой хамт шинэчлэгдэнэ (хадгалаагүй ч харагдана).
    const valueOf = (manager: string, row: DailyGridSection['rows'][number]): number | null => {
        const draft = draftCount(editing?.draft[cellKey(manager, row.key)]);
        return draft !== undefined ? draft : row.values[manager] ?? null;
    };
    const rowTotal = (row: DailyGridSection['rows'][number]) => editing ? columns.reduce((sum, manager) => sum + (valueOf(manager.name, row) ?? 0), 0) : row.total;
    const managerTotal = (manager: string) => editing ? section.rows.reduce((sum, row) => sum + (valueOf(manager, row) ?? 0), 0) : section.byManager[manager];
    const total = editing ? section.rows.reduce((sum, row) => sum + rowTotal(row), 0) : section.total;
    const isOwn = (manager: DailyReportManager) => !!editing?.own && editing.own === manager.name;
    // Нэг мөртэй хүснэгтийн мөр нь өөрөө нийт дүн (Mandala-гийн ангилалгүй шугам).
    const single = section.rows.length === 1;
    return (
        <div className={cn('min-w-0 rounded-2xl border border-border', screenOnly && 'print:hidden')}>
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
                <h3 className="num text-[15px] font-semibold">{title}</h3>
                <span className="text-xs text-muted-foreground">{caption}</span>
            </div>
            {/* Доод мөрийн өнгө картын бөөрөнхий булангаас гарахгүй (хөлгүй үед). */}
            <div className={cn('overflow-x-auto', !footer && 'rounded-b-[15px]')} role="region" aria-label={title} tabIndex={0}>
                <table className="w-full text-[13px]">
                    <thead className="bg-surface-2 text-xs text-muted-foreground">
                        <tr>
                            <th scope="col" className="px-3 py-2 text-left font-medium"><span className="sr-only">Мөр</span></th>
                            {columns.map(manager => (
                                <th key={manager.name} scope="col" title={isOwn(manager) ? `${manager.title} — таны багана` : manager.title}
                                    className={cn('px-2 py-2 text-center font-medium', isOwn(manager) && 'bg-brand-soft text-brand-strong')}>
                                    <abbr className="no-underline" title={manager.title}>{manager.short}</abbr>
                                    {showPhones && <span className="num mt-0.5 block whitespace-nowrap font-normal">{formatStaffPhone(manager.phone) || '—'}</span>}
                                </th>
                            ))}
                            <th scope="col" className="bg-surface-3 px-3 py-2 text-right text-[13px] font-bold text-foreground">Нийт</th>
                        </tr>
                    </thead>
                    <tbody>
                        {section.rows.map(row => (
                            <tr key={row.key} className="border-t border-border">
                                <th scope="row" className={cn('whitespace-nowrap px-3 py-1.5 text-left', single ? 'text-[15px] font-bold text-foreground' : 'font-normal text-fg-2')}>{row.label}</th>
                                {columns.map(manager => {
                                    const editable = !!editing?.editable.has(manager.name);
                                    const key = cellKey(manager.name, row.key);
                                    const saved = row.values[manager.name];
                                    const author = showAuthors ? row.authors?.[manager.name] : undefined;
                                    const other = !!author?.other;
                                    const authorText = other ? cellAuthorTitle(author!, reportDate) : undefined;
                                    const flag = flags?.[key];
                                    return (
                                        <td key={manager.name} title={flag ?? authorText}
                                            data-author={other ? 'other' : undefined} data-flag={flag ? 'short' : undefined}
                                            className={cn('num relative px-1.5 py-1 text-center', isOwn(manager) && 'bg-brand-soft/40', single && 'text-[15px] font-semibold',
                                                flag && 'bg-status-pending-soft font-semibold text-status-pending')}>
                                            {editable ? (
                                                <input type="number" inputMode="numeric" min={0} max={DAILY_COUNT_MAX} step={1}
                                                    aria-label={`${title} · ${row.label} · ${manager.title}`}
                                                    value={editing!.draft[key] ?? (saved === null ? '' : String(saved))}
                                                    // Танигдахгүй текст («4e») хоосон биш — хадгалахад «Тоо буруу» гэж зогсооно.
                                                    onChange={event => editing!.onCell(manager.name, row.key, event.currentTarget.validity.badInput ? '?' : event.target.value)}
                                                    className="num h-8 w-14 rounded-md border border-control bg-surface px-1.5 text-center text-[13px] text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                                            ) : saved ?? (flag ? '—' : '')}
                                            {flag && <span className="sr-only">{flag}</span>}
                                            {other && <><AuthorDot className="absolute top-1 right-1" /><span className="sr-only print:hidden">{authorText}</span></>}
                                        </td>
                                    );
                                })}
                                <td className={cn('num px-3 py-1.5 text-right text-foreground', single ? 'bg-surface-3 text-lg font-bold' : 'bg-surface-2 text-[15px] font-semibold')}>{rowTotal(row)}</td>
                            </tr>
                        ))}
                        {showTotalRow && (
                            <tr className="border-t-2 border-border-strong bg-surface-2 text-[15px] font-bold text-foreground">
                                <th scope="row" className="px-3 py-2 text-left">Нийт</th>
                                {columns.map(manager => <td key={manager.name} className="num px-1.5 py-2 text-center">{managerTotal(manager.name) || ''}</td>)}
                                <td className="num bg-surface-3 px-3 py-2 text-right text-lg">{total}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {footer && <div className="border-t border-border px-4 py-2 text-xs">{footer}</div>}
        </div>
    );
}
