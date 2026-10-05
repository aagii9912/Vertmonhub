'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, CalendarDays, Clock, Check, ArrowRight, MoreHorizontal, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { formatTime, formatWorkdayDate, ubDateStr, ubParts } from '@/lib/utils/date';
import { leadDisplayName, normalizeLeadName, sourceLabel } from '@/lib/leads/labels';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useMyStats, type MyStatsTask, type MyStatsLead } from '@/hooks/useMyStats';
import { useManagerActivity } from '@/hooks/useManagerActivity';
import { attainmentTone, type ManagerActivity } from '@/lib/sales/activity';
import { Panel, Progress, Avatar, Pill, GhostButton, EmptyRow, Skeleton } from '@/components/dashboard/v2/primitives';
import { useRegisterAiContext } from '@/lib/ai/context';

/**
 * «Өнөөдөр» — менежерийн эхний дэлгэц.
 * Уулзалт, залгах лид, сануулга НЭГ цагийн дараалалтай жагсаалтаар;
 * мөр бүр дээр Залгах / Дууссан / Хойшлуулах. Тоо нь хоёрдугаарт.
 */

type Filter = 'all' | 'followup' | 'viewing' | 'personal';
const TASK_SOURCES: Record<Filter, string[]> = { all: ['leads', 'viewings', 'tasks'], followup: ['leads'], viewing: ['viewings'], personal: ['tasks'] };

