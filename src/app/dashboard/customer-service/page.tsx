'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Headphones, AlertTriangle, CheckCircle2, Clock,
    DollarSign, Star, Loader2, Plus,
    Phone, User, FileText, MessageSquare, Wrench, ArrowRight,
    ThumbsUp,
} from 'lucide-react';
import { formatShortDate } from '@/lib/utils/date';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { FilterBar } from '@/components/dashboard/FilterBar';
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

const SHOP_KEY = 'vertmonhub_active_shop_id';

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
    customer_name: string | null;
    customer_phone: string | null;
    type: string;
    priority: string;
    subject: string;
    description: string | null;
    status: string;
    assigned_to: string | null;
    satisfaction_rating: number | null;
    created_at: string;
    resolved_at: string | null;
}

const TYPE_LABELS: Record<string, { text: string; icon: React.ReactNode; variant: StatusPillVariant }> = {
    inquiry: { text: 'Лавлагаа', icon: <MessageSquare className="w-3 h-3" />, variant: 'info' },
    complaint: { text: 'Гомдол', icon: <AlertTriangle className="w-3 h-3" />, variant: 'danger' },
    maintenance: { text: 'Засвар', icon: <Wrench className="w-3 h-3" />, variant: 'pending' },
    handover: { text: 'Хүлээлцэх', icon: <ArrowRight className="w-3 h-3" />, variant: 'success' },
    payment: { text: 'Төлбөр', icon: <DollarSign className="w-3 h-3" />, variant: 'brand' },
    other: { text: 'Бусад', icon: <FileText className="w-3 h-3" />, variant: 'neutral' },
};

const PRIORITY_LABELS: Record<string, { text: string; variant: StatusPillVariant }> = {
    low: { text: 'Бага', variant: 'neutral' },
    medium: { text: 'Дунд', variant: 'info' },
    high: { text: 'Өндөр', variant: 'pending' },
    urgent: { text: 'Яаралтай', variant: 'danger' },
};

const STATUS_LABELS: Record<string, { text: string; variant: StatusPillVariant }> = {
    open: { text: 'Нээлттэй', variant: 'info' },
    in_progress: { text: 'Ажиллаж буй', variant: 'pending' },
    resolved: { text: 'Шийдвэрлэсэн', variant: 'success' },
    closed: { text: 'Хаагдсан', variant: 'neutral' },
};

function formatMoney(n: number | null): string {
    if (n === null || n === undefined) return '—';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' тэрбум₮';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + ' сая₮';
    return new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
}

