'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { cn } from '@/lib/utils';
import { CHANNEL_LIMITS, CHANNEL_SOURCE_LABELS, CHANNEL_SOURCES, channelKeyMetrics, channelMetric, formatChannelValue, type ChannelSource, type MetricDelta } from '@/lib/marketing/channel-reports';
import { reportCoverage, type ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import {
    META_WEEK_KEYS, channelCurrency, comparisonBlockedByCoverage, formatChannelDelta, formatChannelMetric, metaCampaignRows, metaCampaignsBySpend, metaCostText,
    metaMissingResultsReason, metaReachIsSum, metaResultsByType, metaUntypedSpend,
} from '@/lib/marketing/channel-week';
import { META_RESULT_DEFS, isMetaResultType, metaResultKey } from '@/lib/marketing/meta-results';
import { ChannelBreakdownTable } from '@/components/marketing/ChannelReportParts';
import { Skeleton } from '@/components/dashboard/v2/primitives';

type ChannelResponse = { latest: ChannelReportMatches };

/**
 * Хурлын тайланд харуулах үзүүлэлт. Meta зар = Лхагвагийн слайдын «Meta зар — долоо хоногийн тойм»-той
 * ижил (`META_WEEK_KEYS`); бусад эх үүсвэрт гол үзүүлэлтийн дараа нэмэлт. Meta-гийн үр дүнг төрлөөр нь доор.
 */
const EXTRA: Record<Exclude<ChannelSource, 'meta_ads'>, string[]> = {
    facebook_page: ['viewers', 'link_clicks', 'views_ads', 'views_organic'],
    callpro: ['selected', 'calls_total', 'unique_callers'],
    sms: ['delivery_rate'],
};
const cardKeys = (source: ChannelSource): string[] => source === 'meta_ads' ? [...META_WEEK_KEYS] : [...channelKeyMetrics(source), ...EXTRA[source]];

function Delta({ delta }: { delta?: MetricDelta }) {
    if (delta && !delta.comparable && delta.reason === 'coverage') return <span className="text-[11px] text-muted-foreground">өдөр дутуу — харьцуулаагүй</span>;
    const text = formatChannelDelta(delta);
    if (!text || !delta) return <span className="text-[11px] text-muted-foreground">өмнөх —</span>;
    return <span className={cn('text-[11px]', delta.delta! > 0 ? 'text-status-success' : delta.delta! < 0 ? 'text-status-danger' : 'text-muted-foreground')}>{text}</span>;
}

/**
 * Meta-гийн үр дүн төрөл бүрээр: тоо («—» = тоо ирээгүй, зардлыг харуулна) ба нэг үр дүнгийн өртөг. Төрөл хооронд
 * нийлбэргүй. `reachSum` = API-ийн хүрсэн хүн нь хэд хэдэн кампанит ажлын reach-ийн нийлбэр (давхцаж болно) → «≈».
 */
function MetaResults({ totals, comparison, currency, reachSum }: { totals: Record<string, number | string>; comparison: Record<string, MetricDelta> | null; currency: string | null; reachSum: boolean }) {
    const types = metaResultsByType(totals);
    if (!types.length) return null;
    const untyped = metaUntypedSpend(totals);
    const approx = (type: string) => reachSum && type === 'reach';
    return <div className="mt-3 border-t border-border pt-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Үр дүн төрлөөр</p>
        <ul className="space-y-1.5 text-[12px]">
            {types.map(row => {
                const delta = comparison?.[metaResultKey(row.type)];
                return <li key={row.type} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                    <span className="min-w-0">{row.label}</span>
                    <span className="num text-right font-semibold" title={row.results === null ? metaMissingResultsReason(row.type) : approx(row.type) ? REACH_SUM_NOTE : undefined}>
                        {row.results === null ? '—' : `${approx(row.type) ? '≈ ' : ''}${row.results.toLocaleString('en-US')}`}
                    </span>
                    <span className="num col-span-2 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        {/* Өртөг тооцох боломжгүй (тоо ирээгүй) бол тухайн төрлийн зардлыг харуулна. */}
                        <span>{row.cost !== null ? `${META_RESULT_DEFS[row.type].costLabel}: ${approx(row.type) ? '≈ ' : ''}${metaCostText(row.type, row.cost, currency)}` : `Зардал: ${row.spend !== null ? formatChannelValue(row.spend, 'money', currency) : '—'}`}</span>
                        {row.results !== null && delta && (delta.delta !== null || delta.reason === 'coverage') && <Delta delta={delta} />}
                    </span>
                </li>;
            })}
        </ul>
        {/* Meta API төрөлгүй кампанит ажлын зардлыг анхааруулгагүйгээр нийтэд л оруулдаг — нийт ≠ Σ төрлийн зардал. */}
        {untyped !== null && <p className="num mt-1.5 text-[11px] text-muted-foreground">Үр дүнгийн төрөлгүй зардал: {formatChannelValue(untyped, 'money', currency)}</p>}
        {reachSum && types.some(row => row.type === 'reach' && row.results !== null) && <p className="mt-1.5 text-[11px] text-muted-foreground">≈ {REACH_SUM_NOTE}</p>}
    </div>;
}

const REACH_SUM_NOTE = 'Хүрсэн хүн (үр дүн): reach зорилготой кампанит ажлуудын давхардалгүй reach-ийн нийлбэр — кампанит ажил хооронд давхцаж болно.';

/** Meta Ads, Facebook хуудас, CallPro, масс SMS-ийн экспорт — хурлын долоо хоногийн тоо, өмнөх тайлантай харьцуулсан. */
export function WeeklyMarketingChannels({ from, to }: { from: string; to: string }) {
    const { shop, user } = useAuth();
    const query = useQuery<ChannelResponse>({
        queryKey: ['channel-reports', 'weekly', shop?.id, user?.id, from, to],
        queryFn: ({ signal }) => dashboardJson(`/api/marketing/channel-reports?from=${from}&to=${to}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id, staleTime: 60_000, retry: 1,
    });
    if (query.isPending) return <Skeleton className="h-40" />;
    if (!query.data) return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">Сувгийн экспортыг ачаалж чадсангүй. {query.error?.message}</p>;
    const missing = CHANNEL_SOURCES.filter(source => !query.data.latest[source]?.report);

    return (
        <div className="space-y-3">
            {/* Урт файлын нэр (Meta-гийн экспорт ~120 тэмдэгт) картыг утсанд тэлэхгүй: grid-ийн хүүхэд min-w-0. */}
            <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
                {CHANNEL_SOURCES.filter(source => query.data.latest[source]?.report).map(source => {
                    const match = query.data.latest[source];
                    const report = match.report!;
                    const currency = channelCurrency(report.totals);
                    const keys = cardKeys(source).filter(key => report.totals[key] !== undefined);
                    const coverage = reportCoverage(report);
                    // Өдрийн хамралт дутуу долоо хоногийг өмнөхтэй тулгахгүй — хавтан бүрт биш, нэг удаа тайлбарлана.
                    const partial = comparisonBlockedByCoverage(match.comparison);
                    const warnings = report.warnings.filter(warning => warning.level === 'warning');
                    const missedByHour = source === 'callpro'
                        ? report.breakdown.filter(row => row.kind === 'hour' && (row.values.missed ?? 0) > 0).sort((a, b) => (b.values.missed ?? 0) - (a.values.missed ?? 0)).slice(0, 3)
                        : [];
                    // Кампанит ажил × үр дүнгийн төрөл, зардлаар (слайдын «Meta зар — кампанит ажлаар»-тай ижил дараалал);
                    // нийт зардалгүй (валют холилдсон) файлд мөрийн зардал алга тул «их зардалтай» жагсаалт гарахгүй.
                    const allCampaigns = source === 'meta_ads' ? metaCampaignRows(report) : [];
                    const campaigns = allCampaigns.filter(row => (row.values.spend ?? 0) > 0).slice(0, 4);
                    return (
                        <section key={source} className="break-inside-avoid rounded-2xl border border-border p-4" aria-label={CHANNEL_SOURCE_LABELS[source]}>
                            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="flex min-w-0 max-w-full flex-wrap items-baseline gap-2 text-sm font-medium">
                                    {CHANNEL_SOURCE_LABELS[source]}
                                    <span className={cn('min-w-0 max-w-full truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-normal', report.origin === 'api' ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-muted-foreground')}
                                        title={report.origin === 'api' ? 'Meta Marketing API-аас автоматаар' : report.file_name ? `Экспорт файл: ${report.file_name}` : 'Экспорт файлаас'}>
                                        {report.origin === 'api' ? 'Meta API' : report.file_name || 'Файл'}
                                    </span>
                                </h3>
                                <span className={cn('text-[11px]', match.exact && !coverage?.partial ? 'text-muted-foreground' : 'text-status-pending')}>
                                    {report.period_from} – {report.period_to}
                                    {match.longer ? ' · өөр хугацааны тайлан (хурлын долоо хоногоос урт)' : match.exact ? '' : ' · хурлын долоо хоногтой зөрүүтэй'}
                                    {coverage?.partial ? ` · ${coverage.covered}/${coverage.days} өдөр` : ''}
                                </span>
                            </header>
                            {partial && <p className="-mt-2 mb-3 text-[11px] text-status-pending">Өдөр дутуу тул өмнөх долоо хоногтой харьцуулаагүй.</p>}
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                                {keys.map(key => <div key={key}>
                                    <dt className="text-[11px] text-muted-foreground">{channelMetric(source, key)?.label ?? key}</dt>
                                    <dd className="num text-[15px] font-semibold">{formatChannelMetric(source, key, report.totals[key], currency)}</dd>
                                    {!partial && <dd><Delta delta={match.comparison?.[key]} /></dd>}
                                </div>)}
                            </dl>
                            {source === 'meta_ads' && <MetaResults totals={report.totals} comparison={partial ? null : match.comparison} currency={currency} reachSum={metaReachIsSum(report)} />}
                            {campaigns.length > 0 && <ul className="mt-3 space-y-1 border-t border-border pt-2 text-[11.5px] text-fg-2" aria-label="Их зардалтай кампанит ажил">
                                {campaigns.map((row, index) => <li key={`${row.label}:${row.tag ?? ''}:${index}`} className="flex justify-between gap-3">
                                    <span className="min-w-0 truncate">{row.label}</span>
                                    <span className="num shrink-0">
                                        {isMetaResultType(row.tag) && <span className="text-muted-foreground">{typeof row.values.results === 'number' ? `${row.values.results.toLocaleString('en-US')} ` : ''}{META_RESULT_DEFS[row.tag].label} · </span>}
                                        {formatChannelMetric(source, 'spend', row.values.spend, currency)}
                                    </span>
                                </li>)}
                            </ul>}
                            {allCampaigns.length > 0 && <details className="mt-2 text-[11.5px]">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground print:hidden">Кампанит ажлын хүснэгт ({allCampaigns.length} мөр{metaCampaignsBySpend(report.totals) ? '' : ', харагдалтаар'})</summary>
                                <div className="mt-2"><ChannelBreakdownTable source="meta_ads" rows={allCampaigns} totals={report.totals} limit={CHANNEL_LIMITS.breakdown} /></div>
                            </details>}
                            {missedByHour.length > 0 && <p className="mt-3 border-t border-border pt-2 text-[11.5px] text-fg-2">
                                Алдсан дуудлага их цаг: {missedByHour.map(row => `${row.label} (${row.values.missed})`).join(', ')}
                            </p>}
                            {warnings.length > 0 && <p className="mt-2 text-[11px] text-status-pending" title={warnings.slice(0, 3).map(warning => warning.message).join('\n')}>
                                {report.origin === 'api' ? `Meta API синкийн ${warnings.length} анхааруулга.` : `${warnings.length} анхааруулгатай импорт — импортын хуудсанд шалгана уу.`}
                            </p>}
                        </section>
                    );
                })}
            </div>
            {missing.length > 0 && <p className="text-xs text-muted-foreground">
                Экспорт оруулаагүй: {missing.map(source => CHANNEL_SOURCE_LABELS[source]).join(', ')}.{' '}
                <Link href="/marketing/channel-reports" className="inline-flex items-center gap-1 text-brand-strong hover:underline focus-ring print:hidden">Экспорт импорт<ArrowUpRight className="size-3" /></Link>
            </p>}
        </div>
    );
}
