'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Users, Target, BarChart3, RefreshCw, Megaphone, DollarSign, Heart, MessageCircle, Share2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { DataTable, Money, StatusPill, type DataTableColumn } from '@/components/ui/DataTable';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
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

const sourceLabels: Record<string, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    website: 'Вебсайт',
    referral: 'Танилын',
    phone: 'Утас',
    facebook: 'Facebook Ads',
    google: 'Google Ads',
    other: 'Бусад',
};

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
    profit: number;
}
interface RoiTotals {
    spend: number; leads: number; won: number; revenue: number;
    cpl: number | null; cpa: number | null; roas: number | null; profit: number;
}
interface RoiData { campaigns: CampaignRoi[]; sources: unknown[]; totals: RoiTotals; }

interface SocialPost { id: string; content: string | null; likes: number; comments: number; shares: number; published_at: string | null; }
interface SocialInsight { captured_at: string; reach: number; impressions: number; followers: number; }

const fmtMNT = (n: number): string => formatMNT(n, { compact: true });

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

// Кампанит ажлын ROI хүснэгтийн багана
const roiColumns: DataTableColumn<CampaignRoi>[] = [
    { key: 'name', header: 'Кампанит ажил', accessor: (c) => c.name, sortable: true, cell: (c) => <span className="font-medium text-foreground">{c.name}</span> },
    { key: 'spend', header: 'Зардал', align: 'right', sortable: true, accessor: (c) => c.spend, cell: (c) => <Money value={c.spend} compact /> },
    { key: 'leads', header: 'Лийд', align: 'center', sortable: true, accessor: (c) => c.leads, cell: (c) => <span className="tabular-nums">{c.leads}</span> },
    { key: 'cpl', header: 'CPL', align: 'right', sortable: true, accessor: (c) => c.cpl ?? -1, cell: (c) => (c.cpl !== null ? <Money value={c.cpl} compact /> : '—') },
    { key: 'won', header: 'Хожсон', align: 'center', sortable: true, accessor: (c) => c.won, cell: (c) => <span className="tabular-nums">{c.won}</span> },
    { key: 'revenue', header: 'Орлого', align: 'right', sortable: true, accessor: (c) => c.revenue, cell: (c) => <Money value={c.revenue} compact /> },
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
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
    const [selectedAdAccount, setSelectedAdAccount] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [campaignsError, setCampaignsError] = useState<string | null>(null);
    const [roi, setRoi] = useState<RoiData | null>(null);
    const [social, setSocial] = useState<{ posts: SocialPost[]; insights: SocialInsight[] } | null>(null);
    const [syncingSocial, setSyncingSocial] = useState(false);

    useEffect(() => {
        if (!shop?.id) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id]);

    async function fetchData() {
        setLoadError(false);
        try {
            const { data, error: leadsError } = await supabase
                .from('leads')
                .select('id, source, status, budget_min, budget_max, created_at')
                .eq('shop_id', shop!.id);
            if (leadsError) throw leadsError;
            setLeads(data || []);

            // Load already-stored Facebook campaigns from DB (no remote sync)
            const { data: stored, error: campError } = await supabase
                .from('ad_campaigns')
                .select('*')
                .eq('shop_id', shop!.id)
                .eq('platform', 'facebook')
                .order('updated_at', { ascending: false });
            if (campError) throw campError;
            setCampaigns((stored || []) as AdCampaign[]);

            // Жинхэнэ ROI roll-up (spend↔lead↔орлого) — best-effort
            try {
                const res = await fetch('/api/dashboard/marketing-roi', {
                    headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
                });
                if (res.ok) {
                    const roiJson = await res.json();
                    setRoi(roiJson.roi || null);
                }
            } catch {
                // best-effort
            }

            // Хадгалсан organic social түүх — best-effort
            try {
                const res = await fetch('/api/dashboard/marketing/social-history', {
                    headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
                });
                if (res.ok) {
                    const socialJson = await res.json();
                    setSocial({ posts: socialJson.posts || [], insights: socialJson.insights || [] });
                }
            } catch {
                // best-effort
            }
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }

    const fetchAdAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/marketing/facebook/ads/accounts', {
                headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Ad account татахад алдаа');
            }
            setAdAccounts(data.accounts || []);
            if (data.selected_id) setSelectedAdAccount(data.selected_id);
            else if ((data.accounts || []).length === 1) setSelectedAdAccount(data.accounts[0].id);
        } catch (err) {
            setCampaignsError(err instanceof Error ? err.message : 'Алдаа');
        }
    }, []);

    async function syncSocial() {
        setSyncingSocial(true);
        try {
            const headers = { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' };
            const res = await fetch('/api/dashboard/marketing/sync-social', { method: 'POST', headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Sync алдаа');
            const h = await fetch('/api/dashboard/marketing/social-history', { headers });
            const hist = await h.json();
            setSocial({ posts: hist.posts || [], insights: hist.insights || [] });
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
            await fetch('/api/marketing/facebook/ads/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({ ad_account_id: selectedAdAccount }),
            });
            const res = await fetch(`/api/marketing/facebook/ads/campaigns?ad_account_id=${encodeURIComponent(selectedAdAccount)}`, {
                headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Sync алдаа');
            setCampaigns(data.campaigns || []);
            toast.success(`${data.synced} кампанит ажил татлаа`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Sync алдаа';
            setCampaignsError(msg);
            toast.error(msg);
        } finally {
            setCampaignsLoading(false);
        }
    }

    async function syncInsights(campaign: AdCampaign) {
        if (!campaign.external_id) return;
        try {
            const res = await fetch(`/api/marketing/facebook/ads/insights?campaign_id=${encodeURIComponent(campaign.external_id)}`, {
                headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Insights алдаа');
            // refetch list
            const listRes = await fetch('/api/marketing/facebook/ads/campaigns', {
                headers: { 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' },
            });
            const listData = await listRes.json();
            if (listRes.ok) setCampaigns(listData.campaigns || []);
            toast.success('Insights шинэчлэгдлээ');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Insights алдаа');
        }
    }

    const analytics = useMemo(() => {
        if (leads.length === 0) return null;

        const bySource: Record<string, { total: number; won: number; lost: number; active: number }> = {};
        leads.forEach((l) => {
            const src = l.source || 'other';
            if (!bySource[src]) bySource[src] = { total: 0, won: 0, lost: 0, active: 0 };
            bySource[src].total++;
            if (l.status === 'closed_won') bySource[src].won++;
            else if (l.status === 'closed_lost') bySource[src].lost++;
            else bySource[src].active++;
        });

        const sources = Object.entries(bySource)
            .map(([source, data]) => ({
                source,
                label: sourceLabels[source] || source,
                ...data,
                conversionRate: data.total > 0 ? Math.round((data.won / data.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        const totalLeads = leads.length;
        const totalWon = leads.filter((l) => l.status === 'closed_won').length;
        const totalLost = leads.filter((l) => l.status === 'closed_lost').length;
        const overallConversion = totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0;

        const monthly: Record<string, number> = {};
        leads.forEach((l) => {
            const month = new Date(l.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short' });
            monthly[month] = (monthly[month] || 0) + 1;
        });

        const bestSource =
            sources.length > 0 ? sources.reduce((best, s) => (s.conversionRate > best.conversionRate ? s : best)) : null;

        return { sources, totalLeads, totalWon, totalLost, overallConversion, monthly, bestSource };
    }, [leads]);

    // Сар бүрийн лийдийн чартын өгөгдөл — анхны логиктой ижил (сүүлийн 6 сар)
    const monthlyChartData = useMemo(
        () =>
            analytics
                ? Object.entries(analytics.monthly)
                      .slice(-6)
                      .map(([month, count]) => ({ month, count }))
                : [],
        [analytics],
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
                header: 'Зарцуулалт',
                align: 'right',
                sortable: true,
                accessor: (c) => Number(c.spend || 0),
                cell: (c) => <span className="tabular-nums">{Number(c.spend || 0).toLocaleString()}₮</span>,
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
                cell: (c) => <span className="tabular-nums">{Number(c.cpc || 0).toFixed(0)}₮</span>,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

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
                    <Button onClick={() => { setLoading(true); fetchData(); }} variant="secondary" size="sm">
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

                    {/* True ROI (spend ↔ lead ↔ орлого) */}
                    {roi && roi.totals.spend > 0 && (
                        <>
                            <StatBar columns={4}>
                                <StatTile label="Зарын зардал" value={fmtMNT(roi.totals.spend)} icon={<DollarSign className="w-4 h-4" />} accent="warning" />
                                <StatTile label="Орлого (хожсон)" value={fmtMNT(roi.totals.revenue)} icon={<Target className="w-4 h-4" />} accent="success" />
                                <StatTile label="ROAS" value={roi.totals.roas !== null ? `${roi.totals.roas}x` : '—'} helper={roi.totals.cpl !== null ? `CPL ${fmtMNT(roi.totals.cpl)}` : undefined} icon={<TrendingUp className="w-4 h-4" />} accent="brand" />
                                <StatTile label="Цэвэр ашиг" value={fmtMNT(roi.totals.profit)} helper={roi.totals.cpa !== null ? `CPA ${fmtMNT(roi.totals.cpa)}` : undefined} icon={<BarChart3 className="w-4 h-4" />} accent={roi.totals.profit >= 0 ? 'success' : 'danger'} />
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
                                            columns={roiColumns}
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
                            {social && social.insights[0] && (
                                <div className="flex flex-wrap gap-4 mb-4 text-sm">
                                    <span className="text-muted-foreground">Дагагч: <span className="font-semibold text-foreground tabular-nums">{social.insights[0].followers.toLocaleString()}</span></span>
                                    <span className="text-muted-foreground">Хүртээмж: <span className="font-semibold text-foreground tabular-nums">{social.insights[0].reach.toLocaleString()}</span></span>
                                    <span className="text-muted-foreground">Snapshot: <span className="font-semibold text-foreground tabular-nums">{social.insights.length}</span></span>
                                </div>
                            )}
                            {!social || social.posts.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Хадгалсан нийтлэл алга. "Хадгалах" дарж Facebook-аас татна уу.</p>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {social.posts.slice(0, 5).map((p) => (
                                        <div key={p.id} className="py-2.5 flex items-start justify-between gap-3">
                                            <p className="text-sm text-foreground line-clamp-2 flex-1">{p.content || '(зураг)'}</p>
                                            <span className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {p.likes}</span>
                                                <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {p.comments}</span>
                                                <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> {p.shares}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
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
                                <Megaphone className="w-4 h-4 text-brand" />
                                <h3 className="heading-section text-sm text-foreground">Facebook Ads кампаниуд</h3>
                                {campaigns.length > 0 && (
                                    <span className="text-xs text-muted-foreground tabular-nums">({campaigns.length})</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {adAccounts.length === 0 ? (
                                    <Button variant="secondary" size="sm" onClick={fetchAdAccounts}>
                                        Ad account-уудыг ачаалах
                                    </Button>
                                ) : (
                                    <>
                                        <Select
                                            value={selectedAdAccount || ''}
                                            onValueChange={(v) => setSelectedAdAccount(v || null)}
                                        >
                                            <SelectTrigger className="h-9 w-56 text-sm">
                                                <SelectValue placeholder="Ad account сонгоно уу" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {adAccounts.map((a) => (
                                                    <SelectItem key={a.id} value={a.id}>
                                                        {a.name || a.business_name || a.account_id}
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
                        {campaignsError && (
                            <div className="px-4 pt-3">
                                <Alert variant="danger">{campaignsError}</Alert>
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

                    {/* Monthly Trend */}
                    <ChartCard title="Сар бүрийн лийд" height={240}>
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
