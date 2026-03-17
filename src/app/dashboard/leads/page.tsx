'use client';

import React from 'react';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
    Users,
    Phone,
    Mail,
    Calendar,
    DollarSign,
    TrendingUp,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Eye,
    MessageSquare,
    Building2,
    ArrowUpRight,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Zap,
    Star
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Lead, LeadStatus, LeadSource } from '@/types/property';

// Status colors and labels
const statusConfig: Record<LeadStatus, { color: string; label: string; icon: React.ElementType }> = {
    new: { color: 'bg-blue-100 text-blue-700', label: 'Шинэ', icon: AlertCircle },
    contacted: { color: 'bg-purple-100 text-purple-700', label: 'Холбогдсон', icon: Phone },
    viewing_scheduled: { color: 'bg-amber-100 text-amber-700', label: 'Үзлэг товлосон', icon: Calendar },
    offered: { color: 'bg-indigo-100 text-indigo-700', label: 'Санал тавьсан', icon: DollarSign },
    negotiating: { color: 'bg-orange-100 text-orange-700', label: 'Хэлэлцэж байна', icon: MessageSquare },
    closed_won: { color: 'bg-emerald-100 text-emerald-700', label: 'Амжилттай', icon: CheckCircle2 },
    closed_lost: { color: 'bg-gray-100 text-gray-500', label: 'Алдсан', icon: XCircle },
};

// Source labels
const sourceLabels: Record<LeadSource, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    other: 'Бусад',
};

interface LeadStats {
    total: number;
    new: number;
    inProgress: number;
    won: number;
    conversionRate: number;
}

