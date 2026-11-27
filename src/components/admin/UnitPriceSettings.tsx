'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, ListPlus } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardFetch, dashboardJson, dashboardMutate, DashboardApiError } from '@/lib/api/dashboardFetch';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatMNT } from '@/lib/utils/currency';
import { unitCategoryLabel } from '@/lib/inventory/labels';
import { PriceListNameSchema, pricingKey } from '@/lib/sales/pricing';
import { PRICING_IMPORT_MAX_BYTES } from '@/lib/sales/pricing-import';
import {
    EMPTY_UNIT_PRICE_DRAFT, MAX_UNIT_PRICE_LISTS, UNIT_PRICE_CATEGORIES, UnitPriceSaveSchema, unitPriceConflict,
    type UnitPriceCategory, type UnitPriceListOverview, type UnitPriceRow,
} from '@/lib/sales/unit-pricing';
import type { UnitPriceImportFile } from '@/lib/sales/unit-pricing-import';

type Overview = { installed: boolean; lists: UnitPriceListOverview[] };
type ImportedSheet = UnitPriceImportFile['sheets'][number] & { rows: UnitPriceRow[]; unknown: string[]; moved: number };
type Imported = Omit<UnitPriceImportFile, 'sheets'> & { sheets: ImportedSheet[] };
const SHOWN = 8;

/**
 * Per-unit prices (parking, storage, service space): each list is an approved price file — one price, or one per
 * payment condition, for every unit by its register code. A list is filled from the file, reviewed, then activated;
 * to change prices the next file is imported as a new version.
 */
