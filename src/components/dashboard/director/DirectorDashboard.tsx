'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight, RefreshCw, Users, PhoneOff, CalendarX2, Clock3, FileWarning, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { ubParts } from '@/lib/utils/date';
import { sourceLabel } from '@/lib/leads/labels';
import { LEAD_WORK_QUEUES, type LeadWorkQueue } from '@/lib/leads/work-queue';
import { useAuth } from '@/contexts/AuthContext';
import { useDirector, type DirectorPayload } from '@/hooks/useDirector';
import { useLeadSummary } from '@/hooks/useLeads';
import { usePageTitle } from '@/lib/navigation/pageTitle';
import { useRegisterAiContext } from '@/lib/ai/context';
import type { BlockRemaining } from '@/lib/dashboard/director';
import { Panel, Progress, Skeleton } from '@/components/dashboard/v2/primitives';
import { AttentionRow, KpiTile, Meter, TodayHeader } from '@/components/dashboard/today/parts';

/**
 * Захирлын «Өнөөдөр» — эхлээд хийх ажил (хуваарилах, хоцролт, авлага), дараа нь тоо.
 * KPI бүр харьцуулсан хугацаа, эх сурвалжтай; мэдээлэлгүй үзүүлэлт 0 биш, шалтгаантай.
 * Тоо /api/dashboard/director нэг дуудлагаар (сар солиход өмнөх өгөгдөл хэвээр), анхаарах
 * лидийн тоо Лид хуудасны /api/dashboard/leads/summary-аас (ижил дүрэм, ижил шүүлтүүр).
 */

const QUEUE_ICONS: Record<LeadWorkQueue, typeof Users> = { unassigned: Users, uncontacted: PhoneOff, no_followup: CalendarX2, overdue: Clock3 };
const QUEUE_TITLES: Record<LeadWorkQueue, (n: number) => string> = {
    unassigned: (n) => `${n} лид хуваарилаагүй`,
    uncontacted: (n) => `${n} лид холбоо бүртгээгүй`,
    no_followup: (n) => `${n} лид дараагийн алхамгүй`,
    overdue: (n) => `${n} лидийн алхам хугацаа хэтэрсэн`,
};
const QUEUE_ORDER: LeadWorkQueue[] = ['unassigned', 'overdue', 'uncontacted', 'no_followup'];

