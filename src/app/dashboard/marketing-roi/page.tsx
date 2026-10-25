'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { TrendingUp, Users, Target, BarChart3, RefreshCw, Megaphone, DollarSign, Heart, MessageCircle, Share2, Eye } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { DataTable, Money, StatusPill, type DataTableColumn } from '@/components/ui/DataTable';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { ComboChart } from '@/components/charts/ComboChart';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { sourceLabel } from '@/lib/leads/labels';
import type { LeadSourceStats } from '@/lib/marketing/lead-sources';
import { formatMetaPending, formatMetaSpend } from '@/lib/marketing/meta-ads-report';
import type { CampaignRoi, MarketingRoi } from '@/lib/marketing/roi';
import type { TimelineMonth } from '@/lib/marketing/timeline';
import { MetaRangeFilter, MetaReportNotes, MetaResultList, MetaResultsTable, isMetaAdsRange, metaSpendTile, ubMonth } from '@/components/marketing/MetaAdsParts';
import { MetaSpendSync } from '@/components/marketing/MetaSpendSync';
import { toast } from 'sonner';

interface AdAccount {
    id: string;
    account_id: string;
    name?: string;
    currency?: string;
    business_name?: string;
}

interface SocialPost { id: string; content: string | null; likes: number | null; comments: number | null; shares: number | null; reach: number | null; published_at: string | null; }
interface SocialMetricSummary { label: string; kind: 'sum' | 'unique' | 'latest'; value: number | null; day: string | null; days: number; }
interface SocialSync { last_attempt_at: string; last_success_at: string | null; last_from: string | null; last_to: string | null; unavailable_metrics: string[]; last_error: string | null; }
interface SocialHistory {
    posts?: SocialPost[];
    page?: { id: string; name: string | null } | null;
    sync?: SocialSync | null;
    daily?: { from: string; to: string; metrics: Record<string, SocialMetricSummary> } | null;
}
/** Органик картын үзүүлэлтүүд (lib/marketing/social-metrics.ts-ийн нэрээр). */
const SOCIAL_CARD_METRICS = ['page_follows', 'page_daily_follows_unique', 'page_media_view', 'page_total_media_view_unique', 'page_post_engagements', 'page_views_total'] as const;
const socialNumber = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString() : '—';
const socialMetricCaption = (metric: SocialMetricSummary) =>
    metric.kind === 'sum' ? `${metric.days} өдрийн нийлбэр` : metric.day ? `${metric.day}-ны байдлаар` : 'өгөгдөлгүй';

const fmtMNT = (n: number): string => formatMNT(n, { compact: true });

const NO_ACCOUNTS: AdAccount[] = [];
const NO_MONTHS: TimelineMonth[] = [];

interface SourceRow {
    source: string;
    label: string;
    total: number;
    won: number;
    lost: number;
    active: number;
    conversionRate: number;
}

const accountKey = (id: string | null | undefined) => (id ? id.replace(/^act_/, '') : '');
const pendingText = (pending: Record<string, number>) => formatMetaPending({ mnt: 0, complete: false, pending, native: pending });

const conversionPillVariant = (rate: number) =>
    rate >= 50 ? 'success' : rate >= 20 ? 'pending' : 'neutral';

