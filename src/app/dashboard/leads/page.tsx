'use client';

import React from 'react';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterSelect } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import {
    Users,
    Phone,
    Calendar,
    DollarSign,
    TrendingUp,
    Plus,
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
    Star,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Lead, LeadStatus, LeadSource } from '@/types/property';
import { cn } from '@/lib/utils';

type StatusVariant = 'info' | 'brand' | 'warning' | 'success' | 'danger' | 'default';

const statusConfig: Record<LeadStatus, { variant: StatusVariant; label: string; icon: React.ElementType }> = {
    new: { variant: 'info', label: 'Шинэ', icon: AlertCircle },
    contacted: { variant: 'brand', label: 'Холбогдсон', icon: Phone },
    viewing_scheduled: { variant: 'warning', label: 'Үзлэг товлосон', icon: Calendar },
    offered: { variant: 'info', label: 'Санал тавьсан', icon: DollarSign },
    negotiating: { variant: 'warning', label: 'Хэлэлцэж байна', icon: MessageSquare },
    closed_won: { variant: 'success', label: 'Амжилттай', icon: CheckCircle2 },
    closed_lost: { variant: 'default', label: 'Алдсан', icon: XCircle },
};

const sourceLabels: Record<LeadSource, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
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

                const newCount = leadsData.filter((l) => l.status === 'new').length;
                const inProgressCount = leadsData.filter((l) =>
                    ['contacted', 'viewing_scheduled', 'offered', 'negotiating'].includes(l.status),
                ).length;
                const wonCount = leadsData.filter((l) => l.status === 'closed_won').length;
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

    const filteredLeads = leads.filter(
        (l) =>
            l.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.customer_phone?.includes(searchQuery) ||
            l.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const updateStatus = async (id: string, newStatus: LeadStatus) => {
        try {
            const { error } = await supabase
                .from('leads')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
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
        <div>
            <PageHeader
                eyebrow="Лийд"
                title="Лийд шугам"
                subtitle="Орж ирж буй хүсэлтүүдийг хянах, төлөв шинэчлэх, дараагийн алхмыг төлөвлөх"
                primaryAction={
                    <Button href="/dashboard/leads/new" variant="primary" size="md">
                        <Plus className="w-4 h-4" />
                        Лийд нэмэх
                    </Button>
                }
            />

            {/* Stats */}
            <StatBar columns={4}>
                <StatTile
                    label="Нийт лийд"
                    value={stats.total}
                    icon={<Users className="w-4 h-4" />}
                    accent="brand"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-success">
                            <ArrowUpRight className="w-3 h-3" />
                            +18% өмнөх сараас
                        </span>
                    }
                />
                <StatTile
                    label="Шинэ лийд"
                    value={stats.new}
                    icon={<AlertCircle className="w-4 h-4" />}
                    accent="info"
                    helper="Үйлдэл шаардана"
                />
                <StatTile
                    label="Идэвхтэй хэлэлцээ"
                    value={stats.inProgress}
                    icon={<Clock className="w-4 h-4" />}
                    accent="warning"
                    helper="Урт хугацаа дамжсан байж магадгүй"
                />
                <StatTile
                    label="Хөрвүүлэлт"
                    value={`${stats.conversionRate.toFixed(1)}%`}
                    icon={<TrendingUp className="w-4 h-4" />}
                    accent="success"
                    helper={
                        <span className="inline-flex items-center gap-1 text-status-success">
                            <ArrowUpRight className="w-3 h-3" />
                            +5% өмнөх сараас
                        </span>
                    }
                />
            </StatBar>

            {/* Filters */}
            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэр, утас, имэйлээр хайх...',
                }}
                showClear={searchQuery !== '' || statusFilter !== 'all'}
                onClear={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                }}
            >
                <FilterSelect
                    label="Төлөв"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
                >
                    <option value="all">Бүх төлөв</option>
                    {Object.entries(statusConfig).map(([key, { label }]) => (
                        <option key={key} value={key}>
                            {label}
                        </option>
                    ))}
                </FilterSelect>
            </FilterBar>

            {/* Lead Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface-2/50 border-b border-border">
                                <tr>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Харилцагч
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Холбоо барих
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Эх үүсвэр
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Төсөв
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Төлөв
                                    </th>
                                    <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үүссэн
                                    </th>
                                    <th className="text-right px-4 py-3 text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.08em]">
                                        Үйлдэл
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-16 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <Spinner size="lg" />
                                                <span className="text-sm text-muted-foreground">Татаж байна...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredLeads.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12">
                                            <EmptyState
                                                icon={<Users className="w-7 h-7" />}
                                                title="Лийд олдсонгүй"
                                                description="Харилцагч Messenger-ээр холбогдоход энд харагдана"
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLeads.map((lead) => {
                                        const statusInfo = statusConfig[lead.status];
                                        const isExpanded = expandedLead === lead.id;
                                        const leadData = lead as any;

                                        return (
                                            <React.Fragment key={lead.id}>
                                                <tr
                                                    className={cn(
                                                        'hover:bg-surface-2/40 transition-colors cursor-pointer',
                                                        isExpanded && 'bg-brand-soft/30',
                                                    )}
                                                    onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={cn(
                                                                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                                                                    leadData.urgency === 'high'
                                                                        ? 'bg-status-danger-soft'
                                                                        : 'bg-brand-soft',
                                                                )}
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        'font-medium text-sm',
                                                                        leadData.urgency === 'high'
                                                                            ? 'text-status-danger'
                                                                            : 'text-brand-strong',
                                                                    )}
                                                                >
                                                                    {lead.customer_name?.[0]?.toUpperCase() || '?'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-foreground text-sm flex items-center gap-2">
                                                                    {lead.customer_name || 'Үл мэдэгдэх'}
                                                                    {leadData.urgency === 'high' && (
                                                                        <Badge variant="danger" size="sm">
                                                                            <Zap className="w-3 h-3 mr-1" /> Яаралтай
                                                                        </Badge>
                                                                    )}
                                                                </p>
                                                                {leadData.preferred_type && (
                                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                                        <Building2 className="w-3 h-3" />
                                                                        {leadData.preferred_type === 'mandala_garden'
                                                                            ? 'Mandala Garden'
                                                                            : leadData.preferred_type === 'mandala_tower'
                                                                              ? 'Mandala Tower'
                                                                              : leadData.preferred_type === 'elysium'
                                                                                ? 'Elysium Residence'
                                                                                : leadData.preferred_type}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="space-y-1">
                                                            {lead.customer_phone && (
                                                                <a
                                                                    href={`tel:${lead.customer_phone}`}
                                                                    className="text-sm text-brand hover:underline flex items-center gap-1 tabular-nums"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <Phone className="w-3 h-3" />
                                                                    {lead.customer_phone}
                                                                </a>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-muted-foreground">
                                                            {sourceLabels[lead.source] || lead.source}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-foreground text-sm tabular-nums">
                                                            {formatBudget(lead.budget_min, lead.budget_max)}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={lead.status}
                                                            onChange={(e) => {
                                                                e.stopPropagation();
                                                                updateStatus(lead.id, e.target.value as LeadStatus);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="px-2 py-1 text-xs font-medium rounded-md border border-border bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring/40"
                                                        >
                                                            {Object.entries(statusConfig).map(([key, { label }]) => (
                                                                <option key={key} value={key}>
                                                                    {label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm text-muted-foreground">
                                                            {leadData.last_contact || getTimeAgo(lead.created_at)}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isExpanded ? (
                                                                <ChevronUp className="w-5 h-5 text-brand" />
                                                            ) : (
                                                                <ChevronDown className="w-5 h-5 text-muted-foreground/60" />
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={7} className="px-4 py-4 bg-surface-2/30 border-b-2 border-border">
                                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                                <div className="bg-surface rounded-md p-4 border border-border">
                                                                    <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                                                        <Sparkles className="w-4 h-4 text-brand" />
                                                                        AI Тойм
                                                                    </h4>
                                                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                                                        {leadData.ai_summary || 'Дэлгэрэнгүй мэдээлэл байхгүй'}
                                                                    </p>
                                                                    {leadData.conversation_summary && (
                                                                        <div className="mt-3 pt-3 border-t border-border/60">
                                                                            <p className="text-xs text-muted-foreground/80 font-medium mb-1">
                                                                                Сүүлийн харилцаа:
                                                                            </p>
                                                                            <p className="text-sm text-muted-foreground">
                                                                                {leadData.conversation_summary}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="bg-surface rounded-md p-4 border border-border">
                                                                    <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                                                        <MessageSquare className="w-4 h-4 text-status-success" />
                                                                        Яриа эхлэх санаа
                                                                    </h4>
                                                                    {leadData.talking_points && leadData.talking_points.length > 0 ? (
                                                                        <ul className="space-y-2">
                                                                            {leadData.talking_points.map((point: string, idx: number) => (
                                                                                <li
                                                                                    key={idx}
                                                                                    className="text-sm text-foreground bg-status-success-soft px-3 py-2 rounded-md"
                                                                                >
                                                                                    {point}
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    ) : (
                                                                        <p className="text-sm text-muted-foreground">Санаа алга</p>
                                                                    )}
                                                                </div>

                                                                <div className="space-y-4">
                                                                    <div className="bg-surface rounded-md p-4 border border-border">
                                                                        <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                                                            <Star className="w-4 h-4 text-status-pending" />
                                                                            Сонирхол
                                                                        </h4>
                                                                        {leadData.interests && leadData.interests.length > 0 ? (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {leadData.interests.map((interest: string, idx: number) => (
                                                                                    <Badge key={idx} variant="default">
                                                                                        {interest}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-sm text-muted-foreground">Тодорхойгүй</p>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex gap-2">
                                                                        <a
                                                                            href={`tel:${lead.customer_phone}`}
                                                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-brand-fg rounded-md hover:bg-brand-strong transition-colors text-sm font-medium"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <Phone className="w-4 h-4" />
                                                                            Залгах
                                                                        </a>
                                                                        <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border text-foreground rounded-md hover:bg-surface-2 transition-colors text-sm font-medium">
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
    );
}
