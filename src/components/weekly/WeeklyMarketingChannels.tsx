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
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import { Skeleton } from '@/components/dashboard/v2/primitives';

type ChannelResponse = { latest: ChannelReportMatches };

/** Хурлын тайланд харуулах нэмэлт үзүүлэлт (эх үүсвэр бүрийн гол үзүүлэлтийн дараа). */
const EXTRA: Record<ChannelSource, string[]> = {
    meta_ads: ['results', 'cost_per_result', 'post_engagements'],
    facebook_page: ['viewers', 'link_clicks', 'views_ads', 'views_organic'],
    callpro: ['selected', 'calls_total', 'unique_callers'],
    sms: ['delivery_rate'],
};

function format(source: ChannelSource, key: string, value: number | string | null | undefined, currency?: string) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string') return value;
    const kind = channelMetric(source, key)?.kind;
    if (kind === 'money') return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
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
    if (!delta?.comparable || delta.delta === null) return <span className="text-[11px] text-muted-foreground">өмнөх —</span>;
    const sign = delta.delta > 0 ? '+' : '';
    return <span className={cn('text-[11px]', delta.delta > 0 ? 'text-status-success' : delta.delta < 0 ? 'text-status-danger' : 'text-muted-foreground')}>
        {sign}{delta.delta.toLocaleString('en-US', { maximumFractionDigits: 2 })}{delta.pct !== null ? ` (${sign}${delta.pct}%)` : ''}
    </span>;
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
            <div className="grid gap-3 md:grid-cols-2">
                {CHANNEL_SOURCES.filter(source => query.data.latest[source]?.report).map(source => {
                    const match = query.data.latest[source];
                    const report = match.report!;
                    const currency = typeof report.totals.currency === 'string' ? report.totals.currency : undefined;
                    const keys = [...channelKeyMetrics(source), ...EXTRA[source]].filter(key => report.totals[key] !== undefined);
                    const missedByHour = source === 'callpro'
                        ? report.breakdown.filter(row => row.kind === 'hour' && (row.values.missed ?? 0) > 0).sort((a, b) => (b.values.missed ?? 0) - (a.values.missed ?? 0)).slice(0, 3)
                        : [];
                    const campaigns = source === 'meta_ads'
                        ? report.breakdown.filter(row => row.kind === 'campaign').sort((a, b) => (b.values.spend ?? 0) - (a.values.spend ?? 0)).slice(0, 4)
                        : [];
                    return (
                        <section key={source} className="break-inside-avoid rounded-2xl border border-border p-4" aria-label={CHANNEL_SOURCE_LABELS[source]}>
                            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="text-sm font-medium">{CHANNEL_SOURCE_LABELS[source]}</h3>
                                <span className={cn('text-[11px]', match.exact ? 'text-muted-foreground' : 'text-status-pending')}>
                                    {report.period_from} – {report.period_to}{match.exact ? '' : ' · хурлын долоо хоногтой зөрүүтэй'}
                                </span>
                            </header>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                                {keys.map(key => <div key={key}>
                                    <dt className="text-[11px] text-muted-foreground">{channelMetric(source, key)?.label ?? key}</dt>
                                    <dd className="num text-[15px] font-semibold">{format(source, key, report.totals[key], currency)}</dd>
                                    <dd><Delta delta={match.comparison?.[key]} /></dd>
                                </div>)}
                            </dl>
                            {campaigns.length > 0 && <ul className="mt-3 space-y-1 border-t border-border pt-2 text-[11.5px] text-fg-2">
                                {campaigns.map(row => <li key={row.label} className="flex justify-between gap-3"><span className="truncate">{row.label}</span><span className="num shrink-0">{format(source, 'spend', row.values.spend, currency)}</span></li>)}
                            </ul>}
                            {missedByHour.length > 0 && <p className="mt-3 border-t border-border pt-2 text-[11.5px] text-fg-2">
                                Алдсан дуудлага их цаг: {missedByHour.map(row => `${row.label} (${row.values.missed})`).join(', ')}
                            </p>}
                            {report.warnings.length > 0 && <p className="mt-2 text-[11px] text-status-pending">{report.warnings.length} анхааруулгатай импорт — импортын хуудсанд шалгана уу.</p>}
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
