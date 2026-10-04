'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Headphones, AlertTriangle, CheckCircle2,
    DollarSign, Star, Plus,
    Phone, User, FileText, MessageSquare, Wrench, ArrowRight,
    ThumbsUp, Lightbulb, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatTimeAgo } from '@/lib/utils/date';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { PageSkeleton } from '@/components/ui/LoadingSkeleton';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { useAuth } from '@/contexts/AuthContext';
import {
    SERVICE_LOG_CHANNELS, SERVICE_LOG_CHANNEL_LABELS, SERVICE_LOG_PRIORITIES, SERVICE_LOG_PRIORITY_META, SERVICE_LOG_STATUSES,
    SERVICE_LOG_STATUS_META, SERVICE_LOG_TYPES, SERVICE_LOG_TYPE_META, serviceLogChannelLabel, type ServiceLogType,
} from '@/lib/service-logs/labels';
import { slaState } from '@/lib/service-logs/sla';

type StatusPillVariant = 'success' | 'danger' | 'pending' | 'info' | 'active' | 'neutral' | 'brand';

interface KPI {
    total_contracts: number;
    active_contracts: number;
    closed_contracts: number;
    total_sales: number;
    total_collected: number;
    collection_rate: number;
    overdue_contract_count: number;
    total_overdue_amount: number;
    open_requests: number;
    resolved_requests: number;
    total_requests: number;
    open_complaints: number;
    suggestions_count: number;
    avg_resolution_hours: number | null;
    avg_service_rating: number | null;
    nps: number | null;
    avg_csat: number | null;
    total_surveys: number;
    overdue_payments: number;
    upcoming_payments_7d: number;
}

interface ServiceLog {
    id: string;
    contract_id: string | null;
    customer_id: string | null;
    channel: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    type: string;
    priority: string;
    subject: string;
    description: string | null;
    status: string;
    assigned_to: string | null;
    /** Хариуцагч менежер (бүртгэлийн канон нэр) — шийдвэрлэлтийн KPI. */
    manager_name: string | null;
    satisfaction_rating: number | null;
    created_at: string;
    resolved_at: string | null;
}

interface ManagerOption {
    name: string;
}

interface CustomerOption {
    id: string;
    name: string;
    phone: string | null;
}

// Төрөл, чухлал, төлөв, суваг, SLA-ийн толь: lib/service-logs (API-тай ижил). Энд зөвхөн дүрс.
const TYPE_ICONS: Record<ServiceLogType, React.ReactNode> = {
    inquiry: <MessageSquare className="w-3 h-3" />,
    complaint: <AlertTriangle className="w-3 h-3" />,
    suggestion: <Lightbulb className="w-3 h-3" />,
    maintenance: <Wrench className="w-3 h-3" />,
    handover: <ArrowRight className="w-3 h-3" />,
    payment: <DollarSign className="w-3 h-3" />,
    other: <FileText className="w-3 h-3" />,
};

function typeInfoOf(type: string): { text: string; icon: React.ReactNode; variant: StatusPillVariant } {
    const key = (Object.hasOwn(SERVICE_LOG_TYPE_META, type) ? type : 'other') as ServiceLogType;
    return { text: SERVICE_LOG_TYPE_META[key].label, icon: TYPE_ICONS[key], variant: SERVICE_LOG_TYPE_META[key].tone };
}
function metaInfo<K extends string>(meta: Record<K, { label: string; tone: StatusPillVariant }>, value: string, fallback: K) {
    const entry = meta[(Object.hasOwn(meta, value) ? value : fallback) as K];
    return { text: entry.label, variant: entry.tone };
}

/** Нээлттэй бичлэгийн SLA төлөв — хугацаа хэтэрсэн эсвэл үлдсэн цаг. */
function slaInfo(log: ServiceLog): { text: string; variant: StatusPillVariant } | null {
    const state = slaState(log, new Date());
    if (!state) return null;
    if (state.kind === 'overdue') return { text: 'Хугацаа хэтэрсэн', variant: 'danger' };
    return { text: `${state.hoursLeft}ц үлдсэн`, variant: state.warn ? 'pending' : 'neutral' };
}

