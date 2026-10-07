'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Megaphone, Coins, FolderX, UserX, Unlink, Users } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useLeadSummary } from '@/hooks/useLeads';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { useRegisterAiContext } from '@/lib/ai/context';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import { Panel, Skeleton } from '@/components/dashboard/v2/primitives';
import { AiPromptCard, AttentionRow, KpiTile, TodayHeader, WeeklyMeetingCard } from './parts';

/**
 * Маркетингийн ажилтны «Өнөөдөр»: энэ сарын лид, менежерт шилжсэн, гэрээтэй лид, нэг лидийн өртөг;
 * засах шаардлагатай бүртгэл (кампанит ажилгүй лид, ханшгүй зардал), суваг ба сүүлд дууссан ажил.
 * Өгөгдөл Маркетингийн тайлантай нэг /api/marketing/performance (бүтэн сар — зорилт зөвхөн бүтэн сард).
 */

const AI_SUGGESTIONS: [string, string][] = [
    ['Сарын явцыг дүгнэх', 'get_marketing_performance ашиглан энэ сарын маркетингийн гүйцэтгэлийг зорилттой харьцуулж дүгнэ. Дутуу өгөгдлийг дурд, 3 дараагийн ажил санал болго.'],
    ['Сувгуудыг харьцуулах', 'Энэ сарын сувгуудын лид, гэрээтэй лид, нэг лидийн өртгийг харьцуулж хамгийн үр ашигтай, сул сувгийг тайлбарла.'],
];

type Response = { report: MarketingPerformance };

function currentMonth() {
    const { year, month } = ubParts();
    const range = ubMonthRange(year, month - 1);
    return { month, from: ubDateStr(range.start), to: ubDateStr(new Date(range.end.getTime() - 1)) };
}

