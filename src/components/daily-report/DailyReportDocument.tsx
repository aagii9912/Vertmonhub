'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Plus, UserRoundPen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, ubDateStr } from '@/lib/utils/date';
import { formatStaffPhone } from '@/lib/admin/staff-profile';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { DailyReportBranding } from '@/lib/dashboard/daily-report-branding';
import {
    DAILY_COUNT_MAX, DAILY_LIMITS, formalManagerName, PHONE_LEAD_CHECK_ENABLED, phoneLeadChecks, reportDateLabel, reportPeriodLabel, UNASSIGNED,
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

/** Утасны лидийн шалгалт ноорогтой нь: засаж байхад анхааруулга шууд шинэчлэгдэнэ. Унтраалттай бол хоосон. */
export function draftPhoneLeadChecks(report: DailyReport, draft: Record<string, string> | null | undefined, enabled = PHONE_LEAD_CHECK_ENABLED): DailyPhoneLeadCheck[] {
    if (!enabled) return [];
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
 * «Өдрийн тайлан»-гийн баримт (дэлгэц, хэвлэх/PDF ба зураг): толгой, менежерийн нэг хүснэгт (мөр = менежер, багана =
 * шугам/ангилал, чат, уулзалтын төрөл, доор нь «Нийт»), уулзалтын жагсаалт, «Нэмэлт тэмдэглэл» (хоосон ч үргэлж),
 * «Тайлан хийж гүйцэтгэсэн». `editing` өгвөл
 * дуудлага, чатын нүд, нэмэлт тэмдэглэл засагдана; `forImage` — PNG/JPEG: дэлгэцийн өргөн загвартай адил, холбоосгүй.
 * Хэн оруулсны тэмдэг, уулзалтын үйлдлүүд (`meetings`) зөвхөн дэлгэцэд — хэвлэх, зураг, хуулсан текстэд орохгүй.
 * Мужийн тайланд (`report.to > report.date`) огноо нь хугацаа, уулзалтын мөр өдөртэйгээ гарна.
 * `branding` — төслийн нүүрний зураг (толгойн дэвсгэр) ба лого; зураггүй эсвэл ачаалагдаагүй бол энгийн толгой.
 */
export function DailyReportDocument({ report, editing, forImage = false, meetings, phoneCheck = PHONE_LEAD_CHECK_ENABLED, branding }: {
    report: DailyReport;
    branding?: DailyReportBranding | null;
    editing?: DailyReportEditing | null;
    forImage?: boolean;
    meetings?: DailyMeetingActions | null;
    /** «Дуудлага ба утасны лид» шалгалт (анхдагч: `PHONE_LEAD_CHECK_ENABLED`). */
    phoneCheck?: boolean;
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
    const phoneChecks = forImage ? [] : draftPhoneLeadChecks(report, editing?.draft, phoneCheck);
    return (
        <div className="space-y-6">
            <ReportHeader report={report} people={people} branding={branding ?? null} forImage={forImage} />

            <div className="space-y-2">
                <section aria-label="Менежерийн тоон үзүүлэлт">
                    <TeamTable report={report} editing={editing} showAuthors={showAuthors}
                        footer={forImage ? null : (
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground print:hidden">
                                <span>Дуудлага, чат — менежерийн оруулсан тоо · уулзалт — «Уулзалт» хуудаснаас автоматаар</span>
                                <Link href="/dashboard/viewings" className="inline-flex items-center gap-1 text-brand-strong hover:underline">Уулзалт товлох<ArrowUpRight className="size-3.5" /></Link>
                            </div>
                        )} />
                </section>
                {(phoneChecks.length > 0 || report.leads) && (
                    <section className={cn('grid items-start gap-4', forImage ? 'grid-cols-2' : 'lg:grid-cols-2 print:grid-cols-2 print:gap-3')} aria-label="Нэмэлт үзүүлэлт">
                        {phoneChecks.length > 0 && <PhoneLeadCheckTable checks={phoneChecks} managers={managers} />}
                        {report.leads && <CountTable title="Шинэ лид" caption="Системээс · эх үүсвэрээр" section={report.leads} managers={managers} />}
                    </section>
                )}
                {marked && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground print:hidden">
                        <AuthorDot />— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)
                    </p>
                )}
            </div>

            <section className="space-y-4" aria-label="Уулзалт">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="num whitespace-nowrap text-lg font-semibold">Уулзалт: {report.meetings.total}</h3>
                    {actions?.onAdd && (
                        <Button variant="secondary" size="sm" className="print:hidden" onClick={actions.onAdd}><Plus />Уулзалт нэмэх</Button>
                    )}
                </div>
                {report.meetings.groups.map(group => (
                    <div key={group.type} className="overflow-hidden rounded-2xl border border-border">
                        {/* Уулзалтгүй бүлэг нэг мөр: гарчиг дээрээ «— 0»-тэй тул хоосон жагсаалт зай эзлэхгүй. */}
                        <h4 className={cn('num flex items-center gap-2.5 whitespace-nowrap bg-surface-2 px-4 py-2 text-[15px] font-semibold', group.items.length > 0 ? 'border-b border-border' : 'text-fg-2')}>
                            <span aria-hidden className={cn('size-2 shrink-0 rounded-full [print-color-adjust:exact]', MEETING_DOT[group.type] ?? 'bg-border-strong')} />
                            {group.heading} — {group.count}
                        </h4>
                        {group.items.length > 0 ? (
                            <ol className="list-decimal space-y-1.5 py-3 pr-4 pl-10 text-sm leading-relaxed marker:text-muted-foreground">
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
                        ) : null}
                    </div>
                ))}
                {actions && report.meetings.pendingItems.length > 0 && (
                    <PendingMeetings items={report.meetings.pendingItems} actions={actions} titleOf={titleOf} />
                )}
            </section>

            {/* Тэмдэглэлгүй өдөр ч хэсэг үргэлж гарна (дэлгэц, хэвлэх, зураг) — хоосон бол «—». */}
            <section className="space-y-2" aria-label="Нэмэлт тэмдэглэл">
                <h3 className="text-[15px] font-semibold">Нэмэлт тэмдэглэл</h3>
                {editing?.notes ? (
                    <Textarea aria-label="Нэмэлт тэмдэглэл" maxLength={DAILY_LIMITS.generalNote} value={editing.notes.general ?? ''}
                        placeholder="Өдрийн онцлох мэдээ, анхаарах асуудал…" onChange={event => editing.onNotes({ ...editing.notes, general: event.target.value })} />
                ) : report.generalNote
                    ? <p className="whitespace-pre-line text-sm leading-relaxed">{report.generalNote}</p>
                    : <p className="pl-1 text-sm text-muted-foreground">—</p>}
            </section>

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

/** Уулзалтын бүлгийн гарчгийн өнгөн тэмдэг (төлөвийн өнгөнөөс). */
const MEETING_DOT: Partial<Record<string, string>> = {
    new_customer: 'bg-brand', repeat_customer: 'bg-status-info', existing_buyer: 'bg-status-success',
};

/**
 * Тайлангийн толгой. Төслийн нүүрний зурагтай бол зураг дэвсгэр болж (доороос харанхуйлсан), бичвэр цагаанаар гарна —
 * дэлгэц, хэвлэх, зурагт ижил. Зураг ачаалагдаагүй бол энгийн толгой руу шилжинэ. Лого цагаан суурьтай (тунгалаг PNG
 * харанхуй, цайвар аль ч дэвсгэрт уншигдана).
 * Зурагт (modern-screenshot) хэмжсэн өргөн/өндөр нь px-ээр тогтдог тул хамгийн урт мөр нь пикселийн зөрүүгээр доош шилжиж
 * дараагийн мөртэй давхцдаг («БАГ» огноон дээр, утасны дугаар) — зурагт толгойн текст тасрахгүй.
 */
function ReportHeader({ report, people, branding, forImage }: {
    report: DailyReport;
    people: readonly DailyReportManager[];
    branding: DailyReportBranding | null;
    forImage: boolean;
}) {
    // Ачаалагдаагүй зургийн хаяг (хаяг солигдвол дахин оролдоно).
    const [failed, setFailed] = useState<readonly string[]>([]);
    const usable = (url: string | null | undefined) => (url && !failed.includes(url) ? url : null);
    const fail = (url: string) => setFailed(current => (current.includes(url) ? current : [...current, url]));
    const cover = usable(branding?.coverUrl), logo = usable(branding?.logoUrl);
    return (
        <header data-cover={cover ? 'true' : undefined}
            className={cn('relative isolate overflow-hidden rounded-2xl border border-border', forImage && 'whitespace-nowrap',
                cover ? 'flex min-h-[220px] items-end bg-[#12151C] text-white [print-color-adjust:exact] print:min-h-[150px]' : 'bg-surface-2')}>
            {cover && <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" onError={() => fail(cover)} className="absolute inset-0 -z-10 size-full object-cover" />
                <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/50 to-black/15" />
            </>}
            <div className={cn('flex w-full flex-wrap items-end justify-between gap-4 px-5 py-4', cover && 'px-6 pt-10 pb-5')}>
                <div className="flex items-end gap-4">
                    {logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" onError={() => fail(logo)}
                            className={cn('h-16 w-auto max-w-[160px] shrink-0 rounded-xl bg-white object-contain p-2', !cover && 'border border-border')} />
                    )}
                    <div>
                        <p className={cn('text-xs', cover ? 'text-white/80' : 'text-muted-foreground')}>Өдрийн тайлан</p>
                        <h2 className="mt-1 text-xl font-semibold uppercase tracking-[0.06em]">{report.title}</h2>
                        <p className="num mt-1 text-2xl font-semibold tracking-tight">{reportPeriodLabel(report)} <span className={cn('text-sm font-normal', cover ? 'text-white/80' : 'text-muted-foreground')}>· {report.weekday}</span></p>
                    </div>
                </div>
                {people.length > 0 && (
                    <ul className={cn('space-y-0.5 text-right text-[13px]', cover ? 'text-white/90' : 'text-fg-2')}>
                        {people.map(manager => <li key={manager.name}>Менежер — {manager.title}{manager.phone && <span className="num ml-2 whitespace-nowrap">{formatStaffPhone(manager.phone)}</span>}</li>)}
                    </ul>
                )}
            </div>
        </header>
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

/** Хүснэгтийн баганын гарчиг: «Шинэ уулзалт»; бусад төрөл товч нэрээрээ (Давтан, Захиалагч, Ангилаагүй). */
const MEETING_COLUMN_LABEL: Partial<Record<string, string>> = { new_customer: 'Шинэ уулзалт' };

interface TeamColumn {
    /** Үзүүлэлт (`call.l1.new`, `chat.page`) эсвэл уулзалтын төрөл. */
    key: string;
    /** Нүдний бүтэн нэр (оролтын шошго): «Төслийн утас · Нийт», «Чат · Хувь чат». */
    name: string;
    row: DailyGridRow;
    /** Дуудлага, чат — менежерийн оруулсан тоо; уулзалт — системээс. */
    entered: boolean;
}
/** Толгойн нүд: ангилалтай шугам, олон сувагтай чат нь доороо дэд баганатай (`split`). */
interface TeamGroup { key: string; label: string; hint?: string; split: boolean; columns: TeamColumn[] }

function teamGroups(report: DailyReport): TeamGroup[] {
    const entered = (group: string, row: DailyGridRow): TeamColumn => ({ key: row.key, name: `${group} · ${row.label}`, row, entered: true });
    const [onlyChat] = report.chats.rows;
    return [
        ...report.lines.map(line => ({ key: `line.${line.key}`, label: line.label, split: line.categories.length > 0, columns: line.rows.map(row => entered(line.label, row)) })),
        ...(report.chats.rows.length ? [{
            key: 'chats', label: 'Чат', hint: report.chats.rows.length === 1 ? onlyChat.label : undefined,
            split: report.chats.rows.length > 1, columns: report.chats.rows.map(row => entered('Чат', row)),
        }] : []),
        ...report.meetings.rows.map(row => {
            const label = MEETING_COLUMN_LABEL[row.key] ?? row.label;
            return { key: `meeting.${row.key}`, label, split: false, columns: [{ key: row.key, name: label, row, entered: false }] };
        }),
    ];
}

/**
 * Менежерийн хүснэгт (багийн Excel-ийн загвар): мөр = менежер, багана = шугам (ангилалтай бол дэд баганатай), чат,
 * уулзалтын төрөл ба «Нийт уулзалт»; доод «Нийт» мөр баганын нийлбэр. Засах үед нийлбэр ноорогтой хамт шинэчлэгдэнэ.
 */
function TeamTable({ report, editing, showAuthors, footer }: {
    report: DailyReport;
    editing?: DailyReportEditing | null;
    /** Өөр хүн оруулсан нүдний тэмдэг (зураг дээр false; хэвлэхэд CSS-ээр нуугдана). */
    showAuthors: boolean;
    footer: ReactNode;
}) {
    const groups = teamGroups(report);
    const columns = groups.flatMap(group => group.columns);
    const twoRows = groups.some(group => group.split);
    const headerSpan = twoRows ? 2 : undefined;
    // «Оноогдоогүй» мөр зөвхөн хариуцагчгүй уулзалттай үед; дуудлага, чат түүнд хэзээ ч оногдохгүй.
    const managers = report.managers.filter(manager => manager.name !== UNASSIGNED || (report.meetings.byManager[UNASSIGNED] ?? 0) > 0);
    const valueOf = (manager: string, column: TeamColumn): number | null => {
        const draft = column.entered ? draftCount(editing?.draft[cellKey(manager, column.key)]) : undefined;
        return draft !== undefined ? draft : column.row.values[manager] ?? null;
    };
    // Оруулсан тооны нийт: нэг ч менежер оруулаагүй бол хоосон (тодорхойгүй, 0 биш); уулзалт системээс тул үргэлж тоо.
    const columnTotal = (column: TeamColumn): number | null => {
        if (!column.entered) return column.row.total;
        const values = managers.map(manager => valueOf(manager.name, column)).filter((value): value is number => value !== null);
        return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const head = 'border border-border px-2 py-2 text-center font-medium';
    return (
        <div className="min-w-0 rounded-2xl border border-border">
            {/* Толгой, доод мөрийн өнгө картын бөөрөнхий булангаас гарахгүй. */}
            <div className={cn('overflow-x-auto rounded-t-[15px]', !footer && 'rounded-b-[15px]')} role="region" aria-label="Менежерийн үзүүлэлт" tabIndex={0}>
                <table className="w-full border-collapse border-hidden text-[13px]">
                    <thead className="bg-surface-2 text-xs text-muted-foreground">
                        <tr>
                            <th scope="col" rowSpan={headerSpan} className={cn(head, 'w-10')}><span className="sr-only">Дугаар</span></th>
                            <th scope="col" rowSpan={headerSpan} className={cn(head, 'px-3 text-left')}>Менежер</th>
                            {groups.map(group => (group.split
                                ? <th key={group.key} scope="colgroup" colSpan={group.columns.length} className={head}>{group.label}</th>
                                : <th key={group.key} scope="col" rowSpan={headerSpan} title={group.hint} className={head}>{group.label}</th>))}
                            <th scope="col" rowSpan={headerSpan} className={cn(head, 'bg-surface-3 font-bold text-foreground')}>Нийт уулзалт</th>
                        </tr>
                        {twoRows && (
                            <tr>
                                {groups.filter(group => group.split).flatMap(group => group.columns.map(column => (
                                    <th key={column.key} scope="col" className={cn(head, 'py-1.5 font-normal')}>{column.row.label}</th>
                                )))}
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {managers.map((manager, index) => {
                            const own = !!editing?.own && editing.own === manager.name;
                            return (
                                <tr key={manager.name || 'unassigned'}>
                                    <td className="num border border-border px-2 py-1.5 text-center text-muted-foreground">{manager.name === UNASSIGNED ? '' : index + 1}</td>
                                    <th scope="row" title={own ? `${manager.title} — таны мөр` : undefined}
                                        className={cn('whitespace-nowrap border border-border px-3 py-1.5 text-left font-medium text-foreground', own && 'bg-brand-soft text-brand-strong')}>
                                        {manager.title}
                                    </th>
                                    {columns.map(column => {
                                        const editable = column.entered && !!editing?.editable.has(manager.name);
                                        const key = cellKey(manager.name, column.key);
                                        const saved = column.row.values[manager.name] ?? null;
                                        const author = showAuthors && column.entered ? column.row.authors?.[manager.name] : undefined;
                                        const other = !!author?.other;
                                        const authorText = other ? cellAuthorTitle(author!, report.date) : undefined;
                                        return (
                                            <td key={column.key} title={authorText} data-author={other ? 'other' : undefined}
                                                className={cn('num relative border border-border px-1.5 py-1 text-center', own && 'bg-brand-soft/40')}>
                                                {editable ? (
                                                    <input type="number" inputMode="numeric" min={0} max={DAILY_COUNT_MAX} step={1}
                                                        aria-label={`${column.name} · ${manager.title}`}
                                                        value={editing!.draft[key] ?? (saved === null ? '' : String(saved))}
                                                        // Танигдахгүй текст («4e») хоосон биш — хадгалахад «Тоо буруу» гэж зогсооно.
                                                        onChange={event => editing!.onCell(manager.name, column.key, event.currentTarget.validity.badInput ? '?' : event.target.value)}
                                                        className="num h-8 w-14 rounded-md border border-control bg-surface px-1.5 text-center text-[13px] text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                                                ) : saved ?? ''}
                                                {other && <><AuthorDot className="absolute top-1 right-1" /><span className="sr-only print:hidden">{authorText}</span></>}
                                            </td>
                                        );
                                    })}
                                    <td className="num border border-border bg-surface-2 px-3 py-1.5 text-center text-[15px] font-semibold text-foreground">{report.meetings.byManager[manager.name] ?? 0}</td>
                                </tr>
                            );
                        })}
                        <tr className="border-t-2 border-border-strong bg-surface-2 text-[15px] font-bold text-foreground">
                            <th scope="row" colSpan={2} className="border border-border px-3 py-2 text-left">Нийт</th>
                            {columns.map(column => <td key={column.key} className="num border border-border px-1.5 py-2 text-center">{columnTotal(column) ?? ''}</td>)}
                            <td className="num border border-border bg-surface-3 px-3 py-2 text-center text-lg">{report.meetings.total}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {footer}
        </div>
    );
}

/** «Дуудлага ба утасны лид»: менежер бүрийн бүх шугамд оруулсан дуудлага ↔ утсаар бүртгэсэн лид (зөвхөн дэлгэцэд). */
function PhoneLeadCheckTable({ checks, managers }: { checks: readonly DailyPhoneLeadCheck[]; managers: readonly DailyReportManager[] }) {
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
        <CountTable title="Дуудлага ба утасны лид" caption="Шалгалт · бүх шугам" section={section} managers={managers}
            totalRow={false} flags={flags} screenOnly
            footer={<span className="text-muted-foreground">Утсаар бүртгэсэн лид бүр дуудлагын тоонд багтсан байх ёстой — автоматаар нэмэхгүй.</span>} />
    );
}

/** Уншихад зориулсан менежерийн хүснэгт (мөр = үзүүлэлт, багана = менежер): шинэ лид, утасны лидийн шалгалт. */
function CountTable({ title, caption, section, managers, footer, totalRow = true, flags, screenOnly = false }: {
    title: string;
    caption: string;
    section: DailyGridSection;
    managers: readonly DailyReportManager[];
    footer?: ReactNode;
    /** false = багануудын «Нийт» мөргүй (мөрүүд нь нийлэхгүй утгатай үед). */
    totalRow?: boolean;
    /** cellKey → анхааруулгын тайлбар (нүд тодорч, хоосон бол «—»). */
    flags?: Record<string, string>;
    /** Зөвхөн дэлгэцэд (хэвлэхэд нуугдана). */
    screenOnly?: boolean;
}) {
    const showTotalRow = totalRow && section.rows.length > 1;
    // «Оноогдоогүй» багана зөвхөн тоотой хүснэгтэд (хариуцагчгүй лид).
    const columns = managers.filter(manager => manager.name !== UNASSIGNED || (section.byManager[UNASSIGNED] ?? 0) > 0);
    // Нэг мөртэй хүснэгтийн мөр нь өөрөө нийт дүн.
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
                                <th key={manager.name} scope="col" title={manager.title} className="px-2 py-2 text-center font-medium">
                                    <abbr className="no-underline" title={manager.title}>{manager.short}</abbr>
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
                                    const flag = flags?.[cellKey(manager.name, row.key)];
                                    return (
                                        <td key={manager.name} title={flag} data-flag={flag ? 'short' : undefined}
                                            className={cn('num px-1.5 py-1 text-center', single && 'text-[15px] font-semibold', flag && 'bg-status-pending-soft font-semibold text-status-pending')}>
                                            {row.values[manager.name] ?? (flag ? '—' : '')}
                                            {flag && <span className="sr-only">{flag}</span>}
                                        </td>
                                    );
                                })}
                                <td className={cn('num px-3 py-1.5 text-right text-foreground', single ? 'bg-surface-3 text-lg font-bold' : 'bg-surface-2 text-[15px] font-semibold')}>{row.total}</td>
                            </tr>
                        ))}
                        {showTotalRow && (
                            <tr className="border-t-2 border-border-strong bg-surface-2 text-[15px] font-bold text-foreground">
                                <th scope="row" className="px-3 py-2 text-left">Нийт</th>
                                {columns.map(manager => <td key={manager.name} className="num px-1.5 py-2 text-center">{section.byManager[manager.name] || ''}</td>)}
                                <td className="num bg-surface-3 px-3 py-2 text-right text-lg">{section.total}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {footer && <div className="border-t border-border px-4 py-2 text-xs">{footer}</div>}
        </div>
    );
}
