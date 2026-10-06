'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useSavedLeadViews } from '@/hooks/useSavedLeadViews';
import { formatRelativeDays } from '@/lib/utils/date';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { useLeadsList, useLeadSummary, useLeadProjects, useLeadCategories, useManagers, useUpdateLead, type LeadCategoryRow, type LeadPatch, type LeadRow, type ManagerOption } from '@/hooks/useLeads';
import {
    LEAD_VIEWS, LEAD_STATUSES, STATUS_META, SOURCES, SOURCE_LABEL, UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL,
    categoryOptionLabel, sourceLabel, isAnonymousLead, leadDisplayName,
} from '@/lib/leads/labels';
import { LEAD_WORK_QUEUES, type LeadWorkQueue } from '@/lib/leads/work-queue';
import {
    emptyLeadFilters, hasLeadFilters, parseLeadFilters, serializeLeadFilters, viewQuery,
    type LeadListFilters, type LeadSortKey,
} from '@/lib/leads/list-params';
import { describeNextStep } from '@/lib/leads/next-step';
import { isTypingTarget } from '@/lib/navigation/shortcuts';
import { dashboardDownload } from '@/lib/api/dashboardFetch';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar, FilterChip } from '@/components/dashboard/FilterBar';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { StatusPicker, ManagerPicker, CategoryPicker } from './pickers';
import { LeadCard } from './LeadCard';
import { LeadsViewSwitch } from './LeadsViewSwitch';

/**
 * «Лид» — v3. Анхаарах 4 тоо нь шүүлтүүр, харагдац (Миний / Шинэ…) ба хадгалсан харагдац, жагсаалт ↔ Шатаар.
 * Шүүлтүүр URL-д хадгалагдана (анхдагч үед URL цэвэр); мөр сонгоход баруун талд Харилцагчийн карт.
 * ↑/↓ — дараагийн / өмнөх лид, Enter — карт нээх, Esc — хаах.
 */

const PAGE_SIZE = 25;

export function LeadsPage() {
    return <LeadsWorkspace />;
}

/** URL-ийн шүүлтүүрийн түлхүүр (lead, new-гүй) — гаднаас өөрчлөгдсөнийг танихад. */
function filterKeyOf(search: URLSearchParams): string {
    return serializeLeadFilters(parseLeadFilters(search)).toString();
}

function leadsUrl(filters: LeadListFilters, leadId: string | null): string {
    const sp = serializeLeadFilters(filters);
    if (leadId) sp.set('lead', leadId);
    const query = sp.toString();
    return `/dashboard/leads${query ? `?${query}` : ''}`;
}