// Meta кампанит ажлын ROI хүснэгтийн багана (огноотой зардал + CRM лид, гэрээ). Төгрөг зөвхөн хадгалсан ханшаар.
const ratioMNT = (value: number | null) => (value !== null ? <Money value={value} compact /> : '—');
const roiColumns: DataTableColumn<CampaignRoi>[] = [
    {
        key: 'name', header: 'Кампанит ажил', accessor: (c) => c.name, sortable: true,
        cell: (c) => <div><p className="font-medium text-foreground">{c.name}</p><p className="num mt-0.5 text-xs text-muted-foreground">{c.campaignId}</p></div>,
    },
    { key: 'spend', header: 'Зардал', align: 'right', sortable: true, accessor: (c) => c.spend?.mnt ?? -1, cell: (c) => <span className="num">{c.spend ? formatMetaSpend(c.spend, { compact: true }) : 'Бүртгэлгүй'}</span> },
    { key: 'results', header: 'Meta үр дүн', cell: (c) => <MetaResultList results={c.results} /> },
    { key: 'leads', header: 'CRM лид', align: 'center', sortable: true, accessor: (c) => c.leads, cell: (c) => <span className="tabular-nums">{c.leads}</span> },
    { key: 'cpl', header: 'CPL', align: 'right', sortable: true, accessor: (c) => c.cpl ?? -1, cell: (c) => ratioMNT(c.cpl) },
    { key: 'won', header: 'Гэрээтэй', align: 'center', sortable: true, accessor: (c) => c.won, cell: (c) => <span className="tabular-nums">{c.won}</span> },
    { key: 'revenue', header: 'Гэрээний дүн', align: 'right', sortable: true, accessor: (c) => c.revenue, cell: (c) => <Money value={c.revenue} compact /> },
    {
        key: 'roas',
        header: 'ROAS',
        align: 'right',
        sortable: true,
        accessor: (c) => c.roas ?? -1,
        cell: (c) =>
            c.roas !== null ? (
                <span className={cn('tabular-nums font-semibold', c.roas >= 1 ? 'text-status-success' : 'text-status-danger')}>
                    {c.roas}x
                </span>
            ) : (
                '—'
            ),
    },
];

// Эх үүсвэрийн шинжилгээний багана
const sourceColumns: DataTableColumn<SourceRow>[] = [
    { key: 'label', header: 'Суваг', accessor: (s) => s.label, sortable: true, cell: (s) => <span className="font-medium text-foreground">{s.label}</span> },
    { key: 'total', header: 'Лийд', align: 'center', sortable: true, accessor: (s) => s.total, cell: (s) => <span className="tabular-nums">{s.total}</span> },
    { key: 'won', header: 'Амжилт', align: 'center', sortable: true, accessor: (s) => s.won, cell: (s) => <span className="font-medium text-status-success tabular-nums">{s.won}</span> },
    { key: 'lost', header: 'Алдсан', align: 'center', sortable: true, accessor: (s) => s.lost, cell: (s) => <span className="text-status-danger tabular-nums">{s.lost}</span> },
    { key: 'active', header: 'Идэвхтэй', align: 'center', sortable: true, accessor: (s) => s.active, cell: (s) => <span className="text-status-info tabular-nums">{s.active}</span> },
    {
        key: 'conversionRate',
        header: 'Конверс',
        align: 'center',
        sortable: true,
        accessor: (s) => s.conversionRate,
        cell: (s) => <StatusPill variant={conversionPillVariant(s.conversionRate)}>{s.conversionRate}%</StatusPill>,
    },
    {
        key: 'visual',
        header: 'Визуал',
        width: 140,
        cell: (s) => <Progress value={s.conversionRate} size="md" />,
    },
];

