'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, LayoutList, PanelRight, Plus, MoreHorizontal, Phone, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMobile } from '@/hooks/use-mobile';
import { canAccessModuleDynamic } from '@/lib/rbac';
import { formatRelativeDays } from '@/lib/utils/date';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useLeadsList, useLeadSummary, useLeadProjects, useManagers, useUpdateLead, type LeadRow } from '@/hooks/useLeads';
import { LEAD_VIEWS, LEAD_STATUSES, STATUS_META, SOURCES, SOURCE_LABEL, sourceLabel, interestLabel, isAnonymousLead, leadDisplayName, normalizeLeadName, type LeadView } from '@/lib/leads/labels';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { Avatar, Pill, Skeleton } from '@/components/dashboard/v2/primitives';
import { StatusPicker, ManagerPicker } from './pickers';
import { LeadPanel, nextStep } from './LeadPanel';
import { isLeadWorkQueue, LEAD_WORK_QUEUES } from '@/lib/leads/work-queue';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterChip } from '@/components/dashboard/FilterBar';
import { Button } from '@/components/ui/Button';
import { dashboardDownload } from '@/lib/api/dashboardFetch';

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
    const search = useSearchParams();
    return <LeadsWorkspace key={search.get('queue') ?? 'all'} />;
}

function LeadsWorkspace() {
    const router = useRouter();
    const search = useSearchParams();
    const queueParam = search.get('queue');
    const queue = isLeadWorkQueue(queueParam) ? queueParam : undefined;
    const { isMobile, isDesktop } = useMobile();
    const { user } = useAuth();
    const canWrite = !!user?.permissions && canAccessModuleDynamic(user.permissions, 'leads') && !!user.permissions.canWrite;
    const canAssign = canWrite && user?.role !== 'sales_manager';

    const [mode, setMode] = useState<Mode>('table');
    const [view, setView] = useState<LeadView>('all');
    const [status, setStatus] = useState('all');
    const [source, setSource] = useState('all');
    const [manager, setManager] = useState('all');
    const [project, setProject] = useState(() => search.get('project') || 'all');
    const [period, setPeriod] = useState('all');
    const [qInput, setQInput] = useState('');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<SortKey>(queue === 'overdue' ? 'next_followup_at' : 'created_at');
    const [dir, setDir] = useState<'asc' | 'desc'>(queue ? 'asc' : 'desc');
    const [exporting, setExporting] = useState(false);
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

    const params = useMemo(() => ({ view, queue, status, source, manager, project, period, q, sort, dir, page, pageSize: PAGE_SIZE }), [view, queue, status, source, manager, project, period, q, sort, dir, page]);
    const { data, isLoading, isFetching, error, refetch } = useLeadsList(params);
    const { data: summary, error: summaryError } = useLeadSummary();
    const { data: managers = [] } = useManagers();
    const { data: projects = [] } = useLeadProjects();
    const update = useUpdateLead();

    const leads = useMemo(() => data?.leads ?? [], [data]);
    const total = data?.pagination.total ?? 0;
    const totalPages = data?.pagination.totalPages ?? 1;
    const projectNames = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);
    const selectedLeads = leads.filter(l => checked.has(l.id));
    const bulkManagers = managers.filter(m => selectedLeads.length === checked.size && selectedLeads.every(l => !!l.project_id && m.project_ids?.includes(l.project_id)));
    const filterManagers = project === 'all' ? managers : managers.filter(m => m.project_ids?.includes(project));

    const select = useCallback((id: string | null) => {
        setSelectedId(id);
        const sp = new URLSearchParams(search.toString());
        if (id) sp.set('lead', id); else sp.delete('lead');
        const url = `/dashboard/leads${sp.size ? `?${sp}` : ''}`;
        window.history.replaceState(null, '', url);
    }, [search]);

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

    const showSplit = mode === 'split' && isDesktop;
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    const chooseQueue = (key: typeof LEAD_WORK_QUEUES[number]['key']) => {
        setView('all'); setStatus('all'); setSource('all'); setManager('all'); setPeriod('all'); setQInput(''); setQ(''); setPage(1); setChecked(new Set()); setSelectedId(null);
        setSort(key === 'overdue' ? 'next_followup_at' : 'created_at'); setDir('asc');
        router.replace(`/dashboard/leads?queue=${key}`);
    };
    const filtered = !!queue || view !== 'all' || status !== 'all' || source !== 'all' || manager !== 'all' || project !== 'all' || period !== 'all' || !!qInput;
    function resetFilters() {
        setView('all'); setStatus('all'); setSource('all'); setManager('all'); setProject('all'); setPeriod('all'); setQInput(''); setQ(''); setPage(1); setChecked(new Set());
        if (queue) router.replace('/dashboard/leads');
    }
    async function download() {
        setExporting(true);
        try { await dashboardDownload('/api/dashboard/export/excel?type=leads', 'Vertmon-leads.xlsx'); }
        catch (error) { toast.error(error instanceof Error ? error.message : 'Файл татаж чадсангүй.'); }
        finally { setExporting(false); }
    }

    return (
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
            <PageHeader title="Лидүүд" subtitle="Холбогдох харилцагчаа сонгоод, үр дүн ба дараагийн алхмаа бүртгээрэй."
                className="mb-0" primaryAction={canWrite && <Button onClick={() => openQuickCreate('lead')}><Plus />Шинэ лид</Button>}
                secondaryActions={<><Button href="/dashboard/leads/pipeline" variant="secondary"><GitBranch />Pipeline</Button><Button variant="ghost" isLoading={exporting} onClick={() => void download()} title="Байгууллагын бүх лидийг татна"><Download />Excel · бүгд</Button></>} />
            <section aria-label="Анхаарах лидүүд" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {LEAD_WORK_QUEUES.map(item => <button key={item.key} type="button" aria-pressed={queue === item.key}
                    onClick={() => chooseQueue(item.key)} title={item.help}
                    className={cn('flex min-h-18 flex-col items-start justify-between gap-1 rounded-2xl border p-3 sm:min-h-24 sm:gap-2 sm:p-4 text-left transition-colors focus-ring', queue === item.key ? 'border-foreground bg-surface-2' : 'border-transparent bg-surface-2 hover:bg-surface-3')}>
                    <span className="text-xs text-fg-2">{item.label}</span>
                    <span className="num text-2xl font-semibold tracking-tight">{summaryError ? '—' : summary?.queues?.[item.key] ?? '…'}</span>
                </button>)}
            </section>
            {queue && <p role="status" className="text-sm text-fg-2">{LEAD_WORK_QUEUES.find(item => item.key === queue)?.help}</p>}
            {error && <div role="alert" className="rounded-xl border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">Лидүүдийг уншиж чадсангүй. <button type="button" onClick={() => void refetch()} className="ml-2 min-h-9 underline focus-ring">Дахин оролдох</button></div>}
            {summaryError && <p role="status" className="text-xs text-muted-foreground">Анхаарах лидийн тоог уншиж чадсангүй.</p>}

            {/* Таб + хуудасны үйлдэл */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {LEAD_VIEWS.map((v) => {
                    const n = summary?.[v.key];
                    const active = view === v.key;
                    return (
                        <button
                            key={v.key}
                            type="button"
                            aria-pressed={view === v.key}
                            onClick={() => { setView(v.key); setPage(1); setChecked(new Set()); }}
                            className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors focus-ring', active ? 'bg-surface-2 text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:bg-surface-2 hover:text-foreground')}
                        >
                            {v.label}
                            {typeof n === 'number' && <span className={cn('mono-label text-[11px]', active ? 'text-brand' : 'text-muted-foreground')}>{n}</span>}
                        </button>
                    );
                })}
                <div className="ml-auto hidden shrink-0 items-center gap-1 rounded-lg bg-surface-2 p-1 lg:flex">
                    <button type="button" onClick={() => changeMode('table')} aria-pressed={mode === 'table'} className={cn('flex size-8 items-center justify-center rounded-md focus-ring', mode === 'table' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground')} aria-label="Хүснэгт" title="Хүснэгт"><LayoutList className="size-4" /></button>
                    <button type="button" onClick={() => changeMode('split')} aria-pressed={mode === 'split'} className={cn('flex size-8 items-center justify-center rounded-md focus-ring', mode === 'split' ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground')} aria-label="Хажуугийн самбартай" title="Хажуугийн самбартай"><PanelRight className="size-4" /></button>
                </div>
            </div>

            <FilterBar className="mb-0" search={{ value: qInput, onChange: setQInput, label: 'Лидийг нэр, утсаар хайх', placeholder: 'Нэр, утас, имэйл эсвэл «нэргүй»…' }} showClear={filtered} onClear={resetFilters}>
                {projects.length > 1 && <FilterChip value={project} onChange={(v) => { setProject(v); setManager('all'); setPage(1); setChecked(new Set()); select(null); }} label="Төсөл" options={projects.map((p) => [p.id, p.name])} />}
                <FilterChip value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Статус" options={LEAD_STATUSES.map((s) => [s, STATUS_META[s].label])} />
                <FilterChip value={source} onChange={(v) => { setSource(v); setPage(1); }} label="Эх үүсвэр" options={SOURCES.map((s) => [s, SOURCE_LABEL[s]])} />
                {filterManagers.length > 0 && <FilterChip value={manager} onChange={(v) => { setManager(v); setPage(1); }} label="Менежер" options={filterManagers.map((m) => [m.name, m.name])} />}
                <FilterChip value={period} onChange={(v) => { setPeriod(v); setPage(1); }} label="Огноо" options={[['week', '7 хоног'], ['month', '30 хоног'], ['quarter', '90 хоног'], ['year', '1 жил']]} />
            </FilterBar>

            {/* Bulk */}
            {checked.size > 0 && canWrite && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-[12.5px]">
                    <span className="font-medium text-brand">{checked.size} сонгосон</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-fg-2">Статус:</span>
                    <StatusPicker value="" onChange={(s, reason) => void bulk({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
                    {canAssign && bulkManagers.length > 0 && (<><span className="text-fg-2">Менежер:</span><ManagerPicker value={null} options={bulkManagers} onChange={(n) => void bulk({ sales_manager_name: n })} /></>)}
                    <button type="button" onClick={() => setChecked(new Set())} className="ml-auto text-[12px] text-muted-foreground hover:text-foreground">Цуцлах</button>
                </div>
            )}

            {/* Агуулга */}
            <div className={cn('grid gap-3', showSplit && 'lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)]')}>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
                    {error ? null : isMobile ? (
                        <MobileList leads={leads} projectNames={projectNames} loading={isLoading} onOpen={select} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="h-11 border-b border-border bg-surface-2/60 text-xs font-medium tracking-[0.03em] text-muted-foreground">
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
                                        <tr key={i} className="h-10 border-b border-border"><td colSpan={10} className="px-2"><Skeleton className="h-5" /></td></tr>
                                    ))}
                                    {!error && !isLoading && leads.length === 0 && (
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
                                        const overdue = !!l.next_followup_at && new Date(l.next_followup_at).getTime() < Date.now() && !['closed_won', 'closed_lost'].includes(l.status);
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
                                                className={cn('h-14 cursor-pointer border-b border-border transition-colors last:border-b-0 focus-ring', sel ? 'bg-brand-soft/60 shadow-[inset_2px_0_0_var(--brand)]' : 'hover:bg-surface-2/70', isFetching && 'opacity-90')}
                                            >
                                                <td className="px-2" onClick={(e) => e.stopPropagation()}>
                                                    <CheckBox label="Сонгох" checked={checked.has(l.id)} onChange={(v) => setChecked((prev) => { const n = new Set(prev); if (v) n.add(l.id); else n.delete(l.id); return n; })} />
                                                </td>
                                                <td className="px-2"><span className={cn('block max-w-[220px] truncate font-medium', sel ? 'text-brand' : isAnonymousLead(l) ? 'text-muted-foreground' : 'text-foreground')}>{leadDisplayName(l)}</span>{(projects.length > 1 || !l.project_id) && <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{l.project_id ? projectNames[l.project_id] || 'Төсөл' : 'Төсөл тодорхойгүй'}</span>}</td>
                                                <td className="mono-label px-2 text-fg-2">{l.customer_phone || '—'}</td>
                                                <td className="px-2"><StatusPicker value={l.status} disabled={!canWrite} onChange={(s, reason) => patchLead(l.id, { status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} /></td>
                                                {!showSplit && <td className="px-2 text-fg-2">{sourceLabel(l.source)}</td>}
                                                <td className="px-2 text-fg-2">{interestLabel(l)}</td>
                                                {!showSplit && <td className="px-2"><ManagerPicker value={l.sales_manager_name ?? null} options={managers} projectId={l.project_id ?? null} disabled={!canAssign} onChange={(n) => patchLead(l.id, { sales_manager_name: n })} /></td>}
                                                {!showSplit && <td className={cn('px-2', overdue ? 'font-medium text-status-danger' : 'text-fg-2')}>{nextStep(l)}</td>}
                                                <td className="mono-label px-2 text-fg-2">{l.last_contact_at ? formatRelativeDays(l.last_contact_at) : 'Бүртгээгүй'}</td>
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
                        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Өмнөх"><ChevronLeft className="h-4 w-4" /></button>
                        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex size-11 items-center justify-center rounded-lg focus-ring md:size-9 hover:bg-surface-2 disabled:opacity-40" aria-label="Дараах"><ChevronRight className="h-4 w-4" /></button>
                        <span className="ml-auto">Хуудсанд {PAGE_SIZE}</span>
                    </div>
                </div>

                {showSplit && (
                    <aside aria-label="Сонгосон лид" className="sticky top-[calc(var(--header-h)+1rem)] h-[calc(100dvh-var(--header-h)-2rem)] min-h-0 self-start overflow-hidden rounded-2xl border border-border bg-surface">
                        {selectedId ? (
                            <LeadPanel leadId={selectedId} canWrite={canWrite} onClose={() => select(null)} onOpenLead={select} />
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
                    <SheetContent side="right" showCloseButton={false} className="w-full p-0 sm:max-w-[520px]">
                        <SheetTitle className="sr-only">Лидийн дэлгэрэнгүй</SheetTitle>
                        <SheetDescription className="sr-only">Сонгосон лидийн мэдээлэл болон дараагийн үйлдлүүд.</SheetDescription>
                        {selectedId && <LeadPanel leadId={selectedId} canWrite={canWrite} onClose={() => select(null)} onOpenLead={select} />}
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


function MobileList({ leads, projectNames, loading, onOpen }: { leads: LeadRow[]; projectNames: Record<string, string>; loading: boolean; onOpen: (id: string) => void }) {
    if (loading) return <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
    if (!leads.length) return <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">Лид олдсонгүй</div>;
    return (
        <div className="flex flex-col">
            {leads.map((l) => {
                const phone = l.customer_phone?.replace(/\D/g, '') || '';
                return (
                    <div key={l.id} className="flex min-h-20 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 active:bg-surface-2">
                        <button type="button" onClick={() => onOpen(l.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <Avatar name={normalizeLeadName(l.customer_name)} className="h-8 w-8 text-[11px]" />
                            <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-[14px] font-medium', isAnonymousLead(l) ? 'text-muted-foreground' : 'text-foreground')}>{leadDisplayName(l)}</span>
                                {(Object.keys(projectNames).length > 1 || !l.project_id) && <span className="block truncate text-xs text-fg-2">{l.project_id ? projectNames[l.project_id] || 'Төсөл' : 'Төсөл тодорхойгүй'}</span>}
                                <span className="block truncate text-[12px] text-muted-foreground">{[interestLabel(l) !== '—' ? interestLabel(l) : null, sourceLabel(l.source), l.last_contact_at ? `Холбогдсон: ${formatRelativeDays(l.last_contact_at)}` : 'Холбоо бүртгээгүй'].filter(Boolean).join(' · ')}</span>
                                <span className="mt-1 block text-xs text-fg-2">{nextStep(l)}</span>
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
