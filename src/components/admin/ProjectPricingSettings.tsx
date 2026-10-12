'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardJson, dashboardMutate, DashboardApiError } from '@/lib/api/dashboardFetch';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EMPTY_PRICING_DRAFT, PricingSaveSchema, type PricingConfig, type PricingRule } from '@/lib/sales/pricing';

type Overview = { latest: PricingConfig | null; active: PricingConfig | null };
type RuleForm = { [K in keyof PricingRule]: string };
const emptyRule = (): RuleForm => ({ block: '', model: '', floor_min: '', floor_max: '', payment_condition: '', price_per_sqm: '', advance_percent: '' });
const fields: Array<{ key: keyof RuleForm; label: string; numeric?: boolean }> = [
    { key: 'block', label: 'Блок' }, { key: 'model', label: 'Загвар' },
    { key: 'floor_min', label: 'Давхар эхлэх', numeric: true }, { key: 'floor_max', label: 'Давхар дуусах', numeric: true },
    { key: 'payment_condition', label: 'Нөхцөл' }, { key: 'price_per_sqm', label: 'м² үнэ (₮)', numeric: true },
    { key: 'advance_percent', label: 'Эхний урьдчилгаа (%)', numeric: true },
];

/** Root admin projects page wires the chosen shop; the API rechecks access independently. */
export function ProjectPricingSettings({ shopId, projectName }: { shopId: string; projectName?: string }) {
    const query = useQuery({
        queryKey: ['project-pricing', shopId], enabled: !!shopId,
        queryFn: () => dashboardJson<Overview>('/api/admin/pricing', { shopId }),
        staleTime: Infinity, refetchOnWindowFocus: false, meta: { inlineError: true },
    });
    return <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Үнийн нөхцөл{projectName ? ` · ${projectName}` : ''}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Баталсан эх сурвалжийн үнийг оруулна. Ноорог уулзалтын тооцоонд ашиглагдахгүй.</p>
        {query.isPending ? <p className="mt-4 text-sm">Ачаалж байна…</p>
            : query.error && !query.data ? <p role="alert" className="mt-4 text-sm text-status-danger">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Дахин ачаалах</button></p>
                : query.data && <PricingEditor key={`${shopId}:${query.dataUpdatedAt}`} shopId={shopId} overview={query.data} onSaved={async () => {
                    const result = await query.refetch();
                    if (result.error) throw result.error;
                }} />}
    </section>;
}

