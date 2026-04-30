'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Megaphone, Plus, Search, Play, Pause, CheckCircle2,
    Calendar, DollarSign, TrendingUp, ArrowUpRight, MoreVertical,
    Target, BarChart3, X, Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';

interface Campaign {
    id: string;
    name: string;
    type: string;
    status: string;
    budget: number;
    spend: number;
    start_date: string;
    end_date: string;
    metrics: Record<string, number>;
}

const statusColors: Record<string, string> = {
    draft: 'bg-surface-2 text-muted-foreground',
    active: 'bg-status-success-soft text-status-success',
    paused: 'bg-status-pending-soft text-status-pending',
    completed: 'bg-status-info-soft text-status-info',
    cancelled: 'bg-status-danger-soft text-status-danger',
};

const statusLabels: Record<string, string> = {
    draft: 'Ноорог',
    active: 'Идэвхтэй',
    paused: 'Зогссон',
    completed: 'Дууссан',
    cancelled: 'Цуцлагдсан',
};

export default function CampaignsPage() {
    const { shop } = useAuth();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCampaign, setNewCampaign] = useState({ name: '', type: 'social', budget: 0, start_date: new Date().toISOString().split('T')[0], end_date: '' });

    const handleCreate = async () => {
        if (!shop?.id || !newCampaign.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('marketing_campaigns').insert([{
                shop_id: shop.id, name: newCampaign.name.trim(), type: newCampaign.type,
                status: 'draft', budget: newCampaign.budget, spend: 0,
                start_date: newCampaign.start_date || null, end_date: newCampaign.end_date || null, metrics: {},
            }]).select().single();
            if (error) throw error;
            setCampaigns(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewCampaign({ name: '', type: 'social', budget: 0, start_date: new Date().toISOString().split('T')[0], end_date: '' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        if (!shop?.id) return;

        const fetchCampaigns = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('marketing_campaigns')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setCampaigns(data || []);
            } catch (error) {
                console.error('Error fetching campaigns:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCampaigns();
    }, [shop?.id]);

    const filteredCampaigns = campaigns.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);

    const formatCurrency = (value: number) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M₮`;
        if (value >= 1000) return `${(value / 1000).toFixed(0)}K₮`;
        return value.toLocaleString() + '₮';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-status-success border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Megaphone className="w-6 h-6 text-status-success" />
                        Кампанит ажил
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Маркетингийн кампанит ажлууд</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <Input
                            type="text"
                            placeholder="Хайх..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 w-64 bg-surface-2/40"
                        />
                    </div>
                    <Button className="bg-status-success hover:bg-status-success text-white" onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Шинэ кампани
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-surface">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт кампани</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{campaigns.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-info-soft rounded-xl flex items-center justify-center">
                                <Megaphone className="w-6 h-6 text-status-info" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-surface">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Идэвхтэй</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{activeCampaigns}</p>
                            </div>
                            <div className="w-12 h-12 bg-status-success-soft rounded-xl flex items-center justify-center">
                                <Play className="w-6 h-6 text-status-success" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-surface">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Нийт зарцуулалт</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalSpend)}</p>
                            </div>
                            <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-brand-strong" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Campaigns List */}
            <Card className="bg-surface">
                <CardContent className="p-0">
                    {filteredCampaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Megaphone className="w-16 h-16 text-muted-foreground/60 mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-muted-foreground">Кампанит ажил нэмэхийн тулд "Шинэ кампани" товчийг дарна уу.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-surface-2/40 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Нэр</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Төрөл</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Төлөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Төсөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Зарцуулалт</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Хугацаа</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredCampaigns.map((campaign) => (
                                        <tr key={campaign.id} className="hover:bg-surface-2/40">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-foreground">{campaign.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">{campaign.type}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full ${statusColors[campaign.status] || 'bg-surface-2'}`}>
                                                    {statusLabels[campaign.status] || campaign.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium">{formatCurrency(campaign.budget)}</td>
                                            <td className="px-4 py-3 text-sm">{formatCurrency(campaign.spend)}</td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString('mn-MN') : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h3 className="font-semibold text-foreground">Шинэ кампани</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-surface-2 rounded-lg"><X className="w-5 h-5 text-muted-foreground/70" /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div><label className="text-sm font-medium text-foreground block mb-1">Нэр *</label><Input value={newCampaign.name} onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))} placeholder="Кампанийн нэр" /></div>
                            <div><label className="text-sm font-medium text-foreground block mb-1">Төрөл</label>
                                <select value={newCampaign.type} onChange={e => setNewCampaign(p => ({ ...p, type: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm">
                                    <option value="social">Сошиал</option><option value="search">Хайлт</option><option value="display">Дэлгэц</option><option value="email">Имэйл</option><option value="event">Эвент</option>
                                </select></div>
                            <div><label className="text-sm font-medium text-foreground block mb-1">Төсөв (₮)</label><Input type="number" value={newCampaign.budget} onChange={e => setNewCampaign(p => ({ ...p, budget: Number(e.target.value) }))} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-sm font-medium text-foreground block mb-1">Эхлэх</label><Input type="date" value={newCampaign.start_date} onChange={e => setNewCampaign(p => ({ ...p, start_date: e.target.value }))} /></div>
                                <div><label className="text-sm font-medium text-foreground block mb-1">Дуусах</label><Input type="date" value={newCampaign.end_date} onChange={e => setNewCampaign(p => ({ ...p, end_date: e.target.value }))} /></div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Болих</Button>
                            <Button className="bg-status-success hover:bg-status-success text-white" onClick={handleCreate} disabled={!newCampaign.name.trim() || creating}>
                                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Үүсгэж байна...</> : <><Plus className="w-4 h-4 mr-2" />Үүсгэх</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