export function DirectorDashboard({ actions }: { actions?: React.ReactNode }) {
    usePageTitle('Самбар');
    useRegisterAiContext({ type: 'dashboard' });
    const { shop, user } = useAuth();
    const [today] = useState(() => ubParts(new Date()));
    const [ym, setYm] = useState({ year: today.year, month: today.month });
    const { data, isLoading, isFetching, isError, error, refetch } = useDirector(ym.year, ym.month);
    const canLeads = user?.role === 'super_admin' || !!user?.permissions?.modules?.includes('leads');
    const summary = useLeadSummary({ enabled: canLeads });

    const shift = (d: number) => {
        const m = ym.month + d;
        if (m < 1) setYm({ year: ym.year - 1, month: 12 });
        else if (m > 12) setYm({ year: ym.year + 1, month: 1 });
        else setYm({ ...ym, month: m });
    };
    const isCurrent = ym.year === today.year && ym.month === today.month;
    const managers = data?.leaderboard?.length;

    const header = (
        <TodayHeader
            sub={[shop?.name, managers ? `${managers} менежер` : null].filter(Boolean).join(' · ') || undefined}
            actions={<>
                <div className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-surface">
                    <button type="button" onClick={() => shift(-1)} className="flex h-full w-8 items-center justify-center text-fg-2 hover:text-foreground" aria-label="Өмнөх сар">
                        <ChevronLeft className="size-4" />
                    </button>
                    <span className="num min-w-[124px] border-x border-border px-3 text-center text-[13px] font-medium text-foreground">{ym.year} оны {ym.month}-р сар</span>
                    <button type="button" onClick={() => shift(1)} disabled={isCurrent} className="flex h-full w-8 items-center justify-center text-fg-2 hover:text-foreground disabled:opacity-40" aria-label="Дараагийн сар">
                        <ChevronRight className="size-4" />
                    </button>
                </div>
                {!isCurrent && <Button size="sm" variant="ghost" onClick={() => setYm({ year: today.year, month: today.month })}>Энэ сар</Button>}
                {actions}
                <Button size="sm" variant="secondary" href="/dashboard/weekly">Лхагвын хурал</Button>
                <Button size="sm" variant="ghost" onClick={() => { void refetch(); if (canLeads) void summary.refetch(); }} aria-label="Шинэчлэх" title="Шинэчлэх">
                    <RefreshCw className={cn(isFetching && 'animate-spin')} />
                </Button>
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

    const missing = data?.missing ?? [];
    return (
        <>
            {header}
            <div className="flex flex-col gap-5">
                {isError && <Alert variant="warning">
                    Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.
                    <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>}
                {missing.length > 0 && <Alert variant="warning">
                    Зарим хэсгийн мэдээллийг ачаалж чадсангүй. Үзүүлэлтүүд дутуу байж болно.
                    <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>}

                <Kpis data={data} loading={isLoading} month={ym.month} unassigned={canLeads ? summary.data?.queues.unassigned ?? null : null} />

                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                    <Attention data={data} loading={isLoading} summary={canLeads ? summary : null} isCurrent={isCurrent} />
                    <Managers data={data} loading={isLoading} month={ym.month} />
                </div>

                <div className="grid items-start gap-5 xl:grid-cols-3">
                    <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
                        <SalesTrend data={data} loading={isLoading} month={ym.month} />
                        <Funnel data={data} loading={isLoading} month={ym.month} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-5">
                        <OverduePayments data={data} loading={isLoading} />
                        <Inventory data={data} loading={isLoading} />
                    </div>
                </div>
            </div>
        </>
    );
}

/* ================================================================== */

function Kpis({ data, loading, month, unassigned }: { data?: DirectorPayload; loading: boolean; month: number; unassigned: number | null }) {
    const { user } = useAuth();
    if (loading || !data) {
        return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}</div>;
    }
    const missing = data.missing ?? [];
    const s = data.sales;
    const r = data.receivables;
    const f = data.funnel;
    const m = data.meetings;
    const meetingRate = f && f.totals.leads > 0 ? Math.round((f.totals.viewings / f.totals.leads) * 100) : null;
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Сарын гол үзүүлэлт">
            <KpiTile
                label={`Гэрээ · ${month}-р сар`}
                value={s ? formatMNTShort(s.actual) : '—'}
                unavailable={!s || missing.includes('contracts') ? 'Гэрээний мэдээлэл түр боломжгүй' : null}
                meter={s && s.target > 0 ? s.attainmentPct : null}
                detail={s && (s.target > 0
                    ? <>Зорилт {formatMNTShort(s.target)}-ийн <b className={cn('font-semibold', s.attainmentPct >= 100 ? 'text-gold' : 'text-foreground')}>{s.attainmentPct}%</b>
                        {s.momDeltaPct !== null && <> · <span className={s.momDeltaPct >= 0 ? 'text-status-success' : 'text-status-danger'}>{s.momDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(s.momDeltaPct)}%</span> өмнөх сараас</>}</>
                    : user?.role === 'super_admin'
                        ? <Link href="/admin/sales-targets" className="font-medium text-brand-strong hover:underline">Сарын зорилт тохируулах</Link>
                        : 'Сарын зорилт тохируулаагүй')}
                source={s ? `${s.units} гэрээ · CRM-ийн гэрээний огноогоор` : undefined}
            />
            <KpiTile
                label="Хоцорсон төлбөр"
                value={r ? formatMNTShort(r.total) : '—'}
                unavailable={!r || missing.includes('receivables') ? 'Төлбөрийн хуваарийг уншиж чадсангүй' : null}
                detail={r && (r.count > 0 ? <><b className="font-semibold text-status-danger">{r.count}</b> гэрээ хугацаа хэтэрсэн</> : 'Хугацаа хэтэрсэн төлбөр бүртгэгдээгүй')}
                source={r && r.outstandingTotal > 0 ? `Нийт авлага ${formatMNTShort(r.outstandingTotal)} · бүртгэсэн хуваарь` : 'Бүртгэсэн төлбөрийн хуваарь'}
            />
            <KpiTile
                label={`Шинэ лид · ${month}-р сар`}
                value={f ? f.totals.leads : '—'}
                unavailable={!f || missing.includes('leads') ? 'Лидийн мэдээлэл түр боломжгүй' : null}
                detail={unassigned !== null ? <>Хуваарилаагүй <b className={cn('font-semibold', unassigned > 0 ? 'text-status-pending' : 'text-foreground')}>{unassigned}</b> · одоогийн байдлаар</> : undefined}
                source="CRM лид · үүссэн огноогоор"
            />
            <KpiTile
                label={`Уулзалт · ${month}-р сар`}
                value={m ? m.scheduled : '—'}
                unavailable={!m || missing.includes('viewings') ? 'Уулзалтын мэдээлэл түр боломжгүй' : null}
                detail={m && <>Болсон <b className="font-semibold text-foreground">{m.held}</b>{meetingRate !== null && <> · шинэ лидийн {meetingRate}% уулзалттай</>}</>}
                source="Цуцлагдсаныг хассан · товлосон огноогоор"
            />
        </div>
    );
}

