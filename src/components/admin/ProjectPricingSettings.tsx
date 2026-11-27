'use client';

import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSpreadsheet, ListPlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardJson, dashboardMutate, DashboardApiError } from '@/lib/api/dashboardFetch';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
    EMPTY_PRICING_DRAFT, MAX_PRICE_LISTS, PriceListNameSchema, PricingSaveSchema, priceListConflict, pricingKey,
    type PriceListOverview, type PricingConfig, type PricingRule,
} from '@/lib/sales/pricing';
import { PricingImportPanel } from './PricingImportPanel';

type Overview = { lists: PriceListOverview[] };
/** `gid` groups the rules of one price-sheet row (a model on a floor range); it never leaves the editor. */
type RuleForm = { [K in keyof PricingRule]: string } & { gid: string };
let groupCounter = 0;
const newGroup = () => `g${++groupCounter}`;
const advanceValid = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const ALL_ROWS = '*';
const emptyRule = (): RuleForm => ({ block: '', model: '', floor_min: '', floor_max: '', payment_condition: '', price_per_sqm: '', advance_percent: '', gid: newGroup() });
/** Saved rules → form rows; rules of one block, model and floor range share a sheet row. */
function ruleForms(rules: readonly PricingRule[]): RuleForm[] {
    const groups = new Map<string, string>();
    return rules.map(rule => {
        const key = [pricingKey(rule.block), pricingKey(rule.model), rule.floor_min, rule.floor_max].join('|');
        if (!groups.has(key)) groups.set(key, newGroup());
        return { ...Object.fromEntries(Object.entries(rule).map(([field, value]) => [field, value === null ? '' : String(value)])) as { [K in keyof PricingRule]: string }, gid: groups.get(key)! };
    });
}
/** A sheet row's placeholder: it has the model and floors but no price yet. */
const isPlaceholder = (row: RuleForm) => row.payment_condition.trim() === '' && row.price_per_sqm.trim() === '';
const fields: Array<{ key: keyof PricingRule; label: string; numeric?: boolean }> = [
    { key: 'block', label: 'Блок' }, { key: 'model', label: 'Загвар' },
    { key: 'floor_min', label: 'Давхар эхлэх', numeric: true }, { key: 'floor_max', label: 'Давхар дуусах', numeric: true },
    { key: 'payment_condition', label: 'Нөхцөл' }, { key: 'price_per_sqm', label: 'м² үнэ (₮)', numeric: true },
    { key: 'advance_percent', label: 'Эхний урьдчилгаа (%)', numeric: true },
];

/** Root admin projects page wires the chosen shop; the API rechecks access independently. */
export function ProjectPricingSettings({ shopId, projectName, onSaved }: { shopId: string; projectName?: string; onSaved?: () => void }) {
    const query = useQuery({
        queryKey: ['project-pricing', shopId], enabled: !!shopId,
        queryFn: () => dashboardJson<Overview>('/api/admin/pricing', { shopId }),
        staleTime: Infinity, refetchOnWindowFocus: false, meta: { inlineError: true },
    });
    return <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Үнийн нөхцөл{projectName ? ` · ${projectName}` : ''}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Баталсан эх сурвалжийн үнийг оруулна. Ноорог уулзалтын тооцоонд ашиглагдахгүй. Өөр хүчинтэй хугацаатай үнийг (тусгай үнэ) тусдаа жагсаалтаар оруулна.</p>
        {query.isPending ? <p className="mt-4 text-sm">Ачаалж байна…</p>
            : query.error && !query.data ? <p role="alert" className="mt-4 text-sm text-status-danger">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Дахин ачаалах</button></p>
                : query.data && <PriceLists shopId={shopId} overview={query.data} version={query.dataUpdatedAt} onSaved={async () => {
                    onSaved?.();
                    const result = await query.refetch();
                    if (result.error) throw result.error;
                }} />}
    </section>;
}

