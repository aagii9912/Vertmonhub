'use client';

import React from 'react';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn, StatusPill } from '@/components/ui/DataTable';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/Sheet';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
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
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronRight,
    Sparkles,
    Zap,
    Star,
    FileText,
    UserRound,
    CalendarClock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { toast } from 'sonner';
import type { Lead, LeadStatus, LeadSource } from '@/types/property';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { EntityAttachments } from '@/components/dashboard/EntityAttachments';

type StatusPillVariant = 'success' | 'danger' | 'pending' | 'info' | 'active' | 'neutral' | 'brand';

const statusConfig: Record<LeadStatus, { variant: StatusPillVariant; label: string; icon: React.ElementType }> = {
    new: { variant: 'info', label: 'Шинэ', icon: AlertCircle },
    contacted: { variant: 'brand', label: 'Холбогдсон', icon: Phone },
    viewing_scheduled: { variant: 'pending', label: 'Уулзалт товлосон', icon: Calendar },
    offered: { variant: 'info', label: 'Санал тавьсан', icon: DollarSign },
    negotiating: { variant: 'pending', label: 'Хэлэлцэж байна', icon: MessageSquare },
    closed_won: { variant: 'success', label: 'Амжилттай', icon: CheckCircle2 },
    closed_lost: { variant: 'neutral', label: 'Алдсан', icon: XCircle },
};

const sourceLabels: Record<LeadSource, string> = {
    messenger: 'Messenger',
    facebook: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    tv: 'ТВ',
    radio: 'Радио',
    meeting: 'Уулзалт',
    event: 'Өдөрлөг',
    board: 'Билборд / Самбар',
    other: 'Бусад',
};

/** Хугацааны шүүлтүүр — API-ийн ?period= утгуудтай тааруулна. */
const periodLabels: Record<string, string> = {
    all: 'Бүх хугацаа',
    week: 'Сүүлийн 7 хоног',
    month: 'Сүүлийн сар',
    quarter: 'Сүүлийн улирал',
    year: 'Сүүлийн жил',
};

interface LeadStats {
    total: number;
    new: number;
    inProgress: number;
    won: number;
    conversionRate: number;
}

/**
 * Лийдийн API-аас ирдэг боловч `Lead` төрөлд тодорхойлогдоогүй
 * runtime талбаруудыг typed байдлаар авах өргөтгөл (`as any` cast-ийг орлоно).
 */
type LeadRow = Omit<Lead, 'urgency'> & {
    urgency?: string | null;
    preferred_type?: string | null;
    ai_summary?: string | null;
    conversation_summary?: string | null;
    talking_points?: string[] | null;
    interests?: string[] | null;
    last_contact_at?: string | null;
};

