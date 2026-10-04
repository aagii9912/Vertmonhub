'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Building2,
    Layers,
    X,
    User,
    IdCard,
    Ruler,
    DoorOpen,
    TrendingUp,
    Eye,
    Pencil,
    Save,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';
import { UNIT_CATEGORIES, UNIT_STATUSES, UNIT_STATUS_LABEL, unitCategoryLabel, type InventoryStatus } from '@/lib/inventory/labels';

interface SummaryRow {
    phase: string;
    block: string;
    category: string;
    total_units: number;
    available_units: number;
    sold_units: number;
    pending_units: number;
    total_area: number | null;
}

interface UnitRow {
    id: string;
    code: string;
    phase: string;
    block: string;
    building_number: string | null;
    floor: string | null;
    category: string;
    unit_type: string | null;
    model: string | null;
    window_view: string | null;
    rooms: number | null;
    sale_area: number | null;
    contracted_area: number | null;
    status: string;
    raw_status: string | null;
    sales_channel: string | null;
    sales_manager: string | null;
    buyer_name: string | null;
    buyer_registration: string | null;
    contract_total_price: number | null;
    contract_status: string | null;
}

interface UnitSummary {
    summary: SummaryRow[];
    phases: string[];
}

const NO_SUMMARY: SummaryRow[] = [];
const NO_PHASES: string[] = [];
const NO_UNITS: UnitRow[] = [];

type DotVariant = 'success' | 'danger' | 'pending' | 'info' | 'active' | 'neutral' | 'brand';

const STATUS_STYLE: Record<InventoryStatus, { cell: string; dot: DotVariant; variant: 'success' | 'info' | 'warning' | 'default' | 'danger' }> = {
    available:   { cell: 'bg-status-success-soft border-status-success/40 text-status-success hover:bg-status-success/20', dot: 'success', variant: 'success' },
    sold:        { cell: 'bg-surface-3 border-border text-muted-foreground hover:bg-surface-2', dot: 'neutral', variant: 'default' },
    handed_over: { cell: 'bg-status-info-soft border-status-info/40 text-status-info hover:bg-status-info/20', dot: 'info', variant: 'info' },
    reserved:    { cell: 'bg-status-pending-soft border-status-pending/40 text-status-pending hover:bg-status-pending/20', dot: 'pending', variant: 'warning' },
    ordered:     { cell: 'bg-status-pending-soft border-status-pending/50 text-status-pending hover:bg-status-pending/20', dot: 'pending', variant: 'warning' },
};

/** Мэдэгдэхгүй төлөв «Зарагдсан» шиг харагдана (сонгох боломжгүй). */
function meta(status: string) {
    const key = (Object.hasOwn(STATUS_STYLE, status) ? status : 'sold') as InventoryStatus;
    return { label: UNIT_STATUS_LABEL[key], ...STATUS_STYLE[key] };
}
function floorNum(floor: string | null): number {
    if (!floor) return 999;
    const s = String(floor).trim().toUpperCase();
    const b = s.match(/^B(\d+)/);
    if (b) return -parseInt(b[1], 10);
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 998;
}