/** List chooser: every list keeps its own versions, validity window and archive; a new list exists once it is saved. */
function PriceLists({ shopId, overview, version, onSaved }: { shopId: string; overview: Overview; version: number; onSaved: () => Promise<unknown> }) {
    const id = useId();
    const [added, setAdded] = useState<PriceListOverview[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [naming, setNaming] = useState(false);
    const [newName, setNewName] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    // A list added here stays local until its first save puts it on the server.
    const lists = useMemo(() => [...overview.lists, ...added.filter(item => !overview.lists.some(list => list.key === item.key))], [overview.lists, added]);
    const current = lists.find(list => list.key === selected) ?? lists[0];

    function addList() {
        const parsed = PriceListNameSchema.safeParse(newName);
        if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? 'Нэр буруу байна'); return; }
        if (lists.some(list => list.name.trim().toLowerCase() === parsed.data.toLowerCase())) { setNameError('Ийм нэртэй үнийн жагсаалт байна'); return; }
        const key = crypto.randomUUID();
        setAdded(previous => [...previous, { key, name: parsed.data, latest: null, active: null }]);
        setSelected(key); setNaming(false); setNewName(''); setNameError(null);
    }

    if (!current) return null;
    return <div className="mt-4 space-y-4">
        <div role="group" aria-label="Үнийн жагсаалт" className="flex flex-wrap items-center gap-2">
            {lists.map(list => <Button key={list.key} type="button" size="sm" variant={list.key === current.key ? 'primary' : 'secondary'}
                aria-pressed={list.key === current.key} onClick={() => setSelected(list.key)}>
                {list.name}
                <Badge variant={list.active ? 'success' : 'neutral'} className="ml-1.5">{list.active ? 'Идэвхтэй' : list.latest ? 'Идэвхгүй' : 'Шинэ'}</Badge>
            </Button>)}
            {!naming && lists.length < MAX_PRICE_LISTS && <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(true)}><ListPlus className="size-4" />Үнийн жагсаалт нэмэх</Button>}
        </div>
        {naming && <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={`${id}-new-list`} className="flex flex-col gap-1 text-sm">Шинэ жагсаалтын нэр
                <Input id={`${id}-new-list`} value={newName} maxLength={80} placeholder="Жишээ: Forest Garden тусгай үнэ" className="min-w-72"
                    aria-invalid={!!nameError} onChange={event => { setNewName(event.target.value); setNameError(null); }}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addList(); } }} /></label>
            <Button type="button" variant="secondary" onClick={addList}>Нэмэх</Button>
            <Button type="button" variant="ghost" onClick={() => { setNaming(false); setNewName(''); setNameError(null); }}>Болих</Button>
            {nameError && <p role="alert" className="w-full text-sm text-status-danger">{nameError}</p>}
        </div>}
        <PricingEditor key={`${shopId}:${current.key}:${version}`} shopId={shopId} list={current}
            others={lists.filter(list => list.key !== current.key)} onSaved={onSaved} />
    </div>;
}