function PricingEditor({ shopId, overview, onSaved }: { shopId: string; overview: Overview; onSaved: () => Promise<unknown> }) {
    const initial = overview.latest ?? EMPTY_PRICING_DRAFT;
    const id = useId();
    const [source, setSource] = useState(initial.source);
    const [from, setFrom] = useState(initial.valid_from ?? '');
    const [until, setUntil] = useState(initial.valid_until ?? '');
    const [confirmed, setConfirmed] = useState(initial.inventory_area_confirmed);
    const [rows, setRows] = useState<RuleForm[]>(initial.rules.map(rule => Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, value === null ? '' : String(value)])) as RuleForm));
    const [reviewed, setReviewed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);

    function changeRow(index: number, key: keyof RuleForm, value: string) {
        setReviewed(false);
        setRows(previous => previous.map((row, position) => position === index ? { ...row, [key]: value } : row));
    }

    function payload(status: 'draft' | 'active') {
        return PricingSaveSchema.safeParse({ expected_version: overview.latest?.version ?? 0, status, config: {
            source, valid_from: from || null, valid_until: until || null, inventory_area_confirmed: confirmed,
            rules: rows.map(row => ({ ...row,
                floor_min: row.floor_min === '' ? null : Number(row.floor_min), floor_max: row.floor_max === '' ? null : Number(row.floor_max),
                price_per_sqm: row.price_per_sqm === '' ? null : Number(row.price_per_sqm),
                advance_percent: row.advance_percent === '' ? null : Number(row.advance_percent),
            })),
        } });
    }

    function review() {
        const parsed = payload('active');
        setError(parsed.success ? null : parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
        setReviewed(parsed.success);
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

    return <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{overview.active ? `Идэвхтэй хувилбар ${overview.active.version}: ${overview.active.source} (${overview.active.valid_from} – ${overview.active.valid_until})` : 'Идэвхтэй үнэ байхгүй.'} {overview.latest ? `Засаж буй хувилбар: ${overview.latest.version}` : ''}</p>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-3">
            <label htmlFor={`${id}-source`} className="space-y-1 text-sm">Эх сурвалж<Input id={`${id}-source`} value={source} maxLength={500} placeholder="Баталсан үнийн хуудас, огноо" onChange={event => { setSource(event.target.value); setReviewed(false); }} /></label>
            <label htmlFor={`${id}-from`} className="space-y-1 text-sm">Эхлэх огноо<Input id={`${id}-from`} type="date" value={from} onChange={event => { setFrom(event.target.value); setReviewed(false); }} /></label>
            <label htmlFor={`${id}-until`} className="space-y-1 text-sm">Дуусах огноо<Input id={`${id}-until`} type="date" value={until} onChange={event => { setUntil(event.target.value); setReviewed(false); }} /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setReviewed(false); }} className="mt-1" /><span>Одоогийн нөөцийн талбайгаар тооцохыг баталсан. Шинэчилсэн талбай байхгүй эсвэл 0 бол борлуулах, дараа нь гэрээлсэн талбайг ашиглана.</span></label>
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead><tr>{fields.map(field => <th key={field.key} className="border-b border-border px-1 pb-2 text-left font-medium">{field.label}</th>)}<th className="border-b border-border"><span className="sr-only">Устгах</span></th></tr></thead>
                <tbody>{rows.map((row, index) => <tr key={index}>
                    {fields.map(field => <td key={field.key} className="px-1 py-2"><Input aria-label={`${index + 1}-р мөр ${field.label}`} value={row[field.key]} onChange={event => changeRow(index, field.key, event.target.value)} inputMode={field.numeric ? 'decimal' : 'text'} className={field.numeric ? 'num min-w-20' : 'min-w-20'} /></td>)}
                    <td><Button type="button" variant="ghost" aria-label={`${index + 1}-р үнийн мөр устгах`} disabled={saving} onClick={() => { setRows(previous => previous.filter((_, position) => position !== index)); setReviewed(false); }}><Trash2 className="size-4" /></Button></td>
                </tr>)}</tbody>
            </table>
        </div>
        {!rows.length && <p className="text-sm text-muted-foreground">Баталсан үнийн мөр нэмнэ үү.</p>}
        <p className="text-xs text-muted-foreground">Хоосон үнийн нөхцөлийг мөр болгон нэмэхгүй. «10–30%» зэрэг нөхцөлийн эхний урьдчилгааг шошгоос таахгүй; баталсан эхний хувийг тусад нь оруулна.</p>
        <Button type="button" variant="secondary" disabled={saving || rows.length >= 500} onClick={() => { setRows(previous => [...previous, emptyRule()]); setReviewed(false); }}><Plus className="size-4" />Үнийн мөр нэмэх</Button>
        {error && <div role="alert" className="text-sm text-status-danger"><p>{error}</p>
            {conflict && <button type="button" disabled={saving} className="mt-2 font-medium text-brand-strong underline" onClick={async () => {
                setSaving(true);
                try { await onSaved(); }
                catch (cause) { setError(cause instanceof Error ? cause.message : 'Шинэ мэдээлэл ачаалагдсангүй'); }
                finally { setSaving(false); }
            }}>Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх</button>}
        </div>}
        {reviewed && <p role="status" className="rounded-lg border border-status-success/30 bg-status-success-soft p-3 text-sm">{source}: {from}–{until}, {rows.length} мөр. Давхарын зааг, үнэ, эхний урьдчилгааг шалгалаа. Идэвхжүүлэхэд өмнөх идэвхтэй хувилбарыг орлоно; хуучин уулзалтын санал хэвээр үлдэнэ.</p>}
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={saving || conflict} onClick={() => void save('draft')}>Ноорог хадгалах</Button>
            <Button type="button" variant="secondary" disabled={saving || conflict} onClick={review}>Идэвхжүүлэхийн өмнө хянах</Button>
            <Button type="button" disabled={saving || conflict || !reviewed} onClick={() => void save('active')}>{saving ? 'Хадгалж байна…' : 'Баталсан үнийг идэвхжүүлэх'}</Button>
        </div>
    </div>;
}
