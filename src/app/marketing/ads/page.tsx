'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, DollarSign, Eye, MousePointer, RefreshCw, Target } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { formatMetaMoney, formatMetaSpend, type MetaAdsRange, type MetaAdsReport, type MetaCampaignReport } from '@/lib/marketing/meta-ads-report';
import { MetaRangeFilter, MetaReportNotes, MetaResultList, MetaResultsTable, isMetaAdsRange, metaSpendTile, ubMonth } from '@/components/marketing/MetaAdsParts';

const integer = (value: number | null | undefined) => value === null || value === undefined ? '—' : new Intl.NumberFormat('mn-MN').format(value);
const percent = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value}%`;

const columns: DataTableColumn<MetaCampaignReport>[] = [
    {
        key: 'name', header: 'Кампанит ажил', sortable: true, accessor: c => c.name,
        cell: c => <div><p className="font-medium text-foreground">{c.name}</p><p className="num mt-0.5 text-[11px] text-muted-foreground">{c.campaignId} · {c.days} өдөр</p></div>,
    },
    { key: 'spend', header: 'Зардал', align: 'right', sortable: true, accessor: c => c.spend.mnt, cell: c => <span className="num">{formatMetaSpend(c.spend, { compact: true })}</span> },
    { key: 'impressions', header: 'Харагдалт', align: 'right', sortable: true, accessor: c => c.delivery?.impressions ?? -1, cell: c => <span className="num">{integer(c.delivery?.impressions)}</span> },
    { key: 'link_clicks', header: 'Link click', align: 'right', sortable: true, accessor: c => c.delivery?.linkClicks ?? -1, cell: c => <span className="num">{integer(c.delivery?.linkClicks)}</span> },
    { key: 'ctr', header: 'CTR', align: 'right', sortable: true, accessor: c => c.delivery?.ctr ?? -1, cell: c => <span className="num">{percent(c.delivery?.ctr)}</span> },
    { key: 'cpc', header: 'CPC', align: 'right', cell: c => <span className="num">{formatMetaMoney(c.delivery?.cpc)}</span> },
    { key: 'results', header: 'Үр дүн (төрлөөр)', cell: c => <MetaResultList results={c.results} /> },
];

export default function AdsPage() {
    return <Suspense fallback={<Spinner size="md" label="Татаж байна..." />}><AdsFromUrl /></Suspense>;
}

function AdsFromUrl() {
    const search = useSearchParams();
    const fromUrl = { from: search.get('from') || '', to: search.get('to') || '' };
    return <AdsReport initialRange={isMetaAdsRange(fromUrl) ? fromUrl : ubMonth()} />;
}

/** Meta зарын огноотой тайлан: meta_daily_spend (зардал) + meta_ad_insights_daily (харагдалт, үр дүн төрлөөр). */
function AdsReport({ initialRange }: { initialRange: MetaAdsRange }) {
    const [range, setRange] = useState(initialRange);
    const valid = isMetaAdsRange(range);
    const { data, isLoading, error, isFetching, refetch } = useDashboardQuery<{ report: MetaAdsReport }>(
        ['marketing-ads'], valid ? `/api/marketing/meta-ads?${new URLSearchParams(range)}` : null, { keepPreviousData: true },
    );
    const report = data?.report;
    const delivery = report?.delivery;

    return (
        <div className="mx-auto flex min-w-0 max-w-[1440px] flex-col gap-5">
            <PageHeader
                eyebrow="Маркетинг"
                title="Зар сурталчилгаа"
                subtitle="Meta зарын зардал, харагдалт, үр дүн төрлөөр — өдрийн бүртгэлээс"
                secondaryActions={<>
                    <Button href="/dashboard/marketing-roi" variant="secondary">ROI</Button>
                    <Button href="/marketing?tab=records" variant="secondary"><RefreshCw className="w-4 h-4" />Meta зардал татах</Button>
                </>}
            />
            <MetaRangeFilter range={range} onChange={setRange} />

            {isLoading ? (
                <div className="flex min-h-[300px] items-center justify-center"><Spinner size="md" label="Татаж байна..." /></div>
            ) : error && !report ? (
                <Alert variant="danger">
                    <AlertTitle>Meta зарын тайлан татахад алдаа гарлаа</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>
            ) : report && (
                <>
                    <p className="text-xs text-muted-foreground">
                        {report.range.from} – {report.range.to}{report.coverage.lastSpendDay ? ` · сүүлийн зардлын өдөр ${report.coverage.lastSpendDay}` : ''}{isFetching ? ' · шинэчилж байна…' : ''}
                    </p>
                    <MetaReportNotes notes={report.notes} />
                    <StatBar className="mb-0 md:grid-cols-5">
                        <StatTile label="Нийт зардал" {...metaSpendTile(report.spend, 'Тооцооны ханшаар')} icon={<DollarSign />} accent="warning" />
                        <StatTile label="Харагдалт" value={integer(delivery?.impressions)} icon={<Eye />} accent="info" helper={delivery?.cpm ? `CPM ${formatMetaMoney(delivery.cpm)}` : undefined} />
                        <StatTile label="Link click" value={integer(delivery?.linkClicks)} icon={<MousePointer />} accent="brand" helper={delivery ? `CTR ${percent(delivery.ctr)}` : undefined} />
                        <StatTile label="CPC" value={formatMetaMoney(delivery?.cpc)} icon={<Target />} accent="success" helper="Нэг link click-ийн өртөг" />
                        <StatTile label="Кампанит ажил" value={report.campaigns.length} icon={<BarChart3 />} accent="neutral" />
                    </StatBar>

                    <SectionCard title="Үр дүн төрлөөр" description="Дуудлага, мессеж, лид маягт… тус бүрийн тоо, кампанит ажлын зорилгоор ногдсон зардал, нэг үр дүнгийн өртөг. Төрлүүдийг нэг тоонд нэмэхгүй; Meta-гийн үр дүн CRM лидтэй адил биш.">
                        <div className="mt-3"><MetaResultsTable results={report.results} /></div>
                    </SectionCard>

                    <SectionCard title="Кампанит ажил бүрээр" description="Зардал — өдрийн зардлын бүртгэлээс; харагдалт, товшилт, үр дүн — ad set-ийн өдрийн өгөгдлөөс.">
                        <div className="mt-3">
                            {report.campaigns.length === 0 ? (
                                <EmptyState icon={<BarChart3 className="w-7 h-7" />} title="Энэ хугацаанд Meta зардал бүртгэгдээгүй"
                                    description="Зарын дансаа сонгоод «Meta зардал татах»-аар зардал, үр дүнг шинэчилнэ." />
                            ) : (
                                <DataTable caption="Meta кампанит ажлууд" data={report.campaigns} getRowId={c => c.campaignId} columns={columns} showDensityToggle={false} hidePagination />
                            )}
                        </div>
                    </SectionCard>

                    <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium">Тооцох дүрэм</summary>
                        <p className="mt-3 leading-relaxed">{report.basis}</p>
                    </details>
                </>
            )}
        </div>
    );
}
