'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirmToast } from '@/components/ui/Toast';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { CHANNEL_SOURCES, CHANNEL_SOURCE_LABELS, channelKeyMetrics, channelMetric, formatChannelValue, type ChannelSource } from '@/lib/marketing/channel-reports';
import { reportCoverage, type ChannelReportMatches, type ChannelReportSummary } from '@/lib/marketing/channel-reports-load';
import { META_RESULT_DEFS, metaResultKey, presentMetaResultTypes } from '@/lib/marketing/meta-results';
import { ChannelTotalsGrid, MetaResultsByType, MissedCallsByHour, formatMetric } from './ChannelReportParts';
import { CHANNEL_REPORTS_ENDPOINT } from './ChannelReportImport';

export interface ChannelReportsListResponse { reports: ChannelReportSummary[]; latest: ChannelReportMatches }
export type ChannelSourceFilter = ChannelSource | 'all';

const updatedAt = (value: string) => new Date(value).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'short', timeStyle: 'short' });
/** Эх сурвалж: Meta API эсвэл файлын нэр. */
const originText = (report: ChannelReportSummary) => report.origin === 'api' ? 'Meta API' : report.file_name || 'файл';
/** «6/7 өдөр» — тайлангийн хугацааг бүрэн хамраагүй үед л. */
const coverageNote = (report: ChannelReportSummary) => {
    const coverage = reportCoverage(report);
    return coverage?.partial ? `${coverage.covered}/${coverage.days} өдөр` : null;
};