function LeadsWorkspace() {
    const search = useSearchParams();
    const { user, shop } = useAuth();
    const { canWrite: canWriteModule } = useModuleAccess();
    const canWrite = canWriteModule('leads');
    const canAssign = canWrite && user?.role !== 'sales_manager';

    // URL ↔ төлөв: өөрсдөө бичсэн URL-ийг дахин уншихгүй, гаднаас (⌘K, Өнөөдөр, хадгалсан харагдац) ирснийг авна.
    const urlFilterKey = filterKeyOf(search);
    const [filters, setFilters] = useState<LeadListFilters>(() => parseLeadFilters(search));
    const [seenFilterKey, setSeenFilterKey] = useState(urlFilterKey);
    if (urlFilterKey !== seenFilterKey) {
        setSeenFilterKey(urlFilterKey);
        if (urlFilterKey !== serializeLeadFilters(filters).toString()) setFilters(parseLeadFilters(search));
    }
    const urlLead = search.get('lead');
    const [selectedId, setSelectedId] = useState<string | null>(urlLead);
    const [seenLead, setSeenLead] = useState(urlLead);
    if (urlLead !== seenLead) {
        setSeenLead(urlLead);
        setSelectedId(urlLead);
    }
    const [qInput, setQInput] = useState(filters.q);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);
    const rowsRef = useRef<HTMLTableSectionElement>(null);

    const apply = useCallback((next: LeadListFilters, leadId: string | null = selectedId) => {
        setFilters(next);
        setChecked(new Set());
        window.history.replaceState(null, '', leadsUrl(next, leadId));
    }, [selectedId]);
    const patchFilters = (patch: Partial<LeadListFilters>) => apply({ ...filters, ...patch, page: patch.page ?? 1 });

    const select = useCallback((id: string | null) => {
        setSelectedId(id);
        window.history.replaceState(null, '', leadsUrl(filters, id));
    }, [filters]);

    // Шинэ лидийн deep link (?new=1) — нэг удаа нээгээд URL-ээс хасна.
    useEffect(() => {
        if (search.get('new') !== '1') return;
        openQuickCreate('lead');
        window.history.replaceState(null, '', leadsUrl(parseLeadFilters(search), search.get('lead')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Хайлт — 300ms debounce.
    useEffect(() => {
        const q = qInput.trim();
        if (q === filters.q) return;
        const t = setTimeout(() => apply({ ...filters, q, page: 1 }), 300);
        return () => clearTimeout(t);
    }, [qInput, filters, apply]);

    const { data, isLoading, isFetching, error, refetch } = useLeadsList({
        view: filters.view, queue: filters.queue, status: filters.status, source: filters.source, manager: filters.manager,
        project: filters.project, category: filters.category, period: filters.period, q: filters.q, sort: filters.sort,
        dir: filters.dir, page: filters.page, pageSize: PAGE_SIZE,
    });
    const { data: summary, error: summaryError } = useLeadSummary();
    const { data: managers = [] } = useManagers();
    const { data: projects = [] } = useLeadProjects();
    const { data: categories = [] } = useLeadCategories();
    const update = useUpdateLead();
    const savedViews = useSavedLeadViews();

    const leads = useMemo(() => data?.leads ?? [], [data]);
    const total = data?.pagination.total ?? 0;
    const totalPages = data?.pagination.totalPages ?? 1;
    const projectNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
    const selectedLeads = leads.filter((l) => checked.has(l.id));
    const bulkManagers = managers.filter((m) => selectedLeads.length === checked.size && selectedLeads.every((l) => !!l.project_id && m.project_ids?.includes(l.project_id)));
    const filterManagers = filters.project === 'all' ? managers : managers.filter((m) => m.project_ids?.includes(filters.project));
    const showCategory = categories.length > 0;
    const open = !!selectedId;

    const patchLead = (id: string, patch: LeadPatch) =>
        update.mutate({ id, patch }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа') });

    const toggleSort = (key: LeadSortKey) => {
        const dir = filters.sort === key ? (filters.dir === 'asc' ? 'desc' : 'asc') : key === 'customer_name' || key === 'next_followup_at' ? 'asc' : 'desc';
        patchFilters({ sort: key, dir });
    };

    const chooseQueue = (key: LeadWorkQueue) => {
        setQInput('');
        // Ижил тоог дахин дарвал анхаарах шүүлтүүр арилна; бусад шүүлтүүр цэвэрлэгдэж, төсөл хэвээр.
        apply(filters.queue === key ? { ...emptyLeadFilters(), project: filters.project } : { ...emptyLeadFilters(key), project: filters.project }, null);
        setSelectedId(null);
    };

    const resetFilters = () => {
        setQInput('');
        apply(emptyLeadFilters());
    };

    const applySaved = (query: string) => {
        const next = parseLeadFilters(new URLSearchParams(query));
        setQInput(next.q);
        apply(next);
    };

    // Гараар: ↑/↓ дараагийн лид (карт дагана), Enter нээх, Esc хаах.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
            if (e.key === 'Escape' && selectedId) { select(null); return; }
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && leads.length) {
                e.preventDefault();
                const idx = leads.findIndex((l) => l.id === selectedId);
                const next = e.key === 'ArrowDown' ? Math.min(leads.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
                select(leads[next].id);
                const row = rowsRef.current?.querySelector<HTMLElement>(`[data-lead-id="${leads[next].id}"] [data-row-open]`);
                row?.focus({ preventScroll: true });
                row?.closest('tr')?.scrollIntoView({ block: 'nearest' });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [leads, selectedId, select]);

    const bulk = async (patch: LeadPatch) => {
        const ids = [...checked];
        try {
            await Promise.all(ids.map((id) => update.mutateAsync({ id, patch })));
            toast.success(`${ids.length} лид шинэчлэгдлээ`);
            setChecked(new Set());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа');
        }
    };

    async function download() {
        setExporting(true);
        try { await dashboardDownload('/api/dashboard/export/excel?type=leads', 'Vertmon-leads.xlsx'); }
        catch (e) { toast.error(e instanceof Error ? e.message : 'Файл татаж чадсангүй.'); }
        finally { setExporting(false); }
    }

    const filtered = hasLeadFilters(filters) || !!qInput;
    const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
    const to = Math.min(filters.page * PAGE_SIZE, total);
    const subtitle = [shop?.name, typeof summary?.active === 'number' ? `${summary.active} идэвхтэй` : null].filter(Boolean).join(' · ');
    const listQuery = serializeLeadFilters({ ...filters, page: 1 }).toString();

    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
            <PageHeader
                title="Лид"
                subtitle={subtitle || undefined}
                className="mb-0"
                primaryAction={canWrite && <Button onClick={() => openQuickCreate('lead')}><Plus />Лид нэмэх</Button>}
                secondaryActions={<Button variant="ghost" isLoading={exporting} onClick={() => void download()} title="Төслийн бүх лидийг Excel-ээр татна"><Download />Excel · бүгд</Button>}
            />

            <section aria-label="Анхаарах лидүүд" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {LEAD_WORK_QUEUES.map((item) => {
                    const active = filters.queue === item.key;
                    const value = summaryError ? '—' : summary?.queues?.[item.key];
                    const urgent = item.key === 'overdue' && typeof value === 'number' && value > 0;
                    return (
                        <button key={item.key} type="button" aria-pressed={active} onClick={() => chooseQueue(item.key)} title={item.help}
                            className={cn('flex min-h-[88px] flex-col justify-between gap-2 rounded-xl border bg-surface p-4 text-left transition-colors',
                                active ? 'border-brand bg-brand-soft' : 'border-border hover:border-border-strong hover:bg-surface-2')}>
                            <span className="flex items-center gap-2 text-sm text-fg-2">
                                <span aria-hidden className={cn('size-1.5 rounded-full', urgent ? 'bg-status-danger' : value ? 'bg-status-pending' : 'bg-border-strong')} />
                                {item.label}
                            </span>
                            <span className={cn('num text-2xl font-semibold tracking-tight', active ? 'text-brand-strong' : 'text-foreground')}>{value ?? '…'}</span>
                        </button>
                    );
                })}
            </section>
            {filters.queue && <p role="status" className="-mt-2 text-sm text-fg-2">{LEAD_WORK_QUEUES.find((item) => item.key === filters.queue)?.help}</p>}
            {summaryError && <p role="status" className="-mt-2 text-xs text-muted-foreground">Анхаарах лидийн тоог уншиж чадсангүй.</p>}

            {/* Харагдац + хадгалсан харагдац + Жагсаалт ↔ Шатаар */}
            <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Харагдац" className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
                    {LEAD_VIEWS.map((v) => {
                        const n = summary?.[v.key];
                        const active = filters.view === v.key;
                        return (
                            <button key={v.key} type="button" aria-pressed={active} onClick={() => patchFilters({ view: v.key })}
                                className={cn('flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors', active ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:text-foreground')}>
                                {v.label}
                                {typeof n === 'number' && <span className={cn('num text-xs', active ? 'text-brand-strong' : 'text-muted-foreground')}>{n}</span>}
                            </button>
                        );
                    })}
                </div>
                {savedViews.views.map((v) => {
                    const active = v.query === viewQuery(filters);
                    return (
                        <span key={v.id} className={cn('group inline-flex h-10 items-center rounded-xl border pl-3 pr-1 text-sm', active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong')}>
                            <button type="button" aria-pressed={active} onClick={() => applySaved(v.query)} className="inline-flex items-center gap-1.5 font-medium">
                                <Bookmark className="size-3.5" />{v.name}
                            </button>
                            <button type="button" aria-label={`«${v.name}» харагдацыг устгах`} onClick={() => savedViews.remove(v.id)} className="ml-1 flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:bg-surface-2 hover:text-foreground group-hover:opacity-100">
                                <X className="size-3.5" />
                            </button>
                        </span>
                    );
                })}
                {savedViews.available && hasLeadFilters(filters) && !savedViews.views.some((v) => v.query === viewQuery(filters)) && (
                    <SaveViewButton onSave={(name) => {
                        if (savedViews.save(name, viewQuery(filters))) toast.success(`«${name.trim()}» харагдац хадгалагдлаа`);
                        else toast.error('Харагдацыг хадгалж чадсангүй (хөтчийн хадгалах сан хаалттай байж магадгүй).');
                    }} />
                )}
                <LeadsViewSwitch current="list" query={listQuery} className="ml-auto" />
            </div>

            <FilterBar className="mb-0" search={{ value: qInput, onChange: setQInput, label: 'Лидийг нэр, утсаар хайх', placeholder: 'Нэр, утас, имэйл эсвэл «нэргүй»…' }} showClear={filtered} onClear={resetFilters}
                rightSlot={<span className="num whitespace-nowrap text-xs text-muted-foreground">{isLoading ? '…' : `${total} мөр`}</span>}>
                {projects.length > 1 && <FilterChip value={filters.project} onChange={(v) => { patchFilters({ project: v, manager: 'all' }); select(null); }} label="Төсөл" options={projects.map((p) => [p.id, p.name])} />}
                <FilterChip value={filters.status} onChange={(v) => patchFilters({ status: v })} label="Статус" options={LEAD_STATUSES.map((s) => [s, STATUS_META[s].label])} />
                <FilterChip value={filters.source} onChange={(v) => patchFilters({ source: v })} label="Эх үүсвэр" options={SOURCES.map((s) => [s, SOURCE_LABEL[s]])} />
                {showCategory && <FilterChip value={filters.category} onChange={(v) => patchFilters({ category: v })} label="Ангилал" options={[[UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL], ...categories.map((c): [string, string] => [c.id, categoryOptionLabel(c)])]} />}
                {filterManagers.length > 0 && <FilterChip value={filters.manager} onChange={(v) => patchFilters({ manager: v })} label="Менежер" options={filterManagers.map((m) => [m.name, m.name])} />}
                <FilterChip value={filters.period} onChange={(v) => patchFilters({ period: v })} label="Огноо" options={[['week', '7 хоног'], ['month', '30 хоног'], ['quarter', '90 хоног'], ['year', '1 жил']]} />
            </FilterBar>

            {checked.size > 0 && canWrite && (
                <div role="toolbar" aria-label="Сонгосон лидэд" className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft px-4 py-2 text-sm">
                    <span className="font-medium text-brand-strong">{checked.size} сонгосон</span>
                    <span className="text-fg-2">Статус:</span>
                    <StatusPicker value="" onChange={(s, reason) => void bulk({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
                    {canAssign && bulkManagers.length > 0 && (<><span className="text-fg-2">Менежер:</span><ManagerPicker value={null} options={bulkManagers} onChange={(n) => void bulk({ sales_manager_name: n })} /></>)}
                    {categories.some((c) => c.is_active) && (<><span className="text-fg-2">Ангилал:</span><CategoryPicker value={undefined} options={categories} onChange={(id) => void bulk({ category_id: id })} /></>)}
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setChecked(new Set())}>Цуцлах</Button>
                </div>
            )}

            <div className={cn('grid items-start gap-4', open && 'xl:grid-cols-[minmax(0,1fr)_420px]')}>
                <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
                    {error ? (
                        <div role="alert" className="flex flex-col items-start gap-3 p-6 text-sm text-status-danger">
                            Лидүүдийг уншиж чадсангүй.
                            <Button size="sm" variant="secondary" onClick={() => void refetch()}>Дахин оролдох</Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <caption className="sr-only">Лидийн жагсаалт</caption>
                                <thead>
                                    <tr className="h-10 border-b border-border bg-surface-2/60 text-xs text-muted-foreground">
                                        <th scope="col" className="w-10 pl-4 pr-1 text-left">
                                            <RowCheck label="Бүгдийг сонгох" checked={leads.length > 0 && leads.every((l) => checked.has(l.id))} onChange={(v) => setChecked(v ? new Set(leads.map((l) => l.id)) : new Set())} />
                                        </th>
                                        <SortHeader label="Харилцагч" sortKey="customer_name" filters={filters} onSort={toggleSort} />
                                        <th scope="col" className="px-3 text-left font-medium">Шат</th>
                                        <SortHeader label="Дараагийн алхам" sortKey="next_followup_at" filters={filters} onSort={toggleSort} />
                                        <th scope="col" className="px-3 text-left font-medium">Хариуцагч</th>
                                        {!open && <th scope="col" className="px-3 text-left font-medium">Эх үүсвэр</th>}
                                        {!open && showCategory && <th scope="col" className="px-3 text-left font-medium">Ангилал</th>}
                                        {!open && <SortHeader label="Сүүлд холбогдсон" sortKey="last_contact_at" filters={filters} onSort={toggleSort} />}
                                    </tr>
                                </thead>
                                <tbody ref={rowsRef}>
                                    {isLoading && Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="h-14 border-b border-border last:border-b-0"><td colSpan={8} className="px-4"><Skeleton className="h-5" /></td></tr>
                                    ))}
                                    {!isLoading && leads.length === 0 && (
                                        <tr><td colSpan={8}>
                                            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                                                <p className="text-sm font-medium text-foreground">{filtered ? 'Энэ шүүлтүүрт лид алга' : 'Лид бүртгэгдээгүй байна'}</p>
                                                <p className="max-w-sm text-sm text-muted-foreground">{filtered ? 'Шүүлтүүрээ өөрчилж эсвэл цэвэрлэж үзнэ үү.' : 'Анхны лидээ бүртгээд дараагийн алхмаа товлоорой.'}</p>
                                                {filtered ? <Button size="sm" variant="secondary" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</Button>
                                                    : canWrite && <Button size="sm" onClick={() => openQuickCreate('lead')}><Plus />Лид нэмэх</Button>}
                                            </div>
                                        </td></tr>
                                    )}
                                    {leads.map((l) => (
                                        <LeadRowView key={l.id} lead={l} selected={l.id === selectedId} checked={checked.has(l.id)} open={open}
                                            canWrite={canWrite} canAssign={canAssign} showCategory={showCategory} managers={managers} categories={categories}
                                            projectName={projects.length > 1 || !l.project_id ? (l.project_id ? projectNames[l.project_id] || 'Төсөл' : 'Төсөл тодорхойгүй') : null}
                                            fetching={isFetching}
                                            onSelect={() => select(l.id === selectedId ? null : l.id)}
                                            onCheck={(v) => setChecked((prev) => { const n = new Set(prev); if (v) n.add(l.id); else n.delete(l.id); return n; })}
                                            onPatch={(patch) => patchLead(l.id, patch)} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                        <span className="num">{from}–{to} / {total}</span>
                        <Button variant="ghost" size="iconSm" disabled={filters.page <= 1} onClick={() => patchFilters({ page: filters.page - 1 })} aria-label="Өмнөх хуудас"><ChevronLeft /></Button>
                        <Button variant="ghost" size="iconSm" disabled={filters.page >= totalPages} onClick={() => patchFilters({ page: filters.page + 1 })} aria-label="Дараах хуудас"><ChevronRight /></Button>
                        <span className="ml-auto hidden lg:inline">↑ ↓ — лид солих · Enter — нээх · Esc — хаах</span>
                    </div>
                </div>

                {open && selectedId && (
                    <aside aria-label="Харилцагчийн карт"
                        className="fixed inset-y-0 right-0 z-30 mt-[var(--header-h)] w-[min(440px,100vw)] overflow-hidden border-l border-border bg-surface shadow-xl xl:sticky xl:top-[calc(var(--header-h)+1.5rem)] xl:right-auto xl:bottom-auto xl:z-auto xl:mt-0 xl:h-[calc(100dvh-var(--header-h)-3rem)] xl:w-auto xl:rounded-xl xl:border xl:shadow-none">
                        <LeadCard key={selectedId} leadId={selectedId} canWrite={canWrite} onClose={() => select(null)} onOpenLead={select} />
                    </aside>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

function LeadRowView({ lead, selected, checked, open, canWrite, canAssign, showCategory, managers, categories, projectName, fetching, onSelect, onCheck, onPatch }: {
    lead: LeadRow;
    selected: boolean;
    checked: boolean;
    open: boolean;
    canWrite: boolean;
    canAssign: boolean;
    showCategory: boolean;
    managers: ManagerOption[];
    categories: LeadCategoryRow[];
    projectName: string | null;
    fetching: boolean;
    onSelect: () => void;
    onCheck: (v: boolean) => void;
    onPatch: (patch: LeadPatch) => void;
}) {
    const step = describeNextStep(lead);
    return (
        <tr data-lead-id={lead.id} aria-selected={selected} onClick={onSelect}
            className={cn('h-14 cursor-pointer border-b border-border transition-colors last:border-b-0', selected ? 'bg-brand-soft/60 shadow-[inset_3px_0_0_var(--brand)]' : 'hover:bg-surface-2/70', fetching && 'opacity-90')}>
            <td className="pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                <RowCheck label={`${leadDisplayName(lead)} сонгох`} checked={checked} onChange={onCheck} />
            </td>
            <td className="max-w-[260px] px-3">
                <button type="button" data-row-open onClick={(e) => { e.stopPropagation(); onSelect(); }} aria-expanded={selected}
                    className={cn('block max-w-full truncate rounded-sm text-left font-medium', selected ? 'text-brand-strong' : isAnonymousLead(lead) ? 'text-muted-foreground' : 'text-foreground')}>
                    {leadDisplayName(lead)}
                </button>
                <span className="num block truncate text-xs text-muted-foreground">{lead.customer_phone || 'Утасгүй'}{projectName ? ` · ${projectName}` : ''}</span>
            </td>
            <td className="px-3" onClick={(e) => e.stopPropagation()}>
                <StatusPicker value={lead.status} disabled={!canWrite} onChange={(s, reason) => onPatch({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
            </td>
            <td className={cn('whitespace-nowrap px-3', step.overdue ? 'font-medium text-status-danger' : step.kind === 'none' ? 'text-muted-foreground' : 'text-fg-2')}>
                {step.kind === 'closed' ? step.action : `${step.action} · ${step.when}`}
            </td>
            <td className="px-3" onClick={(e) => e.stopPropagation()}>
                <ManagerPicker value={lead.sales_manager_name ?? null} options={managers} projectId={lead.project_id ?? null} disabled={!canAssign} onChange={(n) => onPatch({ sales_manager_name: n })} />
            </td>
            {!open && <td className="whitespace-nowrap px-3 text-fg-2">{sourceLabel(lead.source)}</td>}
            {!open && showCategory && (
                <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <CategoryPicker value={lead.category_id ?? null} options={categories} disabled={!canWrite} onChange={(id) => onPatch({ category_id: id })} />
                </td>
            )}
            {!open && <td className="whitespace-nowrap px-3 text-fg-2">{lead.last_contact_at ? formatRelativeDays(lead.last_contact_at) : 'Бүртгээгүй'}</td>}
        </tr>
    );
}

function SortHeader({ label, sortKey, filters, onSort }: { label: string; sortKey: LeadSortKey; filters: LeadListFilters; onSort: (key: LeadSortKey) => void }) {
    const active = filters.sort === sortKey;
    return (
        <th scope="col" className="px-3 text-left font-medium" aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onClick={() => onSort(sortKey)} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
                {label}
                {active && (filters.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
            </button>
        </th>
    );
}

function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()}
            className="size-4 cursor-pointer rounded border-control accent-[var(--brand)]" />
    );
}

function SaveViewButton({ onSave }: { onSave: (name: string) => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setName(''); }}>
            <PopoverTrigger asChild>
                <Button size="sm" variant="ghost"><BookmarkPlus />Харагдац хадгалах</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
                <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSave(name); setOpen(false); setName(''); }} className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-fg-2" htmlFor="lead-view-name">Харагдацын нэр</label>
                    <input id="lead-view-name" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Ж: Facebook-ийн шинэ лид"
                        className="h-9 rounded-lg border border-control bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Одоогийн шүүлтүүр энэ төхөөрөмж дээр хадгалагдана.</p>
                    <Button type="submit" size="sm" disabled={!name.trim()}>Хадгалах</Button>
                </form>
            </PopoverContent>
        </Popover>
    );
}
