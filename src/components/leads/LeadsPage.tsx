'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, LayoutList, PanelRight, Plus, Search, MoreHorizontal, Phone, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMobile } from '@/hooks/use-mobile';
import { canAccessModuleDynamic } from '@/lib/rbac';
import { formatRelativeDays } from '@/lib/utils/date';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useLeadsList, useLeadSummary, useManagers, useUpdateLead, type LeadRow } from '@/hooks/useLeads';
import { LEAD_VIEWS, LEAD_STATUSES, STATUS_META, SOURCES, SOURCE_LABEL, sourceLabel, interestLabel, type LeadView } from '@/lib/leads/labels';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { Avatar, Pill, Skeleton } from '@/components/dashboard/v2/primitives';
import { StatusPicker, ManagerPicker } from './pickers';
import { LeadPanel, nextStep } from './LeadPanel';

/**
 * «Лид» — v2. Нягт хүснэгт (A) эсвэл split view (B) — хэрэглэгч сольж болно,
 * сонголт хадгалагдана. Статус/менежер нүдэн дээр нь солигдоно, дэлгэрэнгүй
 * нь хуудас солихгүйгээр хажуугийн панелд.
 */

const MODE_KEY = 'vertmonhub_leads_mode';
const PAGE_SIZE = 25;
type Mode = 'table' | 'split';
type SortKey = 'created_at' | 'last_contact_at' | 'customer_name' | 'next_followup_at';