/** Эх үүсвэр бүрийн сүүлийн тайлан (өмнөх ижил урттай тайлантай харьцуулсан) ба хадгалсан тайлангууд. */
export function ChannelReportList({ data, filter, onFilter, canDelete, shopId }: {
    data: ChannelReportsListResponse;
    filter: ChannelSourceFilter;
    onFilter: (filter: ChannelSourceFilter) => void;
    canDelete: boolean;
    shopId: string;
}) {
    const cache = useQueryClient();
    const [deleting, setDeleting] = useState<string | null>(null);
    const latest = CHANNEL_SOURCES.filter(source => data.latest[source]?.report && (filter === 'all' || filter === source));

    async function remove(report: ChannelReportSummary) {
        const ok = await confirmToast({
            title: 'Тайланг устгах уу?',
            // Meta API-ийн тайланг файлаар солихын тулд эхлээд устгадаг; синк холбогдсон хэвээр бол буцааж бичнэ.
            description: `${CHANNEL_SOURCE_LABELS[report.source]} · ${report.period_from} – ${report.period_to}. ${report.origin === 'api' ? 'Дараагийн Meta синк (35 хоногийн дотор) сэргээнэ.' : 'Файлаа дахин импортлож сэргээнэ.'}`,
            confirmLabel: 'Устгах', destructive: true,
        });
        if (!ok) return;
        setDeleting(report.id);
        try {
            const response = await dashboardFetch(`${CHANNEL_REPORTS_ENDPOINT}?id=${encodeURIComponent(report.id)}`, { method: 'DELETE', shopId });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Устгаж чадсангүй.');
            toast.success('Тайлан устгагдлаа.');
            await cache.invalidateQueries({ queryKey: ['marketing-channel-reports'] });
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Устгаж чадсангүй.'); }
        finally { setDeleting(null); }
    }

    return <div className="space-y-5">
        <nav aria-label="Эх үүсвэрээр шүүх" className="flex gap-1 overflow-x-auto border-b border-border pb-3">
            {(['all', ...CHANNEL_SOURCES] as const).map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => onFilter(key)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors focus-ring ${filter === key ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface-2'}`}>
                {key === 'all' ? 'Бүгд' : CHANNEL_SOURCE_LABELS[key]}
            </button>)}
        </nav>

        {!!latest.length && <div className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            {latest.map(source => {
                const match = data.latest[source];
                const report = match.report!;
                // Өдрийн хамралт дутуу бол хавтан бүрт давтахгүй, нэг удаа тайлбарлана.
                const partial = Object.values(match.comparison ?? {}).some(delta => delta.reason === 'coverage');
                const comparison = match.previous && !partial ? match.comparison : null;
                return <article key={source} className="space-y-3 rounded-2xl border border-border p-4" aria-label={`${CHANNEL_SOURCE_LABELS[source]} сүүлийн тайлан`}>
                    <header className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold">{CHANNEL_SOURCE_LABELS[source]}</h3>
                        <p className="text-xs text-muted-foreground">{report.period_from} – {report.period_to}{coverageNote(report) ? ` · ${coverageNote(report)}` : ''} · {originText(report)}{match.previous ? ` · өмнөх ${match.previous.period_from} – ${match.previous.period_to}` : ' · харьцуулах өмнөх тайлан алга'}</p>
                    </header>
                    {partial && <p className="text-xs text-status-pending">Аль нэг долоо хоногийн өдрийн хамралт дутуу тул өмнөх тайлантай харьцуулаагүй.</p>}
                    <ChannelTotalsGrid source={source} totals={report.totals} comparison={comparison} keys={channelKeyMetrics(source)} />
                    {source === 'meta_ads' && <MetaResultsByType totals={report.totals} comparison={comparison} />}
                    {source === 'callpro' && <MissedCallsByHour breakdown={report.breakdown} />}
                </article>;
            })}
        </div>}

        {data.reports.length ? <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Хадгалсан тайлангууд">
            <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-xs text-muted-foreground"><tr>
                    {['Эх үүсвэр', 'Хугацаа', 'Гол үзүүлэлт', 'Файл / API', 'Шинэчилсэн', ''].map((label, i) => <th key={`${label}-${i}`} scope="col" className="px-3 py-2 font-medium">{label}</th>)}
                </tr></thead>
                <tbody>{data.reports.map(report => {
                    const warnings = report.warnings.filter(w => w.level === 'warning');
                    const coverage = coverageNote(report);
                    const resultTypes = report.source === 'meta_ads' ? presentMetaResultTypes(report.totals) : [];
                    return <tr key={report.id} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-medium">{CHANNEL_SOURCE_LABELS[report.source]}</td>
                        <td className="num whitespace-nowrap px-3 py-2">{report.period_from} – {report.period_to}{coverage && <span className="block text-xs text-status-pending">{coverage}</span>}</td>
                        <td className="px-3 py-2 text-xs">
                            <p className="flex flex-wrap gap-x-3 gap-y-1">{channelKeyMetrics(report.source).map(key => <span key={key}>
                                <span className="text-muted-foreground">{channelMetric(report.source, key)?.label}:</span>{' '}
                                <span className="num">{typeof report.totals[key] === 'number' ? formatMetric(report.source, key, report.totals[key], report.totals) : 'тооцоогүй'}</span>
                            </span>)}</p>
                            {!!resultTypes.length && <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{resultTypes.map(type => <span key={type}>
                                <span className="text-muted-foreground">{META_RESULT_DEFS[type].label}:</span>{' '}
                                <span className="num">{typeof report.totals[metaResultKey(type)] === 'number' ? formatChannelValue(report.totals[metaResultKey(type)] as number, 'count') : '—'}</span>
                            </span>)}</p>}
                            {!!warnings.length && <Badge variant="warning" className="mt-1" title={warnings.slice(0, 3).map(w => w.message).join('\n')}>{warnings.length} анхааруулга</Badge>}
                            {report.note && <p className="mt-1 text-muted-foreground">{report.note}</p>}
                        </td>
                        <td className="max-w-48 break-words px-3 py-2 text-xs text-muted-foreground">{report.origin === 'api' ? <Badge variant="brand">Meta API</Badge> : report.file_name || '—'} · {report.row_count} мөр</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{updatedAt(report.updated_at)}</td>
                        <td className="px-3 py-2 text-right">{canDelete && <Button size="iconSm" variant="ghost" aria-label={`${CHANNEL_SOURCE_LABELS[report.source]} ${report.period_from} – ${report.period_to} тайланг устгах`}
                            isLoading={deleting === report.id} disabled={!!deleting} onClick={() => void remove(report)}>{deleting !== report.id && <Trash2 />}</Button>}</td>
                    </tr>;
                })}</tbody>
            </table>
        </div> : <EmptyState title="Хадгалсан тайлан алга" description="Экспорт файлаа оруулж, баганаа холбоод хадгална уу." />}
    </div>;
}
