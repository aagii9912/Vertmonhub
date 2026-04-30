'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Headphones, AlertTriangle, CheckCircle2, Clock, TrendingUp,
    DollarSign, Star, Loader2, Plus, Search, Filter,
    Phone, User, FileText, MessageSquare, Wrench, ArrowRight,
    BarChart3, ThumbsUp,
} from 'lucide-react';

const SHOP_KEY = 'vertmonhub_active_shop_id';

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

const TYPE_LABELS: Record<string, { text: string; icon: React.ReactNode; cls: string }> = {
    inquiry: { text: 'Лавлагаа', icon: <MessageSquare className="w-3 h-3" />, cls: 'bg-status-info-soft text-status-info' },
    complaint: { text: 'Гомдол', icon: <AlertTriangle className="w-3 h-3" />, cls: 'bg-status-danger-soft text-status-danger' },
    maintenance: { text: 'Засвар', icon: <Wrench className="w-3 h-3" />, cls: 'bg-status-pending-soft text-status-pending' },
    handover: { text: 'Хүлээлцэх', icon: <ArrowRight className="w-3 h-3" />, cls: 'bg-status-success-soft text-status-success' },
    payment: { text: 'Төлбөр', icon: <DollarSign className="w-3 h-3" />, cls: 'bg-brand-soft text-brand' },
    other: { text: 'Бусад', icon: <FileText className="w-3 h-3" />, cls: 'bg-surface-2/10 text-muted-foreground/70' },
};