export default function LeadsPage() {
    const { shop } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
    const [stats, setStats] = useState<LeadStats>({
        total: 0,
        new: 0,
        inProgress: 0,
        won: 0,
        conversionRate: 0,
    });
    const [expandedLead, setExpandedLead] = useState<string | null>(null);

    // Fetch leads
    useEffect(() => {
        if (!shop?.id) return;

        const fetchLeads = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('leads')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });

                if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }

                const { data, error } = await query;

                if (error) throw error;

                const leadsData = data as Lead[];
                setLeads(leadsData);

                // Calculate stats
                const newCount = leadsData.filter(l => l.status === 'new').length;
                const inProgressCount = leadsData.filter(l =>
                    ['contacted', 'viewing_scheduled', 'offered', 'negotiating'].includes(l.status)
                ).length;
                const wonCount = leadsData.filter(l => l.status === 'closed_won').length;
                const conversionRate = leadsData.length > 0 ? (wonCount / leadsData.length) * 100 : 0;

                setStats({
                    total: leadsData.length,
                    new: newCount,
                    inProgress: inProgressCount,
                    won: wonCount,
                    conversionRate,
                });
            } catch (error) {
                console.error('Error fetching leads:', error);
                toast.error('Мэдээлэл татахад алдаа гарлаа');
            } finally {
                setLoading(false);
            }
        };

        fetchLeads();
    }, [shop?.id, statusFilter]);

    // Filter by search
    const filteredLeads = leads.filter(l =>
        l.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.customer_phone?.includes(searchQuery) ||
        l.customer_email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Update lead status
    const updateStatus = async (id: string, newStatus: LeadStatus) => {
        try {
            const { error } = await supabase
                .from('leads')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            setLeads(prev => prev.map(l =>
                l.id === id ? { ...l, status: newStatus } : l
            ));
            toast.success('Статус шинэчлэгдлээ');
        } catch (error) {
            console.error('Error updating lead:', error);
            toast.error('Шинэчлэхэд алдаа гарлаа');
        }
    };

    const formatBudget = (min?: number | null, max?: number | null) => {
        if (!min && !max) return '-';
        const formatPrice = (p: number) => {
            if (p >= 1000000000) return `${(p / 1000000000).toFixed(1)}B`;
            if (p >= 1000000) return `${(p / 1000000).toFixed(0)}M`;
            return p.toLocaleString();
        };
        if (min && max) return `${formatPrice(min)} - ${formatPrice(max)}₮`;
        if (min) return `${formatPrice(min)}₮+`;
        if (max) return `${formatPrice(max)}₮ хүртэл`;
        return '-';
    };

    const getTimeAgo = (date: string) => {
        const now = new Date();
        const past = new Date(date);
        const diffMs = now.getTime() - past.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Өнөөдөр';
        if (diffDays === 1) return 'Өчигдөр';
        if (diffDays < 7) return `${diffDays} хоногийн өмнө`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} долоо хоногийн өмнө`;
        return `${Math.floor(diffDays / 30)} сарын өмнө`;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold text-gray-900">Лийд</h1>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Хайх..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 w-64 bg-gray-50 border-gray-200"
                            />
                        </div>
                        <Link href="/dashboard/leads/new">
                            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Plus className="w-4 h-4 mr-2" />
                                Лийд нэмэх
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Нийт лийд</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3" />
                                        +18% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                    <Users className="w-6 h-6 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Шинэ лийд</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.new}</p>
                                    <p className="text-xs text-blue-600 mt-1">Үйлдэл шаардана</p>
                                </div>
                                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Оролцож байгаа</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.inProgress}</p>
                                    <p className="text-xs text-amber-600 mt-1">Идэвхтэй хэлэлцээ</p>
                                </div>
                                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">Хөрвүүлэлт</p>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.conversionRate.toFixed(1)}%</p>
                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                        <ArrowUpRight className="w-3 h-3" />
                                        +5% өмнөх сараас
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-purple-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Lead Pipeline */}
                <Card className="bg-white border-gray-200">
                    <CardContent className="p-0">
                        {/* Table Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Лийд шугам</h3>
                            <div className="flex items-center gap-3">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
                                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
                                >
                                    <option value="all">Бүх төлөв</option>
                                    {Object.entries(statusConfig).map(([key, { label }]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <Button variant="outline" size="sm" className="text-gray-600">
                                    Дэлгэрэнгүй шүүлт
                                </Button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Харилцагч</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Холбоо барих</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Эх үүсвэр</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Төсөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Төлөв</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үүссэн</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                                    Татаж байна...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredLeads.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                                <p>Лийд олдсонгүй</p>
                                                <p className="text-sm mt-1">Харилцагч Messenger-ээр холбогдоход энд харагдана</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredLeads.map((lead) => {
                                            const statusInfo = statusConfig[lead.status];
                                            const StatusIcon = statusInfo.icon;
                                            const isExpanded = expandedLead === lead.id;
                                            const leadData = lead as any; // For enhanced fields
                                            const urgencyColors = {
                                                high: 'bg-red-100 text-red-700 border-red-200',
                                                medium: 'bg-amber-100 text-amber-700 border-amber-200',
                                                low: 'bg-gray-100 text-gray-600 border-gray-200',
                                            };

                                            return (
                                                <React.Fragment key={lead.id}>
                                                    <tr
                                                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-emerald-50' : ''}`}
                                                        onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${leadData.urgency === 'high' ? 'bg-red-100' : 'bg-emerald-100'
                                                                    }`}>
                                                                    <span className={`font-medium text-sm ${leadData.urgency === 'high' ? 'text-red-700' : 'text-emerald-700'
                                                                        }`}>
                                                                        {lead.customer_name?.[0]?.toUpperCase() || '?'}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium text-gray-900 text-sm flex items-center gap-2">
                                                                        {lead.customer_name || 'Үл мэдэгдэх'}
                                                                        {leadData.urgency === 'high' && (
                                                                            <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full flex items-center gap-0.5">
                                                                                <Zap className="w-3 h-3" /> Яаралтай
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                    {leadData.preferred_type && (
                                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                                            <Building2 className="w-3 h-3" />
                                                                            {leadData.preferred_type === 'mandala_garden' ? 'Mandala Garden' :
                                                                                leadData.preferred_type === 'mandala_tower' ? 'Mandala Tower' :
                                                                                    leadData.preferred_type === 'elysium' ? 'Elysium Residence' :
                                                                                        leadData.preferred_type}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="space-y-1">
                                                                {lead.customer_phone && (
                                                                    <a href={`tel:${lead.customer_phone}`} className="text-sm text-emerald-600 hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                        <Phone className="w-3 h-3" />
                                                                        {lead.customer_phone}
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-sm text-gray-600">
                                                                {sourceLabels[lead.source] || lead.source}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-medium text-gray-900 text-sm">
                                                                {formatBudget(lead.budget_min, lead.budget_max)}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <select
                                                                value={lead.status}
                                                                onChange={(e) => { e.stopPropagation(); updateStatus(lead.id, e.target.value as LeadStatus); }}
                                                                className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${statusInfo.color}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {Object.entries(statusConfig).map(([key, { label }]) => (
                                                                    <option key={key} value={key}>{label}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm text-gray-500">
                                                                {leadData.last_contact || getTimeAgo(lead.created_at)}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {isExpanded ? (
                                                                    <ChevronUp className="w-5 h-5 text-emerald-600" />
                                                                ) : (
                                                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={7} className="px-4 py-4 bg-gradient-to-b from-emerald-50 to-white border-b-2 border-emerald-200">
                                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                                    {/* AI Summary */}
                                                                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                                                        <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                                                                            <Sparkles className="w-4 h-4 text-purple-500" />
                                                                            AI Тойм
                                                                        </h4>
                                                                        <p className="text-sm text-gray-600 leading-relaxed">
                                                                            {leadData.ai_summary || 'Дэлгэрэнгүй мэдээлэл байхгүй'}
                                                                        </p>
                                                                        {leadData.conversation_summary && (
                                                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                                                <p className="text-xs text-gray-500 font-medium mb-1">Сүүлийн харилцаа:</p>
                                                                                <p className="text-sm text-gray-600">{leadData.conversation_summary}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Talking Points */}
                                                                    <div className="bg-white rounded-xl p-4 border border-emerald-200 shadow-sm">
                                                                        <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                                                                            <MessageSquare className="w-4 h-4 text-emerald-500" />
                                                                            Яриа эхлэх санаа
                                                                        </h4>
                                                                        {leadData.talking_points && leadData.talking_points.length > 0 ? (
                                                                            <ul className="space-y-2">
                                                                                {leadData.talking_points.map((point: string, idx: number) => (
                                                                                    <li key={idx} className="text-sm text-gray-700 bg-emerald-50 px-3 py-2 rounded-lg">
                                                                                        {point}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        ) : (
                                                                            <p className="text-sm text-gray-500">Санаа алга</p>
                                                                        )}
                                                                    </div>

                                                                    {/* Interests & Actions */}
                                                                    <div className="space-y-4">
                                                                        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                                                            <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                                                                                <Star className="w-4 h-4 text-amber-500" />
                                                                                Сонирхол
                                                                            </h4>
                                                                            {leadData.interests && leadData.interests.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {leadData.interests.map((interest: string, idx: number) => (
                                                                                        <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                                                            {interest}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <p className="text-sm text-gray-500">Тодорхойгүй</p>
                                                                            )}
                                                                        </div>

                                                                        {/* Quick Actions */}
                                                                        <div className="flex gap-2">
                                                                            <a
                                                                                href={`tel:${lead.customer_phone}`}
                                                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <Phone className="w-4 h-4" />
                                                                                Залгах
                                                                            </a>
                                                                            <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
                                                                                <MessageSquare className="w-4 h-4" />
                                                                                Мессеж
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
