'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

const SHOP_KEY = 'vertmonhub_active_shop_id';

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

const CATEGORY_LABEL: Record<string, string> = {
    residential: 'Орон сууц',
    parking: 'Зогсоол',
    industry: 'Агуулах',
    commercial: 'Үйлчилгээ',
};
const CATEGORY_ORDER = ['residential', 'parking', 'industry', 'commercial'];

type DotVariant = 'success' | 'danger' | 'pending' | 'info' | 'active' | 'neutral' | 'brand';

const STATUS_META: Record<string, { label: string; cell: string; dot: DotVariant; variant: 'success' | 'info' | 'warning' | 'default' | 'danger' }> = {
    available:   { label: 'Чөлөөтэй',   cell: 'bg-status-success-soft border-status-success/40 text-status-success hover:bg-status-success/20', dot: 'success', variant: 'success' },
    sold:        { label: 'Зарагдсан',  cell: 'bg-surface-3 border-border text-muted-foreground hover:bg-surface-2', dot: 'neutral', variant: 'default' },
    handed_over: { label: 'Хүлээлгэсэн', cell: 'bg-status-info-soft border-status-info/40 text-status-info hover:bg-status-info/20', dot: 'info', variant: 'info' },
    reserved:    { label: 'Хадгалсан',  cell: 'bg-status-pending-soft border-status-pending/40 text-status-pending hover:bg-status-pending/20', dot: 'pending', variant: 'warning' },
    ordered:     { label: 'Захиалсан',  cell: 'bg-status-pending-soft border-status-pending/50 text-status-pending hover:bg-status-pending/20', dot: 'pending', variant: 'warning' },
};
const STATUS_ORDER = ['available', 'ordered', 'reserved', 'sold', 'handed_over'];