export default function BlocksPage() {
    const { shop, user } = useAuth();
    const scope = [shop?.id, user?.id, user?.role] as const;

    const [phaseChoice, setPhaseChoice] = useState<string>('');
    const [categoryChoice, setCategoryChoice] = useState<string>('residential');
    const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<UnitRow | null>(null);

    // Ирсэн хариуг шалгадаг тул useDashboardQuery биш. signal ашигладаг тул хуудаснаас гарахад
    // хүсэлт цуцлагдана; хуучин шигээ автоматаар дахин оролдохгүй («Дахин оролдох» товчоор).
    const summaryQuery = useQuery<UnitSummary>({
        queryKey: ['units', 'summary', ...scope],
        queryFn: async ({ signal }) => {
            const data = await dashboardJson<UnitSummary>('/api/dashboard/units', { signal });
            if (!Array.isArray(data.summary) || !Array.isArray(data.phases)) {
                throw new Error('Блокийн мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.');
            }
            return data;
        },
        enabled: !!shop?.id,
        staleTime: 30_000,
        retry: false,
        meta: { inlineError: true },
    });
    const summary = summaryQuery.data?.summary ?? NO_SUMMARY;
    const phases = summaryQuery.data?.phases ?? NO_PHASES;
    // Сонгоогүй (эсвэл алга болсон) ээлж бол эхний ээлж.
    const activePhase = phases.includes(phaseChoice) ? phaseChoice : (phases[0] ?? '');

    const clearBlock = () => {
        setSelectedBlock(null);
        setSelectedUnit(null);
    };

    // Categories available in the active phase
    const categories = useMemo<string[]>(() => {
        const set = new Set(summary.filter((r) => r.phase === activePhase).map((r) => r.category));
        return UNIT_CATEGORIES.filter((c) => set.has(c));
    }, [summary, activePhase]);
    // Ээлжид сонгосон ангилал байхгүй бол эхний ангилал (ээлж солиход харагдаж буй ангиллаа хадгална).
    const activeCategory = categories.length > 0 && !categories.includes(categoryChoice) ? categories[0] : categoryChoice;

    // Blocks for active phase + category
    const blocks = useMemo(() => {
        return summary
            .filter((r) => r.phase === activePhase && r.category === activeCategory)
            .sort((a, b) => String(a.block).localeCompare(String(b.block), undefined, { numeric: true }));
    }, [summary, activePhase, activeCategory]);

    // Сонгосон блокийн нэгжүүд. Блок, ээлж эсвэл ангилал солигдоход өмнөх хүсэлт signal-аар
    // цуцлагдаж, хоцорч ирсэн хариу шинэ блокийг дарахгүй.
    const unitsQuery = useQuery<UnitRow[]>({
        queryKey: ['units', 'block', activePhase, activeCategory, selectedBlock, ...scope],
        queryFn: async ({ signal }) => {
            const params = new URLSearchParams({ phase: activePhase, block: selectedBlock ?? '', category: activeCategory });
            const data = await dashboardJson<{ units: UnitRow[] }>(`/api/dashboard/units?${params}`, { signal });
            if (!Array.isArray(data.units)) {
                throw new Error('Нэгжийн мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.');
            }
            return data.units;
        },
        enabled: !!shop?.id && !!selectedBlock,
        staleTime: 30_000,
        retry: false,
        meta: { inlineError: true },
    });
    const units = unitsQuery.data ?? NO_UNITS;
    // «Дахин оролдох» дарахад хуучин шигээ spinner.
    const unitsLoading = unitsQuery.isPending || (unitsQuery.isError && unitsQuery.isFetching);

    // Нэгтгэлгүй үед л бүтэн хуудсаар ачаалалт/алдаа харуулна: фон шинэчлэлт амжилтгүй
    // болбол нээлттэй нэгж, засварын форм алга болохгүй (алдааг QueryProvider toast мэдэгдэнэ).
    if (!summaryQuery.data) {
        const summaryError = summaryQuery.isFetching ? null : summaryQuery.error;
        return (
            <div>
                <PageHeader eyebrow="Үл хөдлөх" title="Блокийн харагдац" subtitle="Ээлж, блок бүрээр зарагдсан / зарагдаагүй нэгж" />
                {!summaryError ? <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div> : (
                    <div role="alert">
                        <EmptyState
                            icon={<Building2 className="w-7 h-7" />}
                            title="Блокийн мэдээллийг ачаалж чадсангүй"
                            description={summaryError.message}
                            action={<Button onClick={() => void summaryQuery.refetch()}>Дахин оролдох</Button>}
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Үл хөдлөх"
                title="Блокийн харагдац"
                subtitle="Ээлж, блок бүрээр зарагдсан / зарагдаагүй нэгж ба худалдан авагч"
            />

            {/* Phase tabs */}
            <div className="mb-2 flex flex-wrap gap-1 border-y border-border py-2">
                {phases.map((p) => {
                    const phaseRows = summary.filter((r) => r.phase === p);
                    const total = phaseRows.reduce((s, r) => s + (r.total_units || 0), 0);
                    const avail = phaseRows.reduce((s, r) => s + (r.available_units || 0), 0);
                    return (
                        <button
                            key={p}
                            onClick={() => { clearBlock(); setPhaseChoice(p); setCategoryChoice(activeCategory); }}
                            className={cn(
                                'flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors md:min-h-[34px]',
                                activePhase === p
                                    ? 'bg-brand-soft border-brand text-brand-strong'
                                    : 'bg-surface border-border text-muted-foreground hover:bg-surface-2',
                            )}
                        >
                            <Layers className="w-4 h-4" />
                            {p}
                            <span className="text-[11px] opacity-70">{avail}/{total}</span>
                        </button>
                    );
                })}
            </div>

            {/* Category chips */}
            <div className="mb-3 flex flex-wrap gap-1">
                {categories.map((c) => {
                    const rows = summary.filter((r) => r.phase === activePhase && r.category === c);
                    const total = rows.reduce((s, r) => s + (r.total_units || 0), 0);
                    return (
                        <button
                            key={c}
                            onClick={() => { clearBlock(); setCategoryChoice(c); }}
                            className={cn(
                                'min-h-9 rounded-md border px-3 text-xs font-medium transition-colors',
                                activeCategory === c
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-surface border-border text-muted-foreground hover:bg-surface-2',
                            )}
                        >
                            {unitCategoryLabel(c)} ({total})
                        </button>
                    );
                })}
            </div>

            {/* Block cards */}
            {blocks.length === 0 ? (
                <EmptyState icon={<Building2 className="w-7 h-7" />} title="Энэ ангилалд блок алга" />
            ) : (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {blocks.map((b) => {
                        const pctSold = b.total_units > 0 ? Math.round((b.sold_units / b.total_units) * 100) : 0;
                        const isSel = selectedBlock === b.block;
                        return (
                            <button
                                key={b.block}
                                onClick={() => {
                                    setSelectedUnit(null);
                                    // Сонгосон блокийг дахин дарвал хуучин шигээ нэгжүүдийг дахин ачаална.
                                    if (isSel) void unitsQuery.refetch();
                                    else setSelectedBlock(b.block);
                                }}
                                aria-pressed={isSel}
                                className={cn(
                                    'focus-ring min-h-32 rounded-md border p-3 text-left transition-colors',
                                    isSel ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:bg-surface-2',
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                                        <Building2 className="w-4 h-4 text-brand-strong" /> {b.block}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">{b.total_units} нэгж</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex mb-2">
                                    <div className="h-full bg-muted-foreground/50" style={{ width: `${pctSold}%` }} title={`Зарагдсан ${pctSold}%`} />
                                    <div className="h-full bg-status-success" style={{ width: `${b.total_units > 0 ? Math.round((b.available_units / b.total_units) * 100) : 0}%` }} />
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-status-success font-medium">{b.available_units} чөлөөтэй</span>
                                    <span className="text-muted-foreground">{pctSold}% зарагдсан</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Selected block units */}
            {selectedBlock && (
                <Card>
                    <CardContent className="p-3 md:p-4">
                        <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                            <h3 className="font-semibold text-foreground flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-brand-strong" />
                                {activePhase} · Блок {selectedBlock} · {unitCategoryLabel(activeCategory)}
                            </h3>

                        </div>

                        {unitsLoading ? (
                            <div className="flex items-center justify-center py-16"><Spinner size="md" /></div>
                        ) : unitsQuery.error ? (
                            <div role="alert">
                                <EmptyState
                                    icon={<DoorOpen className="w-7 h-7" />}
                                    title="Нэгжийн мэдээллийг ачаалж чадсангүй"
                                    description={unitsQuery.error.message}
                                    action={<Button onClick={() => void unitsQuery.refetch()}>Дахин оролдох</Button>}
                                />
                            </div>
                        ) : units.length === 0 ? (
                            <EmptyState icon={<DoorOpen className="w-7 h-7" />} title="Нэгж алга" />
                        ) : (
                            <UnitBrowser key={`${activePhase}:${selectedBlock}:${activeCategory}`} units={units} category={activeCategory} onSelect={setSelectedUnit} selectedId={selectedUnit?.id} />
                        )}
                    </CardContent>
                </Card>
            )}

            {selectedUnit && (
                <UnitDrawer
                    unit={selectedUnit}
                    onClose={() => setSelectedUnit(null)}
                    onUpdated={(patch) => {
                        setSelectedUnit((u) => (u ? { ...u, ...patch } : u));
                        if (selectedBlock) void unitsQuery.refetch();
                    }}
                />
            )}
        </div>
    );
}

// Шүүлтүүр нь зөвхөн сонгосон блокийн нэгжүүдэд үйлчилнэ.
function UnitBrowser({ units, category, onSelect, selectedId }: {
    units: UnitRow[]; category: string; onSelect: (unit: UnitRow) => void; selectedId?: string;
}) {
    const [status, setStatus] = useState('all');
    const [rooms, setRooms] = useState('all');
    const [query, setQuery] = useState('');
    const [minArea, setMinArea] = useState('');
    const [maxArea, setMaxArea] = useState('');
    const [view, setView] = useState<'grid' | 'table'>('grid');
    const roomOptions = [...new Set(units.flatMap(u => u.rooms == null ? [] : [u.rooms]))].sort((a, b) => a - b);
    const filtered = units.filter(u => (status === 'all' || u.status === status)
        && (rooms === 'all' || String(u.rooms) === rooms)
        && (!query.trim() || u.code.toLowerCase().includes(query.trim().toLowerCase()))
        && (!minArea || (u.sale_area != null && u.sale_area >= Number(minArea)))
        && (!maxArea || (u.sale_area != null && u.sale_area <= Number(maxArea))));
    const hasFilter = status !== 'all' || rooms !== 'all' || !!query || !!minArea || !!maxArea;
    const reset = () => { setStatus('all'); setRooms('all'); setQuery(''); setMinArea(''); setMaxArea(''); };
    const inputClass = 'h-11 rounded-md border border-border bg-surface px-2 text-sm focus-ring md:h-[34px]';
    return <div className="space-y-3">
        <div className="flex flex-wrap gap-1 border-y border-border py-2" role="group" aria-label="Нэгжийн төлөвөөр шүүх">
            {['all', ...UNIT_STATUSES].map(value => {
                const count = value === 'all' ? units.length : units.filter(u => u.status === value).length;
                return <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn('flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs focus-ring md:min-h-[34px]', status === value ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:bg-surface-2')}>
                    {value !== 'all' && <StatusDot variant={meta(value).dot} />}{value === 'all' ? 'Бүгд' : meta(value).label} <span className="tabular-nums">{count}</span>
                </button>;
            })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Нэгжийн кодоор хайх" placeholder="Тоот / код хайх" value={query} onChange={e => setQuery(e.target.value)} className={cn(inputClass, 'min-w-0 w-full sm:w-44')} />
            {roomOptions.length > 0 && <select aria-label="Өрөөний тоо" value={rooms} onChange={e => setRooms(e.target.value)} className={inputClass}><option value="all">Бүх өрөө</option>{roomOptions.map(n => <option key={n} value={n}>{n} өрөө</option>)}</select>}
            <input type="number" min="0" step="any" aria-label="Талбай хамгийн бага (м²)" placeholder="м² доод" value={minArea} onChange={e => setMinArea(e.target.value)} className={cn(inputClass, 'w-24')} />
            <input type="number" min="0" step="any" aria-label="Талбай хамгийн их (м²)" placeholder="м² дээд" value={maxArea} onChange={e => setMaxArea(e.target.value)} className={cn(inputClass, 'w-24')} />
            <div className="flex gap-1 sm:ml-auto" role="group" aria-label="Нэгжийн харагдац">{(['grid', 'table'] as const).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn(inputClass, view === v && 'border-brand bg-brand-soft text-brand-strong')}>{v === 'grid' ? 'Давхраар' : 'Хүснэгт'}</button>)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><p role="status">{units.length} нэгжээс {filtered.length} харагдаж байна</p>{hasFilter && <button type="button" onClick={reset} className="min-h-9 text-brand-strong hover:underline focus-ring">Шүүлтүүр цэвэрлэх</button>}</div>
        {filtered.length === 0 ? <EmptyState icon={<DoorOpen className="h-6 w-6" />} title="Шүүлтүүрт тохирох нэгж алга" description="Төлөв, өрөө эсвэл талбайн нөхцөлийг өөрчилнө үү." /> : view === 'grid' ? <UnitGrid units={filtered} category={category} onSelect={onSelect} selectedId={selectedId} /> : <div className="max-h-[600px] overflow-auto rounded-md border border-border"><table className="w-full text-sm"><caption className="sr-only">Сонгосон блокийн шүүсэн нэгжүүд</caption><thead className="sticky top-0 bg-surface-2"><tr>{['Тоот / код', 'Давхар', 'Өрөө', 'Талбай', 'Төлөв'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium">{label}</th>)}</tr></thead><tbody>{filtered.map(u => <tr key={u.id} className={cn('border-t border-border', selectedId === u.id && 'bg-brand-soft')}><td className="px-3"><button type="button" onClick={() => onSelect(u)} className="min-h-11 whitespace-nowrap font-medium text-brand-strong underline-offset-4 hover:underline focus-ring">{u.code}</button></td><td className="px-3">{u.floor ?? '—'}</td><td className="px-3">{u.rooms ?? '—'}</td><td className="whitespace-nowrap px-3">{u.sale_area == null ? '—' : `${u.sale_area} м²`}</td><td className="whitespace-nowrap px-3"><Badge variant={meta(u.status).variant}>{meta(u.status).label}</Badge></td></tr>)}</tbody></table></div>}
    </div>;
}

// ============================================
// Unit grid — орон сууц давхраар, бусад нь хавтгай тор
// ============================================
function UnitGrid({ units, category, onSelect, selectedId }: {
    units: UnitRow[];
    category: string;
    onSelect: (u: UnitRow) => void;
    selectedId?: string;
}) {
    const byFloor = useMemo(() => {
        const map = new Map<number, UnitRow[]>();
        for (const u of units) {
            const f = floorNum(u.floor);
            if (!map.has(f)) map.set(f, []);
            map.get(f)!.push(u);
        }
        return [...map.entries()].sort((a, b) => b[0] - a[0]); // дээд давхар эхэнд
    }, [units]);

    const Cell = (u: UnitRow) => {
        const m = meta(u.status);
        return (
            <button
                key={u.id}
                onClick={() => onSelect(u)}
                aria-label={`${u.code} · ${m.label} · ${u.rooms ? `${u.rooms} өрөө · ` : ''}${u.sale_area ?? '—'} м²`}
                title={`${u.code} · ${m.label}${u.buyer_name ? ' · ' + u.buyer_name : ''}`}
                className={cn(
                    'relative h-14 w-full rounded-md border flex flex-col items-center justify-center text-center transition-all px-1',
                    m.cell,
                    selectedId === u.id && 'ring-2 ring-brand scale-105',
                )}
            >
                <span className="text-xs font-semibold leading-tight truncate max-w-full">{u.code}</span>
                <span className="text-[11px] leading-relaxed">
                    {u.rooms ? `${u.rooms}ө · ` : ''}{u.sale_area ? `${u.sale_area}м²` : ''}
                </span>
                {u.buyer_name && <StatusDot variant="brand" className="absolute top-1 right-1 size-1.5" />}
            </button>
        );
    };

    // Орон сууц → давхраар; зогсоол/агуулах/үйлчилгээ → хавтгай тор
    const useFloors = category === 'residential' && byFloor.length > 1;

    // Tailwind v4 нь динамик grid-cols-*-ийг үргэлж үүсгэдэггүй тул inline style ашиглав.
    const gridCols = { gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' };

    if (!useFloors) {
        return (
            <div className="grid gap-1.5 max-h-[560px] overflow-y-auto pr-1" style={gridCols}>
                {units.map((u) => Cell(u))}
            </div>
        );
    }

    return (
        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {byFloor.map(([floor, floorUnits]) => (
                <div key={floor} className="flex items-stretch gap-2">
                    <div className="w-10 flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-muted-foreground/70">
                        {floor < 0 ? `B${-floor}` : floor >= 998 ? '—' : `${floor}`}
                    </div>
                    <div className="flex-1 grid gap-1.5" style={gridCols}>
                        {floorUnits.map((u) => Cell(u))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================
// Unit detail drawer
// ============================================
const UNIT_INPUT_CLS = 'w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/40';

function UnitDrawer({ unit: u, onClose, onUpdated }: {
    unit: UnitRow;
    onClose: () => void;
    onUpdated: (patch: Partial<UnitRow>) => void;
}) {
    const m = meta(u.status);
    const isSold = u.status === 'sold' || u.status === 'handed_over';
    const [editing, setEditing] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-surface border-l border-border overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
                    <div>
                        <div className="heading-section text-foreground">{u.code}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                            {u.phase} · Блок {u.block}{u.floor ? ` · ${u.floor} давхар` : ''}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant={m.variant}>{m.label}</Badge>
                        <button
                            onClick={() => setEditing((e) => !e)}
                            className={cn(
                                'p-1.5 rounded-md transition-colors',
                                editing ? 'bg-brand-soft text-brand-strong' : 'hover:bg-surface-2 text-muted-foreground hover:text-foreground',
                            )}
                            title="Засах"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={onClose} aria-label="Хаах" className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {editing ? (
                        <UnitEditForm unit={u} onCancel={() => setEditing(false)} onSaved={(patch) => { setEditing(false); onUpdated(patch); }} />
                    ) : (
                        <>
                            <Section icon={<DoorOpen className="w-4 h-4 text-status-success" />} title="Нэгж">
                                <Field label="Ангилал" value={unitCategoryLabel(u.category)} />
                                <Field label="Айлын төрөл / Загвар" value={`${u.unit_type || '—'} / ${u.model || '—'}`} />
                                <Field label="Өрөөний тоо" value={u.rooms ? `${u.rooms} өрөө` : null} icon={<DoorOpen className="w-3 h-3" />} />
                                <Field label="Талбай" value={u.sale_area ? `${u.sale_area} м²` : null} icon={<Ruler className="w-3 h-3" />} />
                                <Field label="Цонхны харагдац" value={u.window_view} icon={<Eye className="w-3 h-3" />} />
                            </Section>

                            {isSold && (
                                <Section icon={<User className="w-4 h-4 text-brand" />} title="Худалдан авагч">
                                    {u.buyer_name ? (
                                        <>
                                            <Field label="Нэр" value={u.buyer_name} />
                                            <Field label="Регистр" value={u.buyer_registration} icon={<IdCard className="w-3 h-3" />} />
                                            <Field label="Гэрээний дүн" value={u.contract_total_price ? formatMNT(u.contract_total_price) : '—'} highlight />
                                        </>
                                    ) : (
                                        <p className="text-[12px] text-muted-foreground">Гэрээтэй холбогдсон худалдан авагч олдсонгүй.</p>
                                    )}
                                </Section>
                            )}

                            <Section icon={<TrendingUp className="w-4 h-4 text-status-info" />} title="Борлуулалт">
                                <Field label="Менежер" value={u.sales_manager} />
                                <Field label="Суваг" value={u.sales_channel} />
                                <Field label="Эх төлөв" value={u.raw_status} />
                            </Section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Нэгж гараар засах форм — PATCH /api/dashboard/units
function UnitEditForm({ unit: u, onCancel, onSaved }: {
    unit: UnitRow;
    onCancel: () => void;
    onSaved: (patch: Partial<UnitRow>) => void;
}) {
    const [form, setForm] = useState({
        status: u.status,
        sales_manager: u.sales_manager || '',
        sales_channel: u.sales_channel || '',
        unit_type: u.unit_type || '',
        model: u.model || '',
        window_view: u.window_view || '',
        rooms: u.rooms != null ? String(u.rooms) : '',
        sale_area: u.sale_area != null ? String(u.sale_area) : '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    async function save() {
        setSaving(true);
        try {
            const patch: Record<string, unknown> = {
                status: form.status,
                sales_manager: form.sales_manager || null,
                sales_channel: form.sales_channel || null,
                unit_type: form.unit_type || null,
                model: form.model || null,
                window_view: form.window_view || null,
                rooms: form.rooms === '' ? null : Number(form.rooms),
                sale_area: form.sale_area === '' ? null : Number(form.sale_area),
            };
            const res = await dashboardFetch('/api/dashboard/units', {
                method: 'PATCH',
                body: JSON.stringify({ id: u.id, ...patch }),
            });
            if (res.ok) {
                toast.success('Нэгж шинэчлэгдлээ');
                onSaved(patch as Partial<UnitRow>);
            } else {
                const d = await res.json().catch(() => ({}));
                toast.error(d.error || 'Хадгалахад алдаа гарлаа');
            }
        } catch {
            toast.error('Сүлжээний алдаа');
        } finally {
            setSaving(false);
        }
    }

    const label = (t: string) => <span className="mb-1 block text-2xs text-muted-foreground">{t}</span>;

    return (
        <div className="space-y-3">
            <h3 className="heading-section text-sm text-foreground flex items-center gap-2">
                <Pencil className="w-4 h-4 text-brand" /> Нэгж засах
            </h3>

            <label className="block">
                {label('Төлөв')}
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={UNIT_INPUT_CLS}>
                    {UNIT_STATUSES.map((value) => <option key={value} value={value}>{UNIT_STATUS_LABEL[value]}</option>)}
                </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="block">{label('Айлын төрөл')}<input value={form.unit_type} onChange={(e) => set('unit_type', e.target.value)} className={UNIT_INPUT_CLS} /></label>
                <label className="block">{label('Загвар')}<input value={form.model} onChange={(e) => set('model', e.target.value)} className={UNIT_INPUT_CLS} /></label>
                <label className="block">{label('Өрөөний тоо')}<input type="text" inputMode="numeric" value={form.rooms} onChange={(e) => set('rooms', e.target.value.replace(/[^0-9]/g, ''))} className={UNIT_INPUT_CLS} /></label>
                <label className="block">{label('Талбай (м²)')}<input type="text" inputMode="decimal" value={form.sale_area} onChange={(e) => set('sale_area', e.target.value.replace(/[^0-9.]/g, ''))} className={UNIT_INPUT_CLS} /></label>
                <label className="block">{label('Менежер')}<input value={form.sales_manager} onChange={(e) => set('sales_manager', e.target.value)} className={UNIT_INPUT_CLS} /></label>
                <label className="block">{label('Суваг')}<input value={form.sales_channel} onChange={(e) => set('sales_channel', e.target.value)} className={UNIT_INPUT_CLS} /></label>
            </div>
            <label className="block">{label('Цонхны харагдац')}<input value={form.window_view} onChange={(e) => set('window_view', e.target.value)} className={UNIT_INPUT_CLS} /></label>

            <div className="flex justify-end gap-2 pt-1">
                <Button onClick={onCancel} variant="ghost" size="sm">Болих</Button>
                <Button onClick={save} isLoading={saving} variant="primary" size="sm">
                    {!saving && <Save className="w-4 h-4" />} Хадгалах
                </Button>
            </div>
        </div>
    );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2.5">{icon}<h3 className="heading-section text-sm text-foreground">{title}</h3></div>
            <div className="space-y-1.5 pl-1">{children}</div>
        </div>
    );
}

function Field({ label, value, icon, highlight }: { label: string; value: string | number | null | undefined; icon?: React.ReactNode; highlight?: boolean }) {
    const display = value === null || value === undefined || value === '' ? '—' : String(value);
    return (
        <div className="flex items-start justify-between gap-3 text-sm py-1 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[12px]">{icon}{label}</div>
            <div className={cn('text-right tabular-nums', highlight ? 'text-status-success font-semibold' : 'text-foreground')}>{display}</div>
        </div>
    );
}