export function UnitPriceSettings({ shopId, onSaved }: { shopId: string; onSaved?: () => void }) {
    const id = useId();
    const query = useQuery({
        queryKey: ['unit-pricing', shopId], enabled: !!shopId,
        queryFn: () => dashboardJson<Overview>('/api/admin/unit-pricing', { shopId }),
        staleTime: Infinity, refetchOnWindowFocus: false, meta: { inlineError: true },
    });
    const [added, setAdded] = useState<UnitPriceListOverview[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [naming, setNaming] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState<UnitPriceCategory>('parking');
    const [nameError, setNameError] = useState<string | null>(null);
    const lists = useMemo(() => [...query.data?.lists ?? [], ...added.filter(item => !query.data?.lists.some(list => list.key === item.key))], [query.data, added]);
    const current = lists.find(list => list.key === selected) ?? lists[0];

    function addList() {
        const parsed = PriceListNameSchema.safeParse(newName);
        if (!parsed.success) { setNameError(parsed.error.issues[0]?.message ?? 'Нэр буруу байна'); return; }
        if (lists.some(list => list.name.trim().toLowerCase() === parsed.data.toLowerCase())) { setNameError('Ийм нэртэй үнийн жагсаалт байна'); return; }
        const key = crypto.randomUUID();
        setAdded(previous => [...previous, { key, name: parsed.data, category: newCategory, latest: null, active: null }]);
        setSelected(key); setNaming(false); setNewName(''); setNameError(null);
    }

    return <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Тоот бүрийн үнэ · зогсоол, агуулах, үйлчилгээ</h2>
        <p className="mt-1 text-sm text-muted-foreground">Зогсоол, агуулах, үйлчилгээний талбай тоот бүрээр үнэлэгддэг. Баталсан үнийн Excel файлыг жагсаалт болгон оруулж, хянаад идэвхжүүлнэ. Блок, гараж бүрийн файл тусдаа жагсаалт болно.</p>
        {query.isPending ? <p className="mt-4 text-sm">Ачаалж байна…</p>
            : query.error && !query.data ? <p role="alert" className="mt-4 text-sm text-status-danger">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Дахин ачаалах</button></p>
                : !query.data?.installed ? <p role="status" className="mt-4 text-sm text-status-pending">Тоот бүрийн үнийн хүснэгт баазад хараахан суулгагдаагүй байна (migration 20261127140000). Суулгасны дараа энд үнийн файл оруулна.</p>
                    : <div className="mt-4 space-y-4">
                        <div role="group" aria-label="Тоотын үнийн жагсаалт" className="flex flex-wrap items-center gap-2">
                            {lists.map(list => <Button key={list.key} type="button" size="sm" variant={list.key === current?.key ? 'primary' : 'secondary'}
                                aria-pressed={list.key === current?.key} onClick={() => setSelected(list.key)}>
                                {list.name}
                                <Badge variant={list.active ? 'success' : 'neutral'} className="ml-1.5">{unitCategoryLabel(list.category)} · {list.active ? 'Идэвхтэй' : list.latest ? 'Идэвхгүй' : 'Шинэ'}</Badge>
                            </Button>)}
                            {!naming && lists.length < MAX_UNIT_PRICE_LISTS && <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(true)}><ListPlus className="size-4" />Жагсаалт нэмэх</Button>}
                        </div>
                        {naming && <div className="flex flex-wrap items-end gap-2">
                            <label htmlFor={`${id}-name`} className="flex flex-col gap-1 text-sm">Шинэ жагсаалтын нэр
                                <Input id={`${id}-name`} value={newName} maxLength={80} placeholder="Жишээ: 201, 202-р блокийн зогсоол" className="min-w-72"
                                    aria-invalid={!!nameError} onChange={event => { setNewName(event.target.value); setNameError(null); }} /></label>
                            <label htmlFor={`${id}-category`} className="flex flex-col gap-1 text-sm">Төрөл
                                <select id={`${id}-category`} value={newCategory} onChange={event => setNewCategory(event.target.value as UnitPriceCategory)}
                                    className="h-10 rounded-lg border border-control bg-surface px-3 text-sm">
                                    {UNIT_PRICE_CATEGORIES.map(category => <option key={category} value={category}>{unitCategoryLabel(category)}</option>)}
                                </select></label>
                            <Button type="button" variant="secondary" onClick={addList}>Нэмэх</Button>
                            <Button type="button" variant="ghost" onClick={() => { setNaming(false); setNewName(''); setNameError(null); }}>Болих</Button>
                            {nameError && <p role="alert" className="w-full text-sm text-status-danger">{nameError}</p>}
                        </div>}
                        {current ? <UnitPriceEditor key={`${shopId}:${current.key}:${query.dataUpdatedAt}`} shopId={shopId} list={current}
                            others={lists.filter(list => list.key !== current.key)} onSaved={async () => {
                                onSaved?.();
                                const result = await query.refetch();
                                if (result.error) throw result.error;
                            }} />
                            : <p className="text-sm text-muted-foreground">Тоотын үнийн жагсаалт алга. «Жагсаалт нэмэх» дарж эхний жагсаалтаа үүсгэнэ.</p>}
                    </div>}
    </section>;
}

