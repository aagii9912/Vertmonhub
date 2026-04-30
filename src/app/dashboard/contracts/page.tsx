'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search,
    Upload,
    FileText,
    AlertCircle,
    TrendingUp,
    CheckCircle2,
    Clock,
    X,
    Trash2,
    Phone,
    IdCard,
    Building2,
    User,
    Calendar,
    DollarSign,
} from 'lucide-react';
import type { PropertyContract, ContractStats } from '@/types/property';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterSelect } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { cn } from '@/lib/utils';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface ApiResponse {
    contracts: PropertyContract[];
    stats: ContractStats;
}

type StatusKey = 'active' | 'closed' | 'cancelled';

const STATUS_LABEL: Record<string, { text: string; variant: 'info' | 'success' | 'danger' }> = {
    active: { text: 'Идэвхтэй', variant: 'info' },
    closed: { text: 'Хаагдсан', variant: 'success' },
    cancelled: { text: 'Цуцалсан', variant: 'danger' },
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
        total: 0,
        closed: 0,
        active: 0,
        total_sales: 0,
        total_paid: 0,
        total_balance: 0,
        overdue_count: 0,
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
        <div>
            <PageHeader
                eyebrow="Гэрээ"
                title="Гэрээний бүртгэл"
                subtitle="Үл хөдлөх хөрөнгийн борлуулалтын гэрээ, төлбөрийн төлөв"
                primaryAction={
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                        variant="primary"
                        size="md"
                        isLoading={importing}
                    >
                        {!importing && <Upload className="w-4 h-4" />}
                        Excel импорт
                    </Button>
                }
                secondaryActions={
                    <Button href="/dashboard/contracts/generate" variant="secondary" size="md">
                        <FileText className="w-4 h-4" /> Гэрээ үүсгэх
                    </Button>
                }
            />
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
            />

            {/* Import message */}
            {importMsg && (
                <div
                    className={cn(
                        'mb-4 p-3 rounded-md flex items-center gap-2 text-sm border',
                        importMsg.type === 'ok'
                            ? 'bg-status-success-soft text-status-success border-status-success/30'
                            : 'bg-status-danger-soft text-status-danger border-status-danger/30',
                    )}
                >
                    {importMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {importMsg.text}
                </div>
            )}

            {/* Stats */}
            <StatBar columns={4}>
                <StatTile
                    label="Нийт гэрээ"
                    value={stats.total}
                    icon={<FileText className="w-4 h-4" />}
                    accent="info"
                    helper={`${stats.active} идэвхтэй / ${stats.closed} хаагдсан`}
                />
                <StatTile
                    label="Нийт борлуулалт"
                    value={formatMoney(stats.total_sales)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    accent="success"
                />
                <StatTile
                    label="Цуглуулсан"
                    value={formatMoney(stats.total_paid)}
                    icon={<DollarSign className="w-4 h-4" />}
                    accent="brand"
                    helper={
                        stats.total_sales > 0
                            ? `${Math.round((stats.total_paid / stats.total_sales) * 100)}%`
                            : undefined
                    }
                />
                <StatTile
                    label="Үлдэгдэл / хоцролт"
                    value={formatMoney(stats.total_balance)}
                    icon={<Clock className="w-4 h-4" />}
                    accent="danger"
                    helper={`${stats.overdue_count} хоцролттой`}
                />
            </StatBar>

            {/* Filters */}
            <FilterBar
                search={{
                    value: search,
                    onChange: setSearch,
                    placeholder: 'Гэрээний дугаар, нэр, утас, регистр...',
                }}
                showClear={search !== '' || statusFilter !== '' || overdueOnly}
                onClear={() => {
                    setSearch('');
                    setStatusFilter('');
                    setOverdueOnly(false);
                }}
            >
                <FilterSelect
                    label="Төлөв"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="">Бүх төлөв</option>
                    <option value="active">Идэвхтэй</option>
                    <option value="closed">Хаагдсан</option>
                    <option value="cancelled">Цуцалсан</option>
                </FilterSelect>
                <button
                    onClick={() => setOverdueOnly(!overdueOnly)}
                    className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5',
                        overdueOnly
                            ? 'bg-status-danger-soft text-status-danger border-status-danger/30'
                            : 'bg-background border-border text-muted-foreground hover:bg-surface-2',
                    )}
                >
                    <Clock className="w-3.5 h-3.5" /> Хоцролттой
                </button>
            </FilterBar>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Spinner size="lg" />
                        </div>
                    ) : contracts.length === 0 ? (
                        <div className="py-12">
                            <EmptyState
                                icon={<FileText className="w-7 h-7" />}
                                title="Одоогоор гэрээ алга"
                                description="Excel файлаа оруулж бүх гэрээгээ нэг дор удирдаарай"
                                action={
                                    <Button onClick={() => fileInputRef.current?.click()} variant="primary" size="sm">
                                        <Upload className="w-4 h-4" /> Excel импорт хийх
                                    </Button>
                                }
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
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
                                    {contracts.map((c) => {
                                        const status = STATUS_LABEL[c.contract_status] || STATUS_LABEL.active;
                                        const paidPct =
                                            c.total_price && c.total_price > 0
                                                ? Math.round(((c.paid_amount || 0) / c.total_price) * 100)
                                                : 0;
                                        return (
                                            <tr
                                                key={c.id}
                                                onClick={() => setSelected(c)}
                                                className="border-b border-border/40 hover:bg-surface-2/40 cursor-pointer transition-colors"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-foreground">{c.contract_number || '—'}</div>
                                                    <div className="text-[11px] text-muted-foreground">{formatDate(c.contract_date)}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-foreground">{c.customer_name || '—'}</div>
                                                    <div className="text-[11px] text-muted-foreground">{c.customer_phone || ''}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-foreground">
                                                        Блок {c.block_name || '—'} / {c.unit_number || c.legacy_unit_number || '—'}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {c.floor || ''} {c.rooms ? `· ${c.rooms} өрөө` : ''}
                                                        {c.contracted_area ? ` · ${c.contracted_area}м²` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-foreground tabular-nums">
                                                    {formatMoney(c.total_price)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="text-foreground tabular-nums">{formatMoney(c.paid_amount)}</div>
                                                    <div className="text-[11px] text-muted-foreground tabular-nums">
                                                        {paidPct}%
                                                        {c.overdue_days && c.overdue_days > 0 ? (
                                                            <span className="text-status-danger ml-1">· {c.overdue_days} хоног</span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-foreground">{c.sales_manager || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <Badge variant={status.variant} size="sm">
                                                        {status.text}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

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
                .then((r) => r.json())
                .then((d) => setPayments(d.payments || []))
                .finally(() => setTabLoading(false));
        } else if (activeTab === 'service') {
            setTabLoading(true);
            fetch(`/api/dashboard/service-logs?search=${encodeURIComponent(c.customer_phone || c.customer_name || '')}`, {
                headers: shopHeaders(),
            })
                .then((r) => r.json())
                .then((d) => setServiceLogs(d.logs || []))
                .finally(() => setTabLoading(false));
        } else if (activeTab === 'handover') {
            setTabLoading(true);
            fetch(`/api/dashboard/handover?contract_id=${c.id}`, { headers: shopHeaders() })
                .then((r) => r.json())
                .then((d) => setHandovers(d.records || []))
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
            <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-xl bg-surface border-l border-border overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 z-10">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="heading-section text-foreground">{c.contract_number || '—'}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{formatDate(c.contract_date)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant={status.variant}>{status.text}</Badge>
                            <button
                                onClick={onDelete}
                                className="p-1.5 hover:bg-status-danger-soft rounded-md text-muted-foreground hover:text-status-danger transition-colors"
                                title="Устгах"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                                    activeTab === tab.id
                                        ? 'bg-brand-soft text-brand-strong'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
                                )}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {activeTab === 'info' && (
                        <>
                            <Section icon={<User className="w-4 h-4 text-brand" />} title="Худалдан авагч">
                                <Field label="Нэр" value={c.customer_name} />
                                <Field label="Регистрийн дугаар" value={c.customer_registration} icon={<IdCard className="w-3 h-3" />} />
                                <Field label="Утас" value={c.customer_phone} icon={<Phone className="w-3 h-3" />} />
                            </Section>

                            <Section icon={<Building2 className="w-4 h-4 text-status-success" />} title="Орон сууц">
                                <Field label="Барилга / Блок" value={`${c.building_number || '—'} / Блок ${c.block_name || '—'}`} />
                                <Field label="Шинэ тоот / Тоот" value={`${c.unit_number || '—'} / ${c.legacy_unit_number || '—'}`} />
                                <Field label="Сууцны тэмдэглэгээ" value={c.unit_label} />
                                <Field label="Давхар" value={c.floor} />
                                <Field label="Загвар / Төрөл" value={`${c.model || '—'} / ${c.unit_type || '—'}`} />
                                <Field label="Өрөөний тоо" value={c.rooms ? `${c.rooms} өрөө` : null} />
                                <Field label="Талбай" value={c.contracted_area ? `${c.contracted_area} м²` : null} />
                            </Section>

                            <Section icon={<DollarSign className="w-4 h-4 text-status-pending" />} title="Үнэ ба төлбөр">
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
                                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                                            <span>Төлбөрийн явц</span>
                                            <span className="tabular-nums">{paidPct}%</span>
                                        </div>
                                        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-brand rounded-full transition-all"
                                                style={{ width: `${Math.min(paidPct, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </Section>

                            <Section icon={<TrendingUp className="w-4 h-4 text-status-info" />} title="Борлуулалт">
                                <Field label="Менежер" value={c.sales_manager} />
                                <Field label="Борлуулалтын төрөл" value={c.sales_channel} />
                                <Field label="Үлдэгдлийн нөхцөл" value={c.balance_payment_method} />
                            </Section>

                            <Section icon={<Calendar className="w-4 h-4 text-status-info" />} title="Огноо">
                                <Field label="Гэрээ хийсэн" value={formatDate(c.contract_date)} />
                                <Field label="Захиалга" value={formatDate(c.order_date)} />
                                <Field label="Ашиглалтад орох" value={formatDate(c.commissioning_date)} />
                            </Section>
                        </>
                    )}

                    {activeTab === 'payments' && (
                        <PaymentsTab payments={payments} loading={tabLoading} />
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

function PaymentsTab({ payments, loading }: { payments: Array<Record<string, unknown>>; loading: boolean }) {
    if (loading)
        return (
            <div className="flex justify-center py-10">
                <Spinner size="md" />
            </div>
        );

    const PAYMENT_STATUS: Record<string, { text: string; variant: 'info' | 'success' | 'danger' | 'warning' | 'default' }> = {
        pending: { text: 'Хүлээгдэж буй', variant: 'info' },
        paid: { text: 'Төлөгдсөн', variant: 'success' },
        overdue: { text: 'Хоцорсон', variant: 'danger' },
        partial: { text: 'Хэсэгчлэн', variant: 'warning' },
        cancelled: { text: 'Цуцлагдсан', variant: 'default' },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="heading-section text-sm text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-status-pending" /> Төлбөрийн хуваарь
                </h3>
                <span className="text-[11px] text-muted-foreground">{payments.length} бүртгэл</span>
            </div>

            {payments.length === 0 ? (
                <EmptyState icon={<DollarSign className="w-7 h-7" />} title="Төлбөрийн хуваарь бүртгэгдээгүй" />
            ) : (
                <div className="space-y-2">
                    {payments.map((p, i) => {
                        const st = PAYMENT_STATUS[String(p.status)] || PAYMENT_STATUS.pending;
                        return (
                            <div key={String(p.id) || i} className="bg-surface-2/40 border border-border rounded-md p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-foreground text-sm font-medium">
                                        {String(p.label || `#${p.installment_number || i + 1} төлбөр`)}
                                    </span>
                                    <Badge variant={st.variant} size="sm">
                                        {st.text}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                                    <div className="text-muted-foreground">Хугацаа:</div>
                                    <div className="text-foreground tabular-nums">
                                        {p.due_date ? formatDate(String(p.due_date)) : '—'}
                                    </div>
                                    <div className="text-muted-foreground">Дүн:</div>
                                    <div className="text-foreground tabular-nums">{formatMoney(Number(p.amount) || 0)}</div>
                                    <div className="text-muted-foreground">Төлсөн:</div>
                                    <div className="text-status-success tabular-nums">{formatMoney(Number(p.paid_amount) || 0)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ServiceTab({ logs, loading }: { logs: Array<Record<string, unknown>>; loading: boolean }) {
    if (loading)
        return (
            <div className="flex justify-center py-10">
                <Spinner size="md" />
            </div>
        );

    return (
        <div>
            <h3 className="heading-section text-sm text-foreground flex items-center gap-2 mb-3">
                <Phone className="w-4 h-4 text-brand" /> Үйлчилгээний түүх
            </h3>
            {logs.length === 0 ? (
                <EmptyState icon={<Phone className="w-7 h-7" />} title="Бүртгэл алга" />
            ) : (
                <div className="space-y-2">
                    {logs.map((log, i) => (
                        <div key={String(log.id) || i} className="bg-surface-2/40 border border-border rounded-md p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-foreground text-sm font-medium truncate max-w-[200px]">
                                    {String(log.subject || '—')}
                                </span>
                                <Badge
                                    variant={
                                        log.status === 'resolved' || log.status === 'closed' ? 'success' : 'info'
                                    }
                                    size="sm"
                                >
                                    {log.status === 'resolved'
                                        ? 'Шийдвэрлэсэн'
                                        : log.status === 'closed'
                                          ? 'Хаагдсан'
                                          : log.status === 'in_progress'
                                            ? 'Ажиллаж буй'
                                            : 'Нээлттэй'}
                                </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {log.type === 'complaint'
                                    ? '🔴 Гомдол'
                                    : log.type === 'maintenance'
                                      ? '🔧 Засвар'
                                      : log.type === 'payment'
                                        ? '💰 Төлбөр'
                                        : '💬 Лавлагаа'}
                                {' · '}
                                {log.created_at ? formatDate(String(log.created_at)) : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function HandoverTab({ records, loading }: { records: Array<Record<string, unknown>>; loading: boolean }) {
    if (loading)
        return (
            <div className="flex justify-center py-10">
                <Spinner size="md" />
            </div>
        );

    return (
        <div>
            <h3 className="heading-section text-sm text-foreground flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-status-success" /> Хүлээлгэн өгөх акт
            </h3>
            {records.length === 0 ? (
                <EmptyState icon={<CheckCircle2 className="w-7 h-7" />} title="Хүлээлгэн өгсөн акт алга" />
            ) : (
                <div className="space-y-2">
                    {records.map((rec, i) => {
                        const checklist = (rec.checklist || {}) as Record<string, unknown>;
                        const checkCount = Object.keys(checklist).length;
                        const doneCount = Object.values(checklist).filter((v) => v === true).length;
                        return (
                            <div key={String(rec.id) || i} className="bg-surface-2/40 border border-border rounded-md p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-foreground text-sm font-medium">
                                        {rec.handover_date ? formatDate(String(rec.handover_date)) : 'Огноо тодорхойгүй'}
                                    </span>
                                    <Badge
                                        variant={
                                            rec.status === 'completed'
                                                ? 'success'
                                                : rec.status === 'disputed'
                                                  ? 'danger'
                                                  : 'info'
                                        }
                                        size="sm"
                                    >
                                        {rec.status === 'completed'
                                            ? 'Дууссан'
                                            : rec.status === 'disputed'
                                              ? 'Маргаантай'
                                              : 'Хүлээгдэж буй'}
                                    </Badge>
                                </div>
                                {checkCount > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                        Шалгах хуудас: {doneCount}/{checkCount} бүрэн
                                    </div>
                                )}
                                {typeof rec.delivered_by === 'string' && rec.delivered_by && (
                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                        Хүлээлгэн өгсөн: {rec.delivered_by}
                                    </div>
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
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2.5">
                {icon}
                <h3 className="heading-section text-sm text-foreground">{title}</h3>
            </div>
            <div className="space-y-1.5 pl-1">{children}</div>
        </div>
    );
}

function Field({
    label,
    value,
    icon,
    highlight,
    danger,
}: {
    label: string;
    value: string | number | null | undefined;
    icon?: React.ReactNode;
    highlight?: boolean;
    danger?: boolean;
}) {
    const display = value === null || value === undefined || value === '' ? '—' : String(value);
    return (
        <div className="flex items-start justify-between gap-3 text-sm py-1 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[12px]">
                {icon}
                {label}
            </div>
            <div
                className={cn(
                    'text-right tabular-nums',
                    danger
                        ? 'text-status-danger font-semibold'
                        : highlight
                          ? 'text-status-success font-semibold'
                          : 'text-foreground',
                )}
            >
                {display}
            </div>
        </div>
    );
}
