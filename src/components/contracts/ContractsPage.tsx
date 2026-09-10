'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, FilePlus2, Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { formatShortDate } from '@/lib/utils/date';
import { useContractsList, CONTRACT_STATUS_META, type ContractRow } from '@/hooks/useContracts';
import { useManagers } from '@/hooks/useLeads';
import { Avatar, Pill, Progress, Skeleton } from '@/components/dashboard/v2/primitives';

/**
 * «Гэрээ» v2 — нягт хүснэгт, статистикийн мөр, серверийн хуудаслалт (25).
 * Мөр дарахад бүтэн дэлгэрэнгүй хуудас (/dashboard/contracts/[id]).
 */

const PAGE_SIZE = 25;
type SortKey = 'contract_date' | 'total_price' | 'balance' | 'customer_name';

export function ContractsPage() {
    const router = useRouter();
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
    const { data, isLoading, isFetching } = useContractsList(params);
    const { data: managers = [] } = useManagers();

    const rows = data?.contracts ?? [];
    const stats = data?.stats;
    const total = data?.pagination?.total ?? 0;
    const totalPages = data?.pagination?.totalPages ?? 1;
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);

    const toggleSort = (k: SortKey) => {
        if (sortBy === k) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortBy(k); setSortOrder(k === 'customer_name' ? 'asc' : 'desc'); }
        setPage(1);
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Статистик */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Kpi label="Нийт гэрээ" value={stats ? String(stats.total) : null} sub={stats ? `${stats.active} идэвхтэй · ${stats.closed} хаагдсан` : undefined} />
                <Kpi label="Нийт борлуулалт" value={stats ? formatMNTShort(stats.total_sales) : null} />
                <Kpi label="Цуглуулсан" value={stats ? formatMNTShort(stats.total_paid) : null} sub={stats && stats.total_sales > 0 ? `${Math.round((stats.total_paid / stats.total_sales) * 100)}%` : undefined} />
                <Kpi label="Үлдэгдэл" value={stats ? formatMNTShort(stats.total_balance) : null} sub={stats && stats.overdue_count > 0 ? `${stats.overdue_count} хоцролттой` : undefined} tone={stats && stats.overdue_count > 0 ? 'danger' : undefined} />
            </div>

            {/* Шүүлтүүр */}
            <div className="flex flex-wrap items-center gap-1.5">
                <Chip value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Төлөв" options={Object.entries(CONTRACT_STATUS_META).map(([k, m]) => [k, m.label])} />
                {managers.length > 0 && <Chip value={manager} onChange={(v) => { setManager(v); setPage(1); }} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
                <button type="button" onClick={() => { setOverdue((v) => !v); setPage(1); }} className={cn('inline-flex h-[26px] items-center gap-1 rounded-md border px-2.5 text-[12px] focus-ring', overdue ? 'border-status-danger bg-status-danger-soft text-status-danger' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>
                    <AlertCircle className="h-3 w-3" /> Хоцролттой
                </button>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Гэрээний дугаар, нэр, утас, тоот…" className="h-[30px] w-full rounded-md border border-border-strong bg-surface pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]" />
                </div>
                <div className="hidden items-center gap-1 sm:flex">
                    <a href="/api/dashboard/export/excel?type=contracts" className="inline-flex h-[28px] items-center gap-1.5 rounded-md border border-border px-2 text-[12px] font-medium text-fg-2 hover:bg-surface-2 hover:text-foreground"><Download className="h-3.5 w-3.5" /> Экспорт</a>
                    <Link href="/dashboard/contracts/generate" className="inline-flex h-[28px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-fg hover:bg-brand-strong"><FilePlus2 className="h-3.5 w-3.5" /> Гэрээ үүсгэх</Link>
                </div>
            </div>

            <div className="rounded-md border border-border bg-surface">
                {isMobile ? (
                    <MobileList rows={rows} loading={isLoading} onOpen={(id) => router.push(`/dashboard/contracts/${id}`)} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="h-8 bg-surface-2 text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
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
                                        <tr key={c.id} onClick={() => router.push(`/dashboard/contracts/${c.id}`)} className={cn('h-10 cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2/70', isFetching && 'opacity-90')}>
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
                <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
                    <span className="mono-label">{from}–{to} / {total}</span>
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 disabled:opacity-40" aria-label="Өмнөх"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 disabled:opacity-40" aria-label="Дараах"><ChevronRight className="h-4 w-4" /></button>
                    <span className="ml-auto">Хуудсанд {PAGE_SIZE}</span>
                </div>
            </div>
        </div>
    );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: 'danger' }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface px-3.5 py-2.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
            {value === null ? <Skeleton className="h-6 w-24" /> : <span className="num text-[20px] font-semibold tracking-[-0.02em] text-foreground">{value}</span>}
            {sub && <span className={cn('text-[11.5px]', tone === 'danger' ? 'font-medium text-status-danger' : 'text-muted-foreground')}>{sub}</span>}
        </div>
    );
}

function Th({ children, onClick, active, dir, right }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 'asc' | 'desc'; right?: boolean }) {
    return (
        <th className={cn('px-2 font-medium', right ? 'text-right' : 'text-left')}>
            <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
                {children}{active && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
        </th>
    );
}

function Chip({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
    const on = value !== 'all';
    return (
        <label className={cn('relative inline-flex h-[26px] items-center gap-1 rounded-md border pl-2.5 pr-6 text-[12px]', on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>
            <span className="pointer-events-none whitespace-nowrap">{on ? `${label}: ${options.find((o) => o[0] === value)?.[1] ?? value}` : label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
                <option value="all">Бүгд</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-70" />
        </label>
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
                    <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 active:bg-surface-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2"><span className="mono-label text-[12.5px] font-medium text-foreground">{c.contract_number || c.unit_label || '—'}</span><Pill tone={st.tone}>{st.label}</Pill></div>
                            <div className="truncate text-[13px] text-foreground">{c.customer_name || '—'}</div>
                            <div className="mono-label text-[12px] text-muted-foreground">{formatMNT(c.total_price || 0)} · үлдэгдэл {formatMNT(c.balance || 0)}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                );
            })}
        </div>
    );
}
