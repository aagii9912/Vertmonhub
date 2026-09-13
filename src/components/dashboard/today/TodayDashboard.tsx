'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, CalendarDays, Clock, Check, ArrowRight, MoreHorizontal, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { sourceLabel } from '@/lib/leads/labels';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useMyStats, type MyStatsTask, type MyStatsLead } from '@/hooks/useMyStats';
import { Panel, Progress, Avatar, Pill, GhostButton, EmptyRow, Skeleton } from '@/components/dashboard/v2/primitives';
import { useRegisterAiContext } from '@/lib/ai/context';

/**
 * «Өнөөдөр» — менежерийн эхний дэлгэц.
 * Уулзалт, залгах лид, сануулга НЭГ цагийн дараалалтай жагсаалтаар;
 * мөр бүр дээр Залгах / Дууссан / Хойшлуулах. Тоо нь хоёрдугаарт.
 */

const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

type Filter = 'all' | 'followup' | 'viewing' | 'personal';
const TASK_SOURCES: Record<Filter, string[]> = { all: ['leads', 'viewings', 'tasks'], followup: ['leads'], viewing: ['viewings'], personal: ['tasks'] };

export function TodayDashboard({ managerName, embedded = false }: { managerName?: string | null; embedded?: boolean }) {
    const { data, isLoading, isError, error, isFetching, refetch } = useMyStats('today', managerName ?? undefined);
    useRegisterAiContext(embedded ? null : { type: 'today' });
    const qc = useQueryClient();
    const [filter, setFilter] = useState<Filter>('all');
    const [busy, setBusy] = useState<string | null>(null);

    const now = useMemo(() => new Date(), []);
    const tasks = data?.tasks ?? [];
    const missing = data?.missing ?? [];
    const incompleteTasks = (kind: Filter) => TASK_SOURCES[kind].some((source) => missing.includes(source));
    const missingSales = missing.includes('sales');
    const missingTargets = missing.includes('targets');
    const counts = {
        all: tasks.length,
        followup: tasks.filter((t) => t.type === 'followup').length,
        viewing: tasks.filter((t) => t.type === 'viewing').length,
        personal: tasks.filter((t) => t.type === 'personal').length,
    };
    const visible = filter === 'all' ? tasks : tasks.filter((t) => t.type === filter);
    const groups = useMemo(() => groupByDaypart(visible, now), [visible, now]);
    const overdueCount = tasks.filter((t) => t.overdue).length;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['my-stats'] });
        void qc.invalidateQueries({ queryKey: ['nav-counts'] });
    };

    async function complete(t: MyStatsTask) {
        setBusy(t.id);
        try {
            let warning: string | undefined;
            if (t.type === 'viewing') {
                const result = await dashboardMutate<{ warning?: string }>(`/api/dashboard/viewings/${t.id}`, 'PATCH', { status: 'completed' });
                warning = result.warning;
            }
            else if (t.type === 'personal') await dashboardMutate(`/api/dashboard/tasks/${t.id}`, 'PATCH', { status: 'done' });
            else await dashboardMutate(`/api/dashboard/leads/${t.id}`, 'PATCH', { next_followup_at: null, last_contact_at: new Date().toISOString() });
            if (warning) toast.warning(warning);
            else toast.success('Дууссан');
            invalidate();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа');
        } finally {
            setBusy(null);
        }
    }

    async function snooze(t: MyStatsTask) {
        setBusy(t.id);
        try {
            const next = new Date(t.dueAt);
            if (next.getTime() < now.getTime()) next.setTime(now.getTime());
            next.setDate(next.getDate() + 1);
            const iso = next.toISOString();
            let warning: string | undefined;
            if (t.type === 'viewing') {
                const result = await dashboardMutate<{ warning?: string }>(`/api/dashboard/viewings/${t.id}`, 'PATCH', { scheduled_at: iso });
                warning = result.warning;
            }
            else if (t.type === 'personal') await dashboardMutate(`/api/dashboard/tasks/${t.id}`, 'PATCH', { dueAt: iso });
            else await dashboardMutate(`/api/dashboard/leads/${t.id}`, 'PATCH', { next_followup_at: iso });
            if (warning) toast.warning(warning);
            else toast.success('Маргааш руу хойшлуулав');
            invalidate();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа');
        } finally {
            setBusy(null);
        }
    }

    const month = data?.target?.periods.month;
    const monthLabel = `${now.getMonth() + 1}-р сар`;
    const todayLeads = (data?.recentLeads ?? []).filter((l) => isSameDay(new Date(l.created_at), now));

    if (!isLoading && !data) {
        return <Alert variant="danger">
            {error instanceof Error ? error.message : 'Самбарын мэдээллийг ачаалж чадсангүй.'}
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
        </Alert>;
    }

    return (
        <div className={cn('grid gap-4', !embedded && 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]')}>
            {(isError || !!data?.missing?.length) && <Alert variant="warning" className="col-span-full">
                {isError ? 'Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.' : 'Зарим мэдээллийг ачаалж чадсангүй. Ажлын жагсаалт болон үзүүлэлтүүд дутуу байж болно.'}
                <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
            </Alert>}
            {/* ---------------- Жагсаалт ---------------- */}
            <Panel
                title="Өнөөдрийн ажил"
                sub={
                    isLoading ? undefined : overdueCount > 0
                        ? <span className="text-status-danger">{overdueCount} хугацаа хэтэрсэн</span>
                        : `${WEEKDAYS[now.getDay()]}, ${now.getMonth() + 1}-р сарын ${now.getDate()}`
                }
                right={
                    <div className="hidden items-center gap-1 sm:flex">
                        {(
                            [
                                ['all', 'Бүгд'],
                                ['followup', 'Залгах'],
                                ['viewing', 'Уулзалт'],
                                ['personal', 'Сануулга'],
                            ] as [Filter, string][]
                        ).map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setFilter(k)}
                                className={cn(
                                    'inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors focus-ring',
                                    filter === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong',
                                )}
                            >
                                {label}
                                <span className={cn('mono-label text-[11px]', filter === k ? 'text-brand' : 'text-muted-foreground')}>{incompleteTasks(k) ? '—' : counts[k]}</span>
                            </button>
                        ))}
                    </div>
                }
            >
                {isLoading ? (
                    <div className="flex flex-col gap-2 p-3.5">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                        <div className="text-[13.5px] font-medium text-foreground">{incompleteTasks(filter) ? 'Ажлын жагсаалтын мэдээлэл дутуу байна' : 'Өнөөдөр төлөвлөсөн ажил алга'}</div>
                        <p className="max-w-xs text-[12.5px] text-muted-foreground">
                            {incompleteTasks(filter) ? 'Бүрэн ачаалсны дараа өнөөдрийн ажлыг шалгана уу.' : 'Шинэ лид бүртгэх, уулзалт товлоход энд цагийн дарааллаар гарна.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => incompleteTasks(filter) ? void refetch() : openQuickCreate('lead')}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring"
                        >
                            {incompleteTasks(filter) ? 'Дахин оролдох' : <><Plus className="h-4 w-4" /> Шинэ лид</>}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {groups.map((g) => (
                            <div key={g.key}>
                                <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-3.5 py-1.5">
                                    <span className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', g.key === 'overdue' ? 'text-status-danger' : 'text-muted-foreground')}>
                                        {g.label}
                                    </span>
                                    <span className="mono-label ml-auto text-[11px] text-muted-foreground">{g.items.length}</span>
                                </div>
                                {g.items.map((t) => (
                                    <TaskRow key={`${t.type}-${t.id}`} task={t} busy={busy === t.id} onDone={() => complete(t)} onSnooze={() => snooze(t)} />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            {/* ---------------- Баруун багана ---------------- */}
            <div className="flex flex-col gap-4">
                <Panel
                    title={`Миний ${monthLabel}`}
                    right={
                        <Link href="/dashboard/reports/kpi" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                            KPI тайлан <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    }
                    bodyClassName="flex flex-col gap-4 p-3.5"
                >
                    {isLoading || !data ? (
                        <Skeleton className="h-24" />
                    ) : (
                        <>
                            <div>
                                <div className="num text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                                    {missingSales ? 'Борлуулалт түр боломжгүй' : formatMNTShort(data.kpis.salesThisMonth)}
                                </div>
                                {missingTargets || missingSales ? (
                                    <div className="text-[12px] text-muted-foreground">{missingTargets ? 'Сарын зорилтын мэдээлэл түр боломжгүй' : 'Зорилтын гүйцэтгэлийг тооцох мэдээлэл дутуу байна'}</div>
                                ) : month && month.target > 0 ? (
                                    <div className="text-[12px] text-muted-foreground">
                                        Зорилт {formatMNTShort(month.target)} ·{' '}
                                        <span className={cn('font-medium', month.actual >= month.target ? 'text-status-success' : 'text-foreground')}>
                                            {Math.round((month.actual / month.target) * 100)}%
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-[12px] text-muted-foreground">Сарын зорилт тохируулаагүй</div>
                                )}
                                {!missingTargets && !missingSales && month && month.target > 0 && <Progress value={month.actual} max={month.target} className="mt-2" />}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Stat label="идэвхтэй гэрээ" value={missing.includes('contracts') ? '—' : data.kpis.activeContracts} />
                                <Stat label="уулзалт / 7 хоног" value={missing.includes('viewings') ? '—' : data.kpis.viewingsThisWeek} />
                                <Stat label="шинэ лид" value={missing.includes('leads') ? '—' : data.kpis.newLeads} />
                            </div>
                        </>
                    )}
                </Panel>

                <Panel title="Өнөөдөр ирсэн лид" sub={isLoading ? undefined : missing.includes('leads') ? '—' : String(todayLeads.length)}>
                    {isLoading ? (
                        <div className="flex flex-col gap-2 p-3.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                    ) : todayLeads.length === 0 ? (
                        <EmptyRow>{missing.includes('leads') ? 'Өнөөдрийн лидийн мэдээлэл түр боломжгүй' : 'Өнөөдөр шинэ лид ирээгүй'}</EmptyRow>
                    ) : (
                        <div className="flex flex-col">
                            {todayLeads.slice(0, 6).map((l) => <LeadRow key={l.id} lead={l} />)}
                        </div>
                    )}
                    <div className="border-t border-border px-3.5 py-2">
                        <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                            Бүх лид <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </Panel>

                {!embedded && (
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="self-end text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                        Шинэчлэх
                    </button>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

function TaskRow({ task, busy, onDone, onSnooze }: { task: MyStatsTask; busy: boolean; onDone: () => void; onSnooze: () => void }) {
    const time = new Date(task.dueAt);
    const phone = extractPhone(task.subtitle);
    const Icon = task.type === 'viewing' ? CalendarDays : task.type === 'personal' ? Clock : Phone;
    const tone = task.type === 'viewing' ? 'info' : task.type === 'personal' ? 'pending' : 'neutral';
    const typeLabel = task.type === 'viewing' ? 'Уулзалт' : task.type === 'personal' ? 'Сануулга' : 'Залгах';

    return (
        <div
            className={cn(
                'group flex min-h-[52px] items-center gap-3 border-b border-border px-3.5 py-1.5 transition-colors hover:bg-surface-2/70',
                task.overdue && 'bg-status-danger-soft/40',
            )}
        >
            <span className={cn('mono-label w-11 shrink-0 text-[12.5px]', task.overdue ? 'text-status-danger' : 'text-fg-2')}>
                {task.type === 'followup' && task.overdue ? '—' : fmtTime(time)}
            </span>
            <Icon className={cn('h-4 w-4 shrink-0', task.overdue ? 'text-status-danger' : 'text-muted-foreground')} strokeWidth={1.75} />
            <Link href={task.href} className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{task.title}</div>
                <div className="truncate text-[12px] text-muted-foreground">{task.subtitle}</div>
            </Link>
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
                {task.overdue ? (
                    <Pill tone="danger">{daysAgo(time)} хоног</Pill>
                ) : (
                    <Pill tone={tone}>{typeLabel}</Pill>
                )}
                <div className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
                    {phone && (
                        <a href={`tel:${phone}`} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-brand hover:bg-brand-soft">
                            <Phone className="h-3.5 w-3.5" /> Залгах
                        </a>
                    )}
                    <GhostButton onClick={onDone} disabled={busy}><Check className="h-3.5 w-3.5" /> Дууссан</GhostButton>
                    <GhostButton onClick={onSnooze} disabled={busy}><ArrowRight className="h-3.5 w-3.5" /> Хойшлуулах</GhostButton>
                </div>
            </div>
            {/* Гар утас: залгах товч 44px */}
            {phone ? (
                <a href={`tel:${phone}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand active:bg-brand-soft sm:hidden" aria-label="Залгах">
                    <Phone className="h-5 w-5" />
                </a>
            ) : (
                <button type="button" onClick={onDone} disabled={busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-surface-2 sm:hidden" aria-label="Дууссан">
                    <Check className="h-5 w-5" />
                </button>
            )}
            <MoreHorizontal className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block sm:group-hover:hidden" />
        </div>
    );
}

function LeadRow({ lead }: { lead: MyStatsLead }) {
    const phone = lead.customer_phone?.replace(/\D/g, '') || null;
    return (
        <div className="flex min-h-[48px] items-center gap-3 border-b border-border px-3.5 py-1.5 last:border-b-0">
            <Avatar name={lead.customer_name} className="h-6 w-6 text-[10px]" />
            <Link href={`/dashboard/leads?lead=${lead.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{lead.customer_name || 'Нэргүй'}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                    {[lead.customer_phone, lead.source ? sourceLabel(lead.source) : null].filter(Boolean).join(' · ')}
                </div>
            </Link>
            {phone && (
                <a href={`tel:${phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-brand hover:bg-brand-soft">
                    <Phone className="h-3.5 w-3.5" /> Залгах
                </a>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">{value}</span>
            <span className="text-[11.5px] text-muted-foreground">{label}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */

function groupByDaypart(tasks: MyStatsTask[], now: Date) {
    const g: Record<'overdue' | 'morning' | 'afternoon' | 'evening', MyStatsTask[]> = { overdue: [], morning: [], afternoon: [], evening: [] };
    for (const t of tasks) {
        const d = new Date(t.dueAt);
        if (t.overdue && !isSameDay(d, now)) g.overdue.push(t);
        else if (d.getHours() < 12) g.morning.push(t);
        else if (d.getHours() < 17) g.afternoon.push(t);
        else g.evening.push(t);
    }
    return (
        [
            { key: 'overdue', label: 'Хугацаа хэтэрсэн', items: g.overdue },
            { key: 'morning', label: 'Өглөө', items: g.morning },
            { key: 'afternoon', label: 'Үдээс хойш', items: g.afternoon },
            { key: 'evening', label: 'Орой', items: g.evening },
        ] as const
    ).filter((x) => x.items.length > 0);
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtTime(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function daysAgo(d: Date) {
    return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
function extractPhone(s: string): string | null {
    const m = s.match(/(\d[\d\s-]{6,}\d)/);
    return m ? m[1].replace(/\D/g, '') : null;
}