export default function CustomerServicePage() {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewForm, setShowNewForm] = useState(false);

    // Хайлтыг 300мс хүлээж хэрэглэнэ (цэвэрлэхэд шууд).
    useEffect(() => {
        const t = setTimeout(() => setSearchTerm(search), search ? 300 : 0);
        return () => clearTimeout(t);
    }, [search]);

    const kpiQuery = useDashboardQuery<{ stats?: KPI }>(['service-logs', 'kpi'], '/api/dashboard/contracts/stats/service');
    const logsQuery = useDashboardQuery<{ logs?: ServiceLog[] }>(
        ['service-logs', 'list', statusFilter, typeFilter, channelFilter, searchTerm],
        `/api/dashboard/service-logs?${new URLSearchParams({
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(typeFilter ? { type: typeFilter } : {}),
            ...(channelFilter ? { channel: channelFilter } : {}),
            ...(searchTerm ? { search: searchTerm } : {}),
        })}`,
        { keepPreviousData: true },
    );
    const logs = logsQuery.data?.logs ?? [];
    const { user } = useAuth();
    const canWrite = user?.role === 'super_admin' || (!!user?.permissions.canWrite && user.permissions.modules.includes('customer-service'));
    // Хариуцагч = борлуулалтын менежерийн бүртгэл (канон нэр) — шийдвэрлэлтийн KPI үүгээр тооцогдоно.
    const managersQuery = useDashboardQuery<{ managers?: ManagerOption[] }>(['service-logs', 'managers'], '/api/dashboard/managers', { staleTime: 300_000 });
    const managers = managersQuery.data?.managers ?? [];

    /** Санал гомдлын жагсаалт, KPI болон харилцагчийн дэлгэрэнгүй дэх түүхийг шинэчилнэ. */
    function refreshLogs() {
        return Promise.all([
            queryClient.invalidateQueries({ queryKey: ['service-logs'] }),
            queryClient.invalidateQueries({ queryKey: ['customers', 'detail'] }),
            // Хариуцагчийн шийдвэрлэлт өдрийн идэвх, сарын KPI-д тоологдоно.
            queryClient.invalidateQueries({ queryKey: ['manager-activity'] }),
            queryClient.invalidateQueries({ queryKey: ['sales-kpi'] }),
        ]);
    }

    async function createServiceLog(formData: Record<string, string>): Promise<boolean> {
        try {
            await dashboardMutate('/api/dashboard/service-logs', 'POST', formData);
            setShowNewForm(false);
            await refreshLogs();
            toast.success('Хүсэлт бүртгэгдлээ');
            return true;
        } catch (err) {
            toast.error(err instanceof Error && err.message ? err.message : 'Хүсэлт бүртгэхэд алдаа гарлаа');
            return false;
        }
    }

    async function updateLog(id: string, patch: { status?: string; manager_name?: string | null }) {
        try {
            await dashboardMutate(`/api/dashboard/service-logs/${id}`, 'PATCH', patch);
            void refreshLogs();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Хүсэлт шинэчилж чадсангүй');
        }
    }
    const updateLogStatus = (id: string, status: string) => updateLog(id, { status });

    if (kpiQuery.isPending || logsQuery.isPending) {
        return <PageSkeleton rows={6} showStats />;
    }

    const k = kpiQuery.data?.stats || {} as KPI;

    return (
        <div>
            <PageHeader
                eyebrow="Санал гомдол"
                title="Санал гомдлын хяналт"
                subtitle="Санал, гомдол, хүсэлт болон харилцагчийн сэтгэл ханамжийн удирдлага"
                primaryAction={
                    <Button onClick={() => setShowNewForm(true)} variant="primary" size="md">
                        <Plus className="w-4 h-4" /> Шинэ хүсэлт
                    </Button>
                }
            />

            {/* KPI Cards: Санал гомдол & Сэтгэл ханамж */}
            {kpiQuery.error && !kpiQuery.data ? (
                <Alert variant="danger" className="mb-4">
                    <AlertTitle>Үзүүлэлт татахад алдаа гарлаа</AlertTitle>
                    <AlertDescription>{kpiQuery.error.message}</AlertDescription>
                    <Button size="sm" variant="secondary" className="self-start" disabled={kpiQuery.isFetching} onClick={() => void kpiQuery.refetch()}>Дахин оролдох</Button>
                </Alert>
            ) : (
                <StatBar columns={4}>
                    <StatTile
                        icon={<AlertTriangle className="w-4 h-4" />}
                        accent="danger"
                        label="Нээлттэй гомдол"
                        value={String(k.open_complaints || 0)}
                        helper={k.avg_resolution_hours ? `Дундаж шийдвэрлэх: ${k.avg_resolution_hours} цаг` : `Нийт ${k.total_requests || 0} бичлэг`}
                    />
                    <StatTile
                        icon={<Lightbulb className="w-4 h-4" />}
                        accent="brand"
                        label="Санал"
                        value={String(k.suggestions_count || 0)}
                        helper={`Нээлттэй ${k.open_requests || 0} хүсэлт`}
                    />
                    <StatTile
                        icon={<ThumbsUp className="w-4 h-4" />}
                        accent="success"
                        label="NPS"
                        value={k.nps !== null ? String(k.nps) : '—'}
                        helper={k.total_surveys > 0 ? `${k.total_surveys} судалгааны хариулт` : 'Судалгаа алга'}
                    />
                    <StatTile
                        icon={<Star className="w-4 h-4" />}
                        accent="warning"
                        label="CSAT"
                        value={k.avg_csat !== null ? `${k.avg_csat}/5` : '—'}
                        helper={k.avg_service_rating ? `Гомдлын үнэлгээ: ${k.avg_service_rating}/5` : undefined}
                    />
                </StatBar>
            )}

            {/* Filters */}
            <FilterBar
                search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: 'Хүсэлт, нэр, утас хайх...',
                }}
            >
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Төлөв</span>
                    <Select
                        value={statusFilter || 'all'}
                        onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}
                    >
                        <SelectTrigger className="h-9 w-auto min-w-40 text-sm" aria-label="Төлөвөөр шүүх">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Бүх төлөв</SelectItem>
                            {SERVICE_LOG_STATUSES.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_STATUS_META[value].label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Төрөл</span>
                    <Select
                        value={typeFilter || 'all'}
                        onValueChange={(value) => setTypeFilter(value === 'all' ? '' : value)}
                    >
                        <SelectTrigger className="h-9 w-auto min-w-40 text-sm" aria-label="Төрлөөр шүүх">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Бүх төрөл</SelectItem>
                            {SERVICE_LOG_TYPES.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_TYPE_META[value].label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/80 whitespace-nowrap">Суваг</span>
                    <Select
                        value={channelFilter || 'all'}
                        onValueChange={(value) => setChannelFilter(value === 'all' ? '' : value)}
                    >
                        <SelectTrigger className="h-9 w-auto min-w-36 text-sm" aria-label="Сувгаар шүүх">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Бүх суваг</SelectItem>
                            {SERVICE_LOG_CHANNELS.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_CHANNEL_LABELS[value]}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </label>
            </FilterBar>

            {/* Service Logs Table */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden" aria-busy={logsQuery.isFetching}>
                {logsQuery.error && !logsQuery.data ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <AlertTriangle className="w-8 h-8 text-status-danger" />
                        <p className="text-sm text-muted-foreground">Санал гомдлын бүртгэл татахад алдаа гарлаа</p>
                        <Button variant="secondary" size="sm" disabled={logsQuery.isFetching} onClick={() => void logsQuery.refetch()}>Дахин оролдох</Button>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Headphones className="w-12 h-12 text-muted-foreground/60 mb-3" />
                        <p className="text-muted-foreground mb-1">Санал гомдлын бүртгэл хоосон</p>
                        <p className="text-muted-foreground/60 text-sm mb-4">
                            Шинэ хүсэлт эсвэл гомдол бүртгэлнэ үү
                        </p>
                        <Button onClick={() => setShowNewForm(true)} variant="primary" size="sm">
                            <Plus className="w-4 h-4" /> Шинэ хүсэлт
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-2xs uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 font-medium">Хүсэлт</th>
                                    <th className="px-4 py-3 font-medium">Харилцагч</th>
                                    <th className="px-4 py-3 font-medium">Төрөл</th>
                                    <th className="px-4 py-3 font-medium">Чухлал</th>
                                    <th className="px-4 py-3 font-medium">Суваг</th>
                                    <th className="px-4 py-3 font-medium">Хариуцагч</th>
                                    <th className="px-4 py-3 font-medium">Огноо</th>
                                    <th className="px-4 py-3 font-medium">Төлөв</th>
                                    <th className="px-4 py-3 font-medium">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const typeInfo = typeInfoOf(log.type);
                                    const prioInfo = metaInfo(SERVICE_LOG_PRIORITY_META, log.priority, 'medium');
                                    const statusInfo = metaInfo(SERVICE_LOG_STATUS_META, log.status, 'open');

                                    return (
                                        <tr key={log.id} className="border-b border-border hover:bg-surface-2">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground max-w-[200px] truncate">
                                                    {log.subject}
                                                </div>
                                                {log.description && (
                                                    <div className="text-2xs text-muted-foreground max-w-[200px] truncate">
                                                        {log.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-foreground flex items-center gap-1.5">
                                                    <User className="w-3 h-3 text-muted-foreground/60" />
                                                    {log.customer_name || '—'}
                                                </div>
                                                {log.customer_phone && (
                                                    <div className="text-2xs text-muted-foreground flex items-center gap-1">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        {log.customer_phone}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill variant={typeInfo.variant}>
                                                    {typeInfo.icon} {typeInfo.text}
                                                </StatusPill>
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill variant={prioInfo.variant}>
                                                    {prioInfo.text}
                                                </StatusPill>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs">
                                                {log.channel ? serviceLogChannelLabel(log.channel) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-foreground text-xs">
                                                <AssigneeCell log={log} managers={managers} canWrite={canWrite} onChange={(name) => updateLog(log.id, { manager_name: name })} />
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs">
                                                {log.created_at ? formatTimeAgo(log.created_at) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill variant={statusInfo.variant}>
                                                    {statusInfo.text}
                                                </StatusPill>
                                                {(() => {
                                                    const sla = slaInfo(log);
                                                    return sla ? (
                                                        <div className="mt-1">
                                                            <StatusPill variant={sla.variant}>{sla.text}</StatusPill>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </td>
                                            <td className="px-4 py-3">
                                                {(log.status === 'open' || log.status === 'in_progress') && (
                                                    <div className="flex gap-1">
                                                        {log.status === 'open' && (
                                                            <Button
                                                                onClick={() => updateLogStatus(log.id, 'in_progress')}
                                                                variant="tertiary"
                                                                size="sm"
                                                                className="min-h-0 px-2 py-1 text-2xs text-status-pending"
                                                            >
                                                                Эхлэх
                                                            </Button>
                                                        )}
                                                        <Button
                                                            onClick={() => updateLogStatus(log.id, 'resolved')}
                                                            variant="tertiary"
                                                            size="sm"
                                                            className="min-h-0 px-2 py-1 text-2xs text-status-success"
                                                        >
                                                            Шийдсэн
                                                        </Button>
                                                    </div>
                                                )}
                                                {log.satisfaction_rating && (
                                                    <div className="flex items-center gap-0.5 mt-1">
                                                        {[1, 2, 3, 4, 5].map(s => (
                                                            <Star
                                                                key={s}
                                                                className={`w-3 h-3 ${s <= log.satisfaction_rating! ? 'text-status-pending fill-current' : 'text-muted-foreground/60'}`}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* New Service Log Modal */}
            <NewServiceLogModal
                open={showNewForm}
                onClose={() => setShowNewForm(false)}
                onSubmit={createServiceLog}
                managers={managers}
                managersError={!!managersQuery.error}
                managersLoading={managersQuery.isFetching}
                onRetryManagers={() => void managersQuery.refetch()}
            />
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function NewServiceLogModal({ open, onClose, onSubmit, managers, managersError, managersLoading, onRetryManagers }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Record<string, string>) => Promise<boolean>;
    managers: ManagerOption[];
    managersError: boolean;
    managersLoading: boolean;
    onRetryManagers: () => void;
}) {
    const EMPTY_FORM = {
        subject: '',
        description: '',
        type: 'complaint',
        priority: 'medium',
        channel: 'phone',
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        // Хоосон бол сервер: холбосон гэрээний менежер → бүртгэсэн менежер.
        manager_name: '',
    };
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);


    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.subject.trim()) return;
        setSubmitting(true);
        const ok = await onSubmit(form);
        setSubmitting(false);
        if (ok) setForm(EMPTY_FORM);
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="rounded-2xl sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-brand" />
                        Шинэ хүсэлт бүртгэх
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Шинэ санал гомдол бүртгэх форм
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <FormField label="Гарчиг" htmlFor="cs-subject" required>
                        <input
                            id="cs-subject"
                            type="text"
                            value={form.subject}
                            onChange={e => setForm({ ...form, subject: e.target.value })}
                            placeholder="Хүсэлтийн товч тайлбар"
                            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            required
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Төрөл" htmlFor="cs-type">
                            <Select
                                value={form.type}
                                onValueChange={(value) => setForm({ ...form, type: value })}
                            >
                                <SelectTrigger id="cs-type" className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SERVICE_LOG_TYPES.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_TYPE_META[value].label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Чухлал" htmlFor="cs-priority">
                            <Select
                                value={form.priority}
                                onValueChange={(value) => setForm({ ...form, priority: value })}
                            >
                                <SelectTrigger id="cs-priority" className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SERVICE_LOG_PRIORITIES.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_PRIORITY_META[value].label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>

                    <FormField label="Суваг" htmlFor="cs-channel">
                        <Select
                            value={form.channel}
                            onValueChange={(value) => setForm({ ...form, channel: value })}
                        >
                            <SelectTrigger id="cs-channel" className="text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SERVICE_LOG_CHANNELS.map((value) => <SelectItem key={value} value={value}>{SERVICE_LOG_CHANNEL_LABELS[value]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </FormField>

                    <CustomerSearch
                        onSelect={(cust) => setForm(f => ({
                            ...f,
                            customer_id: cust?.id || '',
                            customer_name: cust?.name || f.customer_name,
                            customer_phone: cust?.phone || f.customer_phone,
                        }))}
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Харилцагчийн нэр" htmlFor="cs-customer-name">
                            <input
                                id="cs-customer-name"
                                type="text"
                                value={form.customer_name}
                                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            />
                        </FormField>
                        <FormField label="Утас" htmlFor="cs-customer-phone">
                            <input
                                id="cs-customer-phone"
                                type="text"
                                value={form.customer_phone}
                                onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            />
                        </FormField>
                    </div>

                    <FormField
                        label="Хариуцагч менежер"
                        htmlFor="cs-manager"
                        error={managersError ? (
                            <>
                                Менежерийн жагсаалтыг татаж чадсангүй.{' '}
                                <button type="button" onClick={onRetryManagers} disabled={managersLoading} className="underline">Дахин оролдох</button>
                            </>
                        ) : undefined}
                    >
                        <Select
                            value={form.manager_name || 'auto'}
                            onValueChange={(value) => setForm({ ...form, manager_name: value === 'auto' ? '' : value })}
                        >
                            <SelectTrigger id="cs-manager" className="text-sm">
                                <SelectValue placeholder="Менежер сонгох" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Автоматаар (гэрээний / бүртгэсэн менежер)</SelectItem>
                                {managers.map((m) => (
                                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>

                    <FormField label="Дэлгэрэнгүй" htmlFor="cs-description">
                        <textarea
                            id="cs-description"
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        />
                    </FormField>

                    <DialogFooter className="pt-2">
                        <Button type="button" onClick={onClose} variant="ghost" size="md">
                            Болих
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting || !form.subject.trim()}
                            isLoading={submitting}
                            variant="primary"
                            size="md"
                        >
                            {!submitting && <CheckCircle2 className="w-4 h-4" />}
                            Бүртгэх
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Жагсаалтын «Хариуцагч»: бичих эрхтэй бол бүртгэлийн менежерээр солих. Хариуцагч = зөвхөн manager_name
 * (KPI-тай ижил дүрэм); manager_name-гүй мөрийн assigned_to бол хуучин чөлөөт текст — тооцогдохгүй.
 */
function AssigneeCell({ log, managers, canWrite, onChange }: {
    log: ServiceLog;
    managers: ManagerOption[];
    canWrite: boolean;
    onChange: (name: string | null) => void;
}) {
    const legacy = !log.manager_name && log.assigned_to ? log.assigned_to : null;
    const legacyNote = legacy && <div className="mt-0.5 truncate text-2xs text-muted-foreground" title="Хуучин бүртгэлийн текст — KPI-д тооцогдохгүй">{legacy}</div>;
    if (!canWrite || managers.length === 0) {
        return <>{log.manager_name || (legacy ? 'Хариуцагчгүй' : '—')}{legacyNote}</>;
    }
    const options = log.manager_name && !managers.some((m) => m.name === log.manager_name) ? [{ name: log.manager_name }, ...managers] : managers;
    return (
        <div className="min-w-36">
            <Select value={log.manager_name || 'none'} onValueChange={(value) => onChange(value === 'none' ? null : value)}>
                <SelectTrigger className="h-8 text-xs" aria-label={`«${log.subject}» хариуцагч`}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Хариуцагчгүй</SelectItem>
                    {options.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
            </Select>
            {legacyNote}
        </div>
    );
}

// CRM харилцагч хайх typeahead — service_logs.customer_id-д холбоно (заавал биш).
function CustomerSearch({ onSelect }: {
    onSelect: (c: CustomerOption | null) => void;
}) {
    const [q, setQ] = useState('');
    // Хайх үг: 300мс хүлээнэ, 2-оос богино бол шууд. `fresh` — 2-оос богино үгнээс шинээр
    // эхэлсэн хайлт тул өмнөх хайлтын үр дүнг (keepPreviousData) харуулахгүй.
    const [search, setSearch] = useState({ term: '', fresh: true });
    const [picked, setPicked] = useState('');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const next = q.trim();
        const t = setTimeout(() => setSearch((prev) => prev.term === next ? prev : { term: next, fresh: prev.term.length < 2 }), next.length < 2 ? 0 : 300);
        return () => clearTimeout(t);
    }, [q]);

    const searchQuery = useDashboardQuery<{ customers?: CustomerOption[]; data?: CustomerOption[]; rows?: CustomerOption[] }>(
        ['customers', 'search', search.term],
        !picked && search.term.length >= 2 ? `/api/dashboard/customers?search=${encodeURIComponent(search.term)}&limit=8` : null,
        { keepPreviousData: true },
    );
    const found = search.term.length >= 2 && !(search.fresh && searchQuery.isPlaceholderData) ? searchQuery.data : undefined;
    const results = (found?.customers || found?.data || found?.rows || []).slice(0, 8);

    if (picked) {
        return (
            <FormField label="Холбосон харилцагч" htmlFor="cs-cust-picked">
                <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                    <span className="text-sm text-foreground truncate flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground/70" /> {picked}
                    </span>
                    <button type="button" onClick={() => { setPicked(''); setQ(''); onSelect(null); }} className="text-muted-foreground hover:text-foreground p-1" title="Цэвэрлэх">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </FormField>
        );
    }

    return (
        <FormField
            label="Харилцагч холбох (заавал биш)"
            htmlFor="cs-cust-search"
            error={searchQuery.error ? (
                <>
                    Харилцагч хайж чадсангүй.{' '}
                    <button type="button" onClick={() => void searchQuery.refetch()} disabled={searchQuery.isFetching} className="underline">Дахин оролдох</button>
                </>
            ) : undefined}
        >
            <div className="relative">
                <input
                    id="cs-cust-search"
                    type="text"
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => results.length && setOpen(true)}
                    placeholder="CRM харилцагчийг нэрээр хайх..."
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                {open && q.trim().length >= 2 && results.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-lg max-h-52 overflow-y-auto">
                        {results.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => { setPicked(c.name); setOpen(false); onSelect(c); }}
                                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-2 flex items-center gap-2"
                            >
                                <User className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                <span className="truncate">{c.name}{c.phone ? ` • ${c.phone}` : ''}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </FormField>
    );
}
