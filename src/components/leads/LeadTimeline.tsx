'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { formatShortDate, formatTime } from '@/lib/utils/date';
import { ACTIVITY_LABEL, TIMELINE_CONFLICT_LABEL, sourceLabel, statusLabel, statusTone } from '@/lib/leads/labels';
import type { LeadTimeline as LeadTimelineData, TimelineEvent, TimelineManager } from '@/lib/leads/timeline';
import type { LeadDetail } from '@/hooks/useLeads';
import { Avatar, Pill } from '@/components/dashboard/v2/primitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';

/**
 * Лидийн «Түүх» — менежерүүдийн Time-line (сервер `timeline`, lib/leads/timeline.ts):
 * зөрчлийн сануулга, холбогдсон менежерүүдийн товчоо, менежерээр шүүх, дарааллаар үйлдлүүд.
 * `timeline` ирээгүй (хуучин сервер/fixture, алдаа) бол өмнөх энгийн түүхийг харуулна.
 */
export function LeadTimeline({ detail, onOpenLead }: { detail: LeadDetail; onOpenLead?: (id: string) => void }) {
    const timeline = detail.timeline;
    if (!timeline) return <LegacyTimeline detail={detail} />;
    return <ManagerTimeline timeline={timeline} onOpenLead={onOpenLead} />;
}

