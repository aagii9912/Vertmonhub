'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Megaphone, Plus, Search, Play, Pause, CheckCircle2,
    Calendar, DollarSign, TrendingUp, ArrowUpRight, MoreVertical,
    Target, BarChart3
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
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-600',
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
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone className="w-6 h-6 text-emerald-600" />
                        Кампанит ажил
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Маркетингийн кампанит ажлууд</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            type="text"
                            placeholder="Хайх..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 w-64 bg-gray-50"
                        />
                    </div>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        Шинэ кампани
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт кампани</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{campaigns.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <Megaphone className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Идэвхтэй</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{activeCampaigns}</p>
                            </div>
                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                <Play className="w-6 h-6 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-white">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Нийт зарцуулалт</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalSpend)}</p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Campaigns List */}
            <Card className="bg-white">
                <CardContent className="p-0">
                    {filteredCampaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Megaphone className="w-16 h-16 text-gray-300 mb-4" />
                            <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-gray-500">Кампанит ажил нэмэхийн тулд "Шинэ кампани" товчийг дарна уу.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Нэр</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Төрөл</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Төлөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Төсөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Зарцуулалт</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Хугацаа</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredCampaigns.map((campaign) => (
                                        <tr key={campaign.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{campaign.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{campaign.type}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs rounded-full ${statusColors[campaign.status] || 'bg-gray-100'}`}>
                                                    {statusLabels[campaign.status] || campaign.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium">{formatCurrency(campaign.budget)}</td>
                                            <td className="px-4 py-3 text-sm">{formatCurrency(campaign.spend)}</td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
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
        </div>
    );
}
