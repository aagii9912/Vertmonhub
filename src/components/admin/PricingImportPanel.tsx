'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { pricingKey, type PricingRule } from '@/lib/sales/pricing';
import {
    BASE_PRICE_CONDITION, PRICING_IMPORT_MAX_BYTES, buildImportedRules,
    type PricingImportConditionChoice, type PricingImportFile, type PricingImportSheetChoice,
} from '@/lib/sales/pricing-import';

type SheetChoice = Omit<PricingImportSheetChoice, 'sheet'>;
type ConditionForm = { include: boolean; advance: string };
const day = (value: string | null) => value ? value.replaceAll('-', '.') : null;
const SHOWN_ISSUES = 8;

/** Reads approved price-list files and hands the rules to the editor; nothing is saved here. */
export function PricingImportPanel({ shopId, currentBlocks, onApply, onCancel }: {
    shopId: string;
    /** pricingKey(block) → editor rows that an import of that block replaces. */
    currentBlocks: ReadonlyMap<string, number>;
    onApply: (result: { rules: PricingRule[]; files: string[] }) => void;
    onCancel: () => void;
}) {
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<PricingImportFile[]>([]);
    const [sheets, setSheets] = useState<Record<string, SheetChoice>>({});
    const [conditions, setConditions] = useState<Record<string, ConditionForm>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function read(list: FileList | null) {
        const chosen = [...(list ?? [])];
        if (!chosen.length) return;
        if (chosen.some(file => file.size > PRICING_IMPORT_MAX_BYTES)) { setError('Файл 5 MB-аас их байна'); return; }
        setBusy(true); setError(null);
        try {
            const parsed = await Promise.all(chosen.map(async file => {
                const body = new FormData();
                body.set('file', file);
                const response = await dashboardFetch('/api/admin/pricing/import', { shopId, method: 'POST', body });
                const result = await response.json().catch(() => null);
                if (!response.ok) throw new Error(`${file.name}: ${result?.error ?? 'файл уншиж чадсангүй'}`);
                return result as PricingImportFile;
            }));
            setFiles(parsed);
            setSheets(Object.fromEntries(parsed.flatMap((file, f) => file.sheets.map((sheet, s) => [`${f}:${s}`, { include: true, block: sheet.block ?? '', modelColumn: 0 }]))));
            const labels = new Map<string, boolean>();
            for (const sheet of parsed.flatMap(file => file.sheets)) for (const condition of sheet.conditions) if (!labels.has(condition.label)) labels.set(condition.label, condition.base);
            // The list price is not a payment condition; it is added only when the admin asks for it.
            setConditions(Object.fromEntries([...labels].map(([label, base]) => [label, { include: !base, advance: '' }])));
        } catch (cause) {
            setFiles([]); setError(cause instanceof Error ? cause.message : 'Файл уншиж чадсангүй');
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    }

    const built = useMemo(() => {
        const errors: string[] = [];
        const choices: Record<string, PricingImportConditionChoice> = {};
        for (const [label, form] of Object.entries(conditions)) {
            const advance = form.advance.trim() === '' ? null : Number(form.advance.replace(',', '.'));
            const valid = advance === null || (Number.isFinite(advance) && advance >= 0 && advance <= 100 && Math.abs(advance * 100 - Math.round(advance * 100)) < 1e-6);
            if (form.include && !valid) errors.push(`«${label}» нөхцөлийн эхний урьдчилгаа 0–100 хувь, 2 хүртэл орны бутархайтай байна`);
            choices[label] = { include: form.include, advance_percent: valid ? advance : null };
        }
        const result = buildImportedRules(files.flatMap((file, f) => file.sheets.map((sheet, s) => ({ sheet, ...sheets[`${f}:${s}`] }))), choices);
        return { rules: result.rules, errors: [...errors, ...result.errors] };
    }, [files, sheets, conditions]);

    const blocks = useMemo(() => {
        const counts = new Map<string, { label: string; rows: number }>();
        for (const rule of built.rules) {
            const key = pricingKey(rule.block);
            counts.set(key, { label: counts.get(key)?.label ?? rule.block, rows: (counts.get(key)?.rows ?? 0) + 1 });
        }
        return [...counts].map(([key, value]) => ({ ...value, replaced: currentBlocks.get(key) ?? 0 }));
    }, [built.rules, currentBlocks]);
    const missingAdvance = Object.entries(conditions).filter(([, form]) => form.include && form.advance.trim() === '').map(([label]) => label);

    return <section aria-label="Үнийн файл импортлох" className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
        <div className="flex items-start justify-between gap-3">
            <div>
                <h3 className="text-sm font-semibold">Excel-ээс үнэ оруулах</h3>
                <p className="mt-1 text-xs text-muted-foreground">Баталсан үнийн саналын файл (.xlsx). Давхар, загвар, нөхцөл бүрийн м² үнийг уншаад засварт оруулна — хадгалахгүй. Файлд байгаа блокийн одоогийн мөрийг солино, бусад блок хэвээр.</p>
            </div>
            <Button type="button" variant="ghost" aria-label="Импорт хаах" disabled={busy} onClick={onCancel}><X className="size-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <input ref={input} id={`${id}-file`} type="file" accept=".xlsx,.csv" multiple className="sr-only" onChange={event => void read(event.target.files)} />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><FileSpreadsheet className="size-4" />{busy ? 'Уншиж байна…' : files.length ? 'Өөр файл сонгох' : 'Файл сонгох'}</Button>
            <span className="text-xs text-muted-foreground">Хэд хэдэн файл (Б1, Б2 …) зэрэг сонгож болно. 5 MB хүртэл.</span>
        </div>
        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}

        {files.map((file, f) => <div key={f} className="space-y-3">
            <p className="break-words text-sm font-medium">{file.file}</p>
            {file.skipped.map(item => <p key={item.name} className="text-xs text-muted-foreground">«{item.name.trim()}» лист алгасав: {item.reason}</p>)}
            {file.sheets.map((sheet, s) => {
                const key = `${f}:${s}`, choice = sheets[key];
                if (!choice) return null;
                const change = (patch: Partial<SheetChoice>) => setSheets(previous => ({ ...previous, [key]: { ...previous[key], ...patch } }));
                return <div key={key} className="space-y-3 rounded-lg border border-border bg-surface p-3">
                    <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={choice.include} onChange={event => change({ include: event.target.checked })} />
                        <span><span className="font-medium">{sheet.title ?? sheet.name.trim()}</span>
                            {sheet.kind && <Badge variant="neutral" className="ml-2">{sheet.kind === 'service' ? 'Үйлчилгээний талбай' : 'Орон сууц'}</Badge>}
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                {sheet.rows.length} мөр · {sheet.conditions.map(condition => condition.label).join(', ')}
                                {' · '}{sheet.valid_from || sheet.valid_until ? `файлд ${day(sheet.valid_from) ?? '…'} – ${day(sheet.valid_until) ?? '…'} хүчинтэй` : 'файлд хүчинтэй хугацаа заагаагүй'}
                            </span>
                        </span>
                    </label>
                    {choice.include && <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                        <label htmlFor={`${id}-${key}-block`} className="space-y-1 text-sm">Блок
                            <Input id={`${id}-${key}-block`} value={choice.block} maxLength={50} placeholder="Б1" onChange={event => change({ block: event.target.value })} />
                        </label>
                        {sheet.modelColumns.length > 1 && <div className="space-y-1 text-sm">
                            <label htmlFor={`${id}-${key}-model`} className="block">Загварын багана</label>
                            <select id={`${id}-${key}-model`} value={choice.modelColumn} onChange={event => change({ modelColumn: Number(event.target.value) })}
                                className="min-h-10 w-full rounded-lg border border-control bg-surface px-3 text-sm">
                                {sheet.modelColumns.map((column, index) => <option key={index} value={index}>{index + 1}-р «{column.header}»: {column.sample.join(', ')}</option>)}
                            </select>
                            <span className="block text-xs text-muted-foreground">Нөөцийн бүртгэлийн загвартай ижил кодыг сонгоно — үнийн санал түүгээр таарна.</span>
                        </div>}
                    </div>}
                    {sheet.kind === 'service' && choice.include && <p className="text-xs text-muted-foreground">Үйлчилгээний талбайн үнэ «Үнэ, нөхцөл» хуудсанд харагдана; уулзалтын үнийн санал зөвхөн орон сууцанд тооцогдоно.</p>}
                    {sheet.issues.length > 0 && <ul className="space-y-0.5 text-xs text-status-pending">
                        {sheet.issues.slice(0, SHOWN_ISSUES).map((issue, index) => <li key={index}>{issue.row ? `${issue.row}-р мөр: ` : ''}{issue.message}</li>)}
                        {sheet.issues.length > SHOWN_ISSUES && <li>… бас {sheet.issues.length - SHOWN_ISSUES}</li>}
                    </ul>}
                </div>;
            })}
        </div>)}

        {Object.keys(conditions).length > 0 && <div className="space-y-2">
            <h4 className="text-sm font-medium">Төлбөрийн нөхцөл</h4>
            <p className="text-xs text-muted-foreground">Нөхцөл бүрийн эхний урьдчилгааны хувийг баталсан нөхцөлөөс оруулна — шошгоос («10-30%») таахгүй. Хоосон бол ноорог болж хадгалагдана, идэвхжүүлэхийн өмнө бөглөнө.</p>
            <table className="w-full max-w-xl border-collapse text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Нөхцөл</th>
                    <th scope="col" className="border-b border-border py-1.5 pr-3 font-medium">Оруулах</th>
                    <th scope="col" className="border-b border-border py-1.5 font-medium">Эхний урьдчилгаа (%)</th>
                </tr></thead>
                <tbody>{Object.entries(conditions).map(([label, form]) => {
                    const change = (patch: Partial<ConditionForm>) => setConditions(previous => ({ ...previous, [label]: { ...previous[label], ...patch } }));
                    return <tr key={label}>
                        <td className="py-1.5 pr-3">{label}{label === BASE_PRICE_CONDITION && <span className="block text-xs text-muted-foreground">Ашиглалтад орсны дараах жагсаалтын үнэ</span>}</td>
                        <td className="py-1.5 pr-3"><input type="checkbox" aria-label={`«${label}» нөхцөлийг оруулах`} checked={form.include} onChange={event => change({ include: event.target.checked })} /></td>
                        <td className="py-1.5"><Input aria-label={`«${label}» эхний урьдчилгаа (%)`} inputMode="decimal" className="num w-28" value={form.advance} disabled={!form.include} onChange={event => change({ advance: event.target.value })} /></td>
                    </tr>;
                })}</tbody>
            </table>
        </div>}

        {files.length > 0 && <div className="space-y-2">
            {built.errors.length > 0 && <ul role="alert" className="space-y-0.5 text-sm text-status-danger">
                {built.errors.slice(0, SHOWN_ISSUES).map(message => <li key={message}>{message}</li>)}
                {built.errors.length > SHOWN_ISSUES && <li>… бас {built.errors.length - SHOWN_ISSUES}</li>}
            </ul>}
            {blocks.length > 0 && <p className="text-sm">{blocks.map(block => block.replaced
                ? `${block.label}: одоогийн ${block.replaced} мөрийг ${block.rows} мөрөөр солино`
                : `${block.label}: ${block.rows} мөр нэмнэ`).join(' · ')}</p>}
            {missingAdvance.length > 0 && !built.errors.length && <p className="text-xs text-status-pending">Урьдчилгаа оруулаагүй: {missingAdvance.join(', ')}.</p>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || built.errors.length > 0 || !built.rules.length}
                    onClick={() => onApply({ rules: built.rules, files: files.map(file => file.file) })}>
                    Засварт оруулах ({built.rules.length} мөр)
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Болих</Button>
            </div>
        </div>}
    </section>;
}
