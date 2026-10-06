'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
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
import { accountCurrencyLabel, formatAccountMoney, formatMNT } from '@/lib/utils/currency';
import { sourceLabel } from '@/lib/leads/labels';
import type { LeadSourceStats } from '@/lib/marketing/lead-sources';
import { toast } from 'sonner';

interface AdCampaign {
    id: string;
    name: string;
    external_id: string | null;
    status: string;
    objective: string | null;
    budget: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    last_synced_at: string | null;
}

interface AdAccount {
    id: string;
    account_id: string;
    name?: string;
    currency?: string;
    business_name?: string;
}

interface CampaignRoi {
    external_id: string;
    name: string;
    spend: number;
    leads: number;
    won: number;
    revenue: number;
    cpl: number | null;
    cpa: number | null;
    roas: number | null;
    profit: number | null;
}
interface RoiTotals {
    spend: number; leads: number; won: number; revenue: number;
    cpl: number | null; cpa: number | null; roas: number | null; profit: number | null;
}
interface RoiData { campaigns: CampaignRoi[]; sources: unknown[]; totals: RoiTotals; basis?: { note: string }; }

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

/** Сонгосон зарын данс + сүүлийн зардлын синкийн валют (/api/marketing/facebook/ads/spend-sync). */
interface MetaAdsConfig {
    tokenSource?: 'system' | 'user' | null;
    accountId?: string | null;
    status?: { currency?: string | null } | null;
}

/** 'act_123' ба '123'-г ижил данс гэж үзнэ. */
const accountKey = (id: string | null | undefined) => (id ? id.replace(/^act_/, '') : '');

/** Маркетингийн нөлөөллийн сар бүрийн цуваа (/api/dashboard/marketing-roi/timeline, `lib/marketing/timeline.ts`) */
interface TimelineMonth {
    month: string;
    label: string;
    leads: number;
    meetings: number;
    activity: number;
    /** Meta зардал зарын дансны валютаар (өдөр бүрийн зардал өөрийн сардаа); синк хийгдээгүй сар бол null. */
    spend: number | null;
    spendDays: number;
    spendPartial: boolean;
}
interface TimelineData { months?: TimelineMonth[]; currency?: string | null }

const fmtMNT = (n: number): string => formatMNT(n, { compact: true });

const NO_CAMPAIGNS: AdCampaign[] = [];
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

const conversionPillVariant = (rate: number) =>
    rate >= 50 ? 'success' : rate >= 20 ? 'pending' : 'neutral';