export function LeadsPage() {
    const router = useRouter();
    const search = useSearchParams();
    const isMobile = useMobile().isMobile;
    const { user } = useAuth();
    const canWrite = !!user?.permissions && canAccessModuleDynamic(user.permissions, 'leads') && !!user.permissions.canWrite;

    const [mode, setMode] = useState<Mode>('table');
    const [view, setView] = useState<LeadView>('all');
    const [status, setStatus] = useState('all');
    const [source, setSource] = useState('all');
    const [manager, setManager] = useState('all');
    const [period, setPeriod] = useState('all');
    const [qInput, setQInput] = useState('');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<SortKey>('created_at');
    const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());

    // Хадгалсан горим + deep link (?lead=, ?new=1)
    useEffect(() => {
        try {
            const m = localStorage.getItem(MODE_KEY);
            if (m === 'split' || m === 'table') setMode(m);
        } catch { /* алгасна */ }
        const lead = search.get('lead');
        if (lead) setSelectedId(lead);
        if (search.get('new') === '1') {
            openQuickCreate('lead');
            router.replace('/dashboard/leads');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const changeMode = (m: Mode) => {
        setMode(m);
        try { localStorage.setItem(MODE_KEY, m); } catch { /* алгасна */ }
    };

    // Хайлт — 300ms debounce
    useEffect(() => {
        const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [qInput]);

    const params = useMemo(() => ({ view, status, source, manager, period, q, sort, dir, page, pageSize: PAGE_SIZE }), [view, status, source, manager, period, q, sort, dir, page]);
    const { data, isLoading, isFetching } = useLeadsList(params);
    const { data: summary } = useLeadSummary();
    const { data: managers = [] } = useManagers();
    const update = useUpdateLead();

    const leads = useMemo(() => data?.leads ?? [], [data]);
    const total = data?.pagination.total ?? 0;
    const totalPages = data?.pagination.totalPages ?? 1;

    const select = useCallback((id: string | null) => {
        setSelectedId(id);
        const url = id ? `/dashboard/leads?lead=${id}` : '/dashboard/leads';
        window.history.replaceState(null, '', url);
    }, []);

    const patchLead = (id: string, patch: Parameters<typeof update.mutate>[0]['patch']) =>
        update.mutate({ id, patch }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа') });

    const toggleSort = (k: SortKey) => {
        if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc');
        else { setSort(k); setDir(k === 'customer_name' ? 'asc' : 'desc'); }
        setPage(1);
    };

    // Keyboard: ↑/↓ сонголт, Esc хаах
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
            if (e.key === 'Escape' && selectedId) { select(null); return; }
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && leads.length) {
                e.preventDefault();
                const idx = leads.findIndex((l) => l.id === selectedId);
                const next = e.key === 'ArrowDown' ? Math.min(leads.length - 1, idx + 1) : Math.max(0, idx - 1);
                select(leads[next].id);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [leads, selectedId, select]);

    const bulk = async (patch: Parameters<typeof update.mutate>[0]['patch']) => {
        const ids = [...checked];
        try {
            await Promise.all(ids.map((id) => update.mutateAsync({ id, patch })));
            toast.success(`${ids.length} лид шинэчлэгдлээ`);
            setChecked(new Set());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа');
        }
    };

    const showSplit = mode === 'split' && !isMobile;
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);

    return (
        <div className="flex flex-col gap-3">
            {/* Таб + хуудасны үйлдэл */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border">
                {LEAD_VIEWS.map((v) => {
                    const n = summary?.[v.key];
                    const active = view === v.key;
                    return (
                        <button
                            key={v.key}
                            type="button"
                            onClick={() => { setView(v.key); setPage(1); }}
                            className={cn('-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors focus-ring', active ? 'border-brand text-foreground' : 'border-transparent text-fg-2 hover:text-foreground')}
                        >
                            {v.label}
                            {typeof n === 'number' && <span className={cn('mono-label text-[11px]', active ? 'text-brand' : 'text-muted-foreground')}>{n}</span>}
                        </button>
                    );
                })}
                <Link href="/dashboard/leads/pipeline" className="-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-[13px] font-medium text-fg-2 hover:text-foreground">
                    <GitBranch className="h-3.5 w-3.5" /> Лидийн pipeline
                </Link>
                <div className="ml-auto hidden shrink-0 items-center gap-1 pb-1 sm:flex">
                    <div className="inline-flex h-[28px] items-center rounded-md border border-border p-0.5">
                        <button type="button" onClick={() => changeMode('table')} className={cn('flex h-full w-7 items-center justify-center rounded', mode === 'table' ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="Хүснэгт" title="Хүснэгт"><LayoutList className="h-4 w-4" /></button>
                        <button type="button" onClick={() => changeMode('split')} className={cn('flex h-full w-7 items-center justify-center rounded', mode === 'split' ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-label="Split view" title="Split view"><PanelRight className="h-4 w-4" /></button>
                    </div>
                    <a href="/api/dashboard/export/excel?type=leads" className="inline-flex h-[28px] items-center gap-1.5 rounded-md border border-border px-2 text-[12px] font-medium text-fg-2 hover:bg-surface-2 hover:text-foreground">
                        <Download className="h-3.5 w-3.5" /> Экспорт
                    </a>
                </div>
            </div>

            {/* Шүүлтүүр */}
            <div className="flex flex-wrap items-center gap-1.5">
                <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Статус" options={LEAD_STATUSES.map((s) => [s, STATUS_META[s].label])} />
                <FilterSelect value={source} onChange={(v) => { setSource(v); setPage(1); }} label="Эх үүсвэр" options={SOURCES.map((s) => [s, SOURCE_LABEL[s]])} />
                {managers.length > 0 && <FilterSelect value={manager} onChange={(v) => { setManager(v); setPage(1); }} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
                <FilterSelect value={period} onChange={(v) => { setPeriod(v); setPage(1); }} label="Огноо" options={[['week', '7 хоног'], ['month', '30 хоног'], ['quarter', '90 хоног'], ['year', '1 жил']]} />
                <div className="relative ml-auto w-full sm:w-60">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Нэр, утас…" className="h-[30px] w-full rounded-md border border-border-strong bg-surface pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]" />
                </div>
            </div>

            {/* Bulk */}
            {checked.size > 0 && canWrite && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-[12.5px]">
                    <span className="font-medium text-brand">{checked.size} сонгосон</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-fg-2">Статус:</span>
                    <StatusPicker value="" onChange={(s, reason) => void bulk({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
                    {managers.length > 0 && (<><span className="text-fg-2">Менежер:</span><ManagerPicker value={null} options={managers} onChange={(n) => void bulk({ sales_manager_name: n })} /></>)}
                    <button type="button" onClick={() => setChecked(new Set())} className="ml-auto text-[12px] text-muted-foreground hover:text-foreground">Цуцлах</button>
                </div>
            )}

            {/* Агуулга */}
            <div className={cn('grid gap-3', showSplit && 'lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]')}>
                <div className="min-w-0 rounded-md border border-border bg-surface">
                    {isMobile ? (
                        <MobileList leads={leads} loading={isLoading} onOpen={select} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                                <thead>
                                    <tr className="h-8 bg-surface-2 text-[11px] font-medium tracking-[0.03em] text-muted-foreground">
                                        <th className="w-9 px-2"><CheckBox label="Бүгдийг сонгох" checked={leads.length > 0 && leads.every((l) => checked.has(l.id))} onChange={(v) => setChecked(v ? new Set(leads.map((l) => l.id)) : new Set())} /></th>
                                        <Th onClick={() => toggleSort('customer_name')} active={sort === 'customer_name'} dir={dir}>Нэр</Th>
                                        <th className="px-2 text-left font-medium">Утас</th>
                                        <th className="px-2 text-left font-medium">Статус</th>
                                        {!showSplit && <th className="px-2 text-left font-medium">Эх үүсвэр</th>}
                                        <th className="px-2 text-left font-medium">Сонирхол</th>
                                        {!showSplit && <th className="px-2 text-left font-medium">Менежер</th>}
                                        {!showSplit && <Th onClick={() => toggleSort('next_followup_at')} active={sort === 'next_followup_at'} dir={dir}>Дараагийн алхам</Th>}
                                        <Th onClick={() => toggleSort('last_contact_at')} active={sort === 'last_contact_at'} dir={dir}>Сүүлд холбогдсон</Th>
                                        <th className="w-9" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="h-9 border-b border-border"><td colSpan={10} className="px-2"><Skeleton className="h-5" /></td></tr>
                                    ))}
                                    {!isLoading && leads.length === 0 && (
                                        <tr><td colSpan={10}>
                                            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                                                <div className="text-[13.5px] font-medium text-foreground">Лид олдсонгүй</div>
                                                <p className="max-w-xs text-[12.5px] text-muted-foreground">Шүүлтүүрээ өөрчлөх эсвэл шинэ лид бүртгээрэй.</p>
                                                {canWrite && <button type="button" onClick={() => openQuickCreate('lead')} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring"><Plus className="h-4 w-4" /> Шинэ лид</button>}
                                            </div>
                                        </td></tr>
                                    )}
                                    {leads.map((l) => {
                                        const sel = l.id === selectedId;
                                        const overdue = !!l.next_followup_at && new Date(l.next_followup_at).getTime() < Date.now() - 86_400_000 && !['closed_won', 'closed_lost'].includes(l.status);
                                        return (
                                            <tr
                                                key={l.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => select(l.id)}
                                                onKeyDown={(e) => {
                                                    if (e.target !== e.currentTarget) return;
                                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(l.id); }
                                                }}
                                                className={cn('h-9 cursor-pointer border-b border-border transition-colors last:border-b-0 focus-ring', sel ? 'bg-brand-soft/60' : 'hover:bg-surface-2/70', isFetching && 'opacity-90')}
                                            >
                                                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                                                    <CheckBox label="Сонгох" checked={checked.has(l.id)} onChange={(v) => setChecked((prev) => { const n = new Set(prev); if (v) n.add(l.id); else n.delete(l.id); return n; })} />
                                                </td>
                                                <td className="px-2"><span className={cn('block max-w-[220px] truncate font-medium', sel ? 'text-brand' : 'text-foreground')}>{l.customer_name || 'Нэргүй'}</span></td>
                                                <td className="mono-label px-2 text-fg-2">{l.customer_phone || '—'}</td>
                                                <td className="px-2"><StatusPicker value={l.status} disabled={!canWrite} onChange={(s, reason) => patchLead(l.id, { status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} /></td>
                                                {!showSplit && <td className="px-2 text-fg-2">{sourceLabel(l.source)}</td>}
                                                <td className="px-2 text-fg-2">{interestLabel(l)}</td>
                                                {!showSplit && <td className="px-2"><ManagerPicker value={l.sales_manager_name ?? null} options={managers} disabled={!canWrite} onChange={(n) => patchLead(l.id, { sales_manager_name: n })} /></td>}
                                                {!showSplit && <td className={cn('px-2', overdue ? 'font-medium text-status-danger' : 'text-fg-2')}>{nextStep(l)}</td>}
                                                <td className={cn('mono-label px-2', overdue ? 'text-status-danger' : 'text-fg-2')}>{formatRelativeDays(l.last_contact_at || l.created_at)}</td>
                                                <td className="px-2 text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Хуудаслалт */}
                    <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
                        <span className="mono-label">{from}–{to} / {total}</span>
                        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 disabled:opacity-40" aria-label="Өмнөх"><ChevronLeft className="h-4 w-4" /></button>
                        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 disabled:opacity-40" aria-label="Дараах"><ChevronRight className="h-4 w-4" /></button>
                        <span className="ml-auto">Хуудсанд {PAGE_SIZE}</span>
                    </div>
                </div>

                {showSplit && (
                    <aside className="hidden min-h-[520px] rounded-md border border-border bg-surface lg:block lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:max-h-[calc(100vh-var(--header-h)-2rem)] lg:overflow-hidden">
                        {selectedId ? (
                            <LeadPanel leadId={selectedId} managers={managers} canWrite={canWrite} onClose={() => select(null)} />
                        ) : (
                            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
                                <PanelRight className="h-6 w-6 text-muted-foreground" />
                                <div className="text-[13px] font-medium text-foreground">Лид сонгоно уу</div>
                                <p className="text-[12px] text-muted-foreground">Жагсаалтаас мөр сонгоход дэлгэрэнгүй энд гарна. ↑ ↓ товчоор шилжинэ.</p>
                            </div>
                        )}
                    </aside>
                )}
            </div>

            {/* Хүснэгтийн горим / утас: панел нь Sheet */}
            {!showSplit && (
                <Sheet open={!!selectedId} onOpenChange={(o) => !o && select(null)}>
                    <SheetContent side="right" className="w-full p-0 sm:max-w-[520px]">
                        <SheetTitle className="sr-only">Лидийн дэлгэрэнгүй</SheetTitle>
                        {selectedId && <LeadPanel leadId={selectedId} managers={managers} canWrite={canWrite} onClose={() => select(null)} />}
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors focus-ring',
                checked ? 'border-brand bg-brand text-brand-fg' : 'border-border-strong bg-surface hover:border-brand',
            )}
        >
            {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
        </button>
    );
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 'asc' | 'desc' }) {
    return (
        <th className="px-2 text-left font-medium">
            <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
                {children}
                {active && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
        </th>
    );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
    const on = value !== 'all';
    return (
        <label className={cn('relative inline-flex h-[26px] items-center gap-1 rounded-md border pl-2.5 pr-6 text-[12px] focus-within:border-brand', on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>
            <span className="pointer-events-none whitespace-nowrap">{on ? `${label}: ${options.find((o) => o[0] === value)?.[1] ?? value}` : label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
                <option value="all">Бүгд</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-70" />
        </label>
    );
}

function MobileList({ leads, loading, onOpen }: { leads: LeadRow[]; loading: boolean; onOpen: (id: string) => void }) {
    if (loading) return <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
    if (!leads.length) return <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">Лид олдсонгүй</div>;
    return (
        <div className="flex flex-col">
            {leads.map((l) => {
                const phone = l.customer_phone?.replace(/\D/g, '') || '';
                return (
                    <div key={l.id} className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 active:bg-surface-2">
                        <button type="button" onClick={() => onOpen(l.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <Avatar name={l.customer_name} className="h-8 w-8 text-[11px]" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium text-foreground">{l.customer_name || 'Нэргүй'}</span>
                                <span className="block truncate text-[12px] text-muted-foreground">{[interestLabel(l) !== '—' ? interestLabel(l) : null, sourceLabel(l.source), formatRelativeDays(l.last_contact_at || l.created_at)].filter(Boolean).join(' · ')}</span>
                            </span>
                            <Pill tone={STATUS_META[l.status]?.tone ?? 'neutral'}>{STATUS_META[l.status]?.short ?? l.status}</Pill>
                        </button>
                        {phone && <a href={`tel:${phone}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand active:bg-brand-soft" aria-label="Залгах"><Phone className="h-5 w-5" /></a>}
                    </div>
                );
            })}
        </div>
    );
}
