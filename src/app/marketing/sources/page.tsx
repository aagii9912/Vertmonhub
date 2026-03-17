'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Globe, Plus, Search, ExternalLink, DollarSign,
    Calendar, BarChart3, TrendingUp, FileText, Settings
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
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-2" />Шинэ суваг</Button>
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
        </div>
    );
}