/* ================================================================== */

function Attention({ data, loading, summary, isCurrent }: {
    data?: DirectorPayload;
    loading: boolean;
    summary: ReturnType<typeof useLeadSummary> | null;
    isCurrent: boolean;
}) {
    const queues = summary?.data?.queues;
    const r = data?.receivables;
    const receivablesKnown = !!r && !(data?.missing ?? []).includes('receivables');
    const maxDays = r?.items?.reduce((max, it) => Math.max(max, it.daysOverdue), 0) ?? 0;
    const leadRows = queues ? QUEUE_ORDER.filter((key) => queues[key] > 0) : [];
    const count = leadRows.length + (receivablesKnown && r!.count > 0 ? 1 : 0);
    const help = (key: LeadWorkQueue) => LEAD_WORK_QUEUES.find((q) => q.key === key)!.help;
    return (
        <Panel title="Анхаарах" sub={loading || summary?.isPending ? undefined : count > 0 ? `${count} зүйл` : undefined} bodyClassName="px-4 py-1">
            {loading || summary?.isPending ? (
                <div className="flex flex-col gap-2 py-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
                <>
                    {summary?.isError && (
                        <div className="flex items-center gap-2 border-b border-border py-2.5 text-xs text-muted-foreground">
                            Лидийн анхаарах тоог ачаалж чадсангүй.
                            <Button size="sm" variant="ghost" onClick={() => void summary.refetch()}>Дахин оролдох</Button>
                        </div>
                    )}
                    {count === 0 && !summary?.isError ? (
                        !receivablesKnown && !queues ? (
                            <p className="py-4 text-xs text-muted-foreground">Анхаарах зүйлийг тооцох мэдээлэл ачаалагдаагүй.</p>
                        ) : (
                            <div className="flex items-center gap-3 py-4 text-sm text-fg-2">
                                <CheckCircle2 className="size-5 text-status-success" aria-hidden />
                                {receivablesKnown && queues ? 'Анхаарах зүйл алга — лид хуваарилагдсан, төлбөр хугацаандаа.' : receivablesKnown ? 'Төлбөрийн хоцролт алга.' : 'Лидийн анхаарах зүйл алга.'}
                            </div>
                        )
                    ) : (
                        <ul>
                            {leadRows.map((key) => (
                                <AttentionRow
                                    key={key}
                                    icon={QUEUE_ICONS[key]}
                                    tone={key === 'unassigned' || key === 'overdue' ? 'pending' : 'neutral'}
                                    title={QUEUE_TITLES[key](queues![key])}
                                    detail={help(key)}
                                    action={{ label: key === 'unassigned' ? 'Хуваарилах' : 'Харах', href: `/dashboard/leads?queue=${key}`, primary: key === 'unassigned' }}
                                />
                            ))}
                            {receivablesKnown && r!.count > 0 && (
                                <AttentionRow
                                    icon={FileWarning}
                                    tone="danger"
                                    title={`${r!.count} гэрээний төлбөр хоцорсон`}
                                    detail={<span className="num">Нийт {formatMNTShort(r!.total)}{maxDays > 0 ? ` · хамгийн их нь ${maxDays} хоног` : ''}</span>}
                                    action={{ label: 'Харах', href: '/dashboard/contracts' }}
                                />
                            )}
                        </ul>
                    )}
                    {!isCurrent && summary && <p className="border-t border-border py-2 text-xs text-muted-foreground">Лидийн тоо өнөөдрийн байдлаар (сонгосон сараас үл хамаарна).</p>}
                </>
            )}
        </Panel>
    );
}