function PricingEditor({ shopId, list, others, onSaved }: { shopId: string; list: PriceListOverview; others: readonly PriceListOverview[]; onSaved: () => Promise<unknown> }) {
    const initial = list.latest ?? EMPTY_PRICING_DRAFT;
    const id = useId();
    const [name, setName] = useState(list.name);
    const [retiring, setRetiring] = useState(false);
    const [source, setSource] = useState(initial.source);
    const [from, setFrom] = useState(initial.valid_from ?? '');
    const [until, setUntil] = useState(initial.valid_until ?? '');
    const [confirmed, setConfirmed] = useState(initial.inventory_area_confirmed);
    const [rows, setRows] = useState<RuleForm[]>(() => ruleForms(initial.rules));
    const [importing, setImporting] = useState(false);
    // The list by block: a list of a project like Mandala Garden covers many blocks, so the rows are edited one block at a time.
    const blocks = useMemo(() => {
        const found = new Map<string, { key: string; name: string; rows: number; models: Set<string>; missing: number }>();
        for (const row of rows) {
            const name = row.block.trim();
            if (!name) continue;
            const block = found.get(pricingKey(name)) ?? { key: pricingKey(name), name, rows: 0, models: new Set<string>(), missing: 0 };
            block.rows++;
            if (row.model.trim()) block.models.add(pricingKey(row.model));
            if (row.advance_percent.trim() === '') block.missing++;
            found.set(block.key, block);
        }
        return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));
    }, [rows]);
    const blockRows = useMemo(() => new Map(blocks.map(block => [block.key, block.rows])), [blocks]);
    const several = blocks.length > 1;
    /** A block key, ALL_ROWS, or null = only the block cards (the start for a list of several blocks). */
    const [chosenView, setChosenView] = useState<string | null>(() => new Set(initial.rules.map(rule => pricingKey(rule.block))).size > 1 ? null : ALL_ROWS);
    const view = several && (chosenView === null || blocks.some(block => block.key === chosenView)) ? chosenView : ALL_ROWS;
    const viewBlock = blocks.find(block => block.key === view) ?? null;
    const [newBlock, setNewBlock] = useState('');
    // Condition columns added to a block's sheet before any price is typed under them.
    const [extraConditions, setExtraConditions] = useState<Record<string, string[]>>({});
    const [newCondition, setNewCondition] = useState('');
    /** The open block as a price sheet: one row per model and floor range, one column per payment condition. */
    const sheet = useMemo(() => {
        if (!viewBlock) return null;
        const conditions: Array<{ key: string; label: string }> = [];
        const groups = new Map<string, { gid: string; first: number; cells: Map<string, number> }>();
        rows.forEach((row, index) => {
            if (pricingKey(row.block) !== viewBlock.key) return;
            const label = row.payment_condition.trim(), key = pricingKey(label);
            if (label && !conditions.some(condition => condition.key === key)) conditions.push({ key, label });
            const group = groups.get(row.gid) ?? { gid: row.gid, first: index, cells: new Map<string, number>() };
            if (label && !group.cells.has(key)) group.cells.set(key, index);
            groups.set(row.gid, group);
        });
        for (const label of extraConditions[viewBlock.key] ?? []) if (!conditions.some(condition => condition.key === pricingKey(label))) conditions.push({ key: pricingKey(label), label });
        return { conditions, groups: [...groups.values()] };
    }, [rows, viewBlock, extraConditions]);
    // Rows of one payment condition share an advance, so it is entered once per condition (238 imported rows otherwise).
    const conditionGroups = useMemo(() => {
        const groups = new Map<string, { label: string; rows: number; missing: number; values: Set<string> }>();
        for (const row of rows) {
            const label = row.payment_condition.trim();
            if (!label) continue;
            const group = groups.get(pricingKey(label)) ?? { label, rows: 0, missing: 0, values: new Set<string>() };
            group.rows++;
            if (row.advance_percent.trim() === '') group.missing++; else group.values.add(row.advance_percent.trim());
            groups.set(pricingKey(label), group);
        }
        return [...groups].map(([key, group]) => ({ key, ...group }));
    }, [rows]);
    const [bulkAdvance, setBulkAdvance] = useState<Record<string, string>>({});
    const [reviewed, setReviewed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);

    function addBlock() {
        const name = newBlock.trim();
        if (!name || rows.length >= 500) return;
        // An existing block is opened; a new one starts with its first row.
        if (!blocks.some(block => block.key === pricingKey(name))) { setRows(previous => [...previous, { ...emptyRule(), block: name }]); setReviewed(false); }
        setChosenView(pricingKey(name)); setNewBlock('');
    }

    /** Model or floors of a sheet row: every rule of the row changes together. */
    function changeGroup(gid: string, key: 'model' | 'floor_min' | 'floor_max', value: string) {
        setReviewed(false);
        setRows(previous => previous.map(row => row.gid === gid ? { ...row, [key]: value } : row));
    }

    /** A price cell of the sheet. An empty cell means the condition is not offered for that row. */
    function changeCell(gid: string, condition: { key: string; label: string }, value: string) {
        setReviewed(false);
        setRows(previous => {
            const group = previous.filter(row => row.gid === gid);
            const index = previous.findIndex(row => row.gid === gid && pricingKey(row.payment_condition) === condition.key);
            if (index >= 0) {
                if (value.trim() !== '') return previous.map((row, position) => position === index ? { ...row, price_per_sqm: value } : row);
                // Cleared: the rule goes; the row's last rule stays as its placeholder (model and floors are kept).
                return group.length > 1 ? previous.filter((_, position) => position !== index)
                    : previous.map((row, position) => position === index ? { ...row, payment_condition: '', price_per_sqm: '', advance_percent: '' } : row);
            }
            if (value.trim() === '' || !group.length) return previous;
            // The condition's advance is taken over only when the whole list agrees on one value.
            const advances = new Set(previous.filter(row => pricingKey(row.payment_condition) === condition.key && row.advance_percent.trim() !== '').map(row => row.advance_percent.trim()));
            const rule = { payment_condition: condition.label, price_per_sqm: value, advance_percent: advances.size === 1 ? [...advances][0] : '' };
            const placeholder = previous.findIndex(row => row.gid === gid && isPlaceholder(row));
            if (placeholder >= 0) return previous.map((row, position) => position === placeholder ? { ...row, ...rule } : row);
            return previous.length >= 500 ? previous : [...previous, { ...group[0], ...rule }];
        });
    }

    function addCondition() {
        const label = newCondition.trim();
        if (!label || !viewBlock || !sheet || sheet.conditions.some(condition => condition.key === pricingKey(label))) return;
        setExtraConditions(previous => ({ ...previous, [viewBlock.key]: [...previous[viewBlock.key] ?? [], label] }));
        setNewCondition('');
    }

    function changeRow(index: number, key: keyof PricingRule, value: string) {
        setReviewed(false);
        setRows(previous => previous.map((row, position) => position === index ? { ...row, [key]: value } : row));
    }

    function applyAdvance(key: string, value: string) {
        setReviewed(false); setError(null);
        setRows(previous => previous.map(row => pricingKey(row.payment_condition) === key ? { ...row, advance_percent: value } : row));
        setBulkAdvance(previous => ({ ...previous, [key]: '' }));
    }

    function payload(status: 'draft' | 'active') {
        return PricingSaveSchema.safeParse({ list_key: list.key, list_name: name, expected_version: list.latest?.version ?? 0, status, config: {
            source, valid_from: from || null, valid_until: until || null, inventory_area_confirmed: confirmed,
            // A sheet row's placeholder is not a rule once the row has a price.
            rules: rows.filter(row => !isPlaceholder(row) || !rows.some(other => other.gid === row.gid && !isPlaceholder(other))).map(({ gid: _gid, ...row }) => ({ ...row,
                floor_min: row.floor_min === '' ? null : Number(row.floor_min), floor_max: row.floor_max === '' ? null : Number(row.floor_max),
                price_per_sqm: row.price_per_sqm === '' ? null : Number(row.price_per_sqm),
                advance_percent: row.advance_percent === '' ? null : Number(row.advance_percent),
            })),
        } });
    }

    function review() {
        const parsed = payload('active');
        // Another list's active price for the same unit, condition and days: the server refuses it too.
        const conflict = parsed.success ? priceListConflict(parsed.data.config, others.flatMap(other => other.active ? [other.active] : [])) : null;
        setError(parsed.success ? conflict : parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
        setReviewed(parsed.success && !conflict);
    }

    async function retire() {
        if (saving || conflict || !list.latest || !list.active) return;
        setSaving(true); setError(null);
        try {
            await dashboardMutate('/api/admin/pricing', 'DELETE', { list_key: list.key, expected_version: list.latest.version }, { shopId });
            toast.success(`«${list.name}» жагсаалтын үнэ идэвхгүй боллоо`);
            await onSaved();
        } catch (cause) {
            if (cause instanceof DashboardApiError && cause.status === 409) setConflict(true);
            setError(cause instanceof Error ? cause.message : 'Үнийг идэвхгүй болгож чадсангүй');
        }
        finally { setSaving(false); setRetiring(false); }
    }

    async function save(status: 'draft' | 'active') {
        if (saving || conflict || (status === 'active' && !reviewed)) return;
        const parsed = payload(status);
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна'); return; }
        setSaving(true); setError(null);
        try {
            await dashboardMutate('/api/admin/pricing', 'PUT', parsed.data, { shopId });
            toast.success(status === 'active' ? 'Баталсан үнэ идэвхжлээ' : 'Үнийн ноорог хадгалагдлаа');
            await onSaved();
        } catch (cause) {
            if (cause instanceof DashboardApiError && cause.status === 409) setConflict(true);
            setError(cause instanceof Error ? cause.message : 'Үнийн тохиргоо хадгалагдсангүй');
        }
        finally { setSaving(false); }
    }

    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{list.active ? `Идэвхтэй хувилбар ${list.active.version}: ${list.active.source} (${list.active.valid_from} – ${list.active.valid_until})` : 'Идэвхтэй үнэ байхгүй.'} {list.latest ? `Засаж буй хувилбар: ${list.latest.version}` : ''}</p>
        {list.active && <div className="flex flex-wrap items-center gap-2 text-sm">
            {!retiring ? <Button type="button" variant="secondary" disabled={saving || conflict} onClick={() => setRetiring(true)}>Идэвхтэй үнийг идэвхгүй болгох</Button>
                : <>
                    <span role="status">«{list.name}» жагсаалтын хувилбар {list.active.version} архивт шилжинэ. Энэ жагсаалтын байранд уулзалтын үнийн санал тооцогдохоо болино.</span>
                    <Button type="button" variant="danger" disabled={saving} onClick={() => void retire()}>Тийм, идэвхгүй болгох</Button>
                    <Button type="button" variant="ghost" disabled={saving} onClick={() => setRetiring(false)}>Болих</Button>
                </>}
        </div>}
        <label htmlFor={`${id}-name`} className="block max-w-md space-y-1 text-sm">Жагсаалтын нэр<Input id={`${id}-name`} value={name} maxLength={80} onChange={event => { setName(event.target.value); setReviewed(false); }} /></label>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-3">
            <label htmlFor={`${id}-source`} className="space-y-1 text-sm">Эх сурвалж<Input id={`${id}-source`} value={source} maxLength={500} placeholder="Баталсан үнийн хуудас, огноо" onChange={event => { setSource(event.target.value); setReviewed(false); }} /></label>
            <label htmlFor={`${id}-from`} className="space-y-1 text-sm">Эхлэх огноо<Input id={`${id}-from`} type="date" value={from} onChange={event => { setFrom(event.target.value); setReviewed(false); }} /></label>
            <label htmlFor={`${id}-until`} className="space-y-1 text-sm">Дуусах огноо<Input id={`${id}-until`} type="date" value={until} onChange={event => { setUntil(event.target.value); setReviewed(false); }} /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setReviewed(false); }} className="mt-1" /><span>Одоогийн нөөцийн талбайгаар тооцохыг баталсан. Шинэчилсэн талбай байхгүй эсвэл 0 бол борлуулах, дараа нь гэрээлсэн талбайг ашиглана.</span></label>
        {several && <div className="space-y-2">
            <h3 className="text-sm font-medium">Блокууд</h3>
            <div role="group" aria-label="Блок сонгох" className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] items-start gap-2">
                {blocks.map(block => <button key={block.key} type="button" aria-pressed={view === block.key} aria-label={`${block.name} блокийн мөрүүд`}
                    onClick={() => setChosenView(block.key)}
                    className={`rounded-xl border bg-surface p-3 text-left transition-colors hover:border-border-strong ${view === block.key ? 'border-brand' : 'border-border'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">{block.name}<ChevronRight aria-hidden className={`size-4 ${view === block.key ? 'text-brand-strong' : 'text-muted-foreground'}`} /></span>
                    <span className="mt-1.5 block text-xs text-muted-foreground"><span className="num">{block.rows}</span> мөр · <span className="num">{block.models.size}</span> загвар</span>
                    {block.missing > 0 && <Badge variant="pending" className="mt-1.5">Урьдчилгаа дутуу · {block.missing}</Badge>}
                </button>)}
                <button type="button" aria-pressed={view === ALL_ROWS} onClick={() => setChosenView(ALL_ROWS)}
                    className={`rounded-xl border border-dashed p-3 text-left text-sm transition-colors hover:border-border-strong ${view === ALL_ROWS ? 'border-brand' : 'border-border'}`}>
                    <span className="font-semibold">Бүх мөр</span>
                    <span className="mt-1.5 block text-xs text-muted-foreground"><span className="num">{rows.length}</span> мөр нэг хүснэгтээр</span>
                </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label htmlFor={`${id}-new-block`} className="flex flex-col gap-1 text-sm">Шинэ блок
                    <Input id={`${id}-new-block`} value={newBlock} maxLength={50} placeholder="Жишээ: 203" className="w-40"
                        onChange={event => setNewBlock(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addBlock(); } }} /></label>
                <Button type="button" variant="secondary" disabled={saving || !newBlock.trim() || rows.length >= 500} onClick={addBlock}><Plus className="size-4" />Блок нэмэх</Button>
            </div>
        </div>}
        {view === null ? <p className="text-sm text-muted-foreground">Блокоо сонгож үнийг нь засна. Доорх хугацаа, урьдчилгаа, идэвхжүүлэлт жагсаалтын бүх блокт хамаарна.</p>
            : viewBlock && sheet ? <div className="space-y-2">
                <h3 className="text-sm font-medium">{viewBlock.name} блок <span className="font-normal text-muted-foreground">· <span className="num">{sheet.groups.length}</span> мөр · <span className="num">{sheet.conditions.length}</span> нөхцөл</span></h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse text-sm">
                        <caption className="sr-only">{viewBlock.name} блокийн м² үнэ, төлбөрийн нөхцөлөөр</caption>
                        <thead><tr className="text-left text-xs text-muted-foreground">
                            <th scope="col" className="border-b border-border px-2 py-2 font-medium">Загвар</th>
                            <th scope="col" className="border-b border-border px-2 py-2 font-medium" colSpan={2}>Давхар (эхлэх – дуусах)</th>
                            {sheet.conditions.map(condition => {
                                const group = conditionGroups.find(item => item.key === condition.key);
                                return <th key={condition.key} scope="col" className="border-b border-border px-2 py-2 font-medium">
                                    <span className="text-foreground">{condition.label}</span>
                                    <span className={`block font-normal ${!group || group.missing ? 'text-status-pending' : ''}`}>{!group || group.missing ? 'урьдчилгаа дутуу' : group.values.size === 1 ? `урьдчилгаа ${[...group.values][0]}%` : 'урьдчилгаа мөр бүрд өөр'}</span>
                                </th>;
                            })}
                            <th className="border-b border-border"><span className="sr-only">Устгах</span></th>
                        </tr></thead>
                        <tbody>{sheet.groups.map(group => {
                            const head = rows[group.first], number = group.first + 1;
                            const name = `${head.model.trim() || 'шинэ мөр'}${head.floor_min.trim() ? `, ${head.floor_min.trim()}–${head.floor_max.trim() || '?'} давхар` : ''}`;
                            return <tr key={group.gid} className="border-b border-border last:border-b-0">
                                <td className="px-1 py-1.5"><Input aria-label={`${number}-р мөр Загвар`} value={head.model} onChange={event => changeGroup(group.gid, 'model', event.target.value)} className="w-20" /></td>
                                <td className="py-1.5 pl-1"><Input aria-label={`${number}-р мөр Давхар эхлэх`} value={head.floor_min} inputMode="numeric" onChange={event => changeGroup(group.gid, 'floor_min', event.target.value)} className="num w-16" /></td>
                                <td className="py-1.5 pl-1 pr-2"><Input aria-label={`${number}-р мөр Давхар дуусах`} value={head.floor_max} inputMode="numeric" onChange={event => changeGroup(group.gid, 'floor_max', event.target.value)} className="num w-16" /></td>
                                {sheet.conditions.map(condition => {
                                    const index = group.cells.get(condition.key);
                                    return <td key={condition.key} className="px-1 py-1.5"><Input aria-label={`${name} · ${condition.label} м² үнэ (₮)`} inputMode="numeric" placeholder="—"
                                        value={index === undefined ? '' : rows[index].price_per_sqm} onChange={event => changeCell(group.gid, condition, event.target.value)} className="num min-w-28" /></td>;
                                })}
                                <td><Button type="button" variant="ghost" aria-label={`${name} мөрийг устгах`} disabled={saving} onClick={() => { setRows(previous => previous.filter(row => row.gid !== group.gid)); setReviewed(false); }}><Trash2 className="size-4" /></Button></td>
                            </tr>;
                        })}</tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-foreground">Нүд бүр м² үнэ. Хоосон нүд — тухайн байранд энэ нөхцөл байхгүй. Урьдчилгааг доорх «Эхний урьдчилгаа — нөхцөлөөр» хэсэгт оруулна.</p>
                <div className="flex flex-wrap items-end gap-2">
                    <label htmlFor={`${id}-new-condition`} className="flex flex-col gap-1 text-sm">Шинэ нөхцөл
                        <Input id={`${id}-new-condition`} value={newCondition} maxLength={50} placeholder="Жишээ: 30%" className="w-40"
                            onChange={event => setNewCondition(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCondition(); } }} /></label>
                    <Button type="button" variant="secondary" disabled={saving || !newCondition.trim()} onClick={addCondition}><Plus className="size-4" />Нөхцөлийн багана нэмэх</Button>
                </div>
            </div>
            : <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead><tr>{fields.map(field => <th key={field.key} className="border-b border-border px-1 pb-2 text-left font-medium">{field.label}</th>)}<th className="border-b border-border"><span className="sr-only">Устгах</span></th></tr></thead>
                    <tbody>{rows.map((row, index) => <tr key={index}>
                        {fields.map(field => <td key={field.key} className="px-1 py-2"><Input aria-label={`${index + 1}-р мөр ${field.label}`} value={row[field.key]} onChange={event => changeRow(index, field.key, event.target.value)} inputMode={field.numeric ? 'decimal' : 'text'} className={field.numeric ? 'num min-w-20' : 'min-w-20'} /></td>)}
                        <td><Button type="button" variant="ghost" aria-label={`${index + 1}-р үнийн мөр устгах`} disabled={saving} onClick={() => { setRows(previous => previous.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></Button></td>
                    </tr>)}</tbody>
                </table>
            </div>}
        {!rows.length && <p className="text-sm text-muted-foreground">Баталсан үнийн мөр нэмнэ үү.</p>}
        <p className="text-xs text-muted-foreground">Хоосон үнийн нөхцөлийг мөр болгон нэмэхгүй. «10–30%» зэрэг нөхцөлийн эхний урьдчилгааг шошгоос таахгүй; баталсан эхний хувийг тусад нь оруулна.</p>
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={saving || rows.length >= 500} onClick={() => { setRows(previous => [...previous, { ...emptyRule(), block: viewBlock?.name ?? '' }]); if (view === null) setChosenView(ALL_ROWS); setReviewed(false); }}><Plus className="size-4" />Үнийн мөр нэмэх</Button>
            {!importing && <Button type="button" variant="secondary" disabled={saving || conflict} onClick={() => setImporting(true)}><FileSpreadsheet className="size-4" />Excel-ээс оруулах</Button>}
        </div>
        {importing && <PricingImportPanel shopId={shopId} currentBlocks={blockRows} onCancel={() => setImporting(false)} onApply={({ rules, files }) => {
            const blocks = new Set(rules.map(rule => pricingKey(rule.block)));
            setRows(previous => [...previous.filter(row => !blocks.has(pricingKey(row.block))), ...ruleForms(rules)]);
            if (!source.trim()) setSource(`Файл: ${files.join(', ')}`.slice(0, 500));
            setReviewed(false); setError(null); setImporting(false);
            toast.success(`${rules.length} үнийн мөр засварт орлоо. Хугацаа, урьдчилгааг шалгаад хадгална уу.`);
        }} />}
        {conditionGroups.length > 0 && <div className="space-y-2">
            <h3 className="text-sm font-medium">Эхний урьдчилгаа — нөхцөлөөр</h3>
            <p className="text-xs text-muted-foreground">Баталсан хувийг нөхцөл бүрд нэг удаа оруулахад тухайн нөхцөлийн бүх мөрд бичигдэнэ. Мөр тус бүрийг дээрх хүснэгтээс засаж болно.</p>
            <table className="w-full max-w-2xl border-collapse text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Нөхцөл</th>
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Одоо</th>
                    <th scope="col" className="border-b border-border py-1.5 font-medium">Эхний урьдчилгаа (%)</th>
                </tr></thead>
                <tbody>{conditionGroups.map(group => {
                    const typed = (bulkAdvance[group.key] ?? '').trim().replace(',', '.');
                    const valid = typed !== '' && advanceValid(Number(typed));
                    return <tr key={group.key}>
                        <td className="py-1.5 pr-3">{group.label}<span className="block text-xs text-muted-foreground">{group.rows} мөр</span></td>
                        <td className={`py-1.5 pr-3 ${group.missing ? 'text-status-pending' : ''}`}>{group.missing === group.rows ? 'Оруулаагүй'
                            : group.missing ? `${group.missing} мөр хоосон`
                                : group.values.size === 1 ? `${[...group.values][0]}%` : 'Мөр бүрд өөр'}</td>
                        <td className="py-1.5"><div className="flex flex-wrap items-center gap-2">
                            <Input aria-label={`«${group.label}» нөхцөлийн бүх мөрийн урьдчилгаа (%)`} inputMode="decimal" className="num w-28" value={bulkAdvance[group.key] ?? ''}
                                aria-invalid={typed !== '' && !valid} onChange={event => setBulkAdvance(previous => ({ ...previous, [group.key]: event.target.value }))} />
                            <Button type="button" variant="secondary" disabled={saving || !valid} aria-label={`«${group.label}» нөхцөлийн ${group.rows} мөрд урьдчилгаа оруулах`} onClick={() => applyAdvance(group.key, typed)}>{group.rows} мөрд оруулах</Button>
                            {typed !== '' && !valid && <span className="text-xs text-status-danger">0–100, 2 хүртэл орны бутархай</span>}
                        </div></td>
                    </tr>;
                })}</tbody>
            </table>
        </div>}
        {error && <div role="alert" className="text-sm text-status-danger"><p>{error}</p>
            {conflict && <button type="button" disabled={saving} className="mt-2 font-medium text-brand-strong underline" onClick={async () => {
                setSaving(true);
                try { await onSaved(); }
                catch (cause) { setError(cause instanceof Error ? cause.message : 'Шинэ мэдээлэл ачаалагдсангүй'); }
                finally { setSaving(false); }
            }}>Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх</button>}
        </div>}
        {reviewed && <p role="status" className="rounded-lg border border-status-success/30 bg-status-success-soft p-3 text-sm">{source}: {from}–{until}, {rows.length} мөр. Давхарын зааг, үнэ, эхний урьдчилгааг шалгалаа. Идэвхжүүлэхэд «{name.trim()}» жагсаалтын өмнөх идэвхтэй хувилбарыг орлоно; бусад жагсаалт, хуучин уулзалтын санал хэвээр үлдэнэ.</p>}
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={saving || conflict} onClick={() => void save('draft')}>Ноорог хадгалах</Button>
            <Button type="button" variant="secondary" disabled={saving || conflict} onClick={review}>Идэвхжүүлэхийн өмнө хянах</Button>
            <Button type="button" disabled={saving || conflict || !reviewed} onClick={() => void save('active')}>{saving ? 'Хадгалж байна…' : 'Баталсан үнийг идэвхжүүлэх'}</Button>
        </div>
        {!reviewed && !conflict && <p className="text-xs text-muted-foreground">«Баталсан үнийг идэвхжүүлэх» товч «Идэвхжүүлэхийн өмнө хянах» шалгалт алдаагүй гарсны дараа идэвхжинэ.</p>}
    </div>;
}