function ManagerTimeline({ timeline, onOpenLead }: { timeline: LeadTimelineData; onOpenLead?: (id: string) => void }) {
    const [selected, setFilter] = useState<string | null>(null);
    // Товчоонд байхгүй менежерээр шүүхгүй (өгөгдөл шинэчлэгдсэн / өөр лид) — «Түүх 0» болж гацахгүй.
    const filter = selected && timeline.managers.some((m) => m.name === selected) ? selected : null;
    const showFilter = timeline.managers.length > 1 || !!filter;
    const events = useMemo(() => {
        if (!filter) return timeline.events;
        return timeline.events.filter((e) => e.manager === filter || e.actor === filter
            || (e.ownerChange && (e.ownerChange.from === filter || e.ownerChange.to === filter)));
    }, [timeline.events, filter]);
    const duplicates = timeline.duplicates;
    const duplicateWarned = timeline.conflicts.some((c) => c.kind === 'duplicate_phone');

    return (
        <div className="flex flex-col gap-3">
            {timeline.conflicts.length > 0 && (
                <div className="flex flex-col gap-2" aria-label="Менежерүүдийн зөрчил">
                    {timeline.conflicts.map((c, i) => (
                        <Alert key={`${c.kind}-${i}`} variant="warning" role="status" aria-live="polite" className="p-2.5 text-[12.5px]">
                            <AlertTitle className="text-[12.5px]">{TIMELINE_CONFLICT_LABEL[c.kind] ?? c.kind}</AlertTitle>
                            <AlertDescription className="text-[12px]">{c.message}</AlertDescription>
                        </Alert>
                    ))}
                </div>
            )}

            {duplicates && duplicates.count > 0 && (duplicates.leads.length > 0 ? (
                <section aria-label="Ижил утастай лид" className="rounded-md border border-border">
                    <div className="border-b border-border px-3 py-1.5 text-[12px] font-medium text-fg-2">
                        Ижил утастай лид <span className="num text-muted-foreground">{duplicates.count}{duplicates.truncated ? '+' : ''}</span>
                    </div>
                    <ul className="divide-y divide-border">
                        {duplicates.leads.slice(0, 5).map((d) => {
                            const body = (
                                <>
                                    <span className={cn('min-w-0 truncate text-[12.5px]', d.anonymous ? 'text-muted-foreground' : 'text-foreground')}>{d.name}</span>
                                    <span className="truncate text-[12px] text-fg-2">{d.sales_manager_name ?? 'Хуваарилаагүй'}</span>
                                    <Pill tone={statusTone(d.status)} className="ml-auto">{statusLabel(d.status)}</Pill>
                                </>
                            );
                            return (
                                <li key={d.id}>
                                    {onOpenLead ? (
                                        <button type="button" onClick={() => onOpenLead(d.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2 focus-ring">{body}</button>
                                    ) : (
                                        <a href={`/dashboard/leads?lead=${encodeURIComponent(d.id)}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2 focus-ring">{body}</a>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : !duplicateWarned && (
                <p className="text-[12px] text-muted-foreground">Энэ утсаар өөр {duplicates.truncated ? 'дор хаяж ' : ''}<span className="num">{duplicates.count}</span> лид бүртгэлтэй.</p>
            ))}

            {timeline.managers.length > 0 && (
                <section aria-label="Холбогдсон менежерүүд">
                    <div className="mb-1.5 text-[12px] font-medium text-fg-2">Холбогдсон менежерүүд</div>
                    <ul className="flex flex-col gap-1.5">
                        {timeline.managers.map((m) => <ManagerRow key={m.name} manager={m} />)}
                    </ul>
                </section>
            )}

            {showFilter && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Менежерээр шүүх">
                    <FilterChip active={!filter} onClick={() => setFilter(null)}>Бүгд</FilterChip>
                    {timeline.managers.map((m) => (
                        <FilterChip key={m.name} active={filter === m.name} onClick={() => setFilter(filter === m.name ? null : m.name)}>{m.name}</FilterChip>
                    ))}
                </div>
            )}

            <div>
                <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
                    Түүх <span className="mono-label text-[11px] font-normal text-muted-foreground">{events.length}</span>
                </div>
                <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                    {events.map((e, i) => <EventItem key={e.id} event={e} latest={i === 0} />)}
                </ol>
            </div>
        </div>
    );
}

function ManagerRow({ manager: m }: { manager: TimelineManager }) {
    return (
        <li className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
            <Avatar name={m.name} className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-foreground">{m.name}</span>
                    {m.isOwner && <Pill tone="info">Хариуцагч</Pill>}
                    {!m.isActive && <Pill tone="neutral">Идэвхгүй</Pill>}
                </div>
                <div className="mono-label text-[11px] text-muted-foreground">
                    {m.firstAt ? `Анх ${formatShortDate(m.firstAt)} · Сүүлд ${formatShortDate(m.lastAt ?? m.firstAt)}` : 'Холбоо бүртгээгүй'}
                </div>
                {m.lastQuote && (
                    <div className="text-[11.5px] text-fg-2">
                        Сүүлийн санал: <span className="num font-medium text-foreground">{formatMNT(m.lastQuote.amount)}</span>
                        {m.lastQuote.unitLabel ? ` · ${m.lastQuote.unitLabel}` : ''}
                    </div>
                )}
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-x-2.5 text-center">
                <Count label="Залгасан" value={m.calls} />
                <Count label="Уулзалт" value={m.meetings} />
                <Count label="Санал" value={m.quotes} />
            </dl>
        </li>
    );
}

function Count({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <dt className="text-[10.5px] text-muted-foreground">{label}</dt>
            <dd className="num text-[12.5px] font-medium text-foreground">{value}</dd>
        </div>
    );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" aria-pressed={active} onClick={onClick}
            className={cn('h-6 rounded-md border px-2 text-[11.5px] focus-ring', active ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong')}>
            {children}
        </button>
    );
}

function EventItem({ event: e, latest }: { event: TimelineEvent; latest: boolean }) {
    const when = `${formatShortDate(e.at)}${e.dateOnly ? '' : ` ${formatTime(e.at)}`}`;
    if (e.ownerChange) {
        return (
            <li className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-border-strong bg-surface" />
                <div className="flex items-center gap-2 text-[11.5px] text-fg-2">
                    <span className="font-medium text-foreground">Хариуцагч:</span>
                    <span>{e.ownerChange.from ?? '—'}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden /><span className="sr-only">→</span>
                    <span className="font-medium text-foreground">{e.ownerChange.to ?? '—'}</span>
                    <span className="h-px flex-1 bg-border" />
                </div>
                <div className="mono-label text-[11px] text-muted-foreground">{when}{e.actor ? ` · ${e.actor}` : ''}</div>
            </li>
        );
    }
    return (
        <li className="relative">
            <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', latest ? 'bg-brand' : 'bg-border-strong')} />
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mono-label text-[11px] text-muted-foreground">{when}</span>
                {e.actor && <span className="text-[11.5px] font-medium text-fg-2">{e.actor}</span>}
                {e.offOwner && <Pill tone="pending">Хариуцагч биш</Pill>}
            </div>
            {e.kind === 'quote' && e.amount !== null ? (
                <div className="text-[13px] text-foreground">
                    {ACTIVITY_LABEL.quote} · <span className="num font-medium">{formatMNT(e.amount)}</span>{e.unitLabel ? ` · ${e.unitLabel}` : ''}
                </div>
            ) : (
                <div className="text-[13px] text-foreground">{e.title}</div>
            )}
            {e.detail && <div className="text-[12px] text-muted-foreground">{e.detail}</div>}
            {e.kind === 'meeting' && e.scheduledAt && (
                <div className="mono-label text-[11px] text-muted-foreground">Товлосон: {formatShortDate(e.scheduledAt)} {formatTime(e.scheduledAt)}</div>
            )}
        </li>
    );
}

/** Сервер `timeline` өгөөгүй үеийн энгийн түүх (үйлдэл, уулзалт, гэрээ, үүссэн огноо). */
function LegacyTimeline({ detail }: { detail: LeadDetail }) {
    const items = useMemo(() => {
        const list: { at: string; kind: string; title: string; sub?: string; by?: string | null }[] = [];
        for (const a of detail.activities) {
            list.push({ at: a.created_at, kind: a.type, title: a.type === 'note' || a.type === 'call' ? a.content || '' : `${ACTIVITY_LABEL[a.type] ?? a.type}: ${a.content ?? ''}`, by: a.created_by_name });
        }
        for (const v of detail.viewings) {
            list.push({ at: v.scheduled_at, kind: 'meeting', title: `Уулзалт ${v.status === 'completed' ? 'болов' : v.status === 'cancelled' ? 'цуцлагдав' : v.status === 'no_show' ? '— ирээгүй' : 'товлов'}`, sub: [formatTime(v.scheduled_at), v.property_name].filter(Boolean).join(' · '), by: v.sales_manager_name });
        }
        for (const c of detail.contracts) {
            if (c.contract_date) list.push({ at: c.contract_date, kind: 'contract', title: `Гэрээ ${c.contract_number || ''}`.trim(), sub: c.total_price ? formatMNT(c.total_price) : undefined });
        }
        list.push({ at: detail.lead.created_at, kind: 'system', title: 'Лид үүсгэв', sub: sourceLabel(detail.lead.source) });
        return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [detail]);
    return (
        <div>
            <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-foreground">Түүх <span className="mono-label text-[11px] font-normal text-muted-foreground">{items.length}</span></div>
            <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                {items.map((t, i) => (
                    <li key={`${t.kind}-${t.at}-${i}`} className="relative">
                        <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', i === 0 ? 'bg-brand' : 'bg-border-strong')} />
                        <div className="mono-label text-[11px] text-muted-foreground">{formatShortDate(t.at)} {t.kind === 'meeting' ? '' : formatTime(t.at)}{t.by ? ` · ${t.by}` : ''}</div>
                        <div className="text-[13px] text-foreground">{t.title}</div>
                        {t.sub && <div className="text-[12px] text-muted-foreground">{t.sub}</div>}
                    </li>
                ))}
            </ol>
        </div>
    );
}
