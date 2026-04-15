'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    Search, Upload, FileText, Loader2, Filter, AlertCircle,
    TrendingUp, CheckCircle2, Clock, X, Trash2, Phone, IdCard,
    Building2, User, Calendar, DollarSign, Download,
} from 'lucide-react';
import type { PropertyContract, ContractStats } from '@/types/property';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface ApiResponse {
    contracts: PropertyContract[];
    stats: ContractStats;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
    active: { text: 'Идэвхтэй', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    closed: { text: 'Хаагдсан', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    cancelled: { text: 'Цуцалсан', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

function formatMoney(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
}

function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleDateString('mn-MN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return s;
    }
}

function shopHeaders(): HeadersInit {
    return {
        'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '',
    };
}

export default function ContractsPage() {
    const [contracts, setContracts] = useState<PropertyContract[]>([]);
    const [stats, setStats] = useState<ContractStats>({
        total: 0, closed: 0, active: 0,
        total_sales: 0, total_paid: 0, total_balance: 0, overdue_count: 0,
    });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [selected, setSelected] = useState<PropertyContract | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchContracts = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (overdueOnly) params.set('overdue', '1');

            const res = await fetch(`/api/dashboard/contracts?${params}`, {
                headers: shopHeaders(),
            });
            const data: ApiResponse = await res.json();
            setContracts(data.contracts || []);
            setStats(data.stats || stats);
        } catch (err) {
            console.error('[Contracts] fetch error:', err);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, statusFilter, overdueOnly]);

    useEffect(() => {
        const t = setTimeout(fetchContracts, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [fetchContracts, search]);

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportMsg(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/dashboard/contracts', {
                method: 'POST',
                headers: shopHeaders(),
                body: fd,
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setImportMsg({ type: 'ok', text: data.message });
                fetchContracts();
            } else {
                setImportMsg({ type: 'err', text: data.message || data.error || 'Импорт амжилтгүй' });
            }
        } catch (err) {
            setImportMsg({ type: 'err', text: (err as Error).message });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTimeout(() => setImportMsg(null), 6000);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Энэ гэрээг устгах уу?')) return;
        try {
            const res = await fetch(`/api/dashboard/contracts/${id}`, {
                method: 'DELETE',
                headers: shopHeaders(),
            });
            if (!res.ok) throw new Error('Failed');
            setSelected(null);
            fetchContracts();
        } catch (err) {
            alert('Устгахад алдаа гарлаа: ' + (err as Error).message);
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Гэрээний бүртгэл</h1>
                        <p className="text-white/40 text-sm mt-1">
                            Үл хөдлөх хөрөнгийн борлуулалтын гэрээ, төлбөрийн төлөв
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/dashboard/contracts/generate"
                            className="px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] text-white/70 text-sm flex items-center gap-1.5"
                        >
                            <FileText className="w-4 h-4" /> Гэрээ үүсгэх
                        </Link>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing}
                            className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {importing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            Excel импорт
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                    </div>
                </div>

                {/* Import message */}
                {importMsg && (
                    <div
                        className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
                            importMsg.type === 'ok'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                    >
                        {importMsg.type === 'ok' ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : (
                            <AlertCircle className="w-4 h-4" />
                        )}
                        {importMsg.text}
                    </div>
                )}

                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <StatCard
                        icon={<FileText className="w-4 h-4 text-blue-400" />}
                        label="Нийт гэрээ"
                        value={stats.total.toString()}
                        sub={`${stats.active} идэвхтэй / ${stats.closed} хаагдсан`}
                    />
                    <StatCard
                        icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                        label="Нийт борлуулалт"
                        value={formatMoney(stats.total_sales)}
                    />
                    <StatCard
                        icon={<DollarSign className="w-4 h-4 text-amber-400" />}
                        label="Цуглуулсан"
                        value={formatMoney(stats.total_paid)}
                        sub={
                            stats.total_sales > 0
                                ? `${Math.round((stats.total_paid / stats.total_sales) * 100)}%`
                                : undefined
                        }
                    />
                    <StatCard
                        icon={<Clock className="w-4 h-4 text-red-400" />}
                        label="Үлдэгдэл / хоцролт"
                        value={formatMoney(stats.total_balance)}
                        sub={`${stats.overdue_count} хоцролттой`}
                    />
                </div>

                {/* Filters */}
                <div className="bg-[#11111a] rounded-xl border border-white/[0.06] p-3 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input
                                type="text"
                                placeholder="Гэрээний дугаар, нэр, утас, регистр..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 placeholder:text-white/30 focus:border-violet-500/40 outline-none"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-sm text-white/80 focus:border-violet-500/40 outline-none"
                        >
                            <option value="">Бүх төлөв</option>
                            <option value="active">Идэвхтэй</option>
                            <option value="closed">Хаагдсан</option>
                            <option value="cancelled">Цуцалсан</option>
                        </select>
                        <button
                            onClick={() => setOverdueOnly(!overdueOnly)}
                            className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1.5 transition-colors ${
                                overdueOnly
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                    : 'bg-white/[0.04] text-white/60 border-white/[0.06] hover:bg-white/[0.06]'
                            }`}
                        >
                            <Filter className="w-3.5 h-3.5" /> Хоцролттой
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-[#11111a] rounded-xl border border-white/[0.06] overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                        </div>
                    ) : contracts.length === 0 ? (
                        <EmptyState onImport={() => fileInputRef.current?.click()} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                                        <th className="px-4 py-3 font-medium">Гэрээ</th>
                                        <th className="px-4 py-3 font-medium">Худалдан авагч</th>
                                        <th className="px-4 py-3 font-medium">Байр</th>
                                        <th className="px-4 py-3 font-medium text-right">Үнэ</th>
                                        <th className="px-4 py-3 font-medium text-right">Төлсөн</th>
                                        <th className="px-4 py-3 font-medium">Менежер</th>
                                        <th className="px-4 py-3 font-medium">Төлөв</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contracts.map(c => {
                                        const status = STATUS_LABEL[c.contract_status] || STATUS_LABEL.active;
                                        const paidPct =
                                            c.total_price && c.total_price > 0
                                                ? Math.round(((c.paid_amount || 0) / c.total_price) * 100)
                                                : 0;
                                        return (
                                            <tr
                                                key={c.id}
                                                onClick={() => setSelected(c)}
                                                className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-white/90">{c.contract_number || '—'}</div>
                                                    <div className="text-[11px] text-white/40">{formatDate(c.contract_date)}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-white/80">{c.customer_name || '—'}</div>
                                                    <div className="text-[11px] text-white/40">{c.customer_phone || ''}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-white/80">
                                                        Блок {c.block_name || '—'} / {c.unit_number || c.legacy_unit_number || '—'}
                                                    </div>
                                                    <div className="text-[11px] text-white/40">
                                                        {c.floor || ''} {c.rooms ? `· ${c.rooms} өрөө` : ''}
                                                        {c.contracted_area ? ` · ${c.contracted_area}м²` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-white/80 tabular-nums">
                                                    {formatMoney(c.total_price)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="text-white/80 tabular-nums">{formatMoney(c.paid_amount)}</div>
                                                    <div className="text-[11px] text-white/40">
                                                        {paidPct}%
                                                        {c.overdue_days && c.overdue_days > 0 ? (
                                                            <span className="text-red-400 ml-1">· {c.overdue_days} хоног</span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-white/70">{c.sales_manager || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${status.cls}`}>
                                                        {status.text}
                                                    </span>
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

            {/* Detail drawer */}
            {selected && (
                <ContractDrawer
                    contract={selected}
                    onClose={() => setSelected(null)}
                    onDelete={() => handleDelete(selected.id)}
                />
            )}
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function StatCard({
    icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
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

function EmptyState({ onImport }: { onImport: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-12 h-12 text-white/15 mb-3" />
            <p className="text-white/60 mb-1">Одоогоор гэрээ алга</p>
            <p className="text-white/30 text-sm mb-4">
                Excel файлаа оруулж бүх гэрээгээ нэг дор удирдаарай
            </p>
            <button
                onClick={onImport}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
            >
                <Upload className="w-4 h-4" /> Excel импорт хийх
            </button>
        </div>
    );
}

function ContractDrawer({
    contract: c,
    onClose,
    onDelete,
}: {
    contract: PropertyContract;
    onClose: () => void;
    onDelete: () => void;
}) {
    const [activeTab, setActiveTab] = useState<'info' | 'payments' | 'service' | 'handover'>('info');
    const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
    const [serviceLogs, setServiceLogs] = useState<Array<Record<string, unknown>>>([]);
    const [handovers, setHandovers] = useState<Array<Record<string, unknown>>>([]);
    const [tabLoading, setTabLoading] = useState(false);

    const status = STATUS_LABEL[c.contract_status] || STATUS_LABEL.active;
    const paidPct =
        c.total_price && c.total_price > 0
            ? Math.round(((c.paid_amount || 0) / c.total_price) * 100)
            : 0;

    useEffect(() => {
        if (activeTab === 'payments') {
            setTabLoading(true);
            fetch(`/api/dashboard/contracts/${c.id}/payments`, { headers: shopHeaders() })
                .then(r => r.json())
                .then(d => setPayments(d.payments || []))
                .finally(() => setTabLoading(false));
        } else if (activeTab === 'service') {
            setTabLoading(true);
            fetch(`/api/dashboard/service-logs?search=${encodeURIComponent(c.customer_phone || c.customer_name || '')}`, { headers: shopHeaders() })
                .then(r => r.json())
                .then(d => setServiceLogs(d.logs || []))
                .finally(() => setTabLoading(false));
        } else if (activeTab === 'handover') {
            setTabLoading(true);
            fetch(`/api/dashboard/handover?contract_id=${c.id}`, { headers: shopHeaders() })
                .then(r => r.json())
                .then(d => setHandovers(d.records || []))
                .finally(() => setTabLoading(false));
        }
    }, [activeTab, c.id, c.customer_phone, c.customer_name]);

    const tabs = [
        { id: 'info' as const, label: 'Мэдээлэл', icon: <FileText className="w-3.5 h-3.5" /> },
        { id: 'payments' as const, label: 'Төлбөр', icon: <DollarSign className="w-3.5 h-3.5" /> },
        { id: 'service' as const, label: 'Үйлчилгээ', icon: <Phone className="w-3.5 h-3.5" /> },
        { id: 'handover' as const, label: 'Хүлээлцэх', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-xl bg-[#0d0d14] border-l border-white/[0.06] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-[#0d0d14] border-b border-white/[0.06] px-5 py-4 z-10">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-semibold">{c.contract_number || '—'}</div>
                            <div className="text-[11px] text-white/40 mt-0.5">{formatDate(c.contract_date)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-md text-[11px] font-medium border ${status.cls}`}>
                                {status.text}
                            </span>
                            <button
                                onClick={onDelete}
                                className="p-1.5 hover:bg-red-500/10 rounded-md text-white/30 hover:text-red-400"
                                title="Устгах"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-white/[0.06] rounded-md text-white/40"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-3">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                                }`}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {activeTab === 'info' && (
                        <>
                            {/* Худалдан авагч */}
                            <Section icon={<User className="w-4 h-4 text-violet-400" />} title="Худалдан авагч">
                                <Field label="Нэр" value={c.customer_name} />
                                <Field label="Регистрийн дугаар" value={c.customer_registration} icon={<IdCard className="w-3 h-3" />} />
                                <Field label="Утас" value={c.customer_phone} icon={<Phone className="w-3 h-3" />} />
                            </Section>

                            {/* Орон сууц */}
                            <Section icon={<Building2 className="w-4 h-4 text-emerald-400" />} title="Орон сууц">
                                <Field label="Барилга / Блок" value={`${c.building_number || '—'} / Блок ${c.block_name || '—'}`} />
                                <Field label="Шинэ тоот / Тоот" value={`${c.unit_number || '—'} / ${c.legacy_unit_number || '—'}`} />
                                <Field label="Сууцны тэмдэглэгээ" value={c.unit_label} />
                                <Field label="Давхар" value={c.floor} />
                                <Field label="Загвар / Төрөл" value={`${c.model || '—'} / ${c.unit_type || '—'}`} />
                                <Field label="Өрөөний тоо" value={c.rooms ? `${c.rooms} өрөө` : null} />
                                <Field label="Талбай" value={c.contracted_area ? `${c.contracted_area} м²` : null} />
                            </Section>

                            {/* Үнэ ба төлбөр */}
                            <Section icon={<DollarSign className="w-4 h-4 text-amber-400" />} title="Үнэ ба төлбөр">
                                <Field label="1-р үнэ" value={c.first_price ? formatMoney(c.first_price) : null} />
                                <Field label="Нийт үнэ" value={formatMoney(c.total_price)} />
                                <Field label="Урьдчилгаа %" value={c.prepayment_percent ? `${c.prepayment_percent}%` : null} />
                                <Field label="Урьдчилгааны нөхцөл" value={c.prepayment_condition} />
                                <Field label="Төлөх урьдчилгаа" value={c.prepayment_due ? formatMoney(c.prepayment_due) : null} />
                                <Field label="Төлсөн (бэлэн)" value={c.prepayment_paid_cash ? formatMoney(c.prepayment_paid_cash) : null} />
                                <Field label="Төлсөн (бартер)" value={c.prepayment_paid_barter ? formatMoney(c.prepayment_paid_barter) : null} />
                                <Field label="Нийт төлсөн" value={formatMoney(c.paid_amount)} highlight />
                                <Field label="Төлсөн %" value={`${paidPct}%`} />
                                <Field label="Үлдэгдэл" value={formatMoney(c.balance)} highlight={(c.balance ?? 0) > 0} />
                                {c.overdue_days && c.overdue_days > 0 && (
                                    <Field label="Хоцролт" value={`${c.overdue_days} хоног`} danger />
                                )}
                                {c.total_price && c.total_price > 0 && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-[11px] text-white/40 mb-1">
                                            <span>Төлбөрийн явц</span>
                                            <span className="tabular-nums">{paidPct}%</span>
                                        </div>
                                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all"
                                                style={{ width: `${Math.min(paidPct, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </Section>

                            {/* Борлуулалт */}
                            <Section icon={<TrendingUp className="w-4 h-4 text-blue-400" />} title="Борлуулалт">
                                <Field label="Менежер" value={c.sales_manager} />
                                <Field label="Борлуулалтын төрөл" value={c.sales_channel} />
                                <Field label="Үлдэгдлийн нөхцөл" value={c.balance_payment_method} />
                            </Section>

                            {/* Огноо */}
                            <Section icon={<Calendar className="w-4 h-4 text-sky-400" />} title="Огноо">
                                <Field label="Гэрээ хийсэн" value={formatDate(c.contract_date)} />
                                <Field label="Захиалга" value={formatDate(c.order_date)} />
                                <Field label="Ашиглалтад орох" value={formatDate(c.commissioning_date)} />
                            </Section>
                        </>
                    )}

                    {activeTab === 'payments' && (
                        <PaymentsTab payments={payments} loading={tabLoading} contractId={c.id} />
                    )}

                    {activeTab === 'service' && (
                        <ServiceTab logs={serviceLogs} loading={tabLoading} />
                    )}

                    {activeTab === 'handover' && (
                        <HandoverTab records={handovers} loading={tabLoading} />
                    )}
                </div>
            </div>
        </div>
    );
}

/* Төлбөрийн хуваарь tab */
function PaymentsTab({ payments, loading, contractId }: {
    payments: Array<Record<string, unknown>>;
    loading: boolean;
    contractId: string;
}) {
    if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

    const PAYMENT_STATUS: Record<string, { text: string; cls: string }> = {
        pending: { text: 'Хүлээгдэж буй', cls: 'bg-blue-500/10 text-blue-400' },
        paid: { text: 'Төлөгдсөн', cls: 'bg-emerald-500/10 text-emerald-400' },
        overdue: { text: 'Хоцорсон', cls: 'bg-red-500/10 text-red-400' },
        partial: { text: 'Хэсэгчлэн', cls: 'bg-amber-500/10 text-amber-400' },
        cancelled: { text: 'Цуцлагдсан', cls: 'bg-gray-500/10 text-gray-400' },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white/80 text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" /> Төлбөрийн хуваарь
                </h3>
                <span className="text-[11px] text-white/40">{payments.length} бүртгэл</span>
            </div>

            {payments.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                    <DollarSign className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    Төлбөрийн хуваарь бүртгэгдээгүй
                </div>
            ) : (
                <div className="space-y-2">
                    {payments.map((p, i) => {
                        const st = PAYMENT_STATUS[String(p.status)] || PAYMENT_STATUS.pending;
                        return (
                            <div key={String(p.id) || i} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-white/80 text-sm font-medium">
                                        {String(p.label || `#${p.installment_number || i + 1} төлбөр`)}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${st.cls}`}>{st.text}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                                    <div className="text-white/40">Хугацаа:</div>
                                    <div className="text-white/70 tabular-nums">{p.due_date ? formatDate(String(p.due_date)) : '—'}</div>
                                    <div className="text-white/40">Дүн:</div>
                                    <div className="text-white/70 tabular-nums">{formatMoney(Number(p.amount) || 0)}</div>
                                    <div className="text-white/40">Төлсөн:</div>
                                    <div className="text-emerald-400 tabular-nums">{formatMoney(Number(p.paid_amount) || 0)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* Үйлчилгээний түүх tab */
function ServiceTab({ logs, loading }: {
    logs: Array<Record<string, unknown>>;
    loading: boolean;
}) {
    if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

    return (
        <div>
            <h3 className="text-white/80 text-sm font-semibold flex items-center gap-2 mb-3">
                <Phone className="w-4 h-4 text-violet-400" /> Үйлчилгээний түүх
            </h3>
            {logs.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                    <Phone className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    Бүртгэл алга
                </div>
            ) : (
                <div className="space-y-2">
                    {logs.map((log, i) => (
                        <div key={String(log.id) || i} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-white/80 text-sm font-medium truncate max-w-[200px]">
                                    {String(log.subject || '—')}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    log.status === 'resolved' || log.status === 'closed'
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-blue-500/10 text-blue-400'
                                }`}>
                                    {log.status === 'resolved' ? 'Шийдвэрлэсэн' :
                                     log.status === 'closed' ? 'Хаагдсан' :
                                     log.status === 'in_progress' ? 'Ажиллаж буй' : 'Нээлттэй'}
                                </span>
                            </div>
                            <div className="text-[11px] text-white/40">
                                {log.type === 'complaint' ? '🔴 Гомдол' :
                                 log.type === 'maintenance' ? '🔧 Засвар' :
                                 log.type === 'payment' ? '💰 Төлбөр' : '💬 Лавлагаа'}
                                {' · '}{log.created_at ? formatDate(String(log.created_at)) : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* Хүлээлгэн өгөх tab */
function HandoverTab({ records, loading }: {
    records: Array<Record<string, unknown>>;
    loading: boolean;
}) {
    if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

    return (
        <div>
            <h3 className="text-white/80 text-sm font-semibold flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Хүлээлгэн өгөх акт
            </h3>
            {records.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">
                    <CheckCircle2 className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    Хүлээлгэн өгсөн акт алга
                </div>
            ) : (
                <div className="space-y-2">
                    {records.map((rec, i) => {
                        const checklist = (rec.checklist || {}) as Record<string, unknown>;
                        const checkCount = Object.keys(checklist).length;
                        const doneCount = Object.values(checklist).filter(v => v === true).length;
                        return (
                            <div key={String(rec.id) || i} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white/80 text-sm font-medium">
                                        {rec.handover_date ? formatDate(String(rec.handover_date)) : 'Огноо тодорхойгүй'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                        rec.status === 'completed'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : rec.status === 'disputed'
                                            ? 'bg-red-500/10 text-red-400'
                                            : 'bg-blue-500/10 text-blue-400'
                                    }`}>
                                        {rec.status === 'completed' ? 'Дууссан' :
                                         rec.status === 'disputed' ? 'Маргаантай' : 'Хүлээгдэж буй'}
                                    </span>
                                </div>
                                {checkCount > 0 && (
                                    <div className="text-[11px] text-white/40">
                                        Шалгах хуудас: {doneCount}/{checkCount} бүрэн
                                    </div>
                                )}
                                {typeof rec.delivered_by === 'string' && rec.delivered_by && (
                                    <div className="text-[11px] text-white/40 mt-0.5">Хүлээлгэн өгсөн: {rec.delivered_by}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Section({
    icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2.5">
                {icon}
                <h3 className="text-white/80 text-sm font-semibold">{title}</h3>
            </div>
            <div className="space-y-1.5 pl-1">{children}</div>
        </div>
    );
}

function Field({
    label, value, icon, highlight, danger,
}: {
    label: string;
    value: string | number | null | undefined;
    icon?: React.ReactNode;
    highlight?: boolean;
    danger?: boolean;
}) {
    const display = value === null || value === undefined || value === '' ? '—' : String(value);
    return (
        <div className="flex items-start justify-between gap-3 text-sm py-1 border-b border-white/[0.03] last:border-0">
            <div className="flex items-center gap-1.5 text-white/40 text-[12px]">
                {icon}
                {label}
            </div>
            <div
                className={`text-right tabular-nums ${
                    danger
                        ? 'text-red-400 font-semibold'
                        : highlight
                        ? 'text-emerald-400 font-semibold'
                        : 'text-white/80'
                }`}
            >
                {display}
            </div>
        </div>
    );
}
