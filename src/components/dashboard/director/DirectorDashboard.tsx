'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { sourceLabel } from '@/lib/leads/labels';
import { useDirector } from '@/hooks/useDirector';
import { usePageTitle } from '@/lib/navigation/pageTitle';
import { useRegisterAiContext } from '@/lib/ai/context';
import type { FunnelRow, LeaderboardRow, BlockRemaining } from '@/lib/dashboard/director';
import { Panel, Progress, Avatar, Pill, EmptyRow, Skeleton, Rank } from '@/components/dashboard/v2/primitives';

/**
 * Захирлын самбар — нэвтрэх эхний секунд.
 * Дөрвөн блок: борлуулалт vs зорилт · авлага ба үлдэгдэл · leaderboard · funnel.
 * Бүх өгөгдөл /api/dashboard/director нэг дуудлагаар; сар солиход өмнөх
 * өгөгдөл хэвээр (spinner-гүй).
 */

export function DirectorDashboard({ actions }: { actions?: React.ReactNode }) {
    usePageTitle('Самбар');
    useRegisterAiContext({ type: 'dashboard' });
    const now = new Date();
    const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const { data, isLoading, isFetching, refetch } = useDirector(ym.year, ym.month);

    const shift = (d: number) => {
        const m = ym.month + d;
        if (m < 1) setYm({ year: ym.year - 1, month: 12 });
        else if (m > 12) setYm({ year: ym.year + 1, month: 1 });
        else setYm({ ...ym, month: m });
    };
    const isCurrent = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;

    return (
        <div className="flex flex-col gap-4">
            {/* Толгойн мөр: сар сонгогч */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex h-[30px] items-center rounded-md border border-border-strong bg-surface">
                    <button type="button" onClick={() => shift(-1)} className="flex h-full w-8 items-center justify-center text-fg-2 hover:text-foreground focus-ring" aria-label="Өмнөх сар">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="num min-w-[132px] border-x border-border px-3 text-center text-[13px] font-medium text-foreground">
                        {ym.year} оны {ym.month}-р сар
                    </span>
                    <button type="button" onClick={() => shift(1)} disabled={isCurrent} className="flex h-full w-8 items-center justify-center text-fg-2 hover:text-foreground disabled:opacity-40 focus-ring" aria-label="Дараагийн сар">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
                {!isCurrent && (
                    <button type="button" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })} className="h-[30px] rounded-md px-2.5 text-[12.5px] text-brand hover:bg-brand-soft focus-ring">
                        Энэ сар
                    </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                    {actions}
                    <button type="button" onClick={() => void refetch()} className={cn('flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring', isFetching && 'animate-spin')} aria-label="Шинэчлэх">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {data?.missing?.length ? (
                <div className="flex items-center gap-2 rounded-md border border-status-pending/30 bg-status-pending-soft px-3 py-2 text-[12px] text-status-pending">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Зарим хэсгийн өгөгдөл олдсонгүй: {data.missing.join(', ')}. Миграци хийгдээгүй байж болно.
                </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-3">
                <SalesVsTarget data={data} loading={isLoading} className="xl:col-span-2" month={ym.month} />
                <Receivables data={data} loading={isLoading} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <Leaderboard rows={data?.leaderboard} loading={isLoading} />
                <Funnel data={data?.funnel} loading={isLoading} />
            </div>
        </div>
    );
}

/* ================================================================== */

function SalesVsTarget({ data, loading, className, month }: { data?: ReturnType<typeof useDirector>['data']; loading: boolean; className?: string; month: number }) {
    const s = data?.sales;
    return (
        <Panel
            title="Борлуулалт vs зорилт"
            className={className}
            right={
                <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" /> Бодит</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-border-strong" /> Зорилт</span>
                </div>
            }
            bodyClassName="flex flex-col gap-4 p-4"
        >
            {loading || !s ? (
                <><Skeleton className="h-12 w-72" /><Skeleton className="h-52" /></>
            ) : (
                <>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-foreground">{formatMNTShort(s.actual)}</span>
                        {s.target > 0 ? (
                            <span className="text-[13px] text-muted-foreground">Зорилт {formatMNTShort(s.target)} · <b className={cn('font-semibold', s.attainmentPct >= 100 ? 'text-status-success' : 'text-foreground')}>{s.attainmentPct}%</b></span>
                        ) : (
                            <Link href="/admin/sales-targets" className="text-[12.5px] text-brand hover:underline">Сарын зорилт тохируулах</Link>
                        )}
                        {s.momDeltaPct !== null && (
                            <span className={cn('text-[12.5px] font-medium', s.momDeltaPct >= 0 ? 'text-status-success' : 'text-status-danger')}>
                                {s.momDeltaPct >= 0 ? '+' : ''}{s.momDeltaPct}% өнгөрсөн сараас
                            </span>
                        )}
                    </div>
                    {s.target > 0 && <Progress value={s.actual} max={s.target} className="max-w-md" />}
                    <div className="text-[12.5px] text-fg-2">
                        <b className="num font-semibold text-foreground">{s.units} байр</b>
                        {s.unitsByType.length > 0 && <span className="text-muted-foreground"> · {s.unitsByType.map((u) => `${u.type} ${u.count}`).join(' · ')}</span>}
                    </div>
                    <TrendChart actual={s.trendActual} target={s.trendTarget} current={month} />
                </>
            )}
        </Panel>
    );
}

/** 12 сарын багана — бодит (accent) + зорилт (хоосон хүрээ). Inline SVG, санг ашиглахгүй.
 *  Өргөнийг контейнерээс хэмжинэ — текст хэзээ ч томорч/жижгэрэхгүй. */
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

    const H = 200, padL = 52, padR = 8, padB = 24, padT = 16;
    const max = Math.max(1, ...actual, ...target);
    const nice = niceMax(max);
    const unit = nice >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
    const unitLabel = unit === 1_000_000_000 ? 'тэрбум ₮' : 'сая ₮';
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const slot = innerW / 12;
    const barW = Math.min(26, slot * 0.42);
    const compact = slot < 46; // утас: «9» гэж богино, тэгш сар бүрийг л харуулна
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
                        <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted)" fontFamily="var(--font-mono-stack)">{tick(t)}</text>
                    </g>
                ))}
                <text x={padL - 8} y={padT - 6} textAnchor="end" fontSize={10} fill="var(--muted)">{unitLabel}</text>
                {compact && <text x={W - padR} y={H - 7} textAnchor="end" fontSize={10} fill="var(--muted)">сар</text>}
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
                            {isCur && actual[i] > 0 && (
                                <text x={cx} y={y(actual[i]) - 5} textAnchor="middle" fontSize={10.5} fill="var(--fg)" fontFamily="var(--font-mono-stack)">{tick(actual[i])}</text>
                            )}
                            {(!compact || isCur || i % 2 === 0) && (
                                <text x={cx} y={H - 7} textAnchor="middle" fontSize={10.5} fill={isCur ? 'var(--fg)' : 'var(--muted)'} fontWeight={isCur ? 600 : 400}>{compact ? `${i + 1}` : `${i + 1}-р сар`}</text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function fmtAxis(v: number) {
    const m = v / 1_000_000;
    if (m >= 1000) return `${(m / 1000).toFixed(1).replace(/\.0$/, '')} тэрбум`;
    return Math.round(m).toLocaleString('en-US');
}
function niceMax(v: number) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10;
    return m * p;
}

/* ================================================================== */

function Receivables({ data, loading }: { data?: ReturnType<typeof useDirector>['data']; loading: boolean }) {
    const r = data?.receivables;
    const inv = data?.inventory;
    return (
        <Panel title="Авлага ба үлдэгдэл" bodyClassName="flex flex-col">
            {loading || !r || !inv ? (
                <div className="flex flex-col gap-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
            ) : (
                <>
                    <div className="flex flex-col gap-2 border-b border-border p-4">
                        {r.count > 0 ? (
                            <>
                                <div className="flex items-center gap-1.5 text-[12px] font-medium text-status-danger"><AlertCircle className="h-3.5 w-3.5" /> Хугацаа хэтэрсэн · {r.count} гэрээ</div>
                                <div className="num text-[22px] font-semibold tracking-[-0.02em] text-status-danger">{formatMNTShort(r.total)}</div>
                                <div className="flex flex-col">
                                    {r.items.map((it) => (
                                        <Link key={it.contractId} href={`/dashboard/contracts?id=${it.contractId}`} className="flex items-center gap-2 border-b border-border py-2 last:border-b-0 hover:bg-surface-2/60">
                                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">{it.customer}</span>
                                            <span className="num text-[12.5px] text-fg-2">{formatMNTShort(it.amount)}</span>
                                            <Pill tone="danger">{it.daysOverdue} хоног</Pill>
                                        </Link>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="text-[12.5px] text-muted-foreground">Хугацаа хэтэрсэн төлбөр алга</div>
                        )}
                        {r.outstandingTotal > 0 && (
                            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                                <span>Нийт авлага (идэвхтэй гэрээ)</span>
                                <span className="num font-medium text-fg-2">{formatMNTShort(r.outstandingTotal)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 p-4">
                        <div className="flex items-baseline justify-between">
                            <span className="text-[12px] font-medium text-muted-foreground">Үлдэгдэл байр</span>
                            {inv.total > 0 && <span className="text-[11.5px] text-muted-foreground">Зарагдсан {inv.sold} · {Math.round((inv.sold / inv.total) * 100)}%</span>}
                        </div>
                        <div className="num text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                            {inv.available} <span className="text-[15px] font-medium text-muted-foreground">/ {inv.total}</span>
                        </div>
                        {inv.blocks.length === 0 ? (
                            <div className="text-[12px] text-muted-foreground">Блокийн мэдээлэл алга (байрны нэгжүүд импортлогдоогүй)</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {inv.blocks.slice(0, 6).map((b) => <BlockRow key={`${b.phase}|${b.block}`} b={b} />)}
                                {inv.blocks.length > 6 && (
                                    <Link href="/dashboard/properties/blocks" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                                        Бүх блок ({inv.blocks.length}) <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </Panel>
    );
}

function BlockRow({ b }: { b: BlockRemaining }) {
    const soldPct = b.total > 0 ? ((b.total - b.available) / b.total) * 100 : 0;
    return (
        <div className="grid grid-cols-[84px_1fr_auto] items-center gap-3">
            <span className="truncate text-[12.5px] text-fg-2">{b.phase ? `${b.phase} ${b.block}` : `Блок ${b.block}`}</span>
            <Progress value={soldPct} overColor={false} />
            <span className="num text-[12px] text-fg-2">{b.available} / {b.total}</span>
        </div>
    );
}

/* ================================================================== */

function Leaderboard({ rows, loading }: { rows?: LeaderboardRow[]; loading: boolean }) {
    return (
        <Panel
            title="Менежерийн гүйцэтгэл"
            right={<Link href="/dashboard/reports/manager-performance" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">Бүх тайлан <ArrowRight className="h-3.5 w-3.5" /></Link>}
        >
            {loading || !rows ? (
                <div className="flex flex-col gap-2 p-3.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : rows.length === 0 ? (
                <EmptyRow>Энэ сард гүйцэтгэл бүртгэгдээгүй</EmptyRow>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead>
                            <tr className="h-8 bg-surface-2 text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
                                <th className="w-9 px-2 text-left font-medium">#</th>
                                <th className="px-2 text-left font-medium">Менежер</th>
                                <th className="px-2 text-right font-medium">Гэрээ</th>
                                <th className="px-2 text-right font-medium">Борлуулалт</th>
                                <th className="hidden px-2 text-right font-medium sm:table-cell">Уулзалт</th>
                                <th className="hidden px-2 text-right font-medium sm:table-cell">Лид</th>
                                <th className="w-[130px] px-2 text-left font-medium">Зорилтын %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.name} className="h-9 border-b border-border last:border-b-0 hover:bg-surface-2/60">
                                    <td className="px-2"><Rank n={r.rank} /></td>
                                    <td className="px-2"><span className="inline-flex items-center gap-2"><Avatar name={r.name} /><span className="truncate font-medium text-foreground">{r.name}</span></span></td>
                                    <td className="num px-2 text-right text-fg-2">{r.contracts}</td>
                                    <td className="num px-2 text-right font-medium text-foreground">{fmtAxis(r.sales)}<span className="text-muted-foreground"> сая</span></td>
                                    <td className="num hidden px-2 text-right text-fg-2 sm:table-cell">{r.viewings}</td>
                                    <td className="num hidden px-2 text-right text-fg-2 sm:table-cell">{r.leads}</td>
                                    <td className="px-2">
                                        <div className="flex items-center gap-2">
                                            <Progress value={r.targetPct} className="w-14" />
                                            <span className={cn('num w-10 text-right text-[12px]', r.targetPct >= 100 ? 'font-medium text-status-success' : 'text-fg-2')}>{r.target > 0 ? `${r.targetPct}%` : '—'}</span>
                                        </div>
                                    </td>
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

function Funnel({ data, loading }: { data?: { rows: FunnelRow[]; totals: { leads: number; viewings: number; contracts: number } }; loading: boolean }) {
    const max = Math.max(1, ...(data?.rows.map((r) => r.leads) ?? [1]));
    return (
        <Panel
            title="Лидийн урсгал эх үүсвэрээр"
            right={
                <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-soft" /> Лид</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" /> Уулзалт</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-status-success" /> Гэрээ</span>
                </div>
            }
            bodyClassName="flex flex-col"
        >
            {loading || !data ? (
                <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : data.rows.length === 0 ? (
                <EmptyRow>Энэ сард лид бүртгэгдээгүй</EmptyRow>
            ) : (
                <>
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px]">
                        <b className="num font-semibold text-foreground">{data.totals.leads}</b><span className="text-muted-foreground">лид</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <b className="num font-semibold text-foreground">{data.totals.viewings}</b><span className="text-muted-foreground">уулзалт</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <b className="num font-semibold text-foreground">{data.totals.contracts}</b><span className="text-muted-foreground">гэрээ</span>
                        <span className="ml-auto text-[11.5px] text-muted-foreground">Хөрвөлт = гэрээ / лид</span>
                    </div>
                    <div className="flex flex-col gap-3 p-4">
                        {data.rows.map((r) => (
                            <div key={r.source} className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 text-[12.5px]">
                                    <span className="font-medium text-foreground">{sourceLabel(r.source)}</span>
                                    <span className="mono-label ml-auto text-[12px] text-fg-2">{r.leads} → {r.viewings} → {r.contracts}</span>
                                    <span className={cn('num w-12 text-right text-[12px] font-medium', r.conversionPct > 0 ? 'text-foreground' : 'text-muted-foreground')}>{r.conversionPct}%</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <div className="h-1.5 rounded-sm bg-brand-soft" style={{ width: `${(r.leads / max) * 100}%` }} />
                                    <div className="h-1.5 rounded-sm bg-brand" style={{ width: `${(r.viewings / max) * 100}%` }} />
                                    <div className="h-1.5 rounded-sm bg-status-success" style={{ width: `${(r.contracts / max) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Panel>
    );
}
