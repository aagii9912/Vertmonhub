'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, FilePlus2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { formatShortDate } from '@/lib/utils/date';
import { useContractsList, CONTRACT_STATUS_META, type ContractRow } from '@/hooks/useContracts';
import { useManagers } from '@/hooks/useLeads';
import { Avatar, Pill, Progress, Skeleton } from '@/components/dashboard/v2/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterChip } from '@/components/dashboard/FilterBar';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Button } from '@/components/ui/Button';
import { dashboardDownload } from '@/lib/api/dashboardFetch';

/**
 * «Гэрээ» v2 — нягт хүснэгт, статистикийн мөр, серверийн хуудаслалт (25).
 * Мөр дарахад бүтэн дэлгэрэнгүй хуудас (/dashboard/contracts/[id]).
 */

const PAGE_SIZE = 25;
type SortKey = 'contract_date' | 'total_price' | 'balance' | 'customer_name';

export function ContractsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const canWrite = user?.role === 'super_admin' || !!(user?.permissions.canWrite && user.permissions.modules.includes('contracts'));
    const [exporting, setExporting] = useState(false);
    const isMobile = useMobile().isMobile;
    const [status, setStatus] = useState('all');
    const [manager, setManager] = useState('all');
    const [overdue, setOverdue] = useState(false);
    const [qInput, setQInput] = useState('');
    const [q, setQ] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('contract_date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);

    useEffect(() => {
        const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [qInput]);

    const params = useMemo(() => ({ search: q, status, manager, overdue, sortBy, sortOrder, page, pageSize: PAGE_SIZE }), [q, status, manager, overdue, sortBy, sortOrder, page]);
    const { data, isLoading, isFetching, error, refetch } = useContractsList(params);
    const { data: managers = [] } = useManagers();

    const rows = data?.contracts ?? [];
    const stats = error ? undefined : data?.stats;
    const total = data?.pagination?.total ?? 0;
    const totalPages = data?.pagination?.totalPages ?? 1;
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);

    const toggleSort = (k: SortKey) => {
        if (sortBy === k) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortBy(k); setSortOrder(k === 'customer_name' ? 'asc' : 'desc'); }
        setPage(1);
    };
    async function download() {
        setExporting(true);
        try { await dashboardDownload('/api/dashboard/export/excel?type=contracts', 'Vertmon-contracts.xlsx'); }
        catch (error) { toast.error(error instanceof Error ? error.message : 'Файл татаж чадсангүй.'); }
        finally { setExporting(false); }
    }

    return (
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
            <PageHeader title="Гэрээнүүд" subtitle="Гэрээний явц, бүртгэсэн төлөлт, үлдэгдлийг нэг дор хянаарай." className="mb-0"
                primaryAction={canWrite && <Button href="/dashboard/contracts/generate"><FilePlus2 />Гэрээ үүсгэх</Button>}
                secondaryActions={<Button variant="ghost" isLoading={exporting} onClick={() => void download()} title="Байгууллагын бүх гэрээг татна"><Download />Excel · бүгд</Button>} />
            {/* Статистик */}
            <StatBar className="mb-0">
                <Kpi label="Нийт гэрээ" value={stats ? String(stats.total) : isLoading ? null : '—'} sub={stats ? `${stats.active} идэвхтэй · ${stats.closed} хаагдсан` : undefined} />
                <Kpi label="Гэрээний бүртгэлтэй дүн" value={stats ? formatMNTShort(stats.total_sales) : isLoading ? null : '—'} />
                <Kpi label="Гэрээнд бүртгэсэн төлөлт" value={stats ? formatMNTShort(stats.total_paid) : isLoading ? null : '—'} sub={stats && stats.total_sales > 0 ? `${Math.round((stats.total_paid / stats.total_sales) * 100)}%` : undefined} />
                <Kpi label="Үлдэгдэл" value={stats ? formatMNTShort(stats.total_balance) : isLoading ? null : '—'} sub={stats && stats.overdue_count > 0 ? `${stats.overdue_count} гэрээнд хоцролт бүртгэсэн` : undefined} tone={stats && stats.overdue_count > 0 ? 'danger' : undefined} />
            </StatBar>

            <p className="text-xs leading-relaxed text-muted-foreground">Төлөлт, үлдэгдэл, хоцролтыг гэрээний бүртгэлээс харуулав. Энэ нь тухайн сарын мөнгөн орлогын тайлан биш.</p>

            <FilterBar className="mb-0" search={{ value: qInput, onChange: setQInput, label: 'Гэрээ хайх', placeholder: 'Гэрээ, нэр, утас, тоот…' }}
                showClear={status !== 'all' || manager !== 'all' || overdue || !!qInput} onClear={() => { setStatus('all'); setManager('all'); setOverdue(false); setQInput(''); setQ(''); setPage(1); }}>
                <FilterChip value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Төлөв" options={Object.entries(CONTRACT_STATUS_META).map(([k, m]) => [k, m.label])} />
                {managers.length > 0 && <FilterChip value={manager} onChange={(v) => { setManager(v); setPage(1); }} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
                <button type="button" aria-pressed={overdue} onClick={() => { setOverdue((v) => !v); setPage(1); }} className={cn('inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-xs focus-ring md:h-9', overdue ? 'border-status-danger bg-status-danger-soft text-status-danger' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}><AlertCircle className="size-4" />Хоцролттой</button>
            </FilterBar>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {error ? <div role="alert" className="space-y-3 p-6 text-sm">
                    <p className="font-medium text-status-danger">Гэрээнүүдийг уншиж чадсангүй.</p><p className="text-muted-foreground">Жагсаалт хоосон гэсэн үг биш. Дахин оролдоно уу.</p>
                    <Button variant="secondary" onClick={() => void refetch()}>Дахин оролдох</Button>
                </div> : isMobile ? (
                    <MobileList rows={rows} loading={isLoading} onOpen={(id) => router.push(`/dashboard/contracts/${id}`)} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="h-11 border-b border-border bg-surface-2/60 text-xs font-medium tracking-[0.03em] text-muted-foreground">
                                    <Th onClick={() => toggleSort('contract_date')} active={sortBy === 'contract_date'} dir={sortOrder}>Гэрээ</Th>
                                    <Th onClick={() => toggleSort('customer_name')} active={sortBy === 'customer_name'} dir={sortOrder}>Харилцагч</Th>
                                    <th className="px-2 text-left font-medium">Блок / Тоот</th>
                                    <Th onClick={() => toggleSort('total_price')} active={sortBy === 'total_price'} dir={sortOrder} right>Нийт үнэ</Th>
                                    <th className="px-2 text-right font-medium">Төлсөн</th>
                                    <Th onClick={() => toggleSort('balance')} active={sortBy === 'balance'} dir={sortOrder} right>Үлдэгдэл</Th>
                                    <th className="px-2 text-left font-medium">Менежер</th>
                                    <th className="px-2 text-left font-medium">Төлөв</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading && Array.from({ length: 8 }).map((_, i) => <tr key={i} className="h-9 border-b border-border"><td colSpan={8} className="px-2"><Skeleton className="h-5" /></td></tr>)}
                                {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted-foreground">Гэрээ олдсонгүй</td></tr>}
                                {rows.map((c) => {
                                    const paidPct = c.total_price && c.total_price > 0 ? Math.round(((c.paid_amount || 0) / c.total_price) * 100) : 0;
                                    const st = CONTRACT_STATUS_META[c.contract_status] ?? { label: c.contract_status, tone: 'neutral' as const };
                                    const overdueDays = c.overdue_days || 0;
                                    return (
                                        <tr
                                            key={c.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => router.push(`/dashboard/contracts/${c.id}`)}
                                            onKeyDown={(e) => {
                                                if (e.target !== e.currentTarget) return;
                                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/dashboard/contracts/${c.id}`); }
                                            }}
                                            className={cn('h-16 cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2/70 focus-ring', isFetching && 'opacity-90')}
                                        >
                                            <td className="px-2">
                                                <div className="mono-label font-medium text-foreground">{c.contract_number || c.unit_label || '—'}</div>
                                                <div className="mono-label text-[11px] text-muted-foreground">{c.contract_date ? formatShortDate(c.contract_date) : '—'}</div>
                                            </td>
                                            <td className="px-2">
                                                <div className="max-w-[200px] truncate font-medium text-foreground">{c.customer_name || [c.customer_last_name, c.customer_first_name].filter(Boolean).join(' ') || '—'}</div>
                                                <div className="mono-label text-[11px] text-muted-foreground">{c.customer_phone || c.customer_mobile || ''}</div>
                                            </td>
                                            <td className="px-2 text-fg-2">
                                                <span className="mono-label">{[c.block_name ? `Блок ${c.block_name}` : null, c.unit_number || c.legacy_unit_number].filter(Boolean).join(' / ') || '—'}</span>
                                                {(c.unit_type || c.rooms) && <span className="text-muted-foreground"> · {c.unit_type || `${c.rooms} өрөө`}</span>}
                                            </td>
                                            <td className="num px-2 text-right text-foreground">{c.total_price ? formatMNT(c.total_price) : '—'}</td>
                                            <td className="px-2 text-right">
                                                <div className="num text-fg-2">{formatMNT(c.paid_amount || 0)}</div>
                                                <div className="flex items-center justify-end gap-1.5"><Progress value={paidPct} className="w-12" overColor={false} /><span className="num text-[11px] text-muted-foreground">{paidPct}%</span></div>
                                            </td>
                                            <td className={cn('num px-2 text-right', (c.balance || 0) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                                                {formatMNT(c.balance || 0)}
                                                {overdueDays > 0 && <div className="text-[11px] font-medium text-status-danger">{overdueDays} хоног хоцорсон</div>}
                                            </td>
                                            <td className="px-2">{c.sales_manager ? <span className="inline-flex items-center gap-1.5"><Avatar name={c.sales_manager} /><span className="truncate text-fg-2">{c.sales_manager}</span></span> : <span className="text-muted-foreground">—</span>}</td>
                                            <td className="px-2"><Pill tone={st.tone}>{st.label}</Pill></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className={cn("flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground", error && "hidden")}>
                    <span className="mono-label">{from}–{to} / {total}</span>
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Өмнөх"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Дараах"><ChevronRight className="h-4 w-4" /></button>
                    <span className="ml-auto">Хуудсанд {PAGE_SIZE}</span>
                </div>
            </div>
        </div>
    );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: 'danger' }) {
    return <StatTile label={label} value={value === null ? <Skeleton className="h-8 w-24" /> : value}
        helper={sub && <span className={tone === 'danger' ? 'font-medium text-status-danger' : undefined}>{sub}</span>} />;
}

function Th({ children, onClick, active, dir, right }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 'asc' | 'desc'; right?: boolean }) {
    return (
        <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-2 font-medium', right ? 'text-right' : 'text-left')}>
            <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
                {children}{active && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
        </th>
    );
}


function MobileList({ rows, loading, onOpen }: { rows: ContractRow[]; loading: boolean; onOpen: (id: string) => void }) {
    if (loading) return <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
    if (!rows.length) return <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">Гэрээ олдсонгүй</div>;
    return (
        <div className="flex flex-col">
            {rows.map((c) => {
                const st = CONTRACT_STATUS_META[c.contract_status] ?? { label: c.contract_status, tone: 'neutral' as const };
                return (
                    <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="flex min-h-24 items-center gap-3 border-b border-border px-4 py-4 text-left focus-ring last:border-b-0 active:bg-surface-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2"><span className="mono-label text-[12.5px] font-medium text-foreground">{c.contract_number || c.unit_label || '—'}</span><Pill tone={st.tone}>{st.label}</Pill></div>
                            <div className="truncate text-[13px] text-foreground">{c.customer_name || '—'}</div>
                            <div className="mt-2 text-xs text-muted-foreground">Нийт {formatMNT(c.total_price || 0)}</div><div className="mt-1 text-xs text-fg-2">Үлдэгдэл <strong className="num">{formatMNT(c.balance || 0)}</strong>{!!c.overdue_days && <span className="ml-2 text-status-danger">{c.overdue_days} хоног хоцорсон</span>}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                );
            })}
        </div>
    );
}
