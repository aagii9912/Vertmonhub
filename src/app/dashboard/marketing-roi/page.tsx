'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Users, Target, BarChart3, RefreshCw, Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
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

export default function MarketingROIPage() {
    const { shop } = useAuth();
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
    const [selectedAdAccount, setSelectedAdAccount] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [campaignsError, setCampaignsError] = useState<string | null>(null);

    useEffect(() => {
        if (!shop?.id) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id]);

    async function fetchData() {
        const { data } = await supabase
            .from('leads')
            .select('id, source, status, budget_min, budget_max, created_at')
            .eq('shop_id', shop!.id);
        setLeads(data || []);

        // Load already-stored Facebook campaigns from DB (no remote sync)
        const { data: stored } = await supabase
            .from('ad_campaigns')
            .select('*')
            .eq('shop_id', shop!.id)
            .eq('platform', 'facebook')
            .order('updated_at', { ascending: false });
        setCampaigns((stored || []) as AdCampaign[]);

        setLoading(false);
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

    if (loading)
        return (
            <Card>
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
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

                    {/* Source Breakdown */}
                    <Card className="mb-6">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Эх үүсвэрийн шинжилгээ</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-2/50 border-b border-border">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Суваг
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Лийд
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Амжилт
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Алдсан
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Идэвхтэй
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Конверс
                                        </th>
                                        <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Визуал
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {analytics.sources.map((s) => (
                                        <tr key={s.source} className="hover:bg-surface-2/40 transition-colors">
                                            <td className="px-4 py-3 font-medium text-foreground">{s.label}</td>
                                            <td className="px-4 py-3 text-center text-foreground tabular-nums">{s.total}</td>
                                            <td className="px-4 py-3 text-center text-status-success font-medium tabular-nums">
                                                {s.won}
                                            </td>
                                            <td className="px-4 py-3 text-center text-status-danger tabular-nums">{s.lost}</td>
                                            <td className="px-4 py-3 text-center text-status-info tabular-nums">{s.active}</td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant={
                                                        s.conversionRate >= 50
                                                            ? 'success'
                                                            : s.conversionRate >= 20
                                                              ? 'warning'
                                                              : 'default'
                                                    }
                                                    size="sm"
                                                >
                                                    {s.conversionRate}%
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 min-w-[120px]">
                                                <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="bg-brand h-full rounded-full transition-all"
                                                        style={{ width: `${s.conversionRate}%` }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Facebook Ads Campaigns */}
                    <Card className="mb-6">
                        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Megaphone className="w-4 h-4 text-brand" />
                                <h3 className="heading-section text-sm text-foreground">Facebook Ads кампаниуд</h3>
                                {campaigns.length > 0 && (
                                    <span className="text-xs text-muted-foreground">({campaigns.length})</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {adAccounts.length === 0 ? (
                                    <Button variant="secondary" size="sm" onClick={fetchAdAccounts}>
                                        Ad account-уудыг ачаалах
                                    </Button>
                                ) : (
                                    <>
                                        <select
                                            value={selectedAdAccount || ''}
                                            onChange={(e) => setSelectedAdAccount(e.target.value || null)}
                                            className="px-3 py-1.5 bg-background border border-border rounded-md text-sm"
                                        >
                                            <option value="">Ad account сонгоно уу</option>
                                            {adAccounts.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name || a.business_name || a.account_id}
                                                </option>
                                            ))}
                                        </select>
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
                            <div className="px-4 py-2 text-sm text-status-danger bg-status-danger-soft">
                                {campaignsError}
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
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-surface-2/50 border-b border-border">
                                        <tr>
                                            <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Нэр</th>
                                            <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Төлөв</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Зарцуулалт</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Imp</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Click</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">CTR</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">CPC</th>
                                            <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">Конверс</th>
                                            <th className="px-4 py-2.5"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {campaigns.map((c) => (
                                            <tr key={c.id} className="hover:bg-surface-2/40 transition-colors">
                                                <td className="px-4 py-3 font-medium text-foreground">
                                                    {c.name}
                                                    {c.objective && (
                                                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 normal-case">{c.objective}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge
                                                        variant={c.status === 'active' ? 'success' : c.status === 'paused' ? 'warning' : 'default'}
                                                        size="sm"
                                                    >
                                                        {c.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">{Number(c.spend || 0).toLocaleString()}₮</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{Number(c.impressions || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{Number(c.clicks || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{Number(c.ctr || 0).toFixed(2)}%</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{Number(c.cpc || 0).toFixed(0)}₮</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{c.conversions}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => syncInsights(c)}
                                                        className="text-xs text-brand hover:underline"
                                                        title="Insights дахин татах"
                                                        disabled={!c.external_id}
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5 inline" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* Monthly Trend */}
                    <Card>
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Сар бүрийн лийд</h3>
                        </div>
                        <div className="p-4">
                            <div className="flex items-end gap-2 h-32">
                                {Object.entries(analytics.monthly)
                                    .slice(-6)
                                    .map(([month, count]) => {
                                        const max = Math.max(...Object.values(analytics.monthly));
                                        const height = max > 0 ? (count / max) * 100 : 0;
                                        return (
                                            <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                                <span className="text-xs font-medium text-foreground tabular-nums">
                                                    {count}
                                                </span>
                                                <div
                                                    className={cn(
                                                        'w-full bg-brand-soft rounded-t transition-all',
                                                    )}
                                                    style={{ height: `${height}%`, minHeight: '4px' }}
                                                >
                                                    <div className="w-full h-full bg-brand rounded-t" />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                                                    {month}
                                                </span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