function meta(status: string) {
    return STATUS_META[status] || STATUS_META.sold;
}
function formatMoney(n: number | null | undefined): string {
    if (n === null || n === undefined || n === 0) return '—';
    return new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
}
function shopHeaders(): HeadersInit {
    return { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' };
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
    const [summary, setSummary] = useState<SummaryRow[]>([]);
    const [phases, setPhases] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const [activePhase, setActivePhase] = useState<string>('');
    const [activeCategory, setActiveCategory] = useState<string>('residential');
    const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

    const [units, setUnits] = useState<UnitRow[]>([]);
    const [unitsLoading, setUnitsLoading] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<UnitRow | null>(null);

    // Initial summary
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/dashboard/units', { headers: shopHeaders() });
                const data = await res.json();
                setSummary(data.summary || []);
                setPhases(data.phases || []);
                setActivePhase((data.phases || [])[0] || '');
            } catch (e) {
                console.error('[Blocks] summary error', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Categories available in the active phase
    const categories = useMemo(() => {
        const set = new Set(summary.filter((r) => r.phase === activePhase).map((r) => r.category));
        return CATEGORY_ORDER.filter((c) => set.has(c));
    }, [summary, activePhase]);

    useEffect(() => {
        if (categories.length && !categories.includes(activeCategory)) setActiveCategory(categories[0]);
    }, [categories, activeCategory]);

    // Blocks for active phase + category
    const blocks = useMemo(() => {
        return summary
            .filter((r) => r.phase === activePhase && r.category === activeCategory)
            .sort((a, b) => String(a.block).localeCompare(String(b.block), undefined, { numeric: true }));
    }, [summary, activePhase, activeCategory]);

    const loadBlock = useCallback(async (block: string) => {
        setSelectedBlock(block);
        setUnits([]);
        setUnitsLoading(true);
        try {
            const params = new URLSearchParams({ phase: activePhase, block, category: activeCategory });
            const res = await fetch(`/api/dashboard/units?${params}`, { headers: shopHeaders() });
            const data = await res.json();
            setUnits(data.units || []);
        } catch (e) {
            console.error('[Blocks] units error', e);
        } finally {
            setUnitsLoading(false);
        }
    }, [activePhase, activeCategory]);

    if (loading) {
        return (
            <div>
                <PageHeader eyebrow="Үл хөдлөх" title="Блокийн харагдац" subtitle="Ээлж, блок бүрээр зарагдсан / зарагдаагүй нэгж" />
                <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
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
            <div className="flex flex-wrap gap-2 mb-3">
                {phases.map((p) => {
                    const phaseRows = summary.filter((r) => r.phase === p);
                    const total = phaseRows.reduce((s, r) => s + (r.total_units || 0), 0);
                    const avail = phaseRows.reduce((s, r) => s + (r.available_units || 0), 0);
                    return (
                        <button
                            key={p}
                            onClick={() => { setActivePhase(p); setSelectedBlock(null); setUnits([]); }}
                            className={cn(
                                'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors',
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
            <div className="flex flex-wrap gap-2 mb-4">
                {categories.map((c) => {
                    const rows = summary.filter((r) => r.phase === activePhase && r.category === c);
                    const total = rows.reduce((s, r) => s + (r.total_units || 0), 0);
                    return (
                        <button
                            key={c}
                            onClick={() => { setActiveCategory(c); setSelectedBlock(null); setUnits([]); }}
                            className={cn(
                                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                                activeCategory === c
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-surface border-border text-muted-foreground hover:bg-surface-2',
                            )}
                        >
                            {CATEGORY_LABEL[c] || c} ({total})
                        </button>
                    );
                })}
            </div>

            {/* Block cards */}
            {blocks.length === 0 ? (
                <EmptyState icon={<Building2 className="w-7 h-7" />} title="Энэ ангилалд блок алга" />
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-5">
                    {blocks.map((b) => {
                        const pctSold = b.total_units > 0 ? Math.round((b.sold_units / b.total_units) * 100) : 0;
                        const isSel = selectedBlock === b.block;
                        return (
                            <button
                                key={b.block}
                                onClick={() => loadBlock(b.block)}
                                className={cn(
                                    'text-left p-3.5 rounded-xl border transition-all',
                                    isSel ? 'border-brand ring-2 ring-brand/30 bg-brand-soft' : 'border-border bg-surface hover:bg-surface-2 hover:border-brand/40',
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
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-foreground flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-brand-strong" />
                                {activePhase} · Блок {selectedBlock} · {CATEGORY_LABEL[activeCategory]}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_ORDER.map((s) => {
                                    const count = units.filter((u) => u.status === s).length;
                                    if (!count) return null;
                                    const m = meta(s);
                                    return (
                                        <span key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <StatusDot variant={m.dot} /> {m.label} ({count})
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        {unitsLoading ? (
                            <div className="flex items-center justify-center py-16"><Spinner size="md" /></div>
                        ) : units.length === 0 ? (
                            <EmptyState icon={<DoorOpen className="w-7 h-7" />} title="Нэгж алга" />
                        ) : (
                            <UnitGrid units={units} category={activeCategory} onSelect={setSelectedUnit} selectedId={selectedUnit?.id} />
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
                        if (selectedBlock) loadBlock(selectedBlock);
                    }}
                />
            )}
        </div>
    );
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
                title={`${u.code} · ${m.label}${u.buyer_name ? ' · ' + u.buyer_name : ''}`}
                className={cn(
                    'relative h-12 w-full rounded-md border flex flex-col items-center justify-center text-center transition-all px-1',
                    m.cell,
                    selectedId === u.id && 'ring-2 ring-brand scale-105',
                )}
            >
                <span className="text-[10px] font-bold leading-tight truncate max-w-full">{u.unit_type || u.code.split('-').pop()}</span>
                <span className="text-[9px] opacity-75 leading-tight">
                    {u.rooms ? `${u.rooms}ө · ` : ''}{u.sale_area ? `${u.sale_area}м²` : ''}
                </span>
                {u.buyer_name && <StatusDot variant="brand" className="absolute top-1 right-1 size-1.5" />}
            </button>
        );
    };

    // Орон сууц → давхраар; зогсоол/агуулах/үйлчилгээ → хавтгай тор
    const useFloors = category === 'residential' && byFloor.length > 1;

    // Tailwind v4 нь динамик grid-cols-*-ийг үргэлж үүсгэдэггүй тул inline style ашиглав.
    const gridCols = { gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' };

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
const UNIT_STATUS_OPTIONS = [
    { value: 'available', label: 'Чөлөөтэй' },
    { value: 'reserved', label: 'Хадгалсан' },
    { value: 'ordered', label: 'Захиалсан' },
    { value: 'sold', label: 'Зарагдсан' },
    { value: 'handed_over', label: 'Хүлээлгэсэн' },
];

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
                        <button onClick={onClose} className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground transition-colors">
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
                                <Field label="Ангилал" value={CATEGORY_LABEL[u.category] || u.category} />
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
                                            <Field label="Гэрээний дүн" value={formatMoney(u.contract_total_price)} highlight />
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
            const res = await fetch('/api/dashboard/units', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' },
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
                    {UNIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
