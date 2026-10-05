'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import {
    DataTable,
    type DataTableColumn,
    StatusPill,
} from '@/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { BarChart3, Plus, DollarSign, Target, TrendingUp, MousePointer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { accountCurrencyLabel, formatAccountMoney } from '@/lib/utils/currency';

interface AdCampaign {
    id: string;
    platform: string;
    name: string;
    status: string;
    external_id?: string | null;
    budget: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
}

/**
 * Meta-аас синк хийсэн кампанит ажил: зардал, CPC нь төслийн сонгосон зарын дансны валютаар
 * (cron/insights зөвхөн тэр дансны кампанит ажлыг шинэчилнэ). Бусад мөр гараар бүртгэсэн
 * төлөвлөгөө — үр дүн (зардал, click) байхгүй.
 */
const isMetaSynced = (ad: AdCampaign) => ad.platform === 'facebook' && !!ad.external_id;

const STATUS_LABEL: Record<string, string> = { active: 'Идэвхтэй', paused: 'Зогссон', draft: 'Төлөвлөгөөт', completed: 'Дууссан' };

export default function AdsPage() {
    const { shop } = useAuth();
    const { data, isLoading, error, isFetching, refetch } = useDashboardQuery<{ rows: AdCampaign[] }>(
        ['marketing-ads'],
        '/api/marketing/data/ad_campaigns?order=created_at.desc',
    );
    // Зарын дансны валют (сүүлийн зардлын синкээс). Мэдэгдэхгүй бол ₮ гэж таамаглахгүй.
    const metaQuery = useDashboardQuery<{ status?: { currency?: string | null } | null }>(
        ['marketing-ads', 'meta-account'],
        '/api/marketing/facebook/ads/spend-sync',
    );
    const currency = metaQuery.data?.status?.currency ?? null;
    const currencyLabel = accountCurrencyLabel(currency);
    const ads = data?.rows ?? [];
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newAd, setNewAd] = useState({ name: '', platform: 'facebook', budget: 0 });

    const handleCreate = async () => {
        if (!shop?.id || !newAd.name.trim()) return;
        setCreating(true);
        try {
            await dashboardMutate('/api/marketing/data/ad_campaigns', 'POST', {
                name: newAd.name.trim(), platform: newAd.platform,
                status: 'draft', budget: newAd.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0,
            });
            void refetch();
            setShowCreateModal(false);
            setNewAd({ name: '', platform: 'facebook', budget: 0 });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    // Нийлбэрийг зөвхөн нэг валюттай (Meta зарын дансны) мөрөөр — гар бүртгэлийг хольж нэмэхгүй.
    const metaAds = ads.filter(isMetaSynced);
    const totalSpend = metaAds.reduce((s, a) => s + (Number(a.spend) || 0), 0);
    const totalClicks = metaAds.reduce((s, a) => s + (Number(a.clicks) || 0), 0);
    const totalImpressions = metaAds.reduce((s, a) => s + (Number(a.impressions) || 0), 0);
    const totalConversions = metaAds.reduce((s, a) => s + (Number(a.conversions) || 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : null;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : null;

    const columns: DataTableColumn<AdCampaign>[] = [
        {
            key: 'name',
            header: 'Нэр',
            accessor: (ad) => ad.name,
            cell: (ad) => <span className="font-medium text-foreground">{ad.name}</span>,
            sortable: true,
        },
        {
            key: 'platform',
            header: 'Платформ',
            accessor: (ad) => ad.platform,
            cell: (ad) => <span className="text-sm text-muted-foreground capitalize">{ad.platform}</span>,
            sortable: true,
        },
        {
            key: 'status',
            header: 'Төлөв',
            accessor: (ad) => ad.status,
            cell: (ad) => (
                <StatusPill variant={ad.status === 'active' ? 'success' : 'neutral'}>
                    {STATUS_LABEL[ad.status] ?? ad.status}
                </StatusPill>
            ),
        },
        {
            key: 'spend',
            header: `Зарцуулалт (${currencyLabel})`,
            align: 'right',
            accessor: (ad) => (isMetaSynced(ad) ? ad.spend : -1),
            cell: (ad) => <span className="tabular-nums">{isMetaSynced(ad) ? formatAccountMoney(ad.spend, currency) : '—'}</span>,
            sortable: true,
        },
        {
            key: 'clicks',
            header: 'Click',
            align: 'right',
            accessor: (ad) => (isMetaSynced(ad) ? ad.clicks : -1),
            cell: (ad) => <span className="tabular-nums">{isMetaSynced(ad) ? ad.clicks.toLocaleString() : '—'}</span>,
            sortable: true,
        },
        {
            key: 'ctr',
            header: 'CTR',
            align: 'right',
            accessor: (ad) => (isMetaSynced(ad) ? ad.ctr : -1),
            cell: (ad) => <span className="tabular-nums">{isMetaSynced(ad) ? `${ad.ctr.toFixed(2)}%` : '—'}</span>,
            sortable: true,
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" label="Татаж байна..." />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Зар сурталчилгаа"
                subtitle="Төлбөрт зарын кампанит ажлууд"
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" />Төлөвлөгөөт зар бүртгэх
                    </Button>
                }
            />

            {error && !data ? (
                <Alert variant="danger">
                    <AlertTitle>Зар сурталчилгааны мэдээлэл татахад алдаа гарлаа</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        <StatsCard
                            icon={DollarSign}
                            iconColor="warning"
                            title={`Нийт зарцуулалт (${currencyLabel})`}
                            value={metaAds.length ? formatAccountMoney(totalSpend, currency) : '—'}
                        />
                        <StatsCard
                            icon={TrendingUp}
                            iconColor="info"
                            title="CTR"
                            value={avgCtr === null ? '—' : `${avgCtr.toFixed(2)}%`}
                        />
                        <StatsCard
                            icon={MousePointer}
                            iconColor="brand"
                            title={`CPC (${currencyLabel})`}
                            value={formatAccountMoney(avgCpc, currency)}
                        />
                        <StatsCard
                            icon={Target}
                            iconColor="success"
                            title="Хөрвүүлэлт"
                            value={metaAds.length ? totalConversions : '—'}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Зардал, CPC, click нь зөвхөн Meta-аас синк хийсэн кампанит ажлынх бөгөөд зарын дансны валютаар ({currencyLabel}) — төгрөгт хөрвүүлээгүй. Төлөвлөгөөт зарын бүртгэлд үр дүн орохгүй.
                    </p>

                    {ads.length === 0 ? (
                        <EmptyState
                            icon={<BarChart3 className="w-7 h-7" />}
                            title="Мэдээлэл байхгүй"
                            description="Зар сурталчилгааны мэдээлэл энд харагдана."
                        />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={ads}
                            getRowId={(ad) => ad.id}
                            caption="Зар сурталчилгааны кампанит ажлууд"
                        />
                    )}
                </div>
            )}

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Төлөвлөгөөт зар бүртгэх</DialogTitle>
                        <DialogDescription>
                            Зөвхөн Vertmon Hub-д бүртгэл үүснэ — Meta болон бусад платформ дээр зар үүсэхгүй, зардал, click автоматаар орохгүй.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <FormField label="Нэр" htmlFor="ad-name" required>
                            <Input
                                id="ad-name"
                                value={newAd.name}
                                onChange={e => setNewAd(p => ({ ...p, name: e.target.value }))}
                                placeholder="Зарын нэр"
                            />
                        </FormField>
                        <FormField label="Платформ" htmlFor="ad-platform">
                            <Select
                                value={newAd.platform}
                                onValueChange={value => setNewAd(p => ({ ...p, platform: value }))}
                            >
                                <SelectTrigger id="ad-platform">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="facebook">Facebook</SelectItem>
                                    <SelectItem value="instagram">Instagram</SelectItem>
                                    <SelectItem value="google">Google</SelectItem>
                                    <SelectItem value="tiktok">TikTok</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Төсөв (₮)" htmlFor="ad-budget">
                            <Input
                                id="ad-budget"
                                type="number"
                                value={newAd.budget}
                                onChange={e => setNewAd(p => ({ ...p, budget: Number(e.target.value) }))}
                            />
                        </FormField>
                    </FieldGroup>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateModal(false)}>Болих</Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newAd.name.trim() || creating}
                            isLoading={creating}
                        >
                            {!creating && <Plus className="w-4 h-4" />}
                            {creating ? 'Бүртгэж байна...' : 'Бүртгэх'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