export function TodayDashboard({ managerName, embedded = false }: { managerName?: string | null; embedded?: boolean }) {
    const { data, isLoading, isError, error, isFetching, refetch } = useMyStats('today', managerName ?? undefined);
    useRegisterAiContext(embedded ? null : { type: 'today' });
    const qc = useQueryClient();
    const [filter, setFilter] = useState<Filter>('all');
    const [busy, setBusy] = useState<string | null>(null);

    // Таб шөнөжин нээлттэй байсан ч «өнөөдөр» шинэчлэгдэнэ (идэвхийн тайлан, бүлэглэлт УБ өдрөөр).
    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
        const tick = () => setClock(Date.now());
        const timer = setInterval(tick, 60_000);
        const refresh = () => { if (!document.hidden) tick(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    const now = useMemo(() => new Date(clock), [clock]);
    const today = ubDateStr(now);
    // «Өнөөдрийн идэвх»: хувийн горимд сервер зөвхөн өөрийн мөрийг, админы drill-in-д сонгосон менежерийг буцаана.
    const activity = useManagerActivity({ from: today, to: today, group: 'day', manager: managerName ?? null });
    const ownActivity = activity.data && (activity.data.personal || managerName)
        ? activity.data.managers.find((row) => !managerName || row.manager === managerName) ?? null
        : null;
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
        void qc.invalidateQueries({ queryKey: ['my-tasks'] });
        void qc.invalidateQueries({ queryKey: ['manager-activity'] });
        void qc.invalidateQueries({ queryKey: ['sales-kpi'] });
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
            else if (managerName || t.contactedToday) {
                // Захирал менежерийн самбарыг харж байгаа (өөрөө залгаагүй), эсвэл өнөөдөр дуудлага аль хэдийн
                // бүртгэгдсэн: зөвхөн follow-up-ийг цэвэрлэнэ — KPI-д худал/давхар дуудлага нэмэхгүй.
                await dashboardMutate(`/api/dashboard/leads/${t.id}`, 'PATCH', { next_followup_at: null });
                void qc.invalidateQueries({ queryKey: ['leads'] });
            } else {
                // Өөрийн «Залгах» ажлыг дуусгах = дуудлага: түүхэнд менежерийн нэрээр бүртгэгдэж өдрийн KPI-д тоологдоно
                // (last_contact_at, next_followup_at-г recordLeadContact хамт шинэчилнэ).
                await dashboardMutate(`/api/dashboard/leads/${t.id}/activities`, 'POST', { type: 'call', content: 'Залгасан («Өнөөдөр» жагсаалтаас)', next_followup_at: null });
                void qc.invalidateQueries({ queryKey: ['leads'] });
            }
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
            next.setTime(next.getTime() + 86_400_000);
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
    const monthLabel = `${ubParts(now).month}-р сар`;
    const todayLeads = (data?.recentLeads ?? []).filter((l) => isSameDay(new Date(l.created_at), now));

    if (!isLoading && !data) {
        return <Alert variant="danger">
            {error instanceof Error ? error.message : 'Самбарын мэдээллийг ачаалж чадсангүй.'}
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
        </Alert>;
    }

    return (
        <div className={cn('grid items-start gap-4', !embedded && 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]')}>
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
                        : formatWorkdayDate(now)
                }
                right={
                    <div className="flex flex-wrap items-center gap-1">
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
                                aria-pressed={filter === k}
                                className={cn(
                                    'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors focus-ring sm:min-h-8',
                                    filter === k ? 'border-border-strong bg-surface-2 text-foreground' : 'border-transparent text-muted-foreground hover:bg-surface-2',
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
                <TodayActivity
                    loading={activity.isPending}
                    failed={!activity.data && !activity.isPending}
                    onboarding={!!activity.data?.onboarding}
                    targetDays={activity.data?.targetDays ?? 0}
                    row={ownActivity}
                    hidden={!!activity.data && !activity.data.personal && !managerName}
                />
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
                'group flex min-h-[64px] items-center gap-3 border-b border-border px-4 py-2 transition-colors hover:bg-surface-2/70',
                task.overdue && 'bg-status-danger-soft/40',
            )}
        >
            <span className={cn('mono-label w-11 shrink-0 text-[12.5px]', task.overdue ? 'text-status-danger' : 'text-fg-2')}>
                {task.type === 'followup' && task.overdue ? '—' : formatTime(time)}
            </span>
            <Icon className={cn('h-4 w-4 shrink-0', task.overdue ? 'text-status-danger' : 'text-muted-foreground')} strokeWidth={1.75} />
            <Link href={task.href} className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{task.title}</div>
                <div className="truncate text-[12px] text-muted-foreground">{task.subtitle}</div>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
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
            <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground group-hover:hidden" />
        </div>
    );
}

function LeadRow({ lead }: { lead: MyStatsLead }) {
    const phone = lead.customer_phone?.replace(/\D/g, '') || null;
    return (
        <div className="flex min-h-[48px] items-center gap-3 border-b border-border px-3.5 py-1.5 last:border-b-0">
            <Avatar name={normalizeLeadName(lead.customer_name)} className="h-6 w-6 text-[10px]" />
            <Link href={`/dashboard/leads?lead=${lead.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{leadDisplayName(lead)}</div>
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

/** «Өнөөдрийн идэвх»: CRM-ийн дуудлага, болсон уулзалт (өдрийн зорилттой), хэтэрсэн санал хүсэлт. */
function TodayActivity({ loading, failed, onboarding, targetDays, row, hidden }: {
    loading: boolean;
    failed: boolean;
    onboarding: boolean;
    targetDays: number;
    row: ManagerActivity | null;
    hidden: boolean;
}) {
    if (hidden) return null;
    const total = row?.totals;
    const targetText = (target: number | null) => target !== null ? `/ ${target}` : targetDays === 0 ? 'ажлын бус өдөр' : 'зорилтгүй';
    return (
        <Panel
            title="Өнөөдрийн идэвх"
            right={
                <Link href="/dashboard/reports/kpi" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                    Дэлгэрэнгүй <ChevronRight className="h-3.5 w-3.5" />
                </Link>
            }
            bodyClassName="p-3.5"
        >
            {loading ? <Skeleton className="h-14" />
                : failed ? <p className="text-[12px] text-muted-foreground">Өнөөдрийн идэвхийг ачаалж чадсангүй.</p>
                    : onboarding || !total ? <p className="text-[12px] text-muted-foreground">Менежерийн бүртгэлд холбогдоогүй тул идэвх тооцогдохгүй.</p>
                        : (
                            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Өнөөдрийн идэвх">
                                <div className="flex flex-col gap-0.5">
                                    <span className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">{total.calls} <span className="text-[12px] font-normal text-muted-foreground">{targetText(total.target.calls)}</span></span>
                                    <span className="text-[11.5px] text-muted-foreground">дуудлага</span>
                                    {total.attainment.calls !== null && <Pill tone={attainmentTone(total.attainment.calls)} className="self-start">{total.attainment.calls}%</Pill>}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">{total.meetingsHeld} <span className="text-[12px] font-normal text-muted-foreground">{targetText(total.target.meetings)}</span></span>
                                    <span className="text-[11.5px] text-muted-foreground">болсон уулзалт</span>
                                    {total.attainment.meetings !== null && <Pill tone={attainmentTone(total.attainment.meetings)} className="self-start">{total.attainment.meetings}%</Pill>}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className={cn('num text-[20px] font-semibold tracking-[-0.02em]', row.openOverdue > 0 ? 'text-status-danger' : 'text-foreground')}>{row.openOverdue}</span>
                                    <span className="text-[11.5px] text-muted-foreground">хэтэрсэн санал хүсэлт</span>
                                </div>
                            </div>
                        )}
        </Panel>
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
        else if (Number(formatTime(d).slice(0, 2)) < 12) g.morning.push(t);
        else if (Number(formatTime(d).slice(0, 2)) < 17) g.afternoon.push(t);
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
    return ubDateStr(a) === ubDateStr(b);
}
function daysAgo(d: Date) {
    return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
function extractPhone(s: string): string | null {
    const m = s.match(/(\d[\d\s-]{6,}\d)/);
    return m ? m[1].replace(/\D/g, '') : null;
}
