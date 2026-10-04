'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { cn } from '@/lib/utils';
import {
    CHANNEL_SOURCE_LABELS, CHANNEL_SOURCES, channelKeyMetrics, channelMetric, type ChannelSource, type MetricDelta,
} from '@/lib/marketing/channel-reports';
import { reportCoverage, type ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import {
    META_RESULT_DEFS, META_RESULT_TYPES, metaResultCostKey, metaResultKey, metaResultSpendKey, presentMetaResultTypes, type MetaResultType,
} from '@/lib/marketing/meta-results';
import { Skeleton } from '@/components/dashboard/v2/primitives';

type ChannelResponse = { latest: ChannelReportMatches };

/** Хурлын тайланд харуулах нэмэлт үзүүлэлт (эх үүсвэр бүрийн гол үзүүлэлтийн дараа). Meta-гийн үр дүнг төрлөөр нь доор. */
const EXTRA: Record<ChannelSource, string[]> = {
    meta_ads: [],
    facebook_page: ['viewers', 'link_clicks', 'views_ads', 'views_organic'],
    callpro: ['selected', 'calls_total', 'unique_callers'],
    sms: ['delivery_rate'],
};

/** Мөнгө: 0.01-ээс бага өртгийг (постын оролцоо ~0.0037) 0 болгохгүй — 4 орон хүртэл. */
function money(value: number, currency?: string) {
    const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
    return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })}${currency ? ` ${currency}` : ''}`;
}

function format(source: ChannelSource, key: string, value: number | string | null | undefined, currency?: string) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string') return value;
    const kind = channelMetric(source, key)?.kind;
    if (kind === 'money') return money(value, currency);
    if (kind === 'percent') return `${value}%`;
    if (kind === 'duration') {
        const seconds = Math.round(value);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h ? `${h} ц ${m} мин` : `${m} мин ${seconds % 60} сек`;
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function Delta({ delta }: { delta?: MetricDelta }) {
    if (delta && !delta.comparable && delta.reason === 'coverage') return <span className="text-[11px] text-muted-foreground">өдөр дутуу — харьцуулаагүй</span>;
    if (!delta?.comparable || delta.delta === null) return <span className="text-[11px] text-muted-foreground">өмнөх —</span>;
    const sign = delta.delta > 0 ? '+' : '';
    return <span className={cn('text-[11px]', delta.delta > 0 ? 'text-status-success' : delta.delta < 0 ? 'text-status-danger' : 'text-muted-foreground')}>
        {sign}{delta.delta.toLocaleString('en-US', { maximumFractionDigits: 2 })}{delta.pct !== null ? ` (${sign}${delta.pct}%)` : ''}
    </span>;
}

const isResultType = (tag: string | undefined): tag is MetaResultType => !!tag && (META_RESULT_TYPES as readonly string[]).includes(tag);
/** Нэг үр дүнгийн өртөг (reach бол 1000 хүнд). */
const costOf = (type: MetaResultType, value: unknown, currency?: string) =>
    typeof value === 'number' ? `${money(value, currency)}${META_RESULT_DEFS[type].costScale === 1000 ? ' / 1000 хүн' : ''}` : '—';

/** Meta-гийн үр дүн төрөл бүрээр: тоо (reach-ийг өдрөөр нэмэхгүй тул «—» байж болно) ба нэг үр дүнгийн өртөг. */
function MetaResults({ totals, comparison, currency }: { totals: Record<string, number | string>; comparison: Record<string, MetricDelta> | null; currency?: string }) {
    const types = presentMetaResultTypes(totals);
    if (!types.length) return null;
    return <div className="mt-3 border-t border-border pt-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Үр дүн төрлөөр</p>
        <ul className="space-y-1.5 text-[12px]">
            {types.map(type => {
                const def = META_RESULT_DEFS[type];
                const results = totals[metaResultKey(type)];
                const cost = totals[metaResultCostKey(type)];
                const spend = totals[metaResultSpendKey(type)];
                const delta = comparison?.[metaResultKey(type)];
                return <li key={type} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                    <span className="min-w-0">{def.label}</span>
                    <span className="num text-right font-semibold" title={typeof results === 'number' ? undefined : 'Хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй'}>{typeof results === 'number' ? results.toLocaleString('en-US') : '—'}</span>
                    <span className="num col-span-2 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        {/* Өртөг тооцох боломжгүй (reach) бол тухайн төрлийн зардлыг харуулна. */}
                        <span>{typeof cost === 'number' ? `${def.costLabel}: ${costOf(type, cost, currency)}` : `Зардал: ${typeof spend === 'number' ? money(spend, currency) : '—'}`}</span>
                        {typeof results === 'number' && delta && (delta.delta !== null || delta.reason === 'coverage') && <Delta delta={delta} />}
                    </span>
                </li>;
            })}
        </ul>
    </div>;
}

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
                    const currency = typeof report.totals.currency === 'string' ? report.totals.currency : undefined;
                    const keys = [...channelKeyMetrics(source), ...EXTRA[source]].filter(key => report.totals[key] !== undefined);
                    const coverage = reportCoverage(report);
                    // Өдрийн хамралт дутуу долоо хоногийг өмнөхтэй тулгахгүй — хавтан бүрт биш, нэг удаа тайлбарлана.
                    const partial = Object.values(match.comparison ?? {}).some(delta => delta.reason === 'coverage');
                    const warnings = report.warnings.filter(warning => warning.level === 'warning');
                    const missedByHour = source === 'callpro'
                        ? report.breakdown.filter(row => row.kind === 'hour' && (row.values.missed ?? 0) > 0).sort((a, b) => (b.values.missed ?? 0) - (a.values.missed ?? 0)).slice(0, 3)
                        : [];
                    const campaigns = source === 'meta_ads'
                        ? report.breakdown.filter(row => row.kind === 'campaign' && (row.values.spend ?? 0) > 0).sort((a, b) => (b.values.spend ?? 0) - (a.values.spend ?? 0)).slice(0, 4)
                        : [];
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
                                    <dd className="num text-[15px] font-semibold">{format(source, key, report.totals[key], currency)}</dd>
                                    {!partial && <dd><Delta delta={match.comparison?.[key]} /></dd>}
                                </div>)}
                            </dl>
                            {source === 'meta_ads' && <MetaResults totals={report.totals} comparison={partial ? null : match.comparison} currency={currency} />}
                            {campaigns.length > 0 && <ul className="mt-3 space-y-1 border-t border-border pt-2 text-[11.5px] text-fg-2" aria-label="Их зардалтай кампанит ажил">
                                {campaigns.map((row, index) => <li key={`${row.label}:${row.tag ?? ''}:${index}`} className="flex justify-between gap-3">
                                    <span className="min-w-0 truncate">{row.label}</span>
                                    <span className="num shrink-0">
                                        {isResultType(row.tag) && <span className="text-muted-foreground">{typeof row.values.results === 'number' ? `${row.values.results.toLocaleString('en-US')} ` : ''}{META_RESULT_DEFS[row.tag].label} · </span>}
                                        {format(source, 'spend', row.values.spend, currency)}
                                    </span>
                                </li>)}
                            </ul>}
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
                <Link href="/marketing/channel-reports" className="inline-flex items-center gap-1 text-brand hover:underline focus-ring print:hidden">Экспорт импорт<ArrowUpRight className="size-3" /></Link>
            </p>}
        </div>
    );
}
