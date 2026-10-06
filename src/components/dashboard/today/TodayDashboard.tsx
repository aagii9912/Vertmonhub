'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, CalendarDays, Clock, Check, ArrowRight, ChevronRight, Plus, ListChecks, Redo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { formatTime, ubDateStr, ubParts } from '@/lib/utils/date';
import { leadDisplayName, normalizeLeadName, sourceLabel } from '@/lib/leads/labels';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useMyStats, type MyStatsData, type MyStatsTask, type MyStatsLead } from '@/hooks/useMyStats';
import { useManagerActivity } from '@/hooks/useManagerActivity';
import { attainmentTone, type ManagerActivity } from '@/lib/sales/activity';
import { Panel, Skeleton } from '@/components/dashboard/v2/primitives';
import { useRegisterAiContext } from '@/lib/ai/context';
import { LeadComposer } from '@/components/leads/LeadComposer';
import { AiPromptCard, Meter, TodayHeader, WeeklyMeetingCard } from './parts';

/**
 * «Өнөөдөр» — менежерийн эхний дэлгэц. Дараагийн ажил эхэнд: уулзалт, залгах лид, сануулга
 * НЭГ цагийн дараалалтай жагсаалтаар. «Дууссан» нь үр дүн ба дараагийн алхмыг нэг дор асууна
 * (Харилцагчийн карттай ижил composer); тоо, зорилт баруун баганад.
 */

type Filter = 'all' | 'followup' | 'viewing' | 'personal';
const TASK_SOURCES: Record<Filter, string[]> = { all: ['leads', 'viewings', 'tasks'], followup: ['leads'], viewing: ['viewings'], personal: ['tasks'] };
const FILTERS: [Filter, string][] = [['all', 'Бүгд'], ['followup', 'Залгах'], ['viewing', 'Уулзалт'], ['personal', 'Сануулга']];
const AI_SUGGESTIONS: [string, string][] = [
    ['Өдрийн ажлаа эрэмбэлэх', 'Миний өнөөдрийн ажлыг шалгаад хамгийн чухал 3 ажлыг эрэмбэлж өг.'],
    ['Дуудлага бүртгэх', 'Лидтэй ярьсан дуудлага, үр дүн, дараагийн холбогдох хугацааг бүртгэхэд туслаач.'],
];

