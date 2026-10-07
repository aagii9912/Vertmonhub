'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils/date';
import { Textarea } from '@/components/ui/Textarea';
import {
    DAILY_COUNT_MAX, DAILY_LIMITS, reportDateLabel,
    type DailyGridSection, type DailyReport, type DailyReportManager, type DailyReportNotes,
} from '@/lib/dashboard/daily-report';

export const cellKey = (manager: string, metric: string) => `${manager}\u0000${metric}`;

export interface DailyReportEditing {
    /** Засах боломжтой менежерүүд. */
    editable: ReadonlySet<string>;
    /** Нүдний ноорог (cellKey → оруулсан текст); байхгүй бол хадгалсан утга. */
    draft: Record<string, string>;
    onCell: (manager: string, metric: string, value: string) => void;
    /** Багийн тэмдэглэл (null = засах эрхгүй). */
    notes: DailyReportNotes | null;
    onNotes: (notes: DailyReportNotes) => void;
}

/**
 * «Өдрийн тайлан»-гийн баримт (дэлгэц ба хэвлэх/PDF): толгой, шугам/уулзалт/чатын менежерийн хүснэгт,
 * товч дүгнэлт, уулзалтын жагсаалт, «Тайлан хийж гүйцэтгэсэн». `editing` өгвөл тооны нүд, тэмдэглэл засагдана.
 */
export function DailyReportDocument({ report, editing }: { report: DailyReport; editing?: DailyReportEditing | null }) {
    const managers = report.managers;
    const people = managers.filter(manager => manager.inRoster);
    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-surface-2 px-5 py-4">
                <div>
                    <p className="text-xs text-muted-foreground">Өдрийн тайлан</p>
                    <h2 className="mt-1 text-xl font-semibold uppercase tracking-[0.06em]">{report.title}</h2>
                    <p className="num mt-1 text-2xl font-semibold tracking-tight">{reportDateLabel(report.date)} <span className="text-sm font-normal text-muted-foreground">· {report.weekday}</span></p>
                </div>
                {people.length > 0 && (
                    <ul className="space-y-0.5 text-right text-[13px] text-fg-2">
                        {people.map(manager => <li key={manager.name}>Менежер — {manager.title}</li>)}
                    </ul>
                )}
            </header>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="Менежерийн тоон үзүүлэлт">
                {report.lines.map(line => (
                    <CountTable key={line.key} title={line.label} caption="Дуудлага" section={line} managers={managers} editing={editing} />
                ))}
                <CountTable title="Уулзалт" caption="Системээс" section={report.meetings} managers={managers}
                    footer={<Link href="/dashboard/viewings" className="inline-flex items-center gap-1 text-brand-strong hover:underline print:hidden">Уулзалт бүртгэх<ArrowUpRight className="size-3.5" /></Link>} />
                {report.chats.rows.length > 0 && <CountTable title="Чат" caption="Менежерийн чат" section={report.chats} managers={managers} editing={editing} />}
            </section>

            <section className="space-y-3 rounded-2xl border border-border p-5" aria-label="Товч дүгнэлт">
                <dl className="divide-y divide-border">
                    {report.lines.map(line => (
                        <SummaryRow key={line.key} label={line.label} text={`Нийт ${line.total} дуудлага ирсэн.`} note={line.note}
                            edit={editing?.notes ? {
                                value: editing.notes.lines?.[line.key] ?? '',
                                onChange: value => editing.onNotes({ ...editing.notes, lines: { ...editing.notes!.lines, [line.key]: value } }),
                            } : null} />
                    ))}
                    {report.chats.rows.length > 0 && (
                        <SummaryRow label="Менежерийн чат" text={`Нийт ${report.chats.total} чат харилцаа үүсгэсэн.`} note={report.chats.note}
                            edit={editing?.notes ? { value: editing.notes.chats ?? '', onChange: value => editing.onNotes({ ...editing.notes, chats: value }) } : null} />
                    )}
                </dl>
            </section>

            <section className="space-y-4" aria-label="Уулзалт">
                <h3 className="text-lg font-semibold">Уулзалт: <span className="num">{report.meetings.total}</span></h3>
                {report.meetings.groups.map(group => (
                    <div key={group.type} className="space-y-1.5">
                        <h4 className="text-[15px] font-semibold">{group.heading} — <span className="num">{group.count}</span></h4>
                        {group.items.length > 0 ? (
                            <ol className="list-decimal space-y-1 pl-6 text-sm leading-relaxed">
                                {group.items.map(item => (
                                    <li key={item.id}>{item.text}{item.manager && managers.length > 1 && <span className="ml-1.5 text-xs text-muted-foreground">({item.manager})</span>}</li>
                                ))}
                            </ol>
                        ) : <p className="pl-1 text-sm text-muted-foreground">—</p>}
                    </div>
                ))}
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

            {report.completed && (
                <footer className="border-t border-border pt-4 text-right text-sm">
                    Тайлан хийж гүйцэтгэсэн: <span className="font-medium">{report.completed.by || '—'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatTime(report.completed.at)}</span>
                </footer>
            )}
        </div>
    );
}