// Кампанит ажлын ROI хүснэгтийн багана. Зардал, CPL нь зарын дансны валютаар (₮ биш); гэрээний дүн төгрөгөөр.
const roiColumns = (adCurrency: string | null): DataTableColumn<CampaignRoi>[] => [
    { key: 'name', header: 'Кампанит ажил', accessor: (c) => c.name, sortable: true, cell: (c) => <span className="font-medium text-foreground">{c.name}</span> },
    { key: 'spend', header: `Зардал (${accountCurrencyLabel(adCurrency)})`, align: 'right', sortable: true, accessor: (c) => c.spend, cell: (c) => <span className="tabular-nums">{formatAccountMoney(c.spend, adCurrency)}</span> },
    { key: 'leads', header: 'Лийд', align: 'center', sortable: true, accessor: (c) => c.leads, cell: (c) => <span className="tabular-nums">{c.leads}</span> },
    { key: 'cpl', header: 'CPL', align: 'right', sortable: true, accessor: (c) => c.cpl ?? -1, cell: (c) => <span className="tabular-nums">{formatAccountMoney(c.cpl, adCurrency)}</span> },
    { key: 'won', header: 'Хожсон', align: 'center', sortable: true, accessor: (c) => c.won, cell: (c) => <span className="tabular-nums">{c.won}</span> },
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

const campaignStatusVariant = (status: string) =>
    status === 'active' ? 'success' : status === 'paused' ? 'pending' : 'neutral';

export default function MarketingROIPage() {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    // API-аар (RBAC + shop scope сервер талд) — өмнө нь browser Supabase, зөвхөн RLS
    // Эх үүсвэр, сар бүрийн лид — сервер харах эрхтэй бүх лидээр нэгтгэнэ (хөтөч 1000 лидээр тасардаг байсан).
    const sourcesQuery = useDashboardQuery<{ stats?: LeadSourceStats }>(['marketing-roi', 'sources'], '/api/dashboard/marketing-roi/sources');
    // Хадгалсан Facebook кампаниуд (Meta-аас синк хийхгүй)
    const campaignsQuery = useDashboardQuery<{ rows?: AdCampaign[] }>(['marketing-roi', 'campaigns'], '/api/marketing/data/ad_campaigns?eq.platform=facebook&order=updated_at.desc');
    const roiQuery = useDashboardQuery<{ roi?: RoiData | null }>(['marketing-roi', 'roi'], '/api/dashboard/marketing-roi');
    const socialQuery = useDashboardQuery<SocialHistory>(['marketing-roi', 'social'], '/api/dashboard/marketing/social-history');
    const timelineQuery = useDashboardQuery<TimelineData>(['marketing-roi', 'timeline'], '/api/dashboard/marketing-roi/timeline');
    // Зарын дансыг «Ad account-уудыг ачаалах» дарахад л татна.
    const adAccountsQuery = useDashboardQuery<{ accounts?: AdAccount[]; selected_id?: string | null }>(
        ['marketing-roi', 'ad-accounts'], '/api/marketing/facebook/ads/accounts', { enabled: false },
    );
    // System User токентой үед хэрэглэгчийн OAuth холболт хэрэггүй (сервер 409) тул товчийг нуух.
    const metaTokenQuery = useDashboardQuery<MetaAdsConfig>(['marketing-roi', 'meta-token'], '/api/marketing/facebook/ads/spend-sync');
    const showMetaConnect = metaTokenQuery.isError || (metaTokenQuery.isSuccess && metaTokenQuery.data?.tokenSource !== 'system');
    const refetchCampaigns = campaignsQuery.refetch;

    const sourceStats = sourcesQuery.data?.stats;
    const campaigns = campaignsQuery.data?.rows ?? NO_CAMPAIGNS;
    // Таталт алдагдвал хуучин/тэг дүнг одоогийн тайлан мэт харуулахгүй.
    const roi = roiQuery.isError ? null : roiQuery.data?.roi ?? null;
    const socialPosts = socialQuery.data?.posts ?? [];
    const socialDaily = socialQuery.data?.daily ?? null;
    const socialSync = socialQuery.data?.sync ?? null;
    const timeline = timelineQuery.data?.months ?? NO_MONTHS;
    const adAccounts = adAccountsQuery.data?.accounts ?? NO_ACCOUNTS;
    const [pickedAdAccount, setPickedAdAccount] = useState<string | null>(null);
    const selectedAdAccount = pickedAdAccount
        ?? adAccountsQuery.data?.selected_id
        ?? (adAccounts.length === 1 ? adAccounts[0].id : null);
    // ad_campaigns-ийн зардал, CPC нь хадгалсан зарын дансны валютаар (cron/insights зөвхөн тэр дансны
    // кампанит ажлыг шинэчилнэ). Валютыг сүүлийн зардлын синк эсвэл ачаалсан дансны жагсаалтаас авна;
    // мэдэгдэхгүй бол ₮ гэж таамаглахгүй.
    const savedAdAccount = metaTokenQuery.data?.accountId ?? null;
    const adCurrency = metaTokenQuery.data?.status?.currency
        || adAccounts.find((a) => !!savedAdAccount && accountKey(a.id) === accountKey(savedAdAccount))?.currency
        || null;
    const adCurrencyLabel = accountCurrencyLabel(adCurrency);
    const adMoney = useCallback((value: number | null | undefined) => formatAccountMoney(value, adCurrency), [adCurrency]);
    // Цувааны зардал өөрийн валюттай ирнэ (сонгосон зарын дансны өдрийн зардал); ирээгүй бол дансны валютаар шошголно.
    const timelineCurrency = timelineQuery.data?.currency ?? adCurrency;
    const timelineMoney = useCallback((value: number | null | undefined) => formatAccountMoney(value, timelineCurrency), [timelineCurrency]);
    const timelineChart = useMemo(
        () => timeline.map(({ label, leads, meetings, activity, spend }) => ({ label, leads, meetings, activity, spend })),
        [timeline],
    );
    const partialSpendMonths = timeline.filter((m) => m.spendPartial).map((m) => `${m.label} (${m.spendDays} өдөр)`);
    const timelineSpendNote = !timeline.some((m) => m.spend !== null)
        ? 'Зарын зардал: Meta-аас өдрийн зардал татагдаагүй тул шугам хоосон. «Маркетинг» хуудасны «Meta зардал татах»-аар татна уу.'
        : `Зарын зардал: Meta-аас өдрөөр татсан зардлыг тухайн өдрийн сард оноов — зарын дансны валютаар (${accountCurrencyLabel(timelineCurrency)}), төгрөгт хөрвүүлээгүй. Зардал татагдаагүй сард шугам тасарна.${partialSpendMonths.length ? ` Зөвхөн зарим өдөр нь татагдсан: ${partialSpendMonths.join(', ')}.` : ''}`;
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [campaignsError, setCampaignsError] = useState<string | null>(null);
    const adsError = campaignsError || adAccountsQuery.error?.message;
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

    async function syncCampaigns() {
        if (!selectedAdAccount) {
            toast.error('Ad account сонгоно уу');
            return;
        }
        setCampaignsLoading(true);
        setCampaignsError(null);
        try {
            // Persist selection
            const selectResponse = await dashboardFetch('/api/marketing/facebook/ads/accounts', {
                method: 'POST',
                body: JSON.stringify({ ad_account_id: selectedAdAccount }),
            });
            if (!selectResponse.ok) {
                const detail = await selectResponse.json().catch(() => null);
                throw new Error(detail?.error || 'Зарын данс сонгож чадсангүй');
            }
            const res = await dashboardFetch(`/api/marketing/facebook/ads/campaigns?ad_account_id=${encodeURIComponent(selectedAdAccount)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Sync алдаа');
            // Данс солигдсон байж болзошгүй — валютыг хадгалсан данснаас дахин уншина.
            void metaTokenQuery.refetch();
            await refetchCampaigns();
            toast.success(`${data.synced} кампанит ажил татлаа`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Sync алдаа';
            setCampaignsError(msg);
            toast.error(msg);
        } finally {
            setCampaignsLoading(false);
        }
    }

    const syncInsights = useCallback(async (campaign: AdCampaign) => {
        if (!campaign.external_id) return;
        try {
            const res = await dashboardFetch(`/api/marketing/facebook/ads/insights?campaign_id=${encodeURIComponent(campaign.external_id)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Insights алдаа');
            // Insights ad_campaigns мөрийг шинэчилсэн тул хадгалсан жагсаалтыг дахин уншина.
            await refetchCampaigns();
            toast.success('Insights шинэчлэгдлээ');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Insights алдаа');
        }
    }, [refetchCampaigns]);

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

    // Facebook Ads кампаниудын багана (syncInsights handler-тэй тул компонент дотор)
    const campaignColumns = useMemo<DataTableColumn<AdCampaign>[]>(
        () => [
            {
                key: 'name',
                header: 'Нэр',
                sortable: true,
                accessor: (c) => c.name,
                cell: (c) => (
                    <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.objective && (
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5 normal-case">{c.objective}</p>
                        )}
                    </div>
                ),
            },
            {
                key: 'status',
                header: 'Төлөв',
                sortable: true,
                accessor: (c) => c.status,
                cell: (c) => <StatusPill variant={campaignStatusVariant(c.status)}>{c.status}</StatusPill>,
            },
            {
                key: 'spend',
                header: `Зарцуулалт (${adCurrencyLabel})`,
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.spend || 0),
                cell: (c) => <span className="tabular-nums">{adMoney(c.spend)}</span>,
            },
            {
                key: 'impressions',
                header: 'Imp',
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.impressions || 0),
                cell: (c) => <span className="tabular-nums">{Number(c.impressions || 0).toLocaleString()}</span>,
            },
            {
                key: 'clicks',
                header: 'Click',
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.clicks || 0),
                cell: (c) => <span className="tabular-nums">{Number(c.clicks || 0).toLocaleString()}</span>,
            },
            {
                key: 'ctr',
                header: 'CTR',
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.ctr || 0),
                cell: (c) => <span className="tabular-nums">{Number(c.ctr || 0).toFixed(2)}%</span>,
            },
            {
                key: 'cpc',
                header: 'CPC',
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.cpc || 0),
                cell: (c) => <span className="tabular-nums">{adMoney(c.cpc)}</span>,
            },
            {
                key: 'conversions',
                header: 'Конверс',
                align: 'right',
                sortable: true,
                accessor: (c) => c.conversions,
                cell: (c) => <span className="tabular-nums">{c.conversions}</span>,
            },
            {
                key: 'actions',
                header: '',
                align: 'right',
                cell: (c) => (
                    <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => syncInsights(c)}
                        title="Insights дахин татах"
                        disabled={!c.external_id}
                        aria-label="Insights дахин татах"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                ),
            },
        ],
        [syncInsights, adCurrencyLabel, adMoney],
    );
    const roiTableColumns = useMemo(() => roiColumns(adCurrency), [adCurrency]);

    // Хуучин шигээ эхний ачаалалт бүх уншилтыг хүлээнэ. Лид/кампанит ажлын өгөгдөлгүй үед л алдааны
    // карт (дахин оролдох үед spinner); өгөгдөл байхад фон шинэчлэлтийн алдааг QueryProvider toast мэдэгдэнэ.
    const baseQueries = [sourcesQuery, campaignsQuery];
    const loadError = baseQueries.some((q) => !q.data && q.isError && !q.isFetching);
    const loading = !loadError && (baseQueries.some((q) => !q.data) || [roiQuery, socialQuery, timelineQuery].some((q) => q.isPending));

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

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Маркетинг ROI"
                subtitle="Эх үүсвэр тус бүрийн лийд, конверс шинжилгээ"
            />

            {!analytics ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<BarChart3 className="w-7 h-7" />} title="Лийд өгөгдөл байхгүй" />
                    </div>
                </Card>
            ) : (
                <>
                    <StatBar columns={4}>
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

                    {roiQuery.isError && <Alert variant="warning">Маркетингийн гэрээ, зардлын тайланг уншиж чадсангүй. Дахин шинэчилнэ үү.</Alert>}
                    {roi && (
                        <>
                            {roi.basis?.note && <p className="text-sm text-muted-foreground mb-4">{roi.basis.note}</p>}
                            <StatBar columns={4}>
                                <StatTile label="Зарын зардал" value={adMoney(roi.totals.spend)} helper={adCurrency ? `Зарын дансны валютаар (${adCurrencyLabel}), төгрөгт хөрвүүлээгүй` : 'Зарын дансны валют тодорхойгүй, төгрөгт хөрвүүлээгүй'} icon={<DollarSign className="w-4 h-4" />} accent="warning" />
                                <StatTile label="Гэрээний дүн" value={fmtMNT(roi.totals.revenue)} helper="Бүх хугацааны, лидтэй холбосон" icon={<Target className="w-4 h-4" />} accent="success" />
                                <StatTile label="ROAS" value={roi.totals.roas !== null ? `${roi.totals.roas}x` : '—'} helper={roi.totals.cpl !== null ? `CPL ${adMoney(roi.totals.cpl)}` : undefined} icon={<TrendingUp className="w-4 h-4" />} accent="brand" />
                                <StatTile label="Гэрээтэй лид" value={String(roi.totals.won)} helper="Хүчинтэй гэрээгээр баталгаажсан" icon={<BarChart3 className="w-4 h-4" />} accent="success" />
                            </StatBar>

                            {roi.campaigns.length > 0 && (
                                <Card className="mb-6 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-border">
                                        <h3 className="heading-section text-sm text-foreground">Кампанит ажлын ROI</h3>
                                    </div>
                                    <div className="p-4">
                                        <DataTable
                                            caption="Кампанит ажлын ROI"
                                            data={roi.campaigns}
                                            getRowId={(c) => c.external_id}
                                            showDensityToggle={false}
                                            hidePagination
                                            columns={roiTableColumns}
                                        />
                                    </div>
                                </Card>
                            )}
                        </>
                    )}

                    {/* Organic социал (хадгалсан түүх) */}
                    <Card className="mb-6">
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
                                                                    <p className="text-[11px] text-muted-foreground">{socialMetricCaption(metric)}</p>
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
                                        <p className="text-sm text-muted-foreground py-4 text-center">Хадгалсан нийтлэл алга. "Хадгалах" дарж Facebook-аас татна уу.</p>
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
                    <Card className="mb-6 overflow-hidden">
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

                    {/* Facebook Ads Campaigns */}
                    <Card className="mb-6 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Megaphone className="w-4 h-4 text-brand-strong" />
                                <h3 className="heading-section text-sm text-foreground">Facebook Ads кампаниуд</h3>
                                {campaigns.length > 0 && (
                                    <span className="text-xs text-muted-foreground tabular-nums">({campaigns.length})</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {shop?.id && showMetaConnect && <Button variant="secondary" size="sm" href={`/api/marketing/facebook/ads/connect?shop_id=${encodeURIComponent(shop.id)}`}>Meta Ads холбох</Button>}
                                {adAccounts.length === 0 ? (
                                    <Button variant="secondary" size="sm" onClick={() => void adAccountsQuery.refetch()}>
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
                                            onClick={syncCampaigns}
                                            disabled={!selectedAdAccount || campaignsLoading}
                                            isLoading={campaignsLoading}
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Синк хийх
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
                        {campaigns.length === 0 ? (
                            <div className="py-12">
                                <EmptyState
                                    icon={<Megaphone className="w-7 h-7" />}
                                    title="Кампанит ажил байхгүй"
                                    description="Facebook Ad account сонгож синк хийнэ үү"
                                />
                            </div>
                        ) : (
                            <div className="p-4">
                                <DataTable
                                    caption="Facebook Ads кампаниуд"
                                    data={campaigns}
                                    getRowId={(c) => c.id}
                                    showDensityToggle={false}
                                    hidePagination
                                    columns={campaignColumns}
                                />
                            </div>
                        )}
                    </Card>

                    {/* Marketing impact: идэвхжүүлэлт vs лид/уулзалт */}
                    {timelineQuery.error && !timelineQuery.data ? (
                        <Alert variant="danger" className="mb-6">
                            <AlertTitle>Маркетингийн нөлөөллийн цувааг ачаалж чадсангүй</AlertTitle>
                            <AlertDescription>{timelineQuery.error.message}</AlertDescription>
                            <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void timelineQuery.refetch()} isLoading={timelineQuery.isFetching}>Дахин оролдох</Button>
                        </Alert>
                    ) : timeline.length > 0 && (
                        <div className="mb-6">
                            <ChartCard
                                title="Маркетингийн нөлөөлөл"
                                subtitle="Идэвхжүүлэлт (пост, кампанит ажил) лид ба уулзалтын тоонд хэрхэн нөлөөлж буй харьцуулалт"
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
                                    line={{ key: 'spend', name: `Зарын зардал (${accountCurrencyLabel(timelineCurrency)})` }}
                                    lineFormatter={timelineMoney}
                                />
                            </ChartCard>
                            <p className="mt-2 text-xs text-muted-foreground">{timelineSpendNote}</p>
                        </div>
                    )}

                    {/* Monthly Trend */}
                    <ChartCard title="Сар бүрийн лийд" subtitle="Сүүлийн 6 сар (Улаанбаатарын сараар)" height={240}>
                        <BarChart
                            data={monthlyChartData}
                            xKey="month"
                            series={[{ key: 'count', name: 'Лийд' }]}
                        />
                    </ChartCard>
                </>
            )}
        </div>
    );
}