const PRIORITY_LABELS: Record<string, { text: string; cls: string }> = {
    low: { text: 'Бага', cls: 'bg-surface-2/10 text-muted-foreground/70' },
    medium: { text: 'Дунд', cls: 'bg-status-info-soft text-status-info' },
    high: { text: 'Өндөр', cls: 'bg-status-pending-soft text-status-pending' },
    urgent: { text: 'Яаралтай', cls: 'bg-status-danger-soft text-status-danger' },
};

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
    open: { text: 'Нээлттэй', cls: 'bg-status-info-soft text-status-info border-status-info/30' },
    in_progress: { text: 'Ажиллаж буй', cls: 'bg-status-pending-soft text-status-pending border-status-pending/30' },
    resolved: { text: 'Шийдвэрлэсэн', cls: 'bg-status-success-soft text-status-success border-status-success/30' },
    closed: { text: 'Хаагдсан', cls: 'bg-surface-2/10 text-muted-foreground/70 border-border/30' },
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
    return d.toLocaleDateString('mn-MN');
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
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        );
    }

    const k = kpi || {} as KPI;

    return (
        <div className="min-h-screen bg-[#0a0a0f] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
                            <Headphones className="w-6 h-6 text-brand" />
                            Үйлчилгээний хяналт
                        </h1>
                        <p className="text-white/40 text-sm mt-1">
                            Гэрээний хяналт, төлбөрийн хоцрогдол, хүсэлт/гомдлын удирдлага
                        </p>
                    </div>
                    <button
                        onClick={() => setShowNewForm(true)}
                        className="px-4 py-2 rounded-lg bg-brand hover:bg-brand text-white text-sm font-medium flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Шинэ хүсэлт
                    </button>
                </div>

                {/* KPI Cards - Row 1: Гэрээ & Төлбөр */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <KPICard
                        icon={<FileText className="w-4 h-4 text-status-info" />}
                        label="Идэвхтэй гэрээ"
                        value={String(k.active_contracts || 0)}
                        sub={`Нийт ${k.total_contracts || 0} / ${k.closed_contracts || 0} хаагдсан`}
                    />
                    <KPICard
                        icon={<DollarSign className="w-4 h-4 text-status-success" />}
                        label="Цуглуулалт"
                        value={`${k.collection_rate || 0}%`}
                        sub={formatMoney(k.total_collected || 0)}
                        accent="emerald"
                    />
                    <KPICard
                        icon={<AlertTriangle className="w-4 h-4 text-status-danger" />}
                        label="Хоцорсон төлбөр"
                        value={formatMoney(k.total_overdue_amount || 0)}
                        sub={`${k.overdue_contract_count || 0} гэрээ`}
                        accent="red"
                    />
                    <KPICard
                        icon={<Clock className="w-4 h-4 text-status-pending" />}
                        label="Ирэх 7 хоногт"
                        value={`${k.upcoming_payments_7d || 0} төлбөр`}
                        sub={`${k.overdue_payments || 0} хоцорсон`}
                        accent="amber"
                    />
                </div>

                {/* KPI Cards - Row 2: Үйлчилгээ & Сэтгэл ханамж */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <KPICard
                        icon={<Headphones className="w-4 h-4 text-brand" />}
                        label="Нээлттэй хүсэлт"
                        value={String(k.open_requests || 0)}
                        sub={`Нийт ${k.total_requests || 0} / ${k.resolved_requests || 0} шийдвэрлэсэн`}
                        accent="violet"
                    />
                    <KPICard
                        icon={<Clock className="w-4 h-4 text-status-info" />}
                        label="Дундаж шийдвэрлэх"
                        value={k.avg_resolution_hours ? `${k.avg_resolution_hours} цаг` : '—'}
                        accent="sky"
                    />
                    <KPICard
                        icon={<ThumbsUp className="w-4 h-4 text-status-success" />}
                        label="NPS"
                        value={k.nps !== null ? String(k.nps) : '—'}
                        sub={k.total_surveys > 0 ? `${k.total_surveys} судалгаа` : 'Мэдээлэл алга'}
                        accent="emerald"
                    />
                    <KPICard
                        icon={<Star className="w-4 h-4 text-status-pending" />}
                        label="CSAT"
                        value={k.avg_csat !== null ? `${k.avg_csat}/5` : '—'}
                        sub={k.avg_service_rating ? `Үнэлгээ: ${k.avg_service_rating}/5` : undefined}
                        accent="amber"
                    />
                </div>

                {/* Filters */}
                <div className="bg-[#11111a] rounded-xl border border-white/[0.06] p-3 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input
                                type="text"
                                placeholder="Хүсэлт, нэр, утас хайх..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-surface/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder:text-white/30 focus:border-brand/40 outline-none"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 bg-surface/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 outline-none"
                        >
                            <option value="">Бүх төлөв</option>
                            <option value="open">Нээлттэй</option>
                            <option value="in_progress">Ажиллаж буй</option>
                            <option value="resolved">Шийдвэрлэсэн</option>
                            <option value="closed">Хаагдсан</option>
                        </select>
                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}
                            className="px-3 py-2 bg-surface/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 outline-none"
                        >
                            <option value="">Бүх төрөл</option>
                            <option value="inquiry">Лавлагаа</option>
                            <option value="complaint">Гомдол</option>
                            <option value="maintenance">Засвар</option>
                            <option value="payment">Төлбөр</option>
                            <option value="handover">Хүлээлцэх</option>
                        </select>
                    </div>
                </div>

                {/* Service Logs Table */}
                <div className="bg-[#11111a] rounded-xl border border-white/[0.06] overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-brand" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Headphones className="w-12 h-12 text-white/15 mb-3" />
                            <p className="text-white/60 mb-1">Үйлчилгээний бүртгэл хоосон</p>
                            <p className="text-white/30 text-sm mb-4">
                                Шинэ хүсэлт эсвэл гомдол бүртгэлнэ үү
                            </p>
                            <button
                                onClick={() => setShowNewForm(true)}
                                className="px-4 py-2 bg-brand hover:bg-brand text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
                            >
                                <Plus className="w-4 h-4" /> Шинэ хүсэлт
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
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
                                            <tr key={log.id} className="border-b border-white/[0.03] hover:bg-surface/[0.02]">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-white/90 max-w-[200px] truncate">
                                                        {log.subject}
                                                    </div>
                                                    {log.description && (
                                                        <div className="text-[11px] text-white/40 max-w-[200px] truncate">
                                                            {log.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-white/80 flex items-center gap-1.5">
                                                        <User className="w-3 h-3 text-white/30" />
                                                        {log.customer_name || '—'}
                                                    </div>
                                                    {log.customer_phone && (
                                                        <div className="text-[11px] text-white/40 flex items-center gap-1">
                                                            <Phone className="w-2.5 h-2.5" />
                                                            {log.customer_phone}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${typeInfo.cls}`}>
                                                        {typeInfo.icon} {typeInfo.text}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${prioInfo.cls}`}>
                                                        {prioInfo.text}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-white/70 text-xs">
                                                    {log.assigned_to || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-white/50 text-xs">
                                                    {formatDate(log.created_at)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusInfo.cls}`}>
                                                        {statusInfo.text}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(log.status === 'open' || log.status === 'in_progress') && (
                                                        <div className="flex gap-1">
                                                            {log.status === 'open' && (
                                                                <button
                                                                    onClick={() => updateLogStatus(log.id, 'in_progress')}
                                                                    className="px-2 py-1 rounded text-[10px] bg-status-pending-soft text-status-pending hover:bg-status-pending/20"
                                                                >
                                                                    Эхлэх
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => updateLogStatus(log.id, 'resolved')}
                                                                className="px-2 py-1 rounded text-[10px] bg-status-success-soft text-status-success hover:bg-status-success-soft"
                                                            >
                                                                Шийдсэн
                                                            </button>
                                                        </div>
                                                    )}
                                                    {log.satisfaction_rating && (
                                                        <div className="flex items-center gap-0.5 mt-1">
                                                            {[1, 2, 3, 4, 5].map(s => (
                                                                <Star
                                                                    key={s}
                                                                    className={`w-3 h-3 ${s <= log.satisfaction_rating! ? 'text-status-pending fill-amber-400' : 'text-white/10'}`}
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
            </div>

            {/* New Service Log Modal */}
            {showNewForm && (
                <NewServiceLogModal
                    onClose={() => setShowNewForm(false)}
                    onSubmit={createServiceLog}
                />
            )}
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function KPICard({ icon, label, value, sub, accent }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <div className="bg-[#11111a] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 text-[11px] uppercase tracking-wider mb-1.5">
                {icon}
                {label}
            </div>
            <div className="text-white/90 text-lg font-semibold tabular-nums">{value}</div>
            {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
        </div>
    );
}

function NewServiceLogModal({ onClose, onSubmit }: {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-lg bg-[#11111a] border border-white/[0.08] rounded-2xl p-6"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-brand" />
                    Шинэ хүсэлт бүртгэх
                </h2>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-white/50 text-xs mb-1">Гарчиг *</label>
                        <input
                            type="text"
                            value={form.subject}
                            onChange={e => setForm({ ...form, subject: e.target.value })}
                            placeholder="Хүсэлтийн товч тайлбар"
                            className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-brand/40"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-white/50 text-xs mb-1">Төрөл</label>
                            <select
                                value={form.type}
                                onChange={e => setForm({ ...form, type: e.target.value })}
                                className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/80 outline-none"
                            >
                                <option value="inquiry">Лавлагаа</option>
                                <option value="complaint">Гомдол</option>
                                <option value="maintenance">Засвар</option>
                                <option value="payment">Төлбөр</option>
                                <option value="handover">Хүлээлцэх</option>
                                <option value="other">Бусад</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-white/50 text-xs mb-1">Чухлал</label>
                            <select
                                value={form.priority}
                                onChange={e => setForm({ ...form, priority: e.target.value })}
                                className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/80 outline-none"
                            >
                                <option value="low">Бага</option>
                                <option value="medium">Дунд</option>
                                <option value="high">Өндөр</option>
                                <option value="urgent">Яаралтай</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-white/50 text-xs mb-1">Харилцагчийн нэр</label>
                            <input
                                type="text"
                                value={form.customer_name}
                                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                                className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-white/50 text-xs mb-1">Утас</label>
                            <input
                                type="text"
                                value={form.customer_phone}
                                onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                                className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-white/50 text-xs mb-1">Хариуцагч</label>
                        <input
                            type="text"
                            value={form.assigned_to}
                            onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                            placeholder="Менежерийн нэр"
                            className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 placeholder:text-white/30 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-white/50 text-xs mb-1">Дэлгэрэнгүй</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 bg-surface/[0.04] border border-white/[0.08] rounded-lg text-sm text-white/90 outline-none resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-white/50 text-sm hover:text-white/70"
                        >
                            Болих
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !form.subject.trim()}
                            className="px-4 py-2 bg-brand hover:bg-brand text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Бүртгэх
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