function UnitPriceEditor({ shopId, list, others, onSaved }: { shopId: string; list: UnitPriceListOverview; others: readonly UnitPriceListOverview[]; onSaved: () => Promise<unknown> }) {
    const initial = list.latest ?? EMPTY_UNIT_PRICE_DRAFT;
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(list.name);
    const [source, setSource] = useState(initial.source);
    const [from, setFrom] = useState(initial.valid_from ?? '');
    const [until, setUntil] = useState(initial.valid_until ?? '');
    const [note, setNote] = useState(initial.note);
    const [conditions, setConditions] = useState(initial.conditions.map(condition => ({ label: condition.label, advance: condition.advance_percent === null ? '' : String(condition.advance_percent) })));
    const [rows, setRows] = useState<UnitPriceRow[]>(initial.rows);
    const [imported, setImported] = useState<Imported | null>(null);
    const [busy, setBusy] = useState(false);
    const [reviewed, setReviewed] = useState(false);
    const [retiring, setRetiring] = useState(false);
    const [stale, setStale] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const blocks = useMemo(() => {
        const found = new Map<string, { name: string; units: number }>();
        for (const row of rows) { const block = found.get(pricingKey(row.block)) ?? { name: row.block, units: 0 }; block.units++; found.set(pricingKey(row.block), block); }
        return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));
    }, [rows]);
    const touch = () => { setReviewed(false); setError(null); };

    async function read(files: FileList | null) {
        const file = files?.[0];
        if (!file) return;
        if (file.size > PRICING_IMPORT_MAX_BYTES) { setError('Файл 5 MB-аас их байна'); return; }
        setBusy(true); setError(null);
        try {
            const body = new FormData();
            body.set('file', file); body.set('category', list.category);
            const response = await dashboardFetch('/api/admin/unit-pricing/import', { shopId, method: 'POST', body });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error ?? 'Файл уншиж чадсангүй');
            setImported(result as Imported);
        } catch (cause) { setImported(null); setError(cause instanceof Error ? cause.message : 'Файл уншиж чадсангүй'); }
        finally { setBusy(false); if (input.current) input.current.value = ''; }
    }

    /** The file replaces the list's units; an advance already entered for a condition of the same name is kept. */
    function applyImport() {
        if (!imported) return;
        const sheets = imported.sheets;
        const labels = [...new Set(sheets.flatMap(sheet => sheet.conditions))];
        setConditions(previous => labels.map(label => ({ label, advance: previous.find(item => item.label === label)?.advance ?? '' })));
        setRows(sheets.flatMap(sheet => sheet.rows));
        if (!source.trim()) setSource(`Файл: ${imported.file}`.slice(0, 500));
        const dated = sheets.find(sheet => sheet.valid_from || sheet.valid_until);
        if (!from && dated?.valid_from) setFrom(dated.valid_from);
        if (!until && dated?.valid_until) setUntil(dated.valid_until);
        setImported(null); touch();
        toast.success(`${sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)} тоотын үнэ засварт орлоо. Хугацаа, урьдчилгааг шалгаад хадгална уу.`);
    }

    function payload(status: 'draft' | 'active') {
        return UnitPriceSaveSchema.safeParse({ list_key: list.key, list_name: name, category: list.category, expected_version: list.latest?.version ?? 0, status, config: {
            source, valid_from: from || null, valid_until: until || null, note,
            conditions: conditions.map(condition => ({ label: condition.label, advance_percent: condition.advance.trim() === '' ? null : Number(condition.advance.replace(',', '.')) })),
            rows,
        } });
    }

    function review() {
        const parsed = payload('active');
        const conflict = parsed.success ? unitPriceConflict(parsed.data.config, list.category, others.flatMap(other => other.active ? [other.active] : [])) : null;
        setError(parsed.success ? conflict : parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
        setReviewed(parsed.success && !conflict);
    }

    async function run(action: () => Promise<unknown>, done: string) {
        setBusy(true); setError(null);
        try { await action(); toast.success(done); await onSaved(); }
        catch (cause) {
            if (cause instanceof DashboardApiError && cause.status === 409) setStale(true);
            setError(cause instanceof Error ? cause.message : 'Үнийн тохиргоо хадгалагдсангүй');
        }
        finally { setBusy(false); setRetiring(false); }
    }

    async function save(status: 'draft' | 'active') {
        if (busy || stale || (status === 'active' && !reviewed)) return;
        const parsed = payload(status);
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна'); return; }
        await run(() => dashboardMutate('/api/admin/unit-pricing', 'PUT', parsed.data, { shopId }), status === 'active' ? 'Тоотын үнэ идэвхжлээ' : 'Үнийн ноорог хадгалагдлаа');
    }

    const preview = imported?.sheets ?? [];
    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{list.active ? `Идэвхтэй хувилбар ${list.active.version}: ${list.active.source} (${list.active.valid_from} – ${list.active.valid_until ?? 'дуусах хугацаагүй'}), ${list.active.rows.length} тоот` : 'Идэвхтэй үнэ байхгүй.'} {list.latest ? `Засаж буй хувилбар: ${list.latest.version}` : ''}</p>
        {list.active && list.latest && <div className="flex flex-wrap items-center gap-2 text-sm">
            {!retiring ? <Button type="button" variant="secondary" disabled={busy || stale} onClick={() => setRetiring(true)}>Идэвхтэй үнийг идэвхгүй болгох</Button>
                : <>
                    <span role="status">«{list.name}» жагсаалтын хувилбар {list.active.version} архивт шилжиж, эдгээр тоотын үнэ харагдахаа болино.</span>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => dashboardMutate('/api/admin/unit-pricing', 'DELETE', { list_key: list.key, expected_version: list.latest!.version }, { shopId }), `«${list.name}» жагсаалтын үнэ идэвхгүй боллоо`)}>Тийм, идэвхгүй болгох</Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setRetiring(false)}>Болих</Button>
                </>}
        </div>}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-3">
            <label htmlFor={`${id}-list-name`} className="col-span-3 flex max-w-md flex-col gap-1 text-sm">Жагсаалтын нэр · {unitCategoryLabel(list.category)}<Input id={`${id}-list-name`} value={name} maxLength={80} onChange={event => { setName(event.target.value); touch(); }} /></label>
            <label htmlFor={`${id}-source`} className="flex flex-col gap-1 text-sm">Эх сурвалж<Input id={`${id}-source`} value={source} maxLength={500} placeholder="Баталсан үнийн санал, архивын дугаар" onChange={event => { setSource(event.target.value); touch(); }} /></label>
            <label htmlFor={`${id}-from`} className="flex flex-col gap-1 text-sm">Эхлэх огноо<Input id={`${id}-from`} type="date" value={from} onChange={event => { setFrom(event.target.value); touch(); }} /></label>
            <label htmlFor={`${id}-until`} className="flex flex-col gap-1 text-sm">Дуусах огноо (байхгүй бол хоосон)<Input id={`${id}-until`} type="date" value={until} onChange={event => { setUntil(event.target.value); touch(); }} /></label>
        </div>
        <label htmlFor={`${id}-note`} className="flex flex-col gap-1 text-sm">Тэмдэглэл (хөнгөлөлт, нөхцөлийн тайлбар)
            <textarea id={`${id}-note`} value={note} maxLength={2000} rows={2} onChange={event => { setNote(event.target.value); touch(); }}
                className="rounded-lg border border-control bg-surface px-3 py-2 text-sm" /></label>

        <div className="flex flex-wrap items-center gap-2">
            <input ref={input} id={`${id}-file`} type="file" accept=".xlsx,.csv" className="sr-only" onChange={event => void read(event.target.files)} />
            <Button type="button" variant="secondary" disabled={busy || stale} onClick={() => input.current?.click()}><FileSpreadsheet className="size-4" />{rows.length ? 'Шинэ файлаар солих' : 'Үнийн Excel файл оруулах'}</Button>
            <span className="text-xs text-muted-foreground">Файлд «Код» багана болон «Үнэ» эсвэл нөхцөл бүрийн («50%», «0-100%») үнийн багана байна. Кодыг тоотын бүртгэлтэй тулгана.</span>
        </div>

        {imported && <div className="space-y-2 rounded-xl border border-border p-3 text-sm" role="region" aria-label="Файлын урьдчилсан харагдац">
            <p className="font-medium">{imported.file}</p>
            {imported.skipped.map(item => <p key={item.name} className="text-xs text-muted-foreground">«{item.name}» лист орсонгүй: {item.reason}</p>)}
            {preview.map(sheet => <div key={sheet.name} className="space-y-1">
                <p>{sheet.title ?? sheet.name}: <span className="num">{sheet.rows.length}</span> тоот · нөхцөл: {sheet.conditions.join(', ') || '—'}
                    {(sheet.valid_from || sheet.valid_until) && <> · {sheet.valid_from ?? '…'} – {sheet.valid_until ?? 'дуусах хугацаагүй'}</>}</p>
                {sheet.moved > 0 && <p className="text-xs text-muted-foreground">{sheet.moved} тоотын блокийг бүртгэлийнхээр авлаа (файлын «Блок» нь гаражийн харьяалах блок байна).</p>}
                {sheet.unknown.length > 0 && <p className="text-xs text-status-danger">Тоотын бүртгэлд байхгүй {sheet.unknown.length} код: {sheet.unknown.slice(0, SHOWN).join(', ')}{sheet.unknown.length > SHOWN ? ' …' : ''}</p>}
                {sheet.issues.slice(0, SHOWN).map((issue, index) => <p key={index} className="text-xs text-status-pending">{issue.row ? `${issue.row}-р мөр: ` : ''}{issue.message}</p>)}
                {sheet.issues.length > SHOWN && <p className="text-xs text-status-pending">… бас {sheet.issues.length - SHOWN}</p>}
            </div>)}
            {!preview.length && <p className="text-status-danger">Үнийн мөртэй лист олдсонгүй.</p>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!preview.some(sheet => sheet.rows.length)} onClick={applyImport}>Засварт оруулах ({preview.reduce((sum, sheet) => sum + sheet.rows.length, 0)} тоот)</Button>
                <Button type="button" variant="ghost" onClick={() => setImported(null)}>Болих</Button>
            </div>
        </div>}

        {rows.length > 0 && <div className="space-y-2">
            <h3 className="text-sm font-medium"><span className="num">{rows.length}</span> тоот · {blocks.map(block => `${block.name} (${block.units})`).join(', ')}</h3>
            <table className="w-full max-w-2xl border-collapse text-sm">
                <caption className="sr-only">Нөхцөл бүрийн эхний урьдчилгаа</caption>
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Үнийн багана (нөхцөл)</th>
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Үнэтэй тоот</th>
                    <th scope="col" className="border-b border-border py-1.5 font-medium">Эхний урьдчилгаа (%) — байхгүй бол хоосон</th>
                </tr></thead>
                <tbody>{conditions.map((condition, index) => <tr key={condition.label}>
                    <td className="py-1.5 pr-3">{condition.label}</td>
                    <td className="num py-1.5 pr-3">{rows.filter(row => row.prices[condition.label] !== undefined).length}</td>
                    <td className="py-1.5"><Input aria-label={`«${condition.label}» эхний урьдчилгаа (%)`} inputMode="decimal" className="num w-28" value={condition.advance}
                        onChange={event => { setConditions(previous => previous.map((item, position) => position === index ? { ...item, advance: event.target.value } : item)); touch(); }} /></td>
                </tr>)}</tbody>
            </table>
            <p className="text-xs text-muted-foreground">Жишээ: {rows.slice(0, 3).map(row => `${row.code} — ${Object.values(row.prices).map(price => formatMNT(price)).join(' / ')}`).join(' · ')}{rows.length > 3 ? ' …' : ''}. Бүх тоотыг идэвхжүүлсний дараа «Блокоор» табаас харна.</p>
        </div>}

        {error && <div role="alert" className="text-sm text-status-danger"><p>{error}</p>
            {stale && <button type="button" disabled={busy} className="mt-2 font-medium text-brand-strong underline" onClick={() => void onSaved().catch(cause => setError(cause instanceof Error ? cause.message : 'Шинэ мэдээлэл ачаалагдсангүй'))}>Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх</button>}
        </div>}
        {reviewed && <p role="status" className="rounded-lg border border-status-success/30 bg-status-success-soft p-3 text-sm">{source}: {from} – {until || 'дуусах хугацаагүй'}, {rows.length} тоот, {conditions.length} нөхцөл. Идэвхжүүлэхэд «{name.trim()}» жагсаалтын өмнөх идэвхтэй хувилбарыг орлоно; бусад жагсаалт хэвээр үлдэнэ.</p>}
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy || stale} onClick={() => void save('draft')}>Ноорог хадгалах</Button>
            <Button type="button" variant="secondary" disabled={busy || stale} onClick={review}>Идэвхжүүлэхийн өмнө хянах</Button>
            <Button type="button" disabled={busy || stale || !reviewed} onClick={() => void save('active')}>{busy ? 'Хадгалж байна…' : 'Тоотын үнийг идэвхжүүлэх'}</Button>
        </div>
    </div>;
}