/* ================================================================== */

function Managers({ data, loading, month }: { data?: DirectorPayload; loading: boolean; month: number }) {
    const rows = data?.leaderboard;
    return (
        <Panel
            title="Менежерүүд"
            sub={`${month}-р сар · гэрээ ба зорилт`}
            right={<Link href="/dashboard/reports/manager-performance" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">Бүх тайлан <ArrowRight className="size-3.5" aria-hidden /></Link>}
        >
            {loading || !rows ? (
                <div className="flex flex-col gap-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Энэ сард гүйцэтгэл бүртгэгдээгүй</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="h-9 bg-surface-2 text-xs text-muted-foreground">
                                <th scope="col" className="px-4 text-left font-medium">Менежер</th>
                                <th scope="col" className="px-2 text-right font-medium">Гэрээ</th>
                                <th scope="col" className="px-2 text-right font-medium">Борлуулалт</th>
                                <th scope="col" className="w-[150px] px-2 text-left font-medium">Зорилт</th>
                                <th scope="col" className="px-2 text-right font-medium">Уулзалт</th>
                                <th scope="col" className="px-4 text-right font-medium">Лид</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.name} className="h-11 border-b border-border last:border-b-0">
                                    <td className="px-4"><span className="inline-flex items-center gap-2"><Avatar name={r.name} /><span className="truncate font-medium text-foreground">{r.name}</span></span></td>
                                    <td className="num px-2 text-right text-fg-2">{r.contracts}</td>
                                    <td className="num px-2 text-right font-medium text-foreground">{formatMNTShort(r.sales)}</td>
                                    <td className="px-2">
                                        {r.target > 0 ? (
                                            <div className="flex items-center gap-2">
                                                <Meter pct={r.targetPct} className="w-16" />
                                                <span className={cn('num text-xs', r.targetPct >= 100 ? 'font-semibold text-gold' : 'text-fg-2')}>{r.targetPct}%</span>
                                            </div>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </td>
                                    <td className="num px-2 text-right text-fg-2">{r.viewings}</td>
                                    <td className="num px-4 text-right text-fg-2">{r.leads}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Panel>
    );
}

/* ================================================================== */

function SalesTrend({ data, loading, month }: { data?: DirectorPayload; loading: boolean; month: number }) {
    const s = data?.sales;
    return (
        <Panel
            title="Борлуулалт ба зорилт"
            sub={s ? `${data!.year} он · ${formatMNTShort(s.yearActual)}${s.yearTarget > 0 ? ` / ${formatMNTShort(s.yearTarget)}` : ''}` : undefined}
            right={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand" /> Бодит</span>
                    <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm border border-border-strong" /> Зорилт</span>
                </div>
            }
            bodyClassName="flex flex-col gap-3 p-4"
        >
            {loading || !s ? <Skeleton className="h-52" /> : (
                <>
                    {s.unitsByType.length > 0 && (
                        <p className="text-xs text-fg-2"><b className="num font-semibold text-foreground">{s.units} байр</b><span className="text-muted-foreground"> · {s.unitsByType.map((u) => `${u.type} ${u.count}`).join(' · ')}</span></p>
                    )}
                    <TrendChart actual={s.trendActual} target={s.trendTarget} current={month} />
                </>
            )}
        </Panel>
    );
}

/** 12 сарын багана — бодит (accent) + зорилт (хоосон хүрээ). Inline SVG; өргөнийг контейнерээс хэмжинэ. */
function TrendChart({ actual, target, current }: { actual: number[]; target: number[]; current: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [W, setW] = useState(760);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const H = 212, padL = 52, padR = 8, padB = 24, padT = 28;
    const max = Math.max(1, ...actual, ...target);
    const nice = niceMax(max);
    const unit = nice >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
    const unitLabel = unit === 1_000_000_000 ? 'тэрбум ₮' : 'сая ₮';
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const slot = innerW / 12;
    const barW = Math.min(26, slot * 0.42);
    const compact = slot < 46;
    const y = (v: number) => padT + innerH - (v / nice) * innerH;
    const ticks = [0, nice / 3, (nice * 2) / 3, nice];
    const tick = (v: number) => {
        const n = v / unit;
        return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    };

    return (
        <div ref={ref} className="w-full">
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="12 сарын борлуулалт ба зорилт">
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                        <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--muted)" className="num">{tick(t)}</text>
                    </g>
                ))}
                <text x={0} y={12} textAnchor="start" fontSize={12} fill="var(--muted)">{unitLabel}</text>
                {Array.from({ length: 12 }).map((_, i) => {
                    const cx = padL + slot * i + slot / 2;
                    const isCur = i === current - 1;
                    return (
                        <g key={i}>
                            {isCur && <rect x={padL + slot * i + 2} y={padT - 6} width={slot - 4} height={innerH + 6} fill="var(--surface-2)" rx={4} />}
                            {target[i] > 0 && (
                                <rect x={cx - barW / 2 - 3} y={y(target[i])} width={barW + 6} height={Math.max(0, innerH + padT - y(target[i]))} fill="none" stroke="var(--border-strong)" strokeWidth={1} rx={2} />
                            )}
                            {actual[i] > 0 && (
                                <rect x={cx - barW / 2} y={y(actual[i])} width={barW} height={Math.max(1, innerH + padT - y(actual[i]))} fill="var(--brand)" rx={2} />
                            )}
                            {(!compact || isCur || i % 2 === 0) && (
                                <text x={cx} y={H - 6} textAnchor="middle" fontSize={12} fill={isCur ? 'var(--fg)' : 'var(--muted)'} fontWeight={isCur ? 600 : 400}>{compact ? `${i + 1}` : `${i + 1}-р сар`}</text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function niceMax(v: number) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10;
    return m * p;
}

/* ================================================================== */

function Inventory({ data, loading }: { data?: DirectorPayload; loading: boolean }) {
    const inv = data?.inventory;
    const unavailable = (data?.missing ?? []).includes('inventory');
    return (
        <Panel
            title="Үлдэгдэл байр"
            sub={inv && inv.total > 0 ? `Зарагдсан ${inv.sold} · ${Math.round((inv.sold / inv.total) * 100)}%` : undefined}
            bodyClassName="flex flex-col gap-3 p-4"
        >
            {loading || !inv ? <Skeleton className="h-40" /> : unavailable ? (
                <p className="text-xs text-status-pending">Байрны үлдэгдлийг уншиж чадсангүй.</p>
            ) : (
                <>
                    <div className="num text-[26px] font-semibold leading-tight tracking-tight text-foreground">
                        {inv.available} <span className="text-sm font-medium text-muted-foreground">/ {inv.total} сул</span>
                    </div>
                    {inv.blocks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Блокийн мэдээлэл алга (байрны нэгжүүд импортлогдоогүй)</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {inv.blocks.slice(0, 6).map((b) => <BlockRow key={`${b.phase}|${b.block}`} b={b} />)}
                            {inv.blocks.length > 6 && (
                                <Link href="/dashboard/properties/blocks" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                                    Бүх блок ({inv.blocks.length}) <ArrowRight className="size-3.5" aria-hidden />
                                </Link>
                            )}
                        </div>
                    )}
                </>
            )}
        </Panel>
    );
}

function BlockRow({ b }: { b: BlockRemaining }) {
    const soldPct = b.total > 0 ? ((b.total - b.available) / b.total) * 100 : 0;
    return (
        <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3">
            <span className="truncate text-xs text-fg-2">{b.phase ? `${b.phase} ${b.block}` : `Блок ${b.block}`}</span>
            <Progress value={soldPct} overColor={false} />
            <span className="num text-xs text-fg-2">{b.available} / {b.total}</span>
        </div>
    );
}

/* ================================================================== */

/** Сарын шинэ лид эх үүсвэрээр: лид → уулзалттай болсон → гэрээ (ижил лидийн бүлэг). */
function Funnel({ data, loading, month }: { data?: DirectorPayload; loading: boolean; month: number }) {
    const f = data?.funnel;
    const max = Math.max(1, ...(f?.rows.map((r) => r.leads) ?? [1]));
    const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
    return (
        <Panel title="Лидийн урсгал" sub={`${month}-р сарын шинэ лид · эх үүсвэрээр`} bodyClassName="flex flex-col">
            {loading || !f ? (
                <div className="flex flex-col gap-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : f.rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Энэ сард лид бүртгэгдээгүй</p>
            ) : (
                <>
                    <dl className="grid grid-cols-3 border-b border-border">
                        {([['Лид', f.totals.leads, null], ['Уулзалттай', f.totals.viewings, pct(f.totals.viewings, f.totals.leads)], ['Гэрээтэй', f.totals.contracts, pct(f.totals.contracts, f.totals.leads)]] as const).map(([label, value, rate], i) => (
                            <div key={label} className={cn('flex flex-col gap-0.5 px-4 py-3', i > 0 && 'border-l border-border')}>
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="num text-lg font-semibold text-foreground">{value}{rate && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{rate}</span>}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="flex flex-col gap-3 p-4">
                        {f.rows.map((r) => (
                            <div key={r.source} className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="font-medium text-foreground">{sourceLabel(r.source)}</span>
                                    <span className="num ml-auto text-fg-2">{r.leads} → {r.viewings} → {r.contracts}</span>
                                    <span className={cn('num w-12 text-right font-medium', r.conversionPct > 0 ? 'text-foreground' : 'text-muted-foreground')}>{r.conversionPct}%</span>
                                </div>
                                <div className="flex flex-col gap-0.5" aria-hidden>
                                    <div className="h-1.5 rounded-sm bg-brand-soft" style={{ width: `${(r.leads / max) * 100}%` }} />
                                    <div className="h-1.5 rounded-sm bg-brand" style={{ width: `${(r.viewings / max) * 100}%` }} />
                                    <div className="h-1.5 rounded-sm bg-status-success" style={{ width: `${(r.contracts / max) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">Хувь = тухайн сард үүссэн лидээс уулзалттай, гэрээтэй болсон нь (уулзалт, гэрээ мөн тэр сард).</p>
                    </div>
                </>
            )}
        </Panel>
    );
}

/* ================================================================== */

function OverduePayments({ data, loading }: { data?: DirectorPayload; loading: boolean }) {
    const r = data?.receivables;
    const unavailable = (data?.missing ?? []).includes('receivables');
    return (
        <Panel
            title="Хоцорсон төлбөр"
            sub="өнөөдрийн байдлаар"
            right={<Link href="/dashboard/contracts" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">Гэрээ <ArrowRight className="size-3.5" aria-hidden /></Link>}
            bodyClassName="flex flex-col"
        >
            {loading || !r ? <div className="p-4"><Skeleton className="h-32" /></div> : unavailable ? (
                <p role="alert" className="px-4 py-4 text-xs text-status-pending">Төлбөрийн хуваарийг уншиж чадсангүй. Хоцролтыг тооцоогүй.</p>
            ) : r.count === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Төлбөрийн хуваарьт хоцролт бүртгэгдээгүй</p>
            ) : (
                <ul>
                    {r.items.map((it) => (
                        <li key={it.contractId}>
                            <Link href={`/dashboard/contracts/${it.contractId}`} className="flex items-center gap-3 border-b border-border px-4 py-2.5 hover:bg-surface-2/60">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{it.customer}</span>
                                <span className="num text-sm text-fg-2">{formatMNTShort(it.amount)}</span>
                                <StatusPill variant="danger">{it.daysOverdue} хоног</StatusPill>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            <p className="px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">Зөвхөн бүртгэсэн төлбөрийн хуваарийг тооцов. Гэрээнд өмнө бүртгэсэн хоцролтоос ялгаатай байж болно.</p>
        </Panel>
    );
}