export default function LeadsPage() {
    const { shop, user } = useAuth();
    const canWrite = user?.permissions?.canWrite ?? false;
    const reducedMotion = useReducedMotion();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
    const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
    const [periodFilter, setPeriodFilter] = useState<string>('all');
    const [managerFilter, setManagerFilter] = useState<string>('all');
    // Менежерийн жагсаалт (шүүлт + хуваарилах dropdown) — reports эрхгүй бол хоосон
    const [managers, setManagers] = useState<{ name: string; is_active: boolean }[]>([]);
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
                const params = new URLSearchParams({ status: statusFilter });
                if (sourceFilter !== 'all') params.set('source', sourceFilter);
                if (periodFilter !== 'all') params.set('period', periodFilter);
                if (managerFilter !== 'all') params.set('manager', managerFilter);
                const res = await fetch(`/api/dashboard/leads?${params.toString()}`, {
                    headers: { 'x-shop-id': shop.id },
                });
                if (!res.ok) throw new Error('Failed to fetch leads');
                const json = await res.json();

                const leadsData = (json.leads || []) as Lead[];
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
    }, [shop?.id, statusFilter, sourceFilter, periodFilter, managerFilter]);

    // Менежерийн жагсаалт (нэг удаа) — шүүлт + хуваарилах Select-д
    useEffect(() => {
        if (!shop?.id) return;
        (async () => {
            try {
                const res = await fetch('/api/dashboard/managers', {
                    headers: { 'x-shop-id': shop.id },
                });
                if (!res.ok) return;
                const json = await res.json();
                setManagers(json.managers || []);
            } catch {
                // reports эрхгүй / сүлжээний алдаа — менежерийн шүүлт харагдахгүй
            }
        })();
    }, [shop?.id]);

    const filteredLeads = leads.filter(
        (l) =>
            l.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.customer_phone?.includes(searchQuery) ||
            l.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()),
    ) as LeadRow[];

    const updateStatus = async (id: string, newStatus: LeadStatus) => {
        try {
            const res = await fetch(`/api/dashboard/leads/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || shop?.id || '',
                },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Шинэчлэхэд алдаа гарлаа');
            }

            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
            toast.success('Статус шинэчлэгдлээ');
        } catch (error) {
            console.error('Error updating lead:', error);
            toast.error(error instanceof Error ? error.message : 'Шинэчлэхэд алдаа гарлаа');
        }
    };

    /**
     * Дараагийн дагалтын огноог тавих / цуцлах.
     * `days === null` → цуцална. Эс бөгөөс өнөөдрөөс N хоногийн дараа, өглөө 10:00.
     * Энэ нь morning-leads cron болон pipeline-ийн «Дараагийн алхамгүй» badge-ийг
     * бодит болгодог цорын ганц бичих зам (өмнө нь огт байгаагүй).
     */
    const setFollowup = async (id: string, days: number | null) => {
        let nextAt: string | null = null;
        if (days !== null) {
            const when = new Date();
            when.setDate(when.getDate() + days);
            when.setHours(10, 0, 0, 0);
            nextAt = when.toISOString();
        }
        try {
            const res = await fetch(`/api/dashboard/leads/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || shop?.id || '',
                },
                body: JSON.stringify({ next_followup_at: nextAt }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Дагалт тавихад алдаа гарлаа');
            }
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, next_followup_at: nextAt } : l)));
            toast.success(
                nextAt
                    ? `Дагалт: ${new Date(nextAt).toLocaleDateString('mn-MN')} 10:00`
                    : 'Дагалт цуцлагдлаа',
            );
        } catch (error) {
            console.error('Error setting followup:', error);
            toast.error(error instanceof Error ? error.message : 'Дагалт тавихад алдаа гарлаа');
        }
    };

    /** Лийдийг менежерт хуваарилах / чөлөөлөх (null). */
    const assignManager = async (id: string, name: string | null) => {
        try {
            const res = await fetch(`/api/dashboard/leads/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || shop?.id || '',
                },
                body: JSON.stringify({ sales_manager_name: name }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Хуваарилахад алдаа гарлаа');
            }
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, sales_manager_name: name } : l)));
            toast.success(name ? `«${name}»-д хуваарилагдлаа` : 'Хуваарилалт цуцлагдлаа');
        } catch (error) {
            console.error('Error assigning lead:', error);
            toast.error(error instanceof Error ? error.message : 'Хуваарилахад алдаа гарлаа');
        }
    };

    const convertLead = async (id: string) => {
        try {
            const res = await fetch(`/api/dashboard/leads/${id}/convert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Гэрээ болгоход алдаа гарлаа');
            }
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'closed_won' } : l)));
            toast.success('Гэрээ үүсгэж, борлуулалт хаалаа');
        } catch (error) {
            console.error('Error converting lead:', error);
            toast.error(error instanceof Error ? error.message : 'Гэрээ болгоход алдаа гарлаа');
        }
    };

    const formatBudget = (min?: number | null, max?: number | null) => {
        if (!min && !max) return '-';
        const formatPrice = (p: number) => formatMNT(p, { compact: true });
        if (min && max) return `${formatPrice(min)} - ${formatPrice(max)}`;
        if (min) return `${formatPrice(min)}+`;
        if (max) return `${formatPrice(max)} хүртэл`;
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

    const preferredTypeLabel = (value?: string | null) =>
        value === 'mandala_garden'
            ? 'Mandala Garden'
            : value === 'mandala_tower'
              ? 'Mandala Tower'
              : value === 'elysium'
                ? 'Elysium Residence'
                : value;

    // Дэлгэрэнгүй самбарт харагдах идэвхтэй лийд (expandedLead-ээс гаргаж авна).
    const activeLead = expandedLead ? filteredLeads.find((l) => l.id === expandedLead) ?? null : null;

    const toggleExpanded = (id: string) => setExpandedLead((prev) => (prev === id ? null : id));

    // Харилцагчийн нэрийн дугуй аватар (десктоп хүснэгт + мобайл карт хоёуланд).
    const renderAvatar = (lead: LeadRow) => (
        <div
            className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                lead.urgency === 'high' ? 'bg-status-danger-soft' : 'bg-brand-soft',
            )}
        >
            <span
                className={cn(
                    'font-medium text-sm',
                    lead.urgency === 'high' ? 'text-status-danger' : 'text-brand-strong',
                )}
            >
                {lead.customer_name?.[0]?.toUpperCase() || '?'}
            </span>
        </div>
    );

    const columns: DataTableColumn<LeadRow>[] = [
        {
            key: 'customer',
            header: 'Харилцагч',
            sortable: true,
            accessor: (lead) => lead.customer_name ?? '',
            cell: (lead) => (
                <div className="flex items-center gap-3">
                    {renderAvatar(lead)}
                    <div>
                        <p className="font-medium text-foreground text-sm flex items-center gap-2">
                            {lead.customer_name || 'Үл мэдэгдэх'}
                            {lead.urgency === 'high' && (
                                <Badge variant="danger" size="sm">
                                    <Zap className="w-3 h-3 mr-1" /> Яаралтай
                                </Badge>
                            )}
                        </p>
                        {lead.preferred_type && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {preferredTypeLabel(lead.preferred_type)}
                            </p>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: 'contact',
            header: 'Холбоо барих',
            cell: (lead) =>
                lead.customer_phone ? (
                    <a
                        href={`tel:${lead.customer_phone}`}
                        className="text-sm text-brand hover:underline flex items-center gap-1 tabular-nums"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Phone className="w-3 h-3" />
                        {lead.customer_phone}
                    </a>
                ) : null,
        },
        {
            key: 'source',
            header: 'Эх үүсвэр',
            sortable: true,
            accessor: (lead) => sourceLabels[lead.source] || lead.source,
            cell: (lead) => (
                <span className="text-sm text-muted-foreground">
                    {sourceLabels[lead.source] || lead.source}
                </span>
            ),
        },
        {
            key: 'budget',
            header: 'Төсөв',
            sortable: true,
            accessor: (lead) => lead.budget_max ?? lead.budget_min ?? 0,
            cell: (lead) => (
                <p className="font-medium text-foreground text-sm tabular-nums">
                    {formatBudget(lead.budget_min, lead.budget_max)}
                </p>
            ),
        },
        {
            key: 'status',
            header: 'Төлөв',
            sortable: true,
            accessor: (lead) => statusConfig[lead.status]?.label ?? lead.status,
            cell: (lead) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <Select
                        value={lead.status}
                        onValueChange={(value) => updateStatus(lead.id, value as LeadStatus)}
                    >
                        <SelectTrigger className="h-8 w-auto min-w-36 text-xs" aria-label="Төлөв солих">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(statusConfig).map(([key, { label }]) => (
                                <SelectItem key={key} value={key}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ),
        },
        {
            key: 'created',
            header: 'Үүссэн',
            sortable: true,
            accessor: (lead) => lead.last_contact_at ?? lead.created_at,
            cell: (lead) => (
                <p className="text-sm text-muted-foreground">
                    {lead.last_contact_at ? getTimeAgo(lead.last_contact_at) : getTimeAgo(lead.created_at)}
                </p>
            ),
        },
        {
            key: 'actions',
            header: 'Үйлдэл',
            align: 'right',
            cell: (lead) => (
                <span className="inline-flex items-center justify-end">
                    <ChevronRight
                        className={cn(
                            'w-5 h-5 transition-colors',
                            expandedLead === lead.id ? 'text-brand' : 'text-muted-foreground/60',
                        )}
                    />
                </span>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Лийд"
                title="Лийд шугам"
                subtitle="Орж ирж буй хүсэлтүүдийг хянах, төлөв шинэчлэх, дараагийн алхмыг төлөвлөх"
                primaryAction={
                    canWrite ? (
                        <Button href="/dashboard/leads/new" variant="primary" size="md">
                            <Plus className="w-4 h-4" />
                            Лийд нэмэх
                        </Button>
                    ) : undefined
                }
            />

            {/* Stats */}
            <StatBar columns={4}>
                <StatTile
                    label="Нийт лийд"
                    value={stats.total}
                    icon={<Users className="w-4 h-4" />}
                    accent="brand"
                    helper="Бүх цаг үеийн нийт"
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
                    helper="Лийдээс гэрээ хүртэл"
                />
            </StatBar>

            {/* Filters */}
            <FilterBar
                search={{
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: 'Нэр, утас, имэйлээр хайх...',
                }}
                showClear={
                    searchQuery !== '' ||
                    statusFilter !== 'all' ||
                    sourceFilter !== 'all' ||
                    periodFilter !== 'all' ||
                    managerFilter !== 'all'
                }
                onClear={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSourceFilter('all');
                    setPeriodFilter('all');
                    setManagerFilter('all');
                }}
            >
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Төлөв</span>
                    <Select
                        value={statusFilter}
                        onValueChange={(value) => setStatusFilter(value as LeadStatus | 'all')}
                    >
                        <SelectTrigger className="h-9 w-auto min-w-40 text-sm" aria-label="Төлөвөөр шүүх">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Бүх төлөв</SelectItem>
                            {Object.entries(statusConfig).map(([key, { label }]) => (
                                <SelectItem key={key} value={key}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Эх үүсвэр</span>
                    <Select
                        value={sourceFilter}
                        onValueChange={(value) => setSourceFilter(value as LeadSource | 'all')}
                    >
                        <SelectTrigger
                            className="h-9 w-auto min-w-36 text-sm"
                            aria-label="Эх үүсвэрээр шүүх"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Бүх эх үүсвэр</SelectItem>
                            {Object.entries(sourceLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Хугацаа</span>
                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                        <SelectTrigger
                            className="h-9 w-auto min-w-36 text-sm"
                            aria-label="Хугацаагаар шүүх"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(periodLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                {managers.length > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground/80 whitespace-nowrap">Менежер</span>
                        <Select value={managerFilter} onValueChange={setManagerFilter}>
                            <SelectTrigger
                                className="h-9 w-auto min-w-36 text-sm"
                                aria-label="Менежерээр шүүх"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Бүх менежер</SelectItem>
                                {managers.map((m) => (
                                    <SelectItem key={m.name} value={m.name}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                )}
            </FilterBar>

            {/* Lead Table (md+) */}
            <div className="hidden md:block">
                <DataTable<LeadRow>
                    columns={columns}
                    data={filteredLeads}
                    getRowId={(lead) => lead.id}
                    caption="Лийдүүдийн жагсаалт — харилцагч, холбоо барих, эх үүсвэр, төсөв, төлөв, үүссэн огноо"
                    loading={loading}
                    emptyMessage="Лийд олдсонгүй. Харилцагч Messenger-ээр холбогдоход энд харагдана."
                    onRowClick={(lead) => toggleExpanded(lead.id)}
                    pageSize={20}
                />
            </div>

            {/* Lead Cards (mobile, < md) */}
            <div className="md:hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
                        <span className="text-sm text-muted-foreground">Татаж байна...</span>
                    </div>
                ) : filteredLeads.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                                <Users className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="heading-section text-sm text-foreground">Лийд олдсонгүй</p>
                                <p className="text-sm text-muted-foreground">
                                    Харилцагч Messenger-ээр холбогдоход энд харагдана
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-3">
                        {filteredLeads.map((lead, idx) => {
                            const statusInfo = statusConfig[lead.status];
                            const card = (
                                <Card
                                    interactive
                                    onClick={() => toggleExpanded(lead.id)}
                                    className={cn(
                                        'cursor-pointer',
                                        expandedLead === lead.id && 'ring-1 ring-ring/40',
                                    )}
                                >
                                    <CardContent className="flex flex-col gap-3 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                {renderAvatar(lead)}
                                                <div>
                                                    <p className="font-medium text-foreground text-sm flex items-center gap-2">
                                                        {lead.customer_name || 'Үл мэдэгдэх'}
                                                        {lead.urgency === 'high' && (
                                                            <Badge variant="danger" size="sm">
                                                                <Zap className="w-3 h-3 mr-1" /> Яаралтай
                                                            </Badge>
                                                        )}
                                                    </p>
                                                    {lead.preferred_type && (
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Building2 className="w-3 h-3" />
                                                            {preferredTypeLabel(lead.preferred_type)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {statusInfo && (
                                                <StatusPill variant={statusInfo.variant} dot>
                                                    {statusInfo.label}
                                                </StatusPill>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-2xs uppercase tracking-wide text-muted-2">Эх үүсвэр</p>
                                                <p className="text-muted-foreground">
                                                    {sourceLabels[lead.source] || lead.source}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-2xs uppercase tracking-wide text-muted-2">Төсөв</p>
                                                <p className="font-medium text-foreground tabular-nums">
                                                    {formatBudget(lead.budget_min, lead.budget_max)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-2xs uppercase tracking-wide text-muted-2">Үүссэн</p>
                                                <p className="text-muted-foreground">
                                                    {lead.last_contact_at
                                                        ? getTimeAgo(lead.last_contact_at)
                                                        : getTimeAgo(lead.created_at)}
                                                </p>
                                            </div>
                                            {lead.customer_phone && (
                                                <div>
                                                    <p className="text-2xs uppercase tracking-wide text-muted-2">Утас</p>
                                                    <a
                                                        href={`tel:${lead.customer_phone}`}
                                                        className="text-brand hover:underline flex items-center gap-1 tabular-nums"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Phone className="w-3 h-3" />
                                                        {lead.customer_phone}
                                                    </a>
                                                </div>
                                            )}
                                        </div>

                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Select
                                                value={lead.status}
                                                onValueChange={(value) => updateStatus(lead.id, value as LeadStatus)}
                                            >
                                                <SelectTrigger className="h-9 w-full text-xs" aria-label="Төлөв солих">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.entries(statusConfig).map(([key, { label }]) => (
                                                        <SelectItem key={key} value={key}>
                                                            {label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CardContent>
                                </Card>
                            );

                            if (reducedMotion) return <div key={lead.id}>{card}</div>;
                            return (
                                <motion.div
                                    key={lead.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.22, delay: Math.min(idx, 8) * 0.03 }}
                                >
                                    {card}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Expanded lead details */}
            <Sheet open={!!activeLead} onOpenChange={(open) => !open && setExpandedLead(null)}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                    {activeLead && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    {activeLead.customer_name || 'Үл мэдэгдэх'}
                                    {activeLead.urgency === 'high' && (
                                        <Badge variant="danger" size="sm">
                                            <Zap className="w-3 h-3 mr-1" /> Яаралтай
                                        </Badge>
                                    )}
                                </SheetTitle>
                                <SheetDescription>
                                    {sourceLabels[activeLead.source] || activeLead.source}
                                    {activeLead.preferred_type
                                        ? ` · ${preferredTypeLabel(activeLead.preferred_type)}`
                                        : ''}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="flex flex-col gap-4 p-6">
                                <div className="bg-surface rounded-md p-4 border border-border">
                                    <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                        <Sparkles className="w-4 h-4 text-brand" />
                                        AI Тойм
                                    </h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {activeLead.ai_summary || 'Дэлгэрэнгүй мэдээлэл байхгүй'}
                                    </p>
                                    {activeLead.conversation_summary && (
                                        <div className="mt-3 pt-3 border-t border-border/60">
                                            <p className="text-xs text-muted-foreground/80 font-medium mb-1">
                                                Сүүлийн харилцаа:
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {activeLead.conversation_summary}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-surface rounded-md p-4 border border-border">
                                    <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                        <MessageSquare className="w-4 h-4 text-status-success" />
                                        Яриа эхлэх санаа
                                    </h4>
                                    {activeLead.talking_points && activeLead.talking_points.length > 0 ? (
                                        <ul className="space-y-2">
                                            {activeLead.talking_points.map((point: string, idx: number) => (
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

                                <div className="bg-surface rounded-md p-4 border border-border">
                                    <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                        <Star className="w-4 h-4 text-status-pending" />
                                        Сонирхол
                                    </h4>
                                    {activeLead.interests && activeLead.interests.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {activeLead.interests.map((interest: string, idx: number) => (
                                                <Badge key={idx} variant="default">
                                                    {interest}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Тодорхойгүй</p>
                                    )}
                                </div>

                                {canWrite && (
                                    <div className="bg-surface rounded-md p-4 border border-border">
                                        <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                            <CalendarClock className="w-4 h-4 text-brand" />
                                            Дараагийн дагалт
                                        </h4>
                                        {activeLead.next_followup_at ? (
                                            <p className="text-xs text-muted-foreground mb-2">
                                                Товлосон:{' '}
                                                <span className="font-medium text-foreground">
                                                    {new Date(activeLead.next_followup_at).toLocaleDateString('mn-MN')} 10:00
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground mb-2">Товлоогүй байна</p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { label: 'Маргааш', days: 1 },
                                                { label: '3 хоног', days: 3 },
                                                { label: '7 хоног', days: 7 },
                                            ].map((c) => (
                                                <button
                                                    key={c.days}
                                                    type="button"
                                                    onClick={() => setFollowup(activeLead.id, c.days)}
                                                    className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-foreground hover:bg-surface-2 transition-colors"
                                                >
                                                    {c.label}
                                                </button>
                                            ))}
                                            {activeLead.next_followup_at && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFollowup(activeLead.id, null)}
                                                    className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:bg-surface-2 transition-colors"
                                                >
                                                    Цуцлах
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {canWrite && managers.length > 0 && (
                                    <div className="bg-surface rounded-md p-4 border border-border">
                                        <h4 className="heading-section text-sm text-foreground flex items-center gap-2 mb-2">
                                            <UserRound className="w-4 h-4 text-brand" />
                                            Хариуцагч менежер
                                        </h4>
                                        <Select
                                            value={activeLead.sales_manager_name || '__none__'}
                                            onValueChange={(v) =>
                                                assignManager(activeLead.id, v === '__none__' ? null : v)
                                            }
                                        >
                                            <SelectTrigger
                                                className="h-9 w-full text-sm"
                                                aria-label="Хариуцагч менежер"
                                            >
                                                <SelectValue placeholder="Хуваарилаагүй" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">Хуваарилаагүй</SelectItem>
                                                {/* Одоо оноогдсон нэр бүртгэлд байхгүй бол сонголтод хадгална */}
                                                {activeLead.sales_manager_name &&
                                                    !managers.some((m) => m.name === activeLead.sales_manager_name) && (
                                                        <SelectItem value={activeLead.sales_manager_name}>
                                                            {activeLead.sales_manager_name}
                                                        </SelectItem>
                                                    )}
                                                {managers.map((m) => (
                                                    <SelectItem key={m.name} value={m.name}>
                                                        {m.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <a
                                        href={`tel:${activeLead.customer_phone}`}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-brand-fg rounded-md hover:bg-brand-strong transition-colors text-sm font-medium"
                                    >
                                        <Phone className="w-4 h-4" />
                                        Залгах
                                    </a>
                                    <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border text-foreground rounded-md hover:bg-surface-2 transition-colors text-sm font-medium">
                                        <MessageSquare className="w-4 h-4" />
                                        Мессеж
                                    </button>
                                </div>
                                {activeLead.status === 'closed_won' ? (
                                    <a
                                        href="/dashboard/contracts"
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 w-full bg-status-success-soft text-status-success rounded-md hover:opacity-90 transition-colors text-sm font-medium"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Гэрээ үзэх
                                    </a>
                                ) : (
                                    <button
                                        onClick={() => convertLead(activeLead.id)}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 w-full bg-brand-soft text-brand-strong rounded-md hover:bg-brand-soft/80 transition-colors text-sm font-medium"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Гэрээ болгох
                                    </button>
                                )}

                                <div className="mt-2">
                                    <EntityAttachments entityType="lead" entityId={activeLead.id} />
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