export function MarketingToday() {
    useRegisterAiContext({ type: 'dashboard' });
    const { shop, user } = useAuth();
    const [range] = useState(currentMonth);
    const canLeads = user?.role === 'super_admin' || !!user?.permissions?.modules?.includes('leads');
    const summary = useLeadSummary({ enabled: canLeads });
    const report = useQuery({
        queryKey: ['marketing-performance', 'today', shop?.id, user?.id, range.from, range.to],
        queryFn: () => dashboardJson<Response>(`/api/marketing/performance?from=${range.from}&to=${range.to}`),
        enabled: !!shop?.id,
        staleTime: 60_000,
        retry: false,
    });
    const r = report.data?.report;

    return (
        <>
            <TodayHeader
                sub={[shop?.name, `${range.month}-р сарын маркетинг`].filter(Boolean).join(' · ')}
                actions={<>
                    <Button size="sm" variant="ghost" href="/dashboard/weekly">Лхагвын хурал</Button>
                    <Button size="sm" variant="secondary" href="/marketing">Маркетингийн тайлан</Button>
                </>}
            />
            {report.isError && !r ? (
                <Alert variant="danger">
                    {report.error instanceof Error ? report.error.message : 'Маркетингийн мэдээллийг ачаалж чадсангүй.'}
                    <Button size="sm" variant="secondary" disabled={report.isFetching} onClick={() => void report.refetch()}>Дахин оролдох</Button>
                </Alert>
            ) : (
                <div className="flex flex-col gap-5">
                    {report.isError && <Alert variant="warning">
                        Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.
                        <Button size="sm" variant="secondary" disabled={report.isFetching} onClick={() => void report.refetch()}>Дахин оролдох</Button>
                    </Alert>}
                    <Kpis report={r} month={range.month} />
                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="flex min-w-0 flex-col gap-5">
                            <Attention report={r} summary={canLeads ? summary : null} />
                            <Channels report={r} />
                            <Recent report={r} />
                        </div>
                        <div className="flex flex-col gap-4">
                            <AiPromptCard suggestions={AI_SUGGESTIONS} />
                            <WeeklyMeetingCard />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 10) / 10}%`);

function Kpis({ report: r, month }: { report?: MarketingPerformance; month: number }) {
    if (!r) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}</div>;
    const t = r.totals;
    const team = r.teamTotal;
    const previous = `Өмнөх сар ${r.previous.leads}`;
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Маркетингийн гол үзүүлэлт">
            <KpiTile
                label={`Шинэ лид · ${month}-р сар`}
                value={t.leads}
                meter={team.leadAttainment}
                detail={team.leadTarget !== null ? <>Зорилт {team.leadTarget}-ийн <b className="font-semibold text-foreground">{pct(team.leadAttainment)}</b> · {previous}</> : <>{previous} · зорилт тавиагүй</>}
                source="CRM лид · үүссэн огноогоор"
            />
            <KpiTile
                label="Менежерт шилжсэн"
                value={t.sales}
                detail={<>Лидийн <b className="font-semibold text-foreground">{pct(t.salesPct)}</b> · өмнөх сар {r.previous.sales}</>}
                source="Хуваарилсан огноотой лид"
            />
            <KpiTile
                label="Гэрээтэй лид"
                value={t.deals}
                meter={team.dealAttainment}
                detail={team.dealTarget !== null ? <>Зорилт {team.dealTarget}-ийн <b className="font-semibold text-foreground">{pct(team.dealAttainment)}</b></> : <>Лидийн <b className="font-semibold text-foreground">{pct(t.dealPct)}</b></>}
                source="Хүчинтэй гэрээтэй лид"
            />
            <KpiTile
                label="Нэг лидийн өртөг"
                value={t.costPerLead !== null ? formatMNT(t.costPerLead) : '—'}
                unavailable={!t.hasSpend ? 'Зардал бүртгээгүй' : !t.spendComplete ? 'Ханш дутуу · тооцоогүй' : t.costPerLead === null ? 'Лид алга · тооцоогүй' : null}
                detail={t.hasSpend ? <>Зардал {formatMNTShort(t.spend)}{team.budget !== null ? ` / төсөв ${formatMNTShort(team.budget)}` : ''}</> : undefined}
                source="Бүртгэсэн зардал ÷ лид"
            />
        </div>
    );
}

function Attention({ report: r, summary }: { report?: MarketingPerformance; summary: ReturnType<typeof useLeadSummary> | null }) {
    if (!r) return <Panel title="Анхаарах"><div className="flex flex-col gap-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div></Panel>;
    const q = r.quality;
    const spend = r.spendQuality?.current;
    const unassigned = summary?.data?.queues.unassigned ?? 0;
    const rows = [
        unassigned > 0 && <AttentionRow key="unassigned" icon={Users} tone="pending" title={`${unassigned} лид менежерт хуваарилаагүй`} detail="Борлуулалтад шилжээгүй тул холбогдоогүй байж болно" action={{ label: 'Харах', href: '/dashboard/leads?queue=unassigned' }} />,
        q.noCampaign > 0 && <AttentionRow key="campaign" icon={Megaphone} tone="pending" title={`${q.noCampaign} лид кампанит ажилд холбогдоогүй`} detail="Кампанит ажлын үр дүн, өртөг дутуу гарна" action={{ label: 'Засах', href: '/marketing?tab=records' }} />,
        q.noOwner > 0 && <AttentionRow key="owner" icon={UserX} tone="neutral" title={`${q.noOwner} лид маркетингийн хариуцагчгүй`} detail="Багийн гүйцэтгэлд тоологдохгүй" action={{ label: 'Засах', href: '/marketing?tab=records' }} />,
        q.noProject > 0 && <AttentionRow key="project" icon={FolderX} tone="neutral" title={`${q.noProject} лид төсөлгүй`} detail="Төслийн үр дүнд тоологдохгүй" action={{ label: 'Засах', href: '/marketing?tab=records' }} />,
        !!spend?.missingFx && <AttentionRow key="fx" icon={Coins} tone="danger" title={`${spend.missingFx} зардал ханшгүй`} detail="Нийт зардал, нэг лидийн өртөгт ороогүй" action={{ label: 'Засах', href: '/marketing?tab=records' }} />,
        !!spend?.unmappedMeta && <AttentionRow key="meta" icon={Unlink} tone="neutral" title={`${spend.unmappedMeta} Meta зардал кампанит ажилгүй`} detail="Кампанит ажлын өртөгт хуваарилагдаагүй" action={{ label: 'Засах', href: '/marketing?tab=records' }} />,
    ].filter(Boolean);
    return (
        <Panel title="Анхаарах" sub={rows.length ? `${rows.length} зүйл` : undefined} bodyClassName="px-4 py-1">
            {summary?.isError && <p className="border-b border-border py-2.5 text-xs text-muted-foreground">Хуваарилаагүй лидийн тоог ачаалж чадсангүй.</p>}
            {rows.length === 0 ? <p className="py-4 text-sm text-fg-2">Бүртгэл бүрэн — засах зүйл алга.</p> : <ul>{rows}</ul>}
        </Panel>
    );
}

function Channels({ report: r }: { report?: MarketingPerformance }) {
    const rows = (r?.channels ?? []).filter((c) => c.leads > 0 || c.spend > 0).sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    return (
        <Panel title="Сувгууд" sub="энэ сарын лид ба зардал" right={<Link href="/marketing" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">Дэлгэрэнгүй <ArrowRight className="size-3.5" aria-hidden /></Link>}>
            {!r ? <div className="p-4"><Skeleton className="h-32" /></div> : rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Энэ сард лид, зардал бүртгэгдээгүй</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="h-9 bg-surface-2 text-xs text-muted-foreground">
                                <th scope="col" className="px-4 text-left font-medium">Суваг</th>
                                <th scope="col" className="px-2 text-right font-medium">Лид</th>
                                <th scope="col" className="px-2 text-right font-medium">Шилжсэн</th>
                                <th scope="col" className="px-2 text-right font-medium">Гэрээтэй</th>
                                <th scope="col" className="px-2 text-right font-medium">Зардал</th>
                                <th scope="col" className="px-4 text-right font-medium">Нэг лид</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => (
                                <tr key={c.id} className="h-10 border-b border-border last:border-b-0">
                                    <td className="px-4 font-medium text-foreground">{c.name}</td>
                                    <td className="num px-2 text-right text-foreground">{c.leads}</td>
                                    <td className="num px-2 text-right text-fg-2">{c.sales}</td>
                                    <td className="num px-2 text-right text-fg-2">{c.deals}</td>
                                    <td className="num px-2 text-right text-fg-2">{c.hasSpend ? formatMNTShort(c.spend) : '—'}</td>
                                    <td className="num px-4 text-right text-fg-2">{c.costPerLead !== null ? formatMNT(c.costPerLead) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Panel>
    );
}

function Recent({ report: r }: { report?: MarketingPerformance }) {
    const rows = (r?.recent ?? []).slice(0, 5);
    return (
        <Panel title="Сүүлд дууссан ажил" sub="кампанит ажил, контент">
            {!r ? <div className="p-4"><Skeleton className="h-24" /></div> : rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Энэ сард дууссан ажил бүртгэгдээгүй</p>
            ) : (
                <ul>
                    {rows.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">{a.name}</div>
                                <div className="truncate text-xs text-muted-foreground">{[a.activity_kind === 'campaign' ? 'Кампанит ажил' : 'Контент', a.projectName, a.completed_on].filter(Boolean).join(' · ')}</div>
                            </div>
                            <span className="num text-xs text-fg-2">{a.leads} лид · {a.deals} гэрээ</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