export function TodayDashboard({ managerName, embedded = false }: { managerName?: string | null; embedded?: boolean }) {
    const { data, isLoading, isError, error, isFetching, refetch } = useMyStats('today', managerName ?? undefined);
    useRegisterAiContext(embedded ? null : { type: 'today' });
    const qc = useQueryClient();
    const [filter, setFilter] = useState<Filter>('all');
    const [busy, setBusy] = useState<string | null>(null);
    // «Дууссан» дарсан ажлын үр дүнгийн форм (нэг удаад нэг).
    const [finishing, setFinishing] = useState<string | null>(null);

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
    const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
    const missing = data?.missing ?? [];
    const incompleteTasks = (kind: Filter) => TASK_SOURCES[kind].some((source) => missing.includes(source));
    const counts = data?.taskCounts ?? {
        all: tasks.length,
        followup: tasks.filter((t) => t.type === 'followup').length,
        viewing: tasks.filter((t) => t.type === 'viewing').length,
        personal: tasks.filter((t) => t.type === 'personal').length,
        overdue: tasks.filter((t) => t.overdue).length,
    };
    const visible = filter === 'all' ? tasks : tasks.filter((t) => t.type === filter);
    const groups = useMemo(() => groupByDaypart(visible, now), [visible, now]);
    const hidden = counts[filter] - visible.length;
    // Таслагдсан ажлын үлдсэнийг бүрэн жагсаалтаас: сануулга → Миний ажлууд, уулзалт → Уулзалт, бусад → лид (дараагийн алхмаар).
    const more = filter === 'personal' ? { href: '/dashboard/tasks', label: 'Миний ажлууд' }
        : filter === 'viewing' ? { href: '/dashboard/viewings', label: 'Уулзалт' }
            : { href: `/dashboard/leads?${managerName ? `manager=${encodeURIComponent(managerName)}` : 'view=mine'}&sort=next_followup_at&dir=asc`, label: managerName ? `${managerName}-ийн лид` : 'Миний лид' };

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['my-stats'] });
        void qc.invalidateQueries({ queryKey: ['nav-counts'] });
        void qc.invalidateQueries({ queryKey: ['my-tasks'] });
        void qc.invalidateQueries({ queryKey: ['manager-activity'] });
        void qc.invalidateQueries({ queryKey: ['sales-kpi'] });
    };

    // Шууд дуусгах: хувийн сануулга, эсвэл захирал менежерийн самбарыг харж байгаа (өөрөө залгаагүй) —
    // follow-up-ийг цэвэрлэж, уулзалтыг болсон гэж тэмдэглэнэ; KPI-д худал дуудлага нэмэхгүй.
    async function completeNow(t: MyStatsTask) {
        setBusy(t.id);
        try {
            let warning: string | undefined;
            if (t.type === 'viewing') {
                const result = await dashboardMutate<{ warning?: string }>(`/api/dashboard/viewings/${t.id}`, 'PATCH', { status: 'completed' });
                warning = result.warning;
            } else if (t.type === 'personal') await dashboardMutate(`/api/dashboard/tasks/${t.id}`, 'PATCH', { status: 'done' });
            else {
                await dashboardMutate(`/api/dashboard/leads/${t.id}`, 'PATCH', { next_followup_at: null });
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

    function finish(t: MyStatsTask) {
        // Өөрийн залгах/уулзалтын ажил: үр дүн + дараагийн алхмыг асууна (картын «Дууссан»-тай ижил).
        if (!managerName && t.type !== 'personal') setFinishing(`${t.type}-${t.id}`);
        else void completeNow(t);
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
            } else if (t.type === 'personal') await dashboardMutate(`/api/dashboard/tasks/${t.id}`, 'PATCH', { dueAt: iso });
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

    const header = !embedded && (
        <TodayHeader
            sub={isLoading || !data || incompleteTasks('all') ? undefined
                : counts.all === 0
                    ? 'Өнөөдөр товлосон ажил байхгүй'
                    : <>Өнөөдөр <b className="num font-semibold text-foreground">{counts.all}</b> ажил{counts.overdue > 0 && <> · <span className="text-status-danger">{counts.overdue} хугацаа хэтэрсэн</span></>}</>}
            actions={<>
                <Button size="sm" variant="ghost" href="/dashboard/tasks"><ListChecks />Миний ажлууд</Button>
                <Button size="sm" variant="secondary" onClick={() => openQuickCreate('task')}><Plus />Ажил нэмэх</Button>
            </>}
        />
    );

    if (!isLoading && !data) {
        return <>
            {header}
            <Alert variant="danger">
                {error instanceof Error ? error.message : 'Самбарын мэдээллийг ачаалж чадсангүй.'}
                <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
            </Alert>
        </>;
    }

    return (
        <>
            {header}
            <div className={cn('grid items-start gap-5', !embedded && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
                {(isError || !!data?.missing?.length) && <Alert variant="warning" className="col-span-full">
                    {isError ? 'Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.' : 'Зарим мэдээллийг ачаалж чадсангүй. Ажлын жагсаалт болон үзүүлэлтүүд дутуу байж болно.'}
                    <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>}

                <div className="flex min-w-0 flex-col gap-5">
                    <Panel
                        title="Дараагийн ажил"
                        right={
                            <div role="group" aria-label="Ажлын төрөл" className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
                                {FILTERS.map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setFilter(key)}
                                        aria-pressed={filter === key}
                                        className={cn(
                                            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                                            filter === key ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {label}
                                        <span className={cn('num', filter === key ? 'text-brand-strong' : 'text-muted-foreground')}>{incompleteTasks(key) ? '—' : counts[key]}</span>
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        {isLoading ? (
                            <div className="flex flex-col gap-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                        ) : visible.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                                <div className="text-sm font-medium text-foreground">{incompleteTasks(filter) ? 'Ажлын жагсаалтын мэдээлэл дутуу байна' : 'Өнөөдөр төлөвлөсөн ажил алга'}</div>
                                <p className="max-w-xs text-xs text-muted-foreground">
                                    {incompleteTasks(filter) ? 'Бүрэн ачаалсны дараа өнөөдрийн ажлыг шалгана уу.' : 'Шинэ лид бүртгэх, уулзалт товлоход энд цагийн дарааллаар гарна.'}
                                </p>
                                {incompleteTasks(filter)
                                    ? <Button size="sm" variant="secondary" onClick={() => void refetch()}>Дахин оролдох</Button>
                                    : <Button size="sm" onClick={() => openQuickCreate('lead')}><Plus />Шинэ лид</Button>}
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {groups.map((g) => (
                                    <section key={g.key} aria-label={g.label}>
                                        <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-1.5">
                                            <h3 className={cn('text-xs font-semibold', g.key === 'overdue' ? 'text-status-danger' : 'text-muted-foreground')}>{g.label}</h3>
                                            <span className="num ml-auto text-xs text-muted-foreground">{g.items.length}</span>
                                        </div>
                                        {g.items.map((t) => {
                                            const key = `${t.type}-${t.id}`;
                                            return (
                                                <TaskRow
                                                    key={key}
                                                    task={t}
                                                    now={now}
                                                    busy={busy === t.id}
                                                    finishing={finishing === key}
                                                    onDone={() => finish(t)}
                                                    onSnooze={() => void snooze(t)}
                                                    onFinished={() => setFinishing(null)}
                                                />
                                            );
                                        })}
                                    </section>
                                ))}
                                {hidden > 0 && (
                                    <Link href={more.href} className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">
                                        <span>Өөр <b className="num font-semibold text-foreground">{hidden}</b> ажил байна</span>
                                        <span className="inline-flex items-center gap-1 font-medium text-brand-strong">{more.label} <ArrowRight className="size-3.5" aria-hidden /></span>
                                    </Link>
                                )}
                            </div>
                        )}
                    </Panel>

                    <NewLeads data={data} loading={isLoading} now={now} />
                </div>

                <div className="flex flex-col gap-4">
                    {!embedded && <AiPromptCard suggestions={AI_SUGGESTIONS} />}
                    <MonthTarget data={data} loading={isLoading} month={ubParts(now).month} />
                    <TodayActivity
                        loading={activity.isPending}
                        failed={!activity.data && !activity.isPending}
                        onboarding={!!activity.data?.onboarding}
                        targetDays={activity.data?.targetDays ?? 0}
                        row={ownActivity}
                        hidden={!!activity.data && !activity.data.personal && !managerName}
                    />
                    {!embedded && <WeeklyMeetingCard />}
                </div>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */

function TaskRow({ task, now, busy, finishing, onDone, onSnooze, onFinished }: {
    task: MyStatsTask;
    now: Date;
    busy: boolean;
    finishing: boolean;
    onDone: () => void;
    onSnooze: () => void;
    onFinished: () => void;
}) {
    const time = new Date(task.dueAt);
    const phone = extractPhone(task.subtitle);
    const Icon = task.type === 'viewing' ? CalendarDays : task.type === 'personal' ? Clock : Phone;
    const typeLabel = task.type === 'viewing' ? 'Уулзалт' : task.type === 'personal' ? 'Сануулга' : 'Залгах';
    const late = task.overdue && !isSameDay(time, now);

    return (
        <div className={cn('border-b border-border', finishing && 'bg-surface-2/40')}>
            <div className={cn('flex min-h-[60px] items-center gap-3 px-4 py-2', task.overdue && !finishing && 'bg-status-danger-soft/30')}>
                <span className={cn('num w-11 shrink-0 text-sm', task.overdue ? 'text-status-danger' : 'text-fg-2')}>
                    {late ? '—' : formatTime(time)}
                </span>
                <Icon className={cn('size-4 shrink-0', task.overdue ? 'text-status-danger' : 'text-muted-foreground')} strokeWidth={1.75} aria-hidden />
                <Link href={task.href} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{task.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{task.subtitle}</div>
                </Link>
                {late ? <StatusPill variant="danger">{daysAgo(time, now)} хоног хоцорсон</StatusPill>
                    : task.overdue ? <StatusPill variant="danger">Цаг өнгөрсөн</StatusPill>
                        : <StatusPill variant={task.type === 'viewing' ? 'info' : task.type === 'personal' ? 'pending' : 'neutral'}>{typeLabel}</StatusPill>}
                <div className="flex shrink-0 items-center gap-1">
                    {phone && (
                        <a href={`tel:${phone}`} aria-label={`${task.title} руу залгах`} title="Залгах" className="inline-flex size-8 items-center justify-center rounded-lg text-brand-strong transition-colors hover:bg-brand-soft">
                            <Phone className="size-4" />
                        </a>
                    )}
                    {!finishing && <Button size="sm" variant="tertiary" disabled={busy} onClick={onDone}><Check />Дууссан</Button>}
                    <Button size="sm" variant="ghost" className="w-8 px-0" disabled={busy || finishing} onClick={onSnooze} aria-label="Маргааш руу хойшлуулах" title="Маргааш руу хойшлуулах"><Redo2 /></Button>
                </div>
            </div>
            {finishing && (
                <div className="px-4 pb-3 pl-[76px]">
                    <LeadComposer
                        leadId={task.leadId ?? ''}
                        done
                        viewingId={task.type === 'viewing' ? task.id : null}
                        initialCall={task.type === 'followup' && !task.contactedToday}
                        autoFocus
                        onDoneEnd={onFinished}
                    />
                </div>
            )}
        </div>
    );
}

/** Өнөөдөр ирсэн лид — хэр удаан хүлээж байгаагаар (холбогдоогүй шинэ лид эхэнд). */
function NewLeads({ data, loading, now }: { data?: MyStatsData; loading: boolean; now: Date }) {
    const missing = data?.missing?.includes('leads');
    const leads = (data?.recentLeads ?? []).filter((l) => isSameDay(new Date(l.created_at), now));
    const total = missing ? null : Math.max(data?.kpis.newLeads ?? 0, leads.length);
    const waiting = (l: MyStatsLead) => l.status === 'new' && !l.last_contact_at;
    const sorted = [...leads].sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || a.created_at.localeCompare(b.created_at));
    return (
        <Panel title="Өнөөдөр ирсэн лид" sub={loading ? undefined : total === null ? '—' : String(total)}>
            {loading ? (
                <div className="flex flex-col gap-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : sorted.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">{missing ? 'Өнөөдрийн лидийн мэдээлэл түр боломжгүй' : 'Өнөөдөр шинэ лид ирээгүй'}</p>
            ) : (
                <ul className="flex flex-col">
                    {sorted.map((l) => <LeadRow key={l.id} lead={l} now={now} waiting={waiting(l)} />)}
                </ul>
            )}
            <div className="border-t border-border px-4 py-2">
                <Link href={total !== null && total > sorted.length ? '/dashboard/leads?view=mine' : '/dashboard/leads'} className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                    {total !== null && total > sorted.length ? `Бүгдийг харах (${total})` : 'Бүх лид'} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
            </div>
        </Panel>
    );
}

function LeadRow({ lead, now, waiting }: { lead: MyStatsLead; now: Date; waiting: boolean }) {
    const phone = lead.customer_phone?.replace(/\D/g, '') || null;
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(lead.created_at).getTime()) / 60_000));
    const wait = minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} цаг`;
    return (
        <li className="flex min-h-[52px] items-center gap-3 border-b border-border px-4 py-1.5 last:border-b-0">
            <Avatar name={normalizeLeadName(lead.customer_name)} />
            <Link href={`/dashboard/leads?lead=${lead.id}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{leadDisplayName(lead)}</div>
                <div className="truncate text-xs text-muted-foreground">
                    {[lead.customer_phone, lead.source ? sourceLabel(lead.source) : null].filter(Boolean).join(' · ')}
                </div>
            </Link>
            {waiting
                ? <StatusPill variant={minutes >= 60 ? 'danger' : 'pending'}>{wait} хүлээж байна</StatusPill>
                : <StatusPill variant="success">Холбогдсон</StatusPill>}
            {phone && (
                <a href={`tel:${phone}`} aria-label={`${leadDisplayName(lead)} руу залгах`} title="Залгах" className="inline-flex size-8 items-center justify-center rounded-lg text-brand-strong transition-colors hover:bg-brand-soft">
                    <Phone className="size-4" />
                </a>
            )}
        </li>
    );
}

/**
 * «Миний N-р сар»: өөрийн борлуулалт, багийн сарын зорилт ба түүний биелэлт, миний эзлэх хувь.
 * Багийн зорилтыг хувийн мэт харуулахгүй; мэдээлэлгүй бол шалтгаантай.
 */
function MonthTarget({ data, loading, month }: { data?: MyStatsData; loading: boolean; month: number }) {
    const missing = data?.missing ?? [];
    const missingSales = missing.includes('sales');
    const missingTargets = missing.includes('targets');
    const team = data?.target?.periods.month;
    const mine = data?.target?.mine?.month ?? data?.kpis.salesThisMonth ?? 0;
    const hasTarget = !missingTargets && !missingSales && !!team && team.target > 0;
    return (
        <Panel
            title={`Миний ${month}-р сар`}
            right={
                <Link href="/dashboard/reports/kpi" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                    KPI тайлан <ChevronRight className="size-3.5" aria-hidden />
                </Link>
            }
            bodyClassName="flex flex-col gap-4 p-4"
        >
            {loading || !data ? <Skeleton className="h-24" /> : (
                <>
                    <div>
                        <div className="text-xs text-muted-foreground">Миний борлуулалт</div>
                        <div className="num mt-0.5 text-[22px] font-semibold tracking-tight text-foreground">
                            {missingSales ? 'Борлуулалт түр боломжгүй' : formatMNTShort(mine)}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                        {missingTargets || missingSales ? (
                            <p className="text-xs text-muted-foreground">{missingTargets ? 'Сарын зорилтын мэдээлэл түр боломжгүй' : 'Зорилтын гүйцэтгэлийг тооцох мэдээлэл дутуу байна'}</p>
                        ) : hasTarget ? (
                            <>
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="text-muted-foreground">Багийн зорилт <span className="num text-fg-2">{formatMNTShort(team.target)}</span></span>
                                    <span className={cn('num font-semibold', team.actual >= team.target ? 'text-gold' : 'text-foreground')}>{Math.round((team.actual / team.target) * 100)}%</span>
                                </div>
                                <Meter pct={(team.actual / team.target) * 100} />
                                <p className="text-xs text-muted-foreground">
                                    Баг <span className="num text-fg-2">{formatMNTShort(team.actual)}</span> · миний хувь <span className="num font-medium text-foreground">{Math.round((mine / team.target) * 100)}%</span>
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground">Сарын зорилт тохируулаагүй</p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Stat label="идэвхтэй гэрээ" value={missing.includes('contracts') ? '—' : data.kpis.activeContracts} />
                        <Stat label="уулзалт · 7 хоног" value={missing.includes('viewings') ? '—' : data.kpis.viewingsThisWeek} />
                    </div>
                </>
            )}
        </Panel>
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
                <Link href="/dashboard/reports/kpi" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                    Дэлгэрэнгүй <ChevronRight className="size-3.5" aria-hidden />
                </Link>
            }
            bodyClassName="p-4"
        >
            {loading ? <Skeleton className="h-14" />
                : failed ? <p className="text-xs text-muted-foreground">Өнөөдрийн идэвхийг ачаалж чадсангүй.</p>
                    : onboarding || !total ? <p className="text-xs text-muted-foreground">Менежерийн бүртгэлд холбогдоогүй тул идэвх тооцогдохгүй.</p>
                        : (
                            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Өнөөдрийн идэвх">
                                <div className="flex flex-col gap-0.5">
                                    <span className="num text-xl font-semibold tracking-tight text-foreground">{total.calls} <span className="text-xs font-normal text-muted-foreground">{targetText(total.target.calls)}</span></span>
                                    <span className="text-xs text-muted-foreground">дуудлага</span>
                                    {total.attainment.calls !== null && <StatusPill variant={attainmentTone(total.attainment.calls)} className="self-start">{total.attainment.calls}%</StatusPill>}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="num text-xl font-semibold tracking-tight text-foreground">{total.meetingsHeld} <span className="text-xs font-normal text-muted-foreground">{targetText(total.target.meetings)}</span></span>
                                    <span className="text-xs text-muted-foreground">болсон уулзалт</span>
                                    {total.attainment.meetings !== null && <StatusPill variant={attainmentTone(total.attainment.meetings)} className="self-start">{total.attainment.meetings}%</StatusPill>}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className={cn('num text-xl font-semibold tracking-tight', row.openOverdue > 0 ? 'text-status-danger' : 'text-foreground')}>{row.openOverdue}</span>
                                    <span className="text-xs text-muted-foreground">хэтэрсэн санал хүсэлт</span>
                                </div>
                            </div>
                        )}
        </Panel>
    );
}

function Stat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2/60 px-3 py-2">
            <span className="num text-lg font-semibold tracking-tight text-foreground">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
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
/** Хоцорсон УБ хуанлийн өдөр (follow-up-ийн «хугацаа хэтэрсэн» нь өнөөдрөөс өмнөх өдөр). */
function daysAgo(d: Date, now: Date) {
    return Math.max(1, Math.round((Date.parse(ubDateStr(now)) - Date.parse(ubDateStr(d))) / 86_400_000));
}
function extractPhone(s: string): string | null {
    const m = s.match(/(\d[\d\s-]{6,}\d)/);
    return m ? m[1].replace(/\D/g, '') : null;
}
