'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Globe, Plus, Search, ExternalLink, DollarSign,
    Calendar, BarChart3, TrendingUp, FileText, Settings, X, Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';

interface MarketingChannel {
    id: string;
    name: string;
    type: string;
    status: string;
    description: string;
    created_at: string;
}

interface ChannelContract {
    id: string;
    channel_id: string;
    start_date: string;
    end_date: string;
    budget: number;
    currency: string;
    kpi_target: string;
    status: string;
}

const typeLabels: Record<string, string> = {
    social: 'Сошиал',
    search: 'Хайлт',
    affiliate: 'Партнер',
    direct: 'Шууд',
    influencer: 'Инфлүүнсер',
    traditional: 'Уламжлалт',
};

const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700',
    archived: 'bg-gray-100 text-gray-600',
};

export default function SourcesPage() {
    const { shop } = useAuth();
    const [channels, setChannels] = useState<MarketingChannel[]>([]);
    const [contracts, setContracts] = useState<ChannelContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newChannel, setNewChannel] = useState({ name: '', type: 'social', description: '' });

    const handleCreate = async () => {
        if (!newChannel.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('marketing_channels').insert([{
                name: newChannel.name.trim(), type: newChannel.type,
                status: 'active', description: newChannel.description || null,
            }]).select().single();
            if (error) throw error;
            setChannels(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewChannel({ name: '', type: 'social', description: '' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const [channelsRes, contractsRes] = await Promise.all([
                    supabase.from('marketing_channels').select('*').order('created_at', { ascending: false }),
                    supabase.from('channel_contracts').select('*').eq('status', 'active'),
                ]);
                if (channelsRes.error) throw channelsRes.error;
                if (contractsRes.error) throw contractsRes.error;
                setChannels(channelsRes.data || []);
                setContracts(contractsRes.data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const filteredChannels = channels.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.type && c.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const activeChannels = channels.filter(c => c.status === 'active').length;
    const totalBudget = contracts.reduce((sum, c) => sum + (c.budget || 0), 0);

    const formatCurrency = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M₮` : v >= 1000 ? `${(v / 1000).toFixed(0)}K₮` : v.toLocaleString() + '₮';

    const getContractsForChannel = (channelId: string) => contracts.filter(c => c.channel_id === channelId);

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-gray-500">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Globe className="w-6 h-6 text-emerald-600" />
                        Маркетингийн сувгууд
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Сурталчилгааны сувгууд болон гэрээнүүд</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input type="text" placeholder="Хайх..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 w-64 bg-gray-50" />
                    </div>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowCreateModal(true)}><Plus className="w-4 h-4 mr-2" />Шинэ суваг</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Нийт суваг</p><p className="text-2xl font-bold mt-1">{channels.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Идэвхтэй</p><p className="text-2xl font-bold mt-1 text-emerald-600">{activeChannels}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Нийт төсөв</p><p className="text-2xl font-bold mt-1">{formatCurrency(totalBudget)}</p></CardContent></Card>
            </div>

            {filteredChannels.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <Globe className="w-16 h-16 text-gray-300 mb-4" />
                        <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                        <p className="text-gray-500">Маркетингийн суваг нэмнэ үү.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredChannels.map(channel => {
                        const channelContracts = getContractsForChannel(channel.id);
                        const channelBudget = channelContracts.reduce((s, c) => s + (c.budget || 0), 0);
                        return (
                            <Card key={channel.id} className="hover:shadow-md transition-all">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{channel.name}</h3>
                                            <span className="text-xs text-gray-500">{typeLabels[channel.type] || channel.type}</span>
                                        </div>
                                        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[channel.status] || 'bg-gray-100'}`}>
                                            {channel.status === 'active' ? 'Идэвхтэй' : channel.status === 'paused' ? 'Зогссон' : 'Архивлагдсан'}
                                        </span>
                                    </div>
                                    {channel.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{channel.description}</p>}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <FileText className="w-3 h-3" />
                                            {channelContracts.length} гэрээ
                                        </div>
                                        {channelBudget > 0 && (
                                            <span className="text-sm font-medium text-emerald-600">{formatCurrency(channelBudget)}</span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h3 className="font-semibold text-gray-900">Шинэ суваг</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Нэр *</label><Input value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="Сувгийн нэр" /></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Төрөл</label>
                                <select value={newChannel.type} onChange={e => setNewChannel(p => ({ ...p, type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                    <option value="social">Сошиал</option><option value="search">Хайлт</option><option value="affiliate">Партнер</option><option value="direct">Шууд</option><option value="influencer">Инфлүүнсер</option><option value="traditional">Уламжлалт</option>
                                </select></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Тайлбар</label><textarea value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} placeholder="Тайлбар (заавал биш)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20" /></div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Болих</Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={!newChannel.name.trim() || creating}>
                                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Үүсгэж байна...</> : <><Plus className="w-4 h-4 mr-2" />Үүсгэх</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
