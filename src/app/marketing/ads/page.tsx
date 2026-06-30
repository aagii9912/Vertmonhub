'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    DataTable,
    type DataTableColumn,
    Money,
    StatusPill,
} from '@/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
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
import { supabase } from '@/lib/supabase';

interface AdCampaign {
    id: string;
    platform: string;
    name: string;
    status: string;
    budget: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
}

export default function AdsPage() {
    const { shop } = useAuth();
    const [ads, setAds] = useState<AdCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newAd, setNewAd] = useState({ name: '', platform: 'facebook', budget: 0 });

    const handleCreate = async () => {
        if (!shop?.id || !newAd.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('ad_campaigns').insert([{
                shop_id: shop.id, name: newAd.name.trim(), platform: newAd.platform,
                status: 'draft', budget: newAd.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0,
            }]).select().single();
            if (error) throw error;
            setAds(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewAd({ name: '', platform: 'facebook', budget: 0 });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('ad_campaigns')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setAds(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const totalSpend = ads.reduce((s, a) => s + (a.spend || 0), 0);
    const totalClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
    const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
    const totalConversions = ads.reduce((s, a) => s + (a.conversions || 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

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
                    {ad.status === 'active' ? 'Идэвхтэй' : ad.status === 'paused' ? 'Зогссон' : ad.status}
                </StatusPill>
            ),
        },
        {
            key: 'spend',
            header: 'Зарцуулалт',
            align: 'right',
            accessor: (ad) => ad.spend,
            cell: (ad) => <Money value={ad.spend} compact />,
            sortable: true,
        },
        {
            key: 'clicks',
            header: 'Click',
            align: 'right',
            accessor: (ad) => ad.clicks,
            cell: (ad) => <span className="tabular-nums">{ad.clicks.toLocaleString()}</span>,
            sortable: true,
        },
        {
            key: 'ctr',
            header: 'CTR',
            align: 'right',
            accessor: (ad) => ad.ctr,
            cell: (ad) => <span className="tabular-nums">{ad.ctr.toFixed(2)}%</span>,
            sortable: true,
        },
    ];

    if (loading) {
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
                        <Plus className="w-4 h-4" />Шинэ зар
                    </Button>
                }
            />

            <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatsCard
                        icon={DollarSign}
                        iconColor="warning"
                        title="Нийт зарцуулалт"
                        value={<Money value={totalSpend} compact />}
                    />
                    <StatsCard
                        icon={TrendingUp}
                        iconColor="info"
                        title="CTR"
                        value={`${avgCtr.toFixed(2)}%`}
                    />
                    <StatsCard
                        icon={MousePointer}
                        iconColor="brand"
                        title="CPC"
                        value={<Money value={avgCpc} compact />}
                    />
                    <StatsCard
                        icon={Target}
                        iconColor="success"
                        title="Хөрвүүлэлт"
                        value={totalConversions}
                    />
                </div>

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

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Шинэ зар</DialogTitle>
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
                            {creating ? 'Үүсгэж байна...' : 'Үүсгэх'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