function SummaryRow({ label, text, note, edit }: {
    label: string; text: string; note: string;
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

function CountTable({ title, caption, section, managers, editing, footer }: {
    title: string;
    caption: string;
    section: DailyGridSection;
    managers: readonly DailyReportManager[];
    editing?: DailyReportEditing | null;
    footer?: ReactNode;
}) {
    const showTotalRow = section.rows.length > 1;
    return (
        <div className="min-w-0 rounded-2xl border border-border">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
                <h3 className="num text-[15px] font-semibold">{title}</h3>
                <span className="text-xs text-muted-foreground">{caption}</span>
            </div>
            <div className="overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
                <table className="w-full text-[13px]">
                    <thead className="bg-surface-2 text-xs text-muted-foreground">
                        <tr>
                            <th scope="col" className="px-3 py-2 text-left font-medium"><span className="sr-only">Мөр</span></th>
                            {managers.map(manager => (
                                <th key={manager.name} scope="col" className="px-2 py-2 text-center font-medium" title={manager.name || 'Хариуцагчгүй'}>
                                    <abbr className="no-underline" title={manager.name || 'Хариуцагчгүй'}>{manager.short}</abbr>
                                </th>
                            ))}
                            <th scope="col" className="px-3 py-2 text-right font-semibold text-foreground">Нийт</th>
                        </tr>
                    </thead>
                    <tbody>
                        {section.rows.map(row => (
                            <tr key={row.key} className="border-t border-border">
                                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-fg-2">{row.label}</th>
                                {managers.map(manager => {
                                    const editable = !!editing?.editable.has(manager.name);
                                    const key = cellKey(manager.name, row.key);
                                    const saved = row.values[manager.name];
                                    return (
                                        <td key={manager.name} className="num px-1.5 py-1 text-center">
                                            {editable ? (
                                                <input type="number" inputMode="numeric" min={0} max={DAILY_COUNT_MAX} step={1}
                                                    aria-label={`${title} · ${row.label} · ${manager.name}`}
                                                    value={editing!.draft[key] ?? (saved === null ? '' : String(saved))}
                                                    onChange={event => editing!.onCell(manager.name, row.key, event.target.value)}
                                                    className="num h-8 w-14 rounded-md border border-control bg-surface px-1.5 text-center text-[13px] text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                                            ) : saved ?? ''}
                                        </td>
                                    );
                                })}
                                <td className={cn('num px-3 py-1.5 text-right', !showTotalRow && 'font-semibold')}>{row.total}</td>
                            </tr>
                        ))}
                        {showTotalRow && (
                            <tr className="border-t border-border-strong font-semibold">
                                <th scope="row" className="px-3 py-1.5 text-left">Нийт</th>
                                {managers.map(manager => <td key={manager.name} className="num px-1.5 py-1.5 text-center">{section.byManager[manager.name] || ''}</td>)}
                                <td className="num px-3 py-1.5 text-right">{section.total}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {footer && <div className="border-t border-border px-4 py-2 text-xs">{footer}</div>}
        </div>
    );
}