export default function MarketingROIPage() {
    const { shop } = useAuth();
    const { canWrite: canWriteModule } = useModuleAccess();
    const queryClient = useQueryClient();
    const [range, setRange] = useState(() => ubMonth());
    const validRange = isMetaAdsRange(range);
    // API-аар (RBAC + shop scope сервер талд).
    // Эх үүсвэр, сар бүрийн лид — сервер харах эрхтэй бүх лидээр нэгтгэнэ (хөтөч 1000 лидээр тасардаг байсан).
    const sourcesQuery = useDashboardQuery<{ stats?: LeadSourceStats }>(['marketing-roi', 'sources'], '/api/dashboard/marketing-roi/sources');
    // Meta зардал (meta_daily_spend) + үр дүн төрлөөр (meta_ad_insights_daily) + тухайн хугацааны CRM лид, гэрээ.
    const roiQuery = useDashboardQuery<{ roi?: MarketingRoi | null }>(['marketing-roi', 'roi'],
        validRange ? `/api/dashboard/marketing-roi?${new URLSearchParams(range)}` : null, { keepPreviousData: true });
    const socialQuery = useDashboardQuery<SocialHistory>(['marketing-roi', 'social'], '/api/dashboard/marketing/social-history');
    const timelineQuery = useDashboardQuery<{ months?: TimelineMonth[] }>(['marketing-roi', 'timeline'], '/api/dashboard/marketing-roi/timeline');
    // Зарын дансыг «Ad account-уудыг ачаалах» дарахад л татна.
    const adAccountsQuery = useDashboardQuery<{ accounts?: AdAccount[]; selected_id?: string | null }>(
        ['marketing-roi', 'ad-accounts'], '/api/marketing/facebook/ads/accounts', { enabled: false },
    );
    // System User токентой үед хэрэглэгчийн OAuth холболт хэрэггүй (сервер 409) тул товчийг нуух.
    const metaTokenQuery = useDashboardQuery<{ tokenSource?: 'system' | 'user' | null; accountId?: string | null }>(['marketing-roi', 'meta-token'], '/api/marketing/facebook/ads/spend-sync');
    const showMetaConnect = metaTokenQuery.isError || (metaTokenQuery.isSuccess && metaTokenQuery.data?.tokenSource !== 'system');
    const canWrite = canWriteModule('marketing-roi');

    const sourceStats = sourcesQuery.data?.stats;
    // Таталт алдагдвал хуучин/тэг дүнг одоогийн тайлан мэт харуулахгүй.
    const roi = roiQuery.isError ? null : roiQuery.data?.roi ?? null;
    const socialPosts = socialQuery.data?.posts ?? [];
    const socialDaily = socialQuery.data?.daily ?? null;
    const socialSync = socialQuery.data?.sync ?? null;
    const timeline = timelineQuery.data?.months ?? NO_MONTHS;
    const timelineChart = useMemo(
        () => timeline.map(({ label, leads, meetings, activity, spend }) => ({ label, leads, meetings, activity, spend })),
        [timeline],
    );
    const pendingMonths = timeline.filter((m) => Object.keys(m.pending).length > 0);
    const partialSpendMonths = timeline.filter((m) => m.spendPartial).map((m) => `${m.label} (${m.spendDays} өдөр)`);
    const timelineSpendNote = !timeline.some((m) => m.spendDays > 0)
        ? 'Meta зардал: өдрийн зардал татагдаагүй тул шугам хоосон. Доорх «Meta зарын данс» хэсгийн «Meta зардал татах»-аар татна уу.'
        : `Meta зардал: өдрөөр татсан зардлыг тухайн (зарын дансны) өдрийн сард оноов — төгрөг нь өдөр бүрт хадгалсан ханшаар. Зардал татагдаагүй сард шугам тасарна.${partialSpendMonths.length ? ` Зөвхөн зарим өдөр нь татагдсан: ${partialSpendMonths.join(', ')}.` : ''}`;
    const adAccounts = adAccountsQuery.data?.accounts ?? NO_ACCOUNTS;
    const [pickedAdAccount, setPickedAdAccount] = useState<string | null>(null);
    const savedAdAccount = adAccountsQuery.data?.selected_id ?? metaTokenQuery.data?.accountId ?? null;
    const selectedAdAccount = pickedAdAccount
        ?? adAccountsQuery.data?.selected_id
        ?? (adAccounts.length === 1 ? adAccounts[0].id : null);
    const [savingAccount, setSavingAccount] = useState(false);
    const [accountError, setAccountError] = useState<string | null>(null);
    const adsError = accountError || adAccountsQuery.error?.message;
    const [syncingSocial, setSyncingSocial] = useState(false);

    async function syncSocial() {
        setSyncingSocial(true);
        try {
            const res = await dashboardFetch('/api/dashboard/marketing/sync-social', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Sync алдаа');
            await socialQuery.refetch();
            toast.success(data.message || 'Social хадгаллаа');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Sync алдаа');
        } finally {
            setSyncingSocial(false);
        }
    }

    /** Сонгосон зарын дансыг төсөлд хадгална; зардал, үр дүнг «Meta зардал татах» шинэчилнэ. */
    async function saveAdAccount() {
        if (!selectedAdAccount) {
            toast.error('Ad account сонгоно уу');
            return;
        }
        setSavingAccount(true);
        setAccountError(null);
        try {
            const res = await dashboardFetch('/api/marketing/facebook/ads/accounts', {
                method: 'POST',
                body: JSON.stringify({ ad_account_id: selectedAdAccount }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Зарын данс сонгож чадсангүй');
            await Promise.all([
                adAccountsQuery.refetch(),
                metaTokenQuery.refetch(),
                queryClient.invalidateQueries({ queryKey: ['meta-spend-sync'] }),
            ]);
            toast.success('Зарын данс хадгалагдлаа. «Meta зардал татах»-аар зардал, үр дүнг шинэчилнэ үү.');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Зарын данс сонгож чадсангүй';
            setAccountError(msg);
            toast.error(msg);
        } finally {
            setSavingAccount(false);
        }
    }

    const analytics = useMemo(() => {
        if (!sourceStats || sourceStats.totals.total === 0) return null;
        const sources = sourceStats.sources.map((row) => ({ ...row, label: sourceLabel(row.source) }));
        return {
            sources,
            totalLeads: sourceStats.totals.total,
            totalWon: sourceStats.totals.won,
            totalLost: sourceStats.totals.lost,
            overallConversion: sourceStats.totals.conversionRate,
            bestSource: sources.find((row) => row.source === sourceStats.bestSource) ?? null,
        };
    }, [sourceStats]);

    // Сар бүрийн лийд — сүүлийн 6 сар (Улаанбаатарын сараар, лидгүй сар 0).
    const monthlyChartData = useMemo(
        () => (sourceStats?.monthly ?? []).map(({ label, count }) => ({ month: label, count })),
        [sourceStats],
    );

    // Эхний ачаалалт бүх уншилтыг хүлээнэ. Лидийн эх үүсвэрийн өгөгдөлгүй үед л алдааны карт (дахин оролдох
    // үед spinner); өгөгдөл байхад фон шинэчлэлтийн алдааг QueryProvider toast мэдэгдэнэ.
    const loadError = !sourcesQuery.data && sourcesQuery.isError && !sourcesQuery.isFetching;
    const loading = !loadError && (!sourcesQuery.data || [socialQuery, timelineQuery].some((q) => q.isPending) || (validRange && roiQuery.isPending));

    if (loading)
        return (
            <Card>
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            </Card>
        );

    if (loadError)
        return (
            <Card>
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <p className="font-medium text-foreground">Маркетингийн мэдээлэл ачаалахад алдаа гарлаа</p>
                    <Button onClick={() => void queryClient.invalidateQueries({ queryKey: ['marketing-roi'] })} variant="secondary" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" /> Дахин оролдох
                    </Button>
                </div>
            </Card>
        );

    const roiTotals = roi?.totals;
    return (
        <div className="flex min-w-0 flex-col gap-5">
            <PageHeader
                eyebrow="Маркетинг"
                title="Маркетинг ROI"
                subtitle="Meta зарын огноотой зардал, үр дүн ба CRM лид, гэрээний харьцаа; эх үүсвэрийн шинжилгээ"
            />

            <MetaRangeFilter range={range} onChange={setRange} />

            {roiQuery.isError ? (
                <Alert variant="danger">
                    <AlertTitle>Meta зардал, гэрээний ROI тайланг уншиж чадсангүй</AlertTitle>
                    <AlertDescription>{roiQuery.error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void roiQuery.refetch()} isLoading={roiQuery.isFetching}>Дахин оролдох</Button>
                </Alert>
            ) : roi && roiTotals && (
                <>
                    <MetaReportNotes notes={roi.meta.notes} />
                    <StatBar columns={4} className="mb-0">
                        <StatTile label="Meta зардал" {...metaSpendTile(roiTotals.spend, `${roi.range.from} – ${roi.range.to}`)} icon={<DollarSign className="w-4 h-4" />} accent="warning" />
                        <StatTile label="Кампанит ажлын CRM лид" value={roiTotals.leads} icon={<Users className="w-4 h-4" />} accent="info"
                            helper={roiTotals.cpl !== null ? `CPL ${fmtMNT(roiTotals.cpl)}` : 'CPL тооцоогүй'} />
                        <StatTile label="Гэрээтэй лид" value={roiTotals.won} icon={<Target className="w-4 h-4" />} accent="success"
                            helper={`Гэрээний дүн ${fmtMNT(roiTotals.revenue)}`} />
                        <StatTile label="ROAS" value={roiTotals.roas !== null ? `${roiTotals.roas}x` : '—'} icon={<TrendingUp className="w-4 h-4" />} accent="brand"
                            helper={roiTotals.cpa !== null ? `Гэрээтэй лидийн зардал ${fmtMNT(roiTotals.cpa)}` : 'Гэрээний дүн ÷ зардал'} />
                    </StatBar>

                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Meta-гийн үр дүн төрлөөр</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Дуудлага, мессеж, лид маягт… тус бүрийн тоо, нэг үр дүнгийн өртөг. Төрлүүдийг нэмэхгүй; CRM лидтэй адил биш.</p>
                        </div>
                        <div className="p-4"><MetaResultsTable results={roi.meta.results} /></div>
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Кампанит ажлын ROI</h3>
                        </div>
                        {roi.campaigns.length === 0 ? (
                            <div className="py-12">
                                <EmptyState icon={<Megaphone className="w-7 h-7" />} title="Энэ хугацаанд Meta зардал, кампанит ажилд холбогдсон лид алга"
                                    description="Зарын данс сонгож «Meta зардал татах» дарна уу. Лидийг кампанит ажилд холбохдоо акцын Meta campaign ID-г бөглөнө." />
                            </div>
                        ) : (
                            <div className="p-4">
                                <DataTable
                                    caption="Кампанит ажлын ROI"
                                    data={roi.campaigns}
                                    getRowId={(c) => c.campaignId}
                                    showDensityToggle={false}
                                    hidePagination
                                    columns={roiColumns}
                                />
                            </div>
                        )}
                        {(roi.quality.unattributedMetaLeads > 0 || roi.quality.leadsWithoutSpend > 0) && (
                            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                                Кампанит ажилгүй Meta лид: <b>{roi.quality.unattributedMetaLeads}</b> (CPL-д ороогүй) · Энэ хугацаанд зардлын бүртгэлгүй кампанит ажлын лид: <b>{roi.quality.leadsWithoutSpend}</b>
                            </p>
                        )}
                    </Card>
                    <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium">Тооцох дүрэм</summary>
                        <p className="mt-3 leading-relaxed">{roi.basis.note}</p>
                        <p className="mt-2 leading-relaxed">{roi.meta.basis}</p>
                    </details>
                </>
            )}

            {/* Meta зарын данс ба синк */}
            <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-brand-strong" />
                        <h3 className="heading-section text-sm text-foreground">Meta зарын данс</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {shop?.id && showMetaConnect && <Button variant="secondary" size="sm" href={`/api/marketing/facebook/ads/connect?shop_id=${encodeURIComponent(shop.id)}`}>Meta Ads холбох</Button>}
                        {adAccounts.length === 0 ? (
                            <Button variant="secondary" size="sm" onClick={() => void adAccountsQuery.refetch()} isLoading={adAccountsQuery.isFetching}>
                                Ad account-уудыг ачаалах
                            </Button>
                        ) : (
                            <>
                                <Select
                                    value={selectedAdAccount || ''}
                                    onValueChange={(v) => setPickedAdAccount(v || null)}
                                >
                                    <SelectTrigger className="h-9 w-56 text-sm">
                                        <SelectValue placeholder="Ad account сонгоно уу" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {adAccounts.map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                                {a.name || a.business_name || a.account_id} · {a.id} · {a.currency || 'валют тодорхойгүй'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={saveAdAccount}
                                    disabled={!selectedAdAccount || savingAccount || accountKey(selectedAdAccount) === accountKey(savedAdAccount)}
                                    isLoading={savingAccount}
                                >
                                    Хадгалах
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                {adsError && (
                    <div className="px-4 pt-3">
                        <Alert variant="danger">{adsError}</Alert>
                    </div>
                )}
                <div className="p-4">
                    {/* 93 өдрийн хязгаарыг MetaSpendSync өөрөө тогтоож мэдэгдэнэ (lib/marketing/meta-sync-range.ts). */}
                    <MetaSpendSync shopId={shop?.id} canWrite={canWrite} from={range.from} to={range.to} />
                </div>
            </Card>

            {!analytics ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<BarChart3 className="w-7 h-7" />} title="Лийд өгөгдөл байхгүй" />
                    </div>
                </Card>
            ) : (
                <>
                    <h2 className="text-sm font-semibold text-foreground">Лидийн эх үүсвэр</h2>
                    <p className="-mt-3 text-xs text-muted-foreground">Огноо сонголтоос үл хамааран харах эрхтэй бүх лидээр.</p>
                    <StatBar columns={4} className="mb-0">
                        <StatTile
                            label="Нийт лийд"
                            value={analytics.totalLeads}
                            icon={<Users className="w-4 h-4" />}
                            accent="info"
                        />
                        <StatTile
                            label="Амжилттай"
                            value={analytics.totalWon}
                            icon={<Target className="w-4 h-4" />}
                            accent="success"
                        />
                        <StatTile
                            label="Конверс"
                            value={`${analytics.overallConversion}%`}
                            icon={<BarChart3 className="w-4 h-4" />}
                            accent="brand"
                        />
                        <StatTile
                            label="Шилдэг суваг"
                            value={analytics.bestSource?.label || '-'}
                            icon={<TrendingUp className="w-4 h-4" />}
                            accent="warning"
                            helper={
                                analytics.bestSource ? `${analytics.bestSource.conversionRate}% конверс` : undefined
                            }
                        />
                    </StatBar>

                    {/* Organic социал (хадгалсан түүх) */}
                    <Card>
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <h3 className="heading-section text-sm text-foreground">Органик сошиал</h3>
                            <Button variant="secondary" size="sm" onClick={syncSocial} isLoading={syncingSocial} disabled={syncingSocial}>
                                {!syncingSocial && <RefreshCw className="w-4 h-4" />}
                                Хадгалах
                            </Button>
                        </div>
                        <div className="p-4">
                            {socialQuery.error && !socialQuery.data ? (
                                <Alert variant="danger">
                                    <AlertTitle>Хадгалсан сошиал түүхийг ачаалж чадсангүй</AlertTitle>
                                    <AlertDescription>{socialQuery.error.message}</AlertDescription>
                                    <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void socialQuery.refetch()} isLoading={socialQuery.isFetching}>Дахин оролдох</Button>
                                </Alert>
                            ) : (
                                <>
                                    {socialQuery.data?.page && (
                                        <div className="mb-4 space-y-3">
                                            {socialDaily ? (
                                                <>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                        {SOCIAL_CARD_METRICS.map((name) => {
                                                            const metric = socialDaily.metrics[name];
                                                            if (!metric) return null;
                                                            return (
                                                                <div key={name} className="rounded-md border border-border p-3">
                                                                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                                                                    <p className="num text-lg font-semibold text-foreground">{socialNumber(metric.value)}</p>
                                                                    <p className="text-xs text-muted-foreground">{socialMetricCaption(metric)}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {socialQuery.data.page.name ?? 'Facebook Page'} · {socialDaily.from} – {socialDaily.to} (Meta-гийн өдөр, Номхон далайн цаг) · «—» = Meta өгөөгүй
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">Өдрийн үзүүлэлт хадгалагдаагүй байна. «Хадгалах» дарж Facebook-аас татна уу.</p>
                                            )}
                                            {socialSync?.last_error && (
                                                <Alert variant="warning">
                                                    <AlertDescription>{socialSync.last_error}</AlertDescription>
                                                </Alert>
                                            )}
                                            {!!socialSync?.unavailable_metrics?.length && (
                                                <p className="text-xs text-muted-foreground">Meta өгөөгүй үзүүлэлт: {socialSync.unavailable_metrics.join(', ')}</p>
                                            )}
                                        </div>
                                    )}
                                    {socialPosts.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-4 text-center">Хадгалсан нийтлэл алга. &quot;Хадгалах&quot; дарж Facebook-аас татна уу.</p>
                                    ) : (
                                        <div className="divide-y divide-border/60">
                                            {socialPosts.slice(0, 5).map((p) => (
                                                <div key={p.id} className="py-2.5 flex items-start justify-between gap-3">
                                                    <p className="text-sm text-foreground line-clamp-2 flex-1">{p.content || '(зураг)'}</p>
                                                    <span className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                                        <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {socialNumber(p.likes)}</span>
                                                        <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {socialNumber(p.comments)}</span>
                                                        <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> {socialNumber(p.shares)}</span>
                                                        <span className="flex items-center gap-1" title="Үзсэн хүн"><Eye className="w-3.5 h-3.5" /> {socialNumber(p.reach)}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </Card>

                    {/* Source Breakdown */}
                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Эх үүсвэрийн шинжилгээ</h3>
                        </div>
                        <div className="p-4">
                            <DataTable
                                caption="Эх үүсвэрийн шинжилгээ"
                                data={analytics.sources}
                                getRowId={(s) => s.source}
                                showDensityToggle={false}
                                hidePagination
                                columns={sourceColumns}
                            />
                        </div>
                    </Card>
                </>
            )}

            {/* Marketing impact: идэвхжүүлэлт vs лид/уулзалт */}
            {timelineQuery.error && !timelineQuery.data ? (
                <Alert variant="danger">
                    <AlertTitle>Маркетингийн нөлөөллийн цувааг ачаалж чадсангүй</AlertTitle>
                    <AlertDescription>{timelineQuery.error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void timelineQuery.refetch()} isLoading={timelineQuery.isFetching}>Дахин оролдох</Button>
                </Alert>
            ) : timeline.length > 0 && (
                <div>
                    <ChartCard
                        title="Маркетингийн нөлөөлөл"
                        subtitle="Сүүлийн 6 сар (Улаанбаатарын сараар): идэвхжүүлэлт (пост, акц / кампанит ажил), лид, уулзалт ба Meta зардал (₮)"
                        height={300}
                    >
                        <ComboChart
                            data={timelineChart}
                            xKey="label"
                            bars={[
                                { key: 'leads', name: 'Лийд' },
                                { key: 'meetings', name: 'Уулзалт' },
                                { key: 'activity', name: 'Идэвхжүүлэлт' },
                            ]}
                            line={{ key: 'spend', name: 'Meta зардал (₮)' }}
                            lineFormatter={fmtMNT}
                        />
                    </ChartCard>
                    <p className="mt-2 text-xs text-muted-foreground">{timelineSpendNote}</p>
                    {pendingMonths.length > 0 && (
                        <p className="mt-1 text-xs text-status-pending">
                            Ханшгүй Meta зардал төгрөгийн шугамд ороогүй: {pendingMonths.map((m) => `${m.label} ${pendingText(m.pending)}`).join('; ')}.
                        </p>
                    )}
                </div>
            )}

            {analytics && (
                <ChartCard title="Сар бүрийн лийд" subtitle="Сүүлийн 6 сар (Улаанбаатарын сараар)" height={240}>
                    <BarChart
                        data={monthlyChartData}
                        xKey="month"
                        series={[{ key: 'count', name: 'Лийд' }]}
                    />
                </ChartCard>
            )}
        </div>
    );
}
