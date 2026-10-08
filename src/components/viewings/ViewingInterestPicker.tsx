'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useViewingQuote } from '@/hooks/useViewings';
import { formatMNT } from '@/lib/utils/currency';
import { pricingKey } from '@/lib/sales/pricing';
import { interestInput, viewingInterestLabel, type ViewingInterestInput, type ViewingUnitOption, type ViewingCondition } from '@/lib/viewings/interests';
import { Button } from '@/components/ui/Button';

const control = 'h-10 w-full rounded-md border border-control bg-background px-2.5 text-sm text-foreground';
const unique = <T,>(values: T[]) => [...new Set(values)];

/** Multiple interests are independent alternatives; the customer need not commit to an exact unit. */
export function ViewingInterestPicker({ units, conditions = [], pricingReason, value, onChange, onDraftChange }: {
    units: ViewingUnitOption[]; conditions?: ViewingCondition[]; pricingReason?: string | null;
    value: ViewingInterestInput[]; onChange: (value: ViewingInterestInput[]) => void;
    onDraftChange?: (value: ViewingInterestInput | null) => void;
}) {
    const [block, setBlock] = useState('');
    const [model, setModel] = useState('');
    const [area, setArea] = useState('');
    const [floor, setFloor] = useState('');
    const [unitId, setUnitId] = useState('');
    const [term, setTerm] = useState('');
    const matched = units.filter(unit => unit.block === block && (!model || unit.model === model) && (!area || unit.area_sqm === Number(area)));
    const onFloor = matched.filter(unit => !floor || unit.floor === Number(floor));
    const terms = unique(conditions.filter(condition => pricingKey(condition.block) === pricingKey(block) && pricingKey(condition.model) === pricingKey(model)
        && (!floor || (Number(floor) >= condition.floor_min && Number(floor) <= condition.floor_max))).map(condition => condition.payment_condition));
    const selection: ViewingInterestInput | null = block && model && area ? {
        block, model, area_sqm: Number(area), floor: floor ? Number(floor) : null, unit_id: unitId || null, payment_condition: term || null,
    } : null;
    const quote = useViewingQuote(selection);
    useEffect(() => { onDraftChange?.(selection); }, [block, model, area, floor, unitId, term, onDraftChange]); // eslint-disable-line react-hooks/exhaustive-deps -- selection is composed solely from these fields
    const add = () => {
        if (!selection || value.length >= 20) return;
        const item = interestInput(selection);
        if (!value.some(existing => JSON.stringify(interestInput(existing)) === JSON.stringify(item))) onChange([...value, item]);
        setBlock(''); setModel(''); setArea(''); setTerm(''); setUnitId(''); setFloor('');
    };
    return <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="text-sm font-medium">Сонирхсон байр</div>
        {value.map((item, index) => <div key={index} className="flex items-start gap-2 rounded-md bg-brand-soft p-2 text-xs">
            <span className="min-w-0 flex-1">{viewingInterestLabel({ ...item, unit_label: item.unit_id ? units.find(unit => unit.id === item.unit_id)?.unit_number || units.find(unit => unit.id === item.unit_id)?.code : null })}</span>
            <button type="button" aria-label={`${index + 1}-р сонголтыг хасах`} onClick={() => onChange(value.filter((_, i) => i !== index))} className="rounded p-1 hover:bg-surface-2"><X className="size-3.5" /></button>
        </div>)}
        <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">Блок<select aria-label="Блок" className={control} value={block} onChange={e => { setBlock(e.target.value); setModel(''); setArea(''); setFloor(''); setUnitId(''); setTerm(''); }}>
                <option value="">Сонгох</option>{unique(units.map(unit => unit.block)).sort().map(v => <option key={v}>{v}</option>)}
            </select></label>
            <label className="space-y-1 text-xs">Загвар<select aria-label="Загвар" className={control} disabled={!block} value={model} onChange={e => { setModel(e.target.value); setArea(''); setFloor(''); setUnitId(''); setTerm(''); }}>
                <option value="">Сонгох</option>{unique(units.filter(unit => unit.block === block).map(unit => unit.model)).sort().map(v => <option key={v}>{v}</option>)}
            </select></label>
            <label className="space-y-1 text-xs">Талбай<select aria-label="Талбай" className={control} disabled={!model} value={area} onChange={e => { setArea(e.target.value); setFloor(''); setUnitId(''); setTerm(''); }}>
                <option value="">Сонгох</option>{unique(units.filter(unit => unit.block === block && unit.model === model).map(unit => unit.area_sqm)).sort((a, b) => a - b).map(v => <option key={v} value={v}>{v} м²</option>)}
            </select></label>
            <label className="space-y-1 text-xs">Давхар<select aria-label="Давхар" className={control} disabled={!area} value={floor} onChange={e => { setFloor(e.target.value); setUnitId(''); setTerm(''); }}>
                <option value="">Тодорхойгүй</option>{unique(matched.flatMap(unit => unit.floor == null ? [] : [unit.floor])).sort((a, b) => a - b).map(v => <option key={v} value={v}>{v}-р давхар</option>)}
            </select></label>
        </div>
        <label className="block space-y-1 text-xs">Тоот — сонгох албагүй<select aria-label="Тоот" className={control} disabled={!area} value={unitId} onChange={e => { setUnitId(e.target.value); const unit = units.find(u => u.id === e.target.value); if (unit) { setFloor(unit.floor == null ? '' : String(unit.floor)); setTerm(''); } }}>
            <option value="">Тоот сонгоогүй</option>{onFloor.map(unit => <option key={unit.id} value={unit.id}>{unit.unit_number || unit.code}{unit.floor == null ? '' : ` · ${unit.floor}-р давхар`}{unit.status !== 'available' ? ' · боломжгүй' : ''}</option>)}
        </select></label>
        <label className="block space-y-1 text-xs">Төлбөрийн нөхцөл<select aria-label="Төлбөрийн нөхцөл" className={control} value={term} disabled={!area || !terms.length} onChange={e => setTerm(e.target.value)}>
            <option value="">Сонгоогүй</option>{terms.map(v => <option key={v}>{v}</option>)}
        </select></label>
        {!terms.length && <p className="text-xs text-muted-foreground">{pricingReason || 'Энэ байрны баталсан төлбөрийн нөхцөл алга. Сонирхлыг үнэ бодолгүй бүртгэж болно.'}</p>}
        {selection && <div aria-live="polite" className="space-y-1 rounded-md border border-border bg-surface-2 p-3 text-xs">
            {quote.isFetching ? <p>Үнэ бодож байна…</p> : quote.error ? <p role="alert" className="text-status-danger">{quote.error instanceof Error ? quote.error.message : 'Үнэ шалгаж чадсангүй'}</p>
                : quote.data?.available ? <>
                    <Price label="м² үнэ" amount={quote.data.quote.price_per_sqm} />
                    <Price label="Нийт үнэ" amount={quote.data.quote.total_amount} />
                    <Price label="Урьдчилгаа" amount={quote.data.quote.advance_amount} />
                    <Price label="Үлдэгдэл" amount={quote.data.quote.balance_amount} />
                    {quote.data.quote.advance_reason && <p>{quote.data.quote.advance_reason}</p>}
                    <p className="pt-1 text-muted-foreground">{quote.data.quote.source} · v{quote.data.quote.version}</p>
                </> : <p>{quote.data?.reason || 'Үнийн санал байхгүй. Сонголтоо хадгалж болно.'}</p>}
        </div>}
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!selection || value.length >= 20 || !!quote.error}><Plus />Сонголт нэмэх</Button>
        {selection && <p className="text-xs text-muted-foreground">Хадгалах үед энэ сонголт бүртгэгдэнэ. Олон байр сонирхсон бол «Сонголт нэмэх»-ийг дарна.</p>}
    </div>;
}

function Price({ label, amount }: { label: string; amount: number | null }) {
    return <div className="flex justify-between gap-3"><span>{label}</span><span className="num font-medium">{amount == null ? '—' : formatMNT(amount)}</span></div>;
}