function formatDate(s: string | null): string {
    if (!s) return '—';
    const d = new Date(s);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return 'Саяхан';
    if (diffH < 24) return `${diffH} цагийн өмнө`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} өдрийн өмнө`;
    return formatShortDate(s);
}

function shopHeaders(): HeadersInit {
    return {
        'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '',
    };
}

export default function CustomerServicePage() {
    const [kpi, setKpi] = useState<KPI | null>(null);
    const [logs, setLogs] = useState<ServiceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showNewForm, setShowNewForm] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [kpiRes, logsRes] = await Promise.all([
                fetch('/api/dashboard/contracts/stats/service', { headers: shopHeaders() }),
                fetch(`/api/dashboard/service-logs?${new URLSearchParams({
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(search ? { search } : {}),
                })}`, { headers: shopHeaders() }),
            ]);

            const kpiData = await kpiRes.json();
            const logsData = await logsRes.json();

            setKpi(kpiData.stats);
            setLogs(logsData.logs || []);
        } catch (err) {
            console.error('[CustomerService] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, search]);

    useEffect(() => {
        const t = setTimeout(fetchData, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [fetchData, search]);

    async function createServiceLog(formData: Record<string, string>) {
        try {
            const res = await fetch('/api/dashboard/service-logs', {
                method: 'POST',
                headers: { ...shopHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                setShowNewForm(false);
                fetchData();
            }
        } catch (err) {
            console.error('[CustomerService] create error:', err);
        }
    }

    async function updateLogStatus(id: string, status: string) {
        try {
            await fetch(`/api/dashboard/service-logs/${id}`, {
                method: 'PATCH',
                headers: { ...shopHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            fetchData();
        } catch (err) {
            console.error('[CustomerService] update error:', err);
        }
    }

    if (loading && !kpi) {
        return <PageSkeleton rows={6} showStats />;
    }

    const k = kpi || {} as KPI;

    return (
        <div>
            <PageHeader
                eyebrow="Үйлчилгээ"
                title="Үйлчилгээний хяналт"
                subtitle="Гэрээний хяналт, төлбөрийн хоцрогдол, хүсэлт/гомдлын удирдлага"
                primaryAction={
                    <Button onClick={() => setShowNewForm(true)} variant="primary" size="md">
                        <Plus className="w-4 h-4" /> Шинэ хүсэлт
                    </Button>
                }
            />

            {/* KPI Cards - Row 1: Гэрээ & Төлбөр */}
            <StatBar columns={4}>
                <StatTile
                    icon={<FileText className="w-4 h-4" />}
                    accent="info"
                    label="Идэвхтэй гэрээ"
                    value={String(k.active_contracts || 0)}
                    helper={`Нийт ${k.total_contracts || 0} / ${k.closed_contracts || 0} хаагдсан`}
                />
                <StatTile
                    icon={<DollarSign className="w-4 h-4" />}
                    accent="success"
                    label="Цуглуулалт"
                    value={`${k.collection_rate || 0}%`}
                    helper={formatMoney(k.total_collected || 0)}
                />
                <StatTile
                    icon={<AlertTriangle className="w-4 h-4" />}
                    accent="danger"
                    label="Хоцорсон төлбөр"
                    value={formatMoney(k.total_overdue_amount || 0)}
                    helper={`${k.overdue_contract_count || 0} гэрээ`}
                />
                <StatTile
                    icon={<Clock className="w-4 h-4" />}
                    accent="warning"
                    label="Ирэх 7 хоногт"
                    value={`${k.upcoming_payments_7d || 0} төлбөр`}
                    helper={`${k.overdue_payments || 0} хоцорсон`}
                />
            </StatBar>

            {/* KPI Cards - Row 2: Үйлчилгээ & Сэтгэл ханамж */}
            <StatBar columns={4}>
                <StatTile
                    icon={<Headphones className="w-4 h-4" />}
                    accent="brand"
                    label="Нээлттэй хүсэлт"
                    value={String(k.open_requests || 0)}
                    helper={`Нийт ${k.total_requests || 0} / ${k.resolved_requests || 0} шийдвэрлэсэн`}
                />
                <StatTile
                    icon={<Clock className="w-4 h-4" />}
                    accent="info"
                    label="Дундаж шийдвэрлэх"
                    value={k.avg_resolution_hours ? `${k.avg_resolution_hours} цаг` : '—'}
                />
                <StatTile
                    icon={<ThumbsUp className="w-4 h-4" />}
                    accent="success"
                    label="NPS"
                    value={k.nps !== null ? String(k.nps) : '—'}
                    helper={k.total_surveys > 0 ? `${k.total_surveys} судалгаа` : 'Мэдээлэл алга'}
                />
                <StatTile
                    icon={<Star className="w-4 h-4" />}
                    accent="warning"
                    label="CSAT"
                    value={k.avg_csat !== null ? `${k.avg_csat}/5` : '—'}
                    helper={k.avg_service_rating ? `Үнэлгээ: ${k.avg_service_rating}/5` : undefined}
                />
            </StatBar>

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
                            <SelectItem value="open">Нээлттэй</SelectItem>
                            <SelectItem value="in_progress">Ажиллаж буй</SelectItem>
                            <SelectItem value="resolved">Шийдвэрлэсэн</SelectItem>
                            <SelectItem value="closed">Хаагдсан</SelectItem>
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
                            <SelectItem value="inquiry">Лавлагаа</SelectItem>
                            <SelectItem value="complaint">Гомдол</SelectItem>
                            <SelectItem value="maintenance">Засвар</SelectItem>
                            <SelectItem value="payment">Төлбөр</SelectItem>
                            <SelectItem value="handover">Хүлээлцэх</SelectItem>
                        </SelectContent>
                    </Select>
                </label>
            </FilterBar>

            {/* Service Logs Table */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-brand" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Headphones className="w-12 h-12 text-muted-foreground/60 mb-3" />
                        <p className="text-muted-foreground mb-1">Үйлчилгээний бүртгэл хоосон</p>
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
                                    <th className="px-4 py-3 font-medium">Хариуцагч</th>
                                    <th className="px-4 py-3 font-medium">Огноо</th>
                                    <th className="px-4 py-3 font-medium">Төлөв</th>
                                    <th className="px-4 py-3 font-medium">Үйлдэл</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const typeInfo = TYPE_LABELS[log.type] || TYPE_LABELS.other;
                                    const prioInfo = PRIORITY_LABELS[log.priority] || PRIORITY_LABELS.medium;
                                    const statusInfo = STATUS_LABELS[log.status] || STATUS_LABELS.open;

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
                                            <td className="px-4 py-3 text-foreground text-xs">
                                                {log.assigned_to || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs">
                                                {formatDate(log.created_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill variant={statusInfo.variant}>
                                                    {statusInfo.text}
                                                </StatusPill>
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
            />
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function NewServiceLogModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Record<string, string>) => void;
}) {
    const [form, setForm] = useState({
        subject: '',
        description: '',
        type: 'inquiry',
        priority: 'medium',
        customer_name: '',
        customer_phone: '',
        assigned_to: '',
    });
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.subject.trim()) return;
        setSubmitting(true);
        await onSubmit(form);
        setSubmitting(false);
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
                        Шинэ үйлчилгээний хүсэлт бүртгэх форм
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
                                    <SelectItem value="inquiry">Лавлагаа</SelectItem>
                                    <SelectItem value="complaint">Гомдол</SelectItem>
                                    <SelectItem value="maintenance">Засвар</SelectItem>
                                    <SelectItem value="payment">Төлбөр</SelectItem>
                                    <SelectItem value="handover">Хүлээлцэх</SelectItem>
                                    <SelectItem value="other">Бусад</SelectItem>
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
                                    <SelectItem value="low">Бага</SelectItem>
                                    <SelectItem value="medium">Дунд</SelectItem>
                                    <SelectItem value="high">Өндөр</SelectItem>
                                    <SelectItem value="urgent">Яаралтай</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>

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

                    <FormField label="Хариуцагч" htmlFor="cs-assigned-to">
                        <input
                            id="cs-assigned-to"
                            type="text"
                            value={form.assigned_to}
                            onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                            placeholder="Менежерийн нэр"
                            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        />
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
