'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateText } from '@/components/ui/DateText';
import { Input } from '@/components/ui/Input';
import { formatMNT } from '@/lib/utils/currency';
import { pricingKey } from '@/lib/sales/pricing';
import type { UnitPriceSheet } from '@/lib/sales/unit-pricing';
import { PRICING_VALIDITY, pricingDay } from './PricingVersionView';

function Meta({ label, children }: { label: string; children: ReactNode }) {
    return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm text-foreground">{children}</dd></div>;
}

/**
 * One block's units of an active per-unit price list (parking spaces, storage, service space): a price per unit,
 * or one per payment condition. Prices are whole amounts per unit, not per m².
 */
export function UnitPriceView({ sheet, block, showList = false }: { sheet: UnitPriceSheet; block: string; showList?: boolean }) {
    const rows = useMemo(() => sheet.rows.filter(row => pricingKey(row.block) === pricingKey(block))
        .sort((a, b) => a.code.localeCompare(b.code, 'mn', { numeric: true })), [sheet.rows, block]);
    const models = useMemo(() => [...new Set(rows.map(row => row.model).filter((model): model is string => !!model))].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true })), [rows]);
    const conditions = sheet.conditions.filter(condition => rows.some(row => row.prices[condition.label] !== undefined));
    const [model, setModel] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const shown = rows.filter(row => (model === null || row.model === model) && (!search.trim() || pricingKey(row.code).includes(pricingKey(search))));
    const state = PRICING_VALIDITY[sheet.validity];
    return <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{showList ? `${sheet.list_name} · ` : ''}Хувилбар {sheet.version}</h3>
                <Badge variant={state.variant} size="md">{state.label}</Badge>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Meta label="Эх сурвалж">{sheet.source || '—'}</Meta>
                <Meta label="Хүчинтэй хугацаа"><span className="num">{pricingDay(sheet.valid_from)} – {sheet.valid_until ? pricingDay(sheet.valid_until) : 'дуусах хугацаагүй'}</span></Meta>
                <Meta label="Идэвхжүүлсэн"><DateText value={sheet.activated_at} format="datetime" />{sheet.activated_by ? ` · ${sheet.activated_by}` : ''}</Meta>
                <Meta label="Үнэтэй тоот"><span className="num">{rows.length}</span></Meta>
            </dl>
            {sheet.validity !== 'valid' && <Alert variant="warning" className="mt-4">
                {sheet.validity === 'expired' ? 'Хүчинтэй хугацаа дууссан. Шинэ үнэ батлагдтал энэ үнийг харилцагчид санал болгохгүй.' : `Энэ үнэ ${pricingDay(sheet.valid_from)}-нээс хүчинтэй болно.`}
            </Alert>}
            {sheet.note && <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{sheet.note}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
            {models.length > 1 && <div role="group" aria-label="Загвараар шүүх" className="flex flex-wrap gap-2">
                {[null, ...models].map(item => <Button key={item ?? 'all'} type="button" size="sm" variant={model === item ? 'primary' : 'secondary'}
                    aria-pressed={model === item} onClick={() => setModel(item)}>{item ?? 'Бүгд'}</Button>)}
            </div>}
            <Input aria-label="Кодоор хайх" placeholder="Кодоор хайх" value={search} onChange={event => setSearch(event.target.value)} className="ml-auto w-44" />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">{sheet.list_name}: тоот бүрийн үнэ</caption>
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Код</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Загвар</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 text-right font-medium">Талбай</th>
                    {conditions.map(condition => <th key={condition.label} scope="col" className="border-b border-border px-4 py-2.5 text-right font-medium">
                        <span className="text-foreground">{condition.label}</span>
                        {condition.advance_percent !== null && <span className="block font-normal">урьдчилгаа {condition.advance_percent}%</span>}
                    </th>)}
                </tr></thead>
                <tbody>{shown.map(row => <tr key={row.code} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-2.5">{row.model ?? '—'}</td>
                    <td className="num px-4 py-2.5 text-right">{row.area_sqm === null ? '—' : `${row.area_sqm} м²`}</td>
                    {conditions.map(condition => <td key={condition.label} className="num px-4 py-2.5 text-right">
                        {row.prices[condition.label] === undefined ? <span className="text-muted-foreground">—</span> : formatMNT(row.prices[condition.label])}
                    </td>)}
                </tr>)}</tbody>
            </table>
        </div>
        <p className="text-xs text-muted-foreground">Нүд бүр нэг тоотын нийт үнэ (м² үнэ биш). Хоосон нүд — тухайн тоотод энэ нөхцөл байхгүй.{shown.length !== rows.length ? ` ${rows.length} тоотоос ${shown.length} нь харагдаж байна.` : ''}</p>
    </div>;
}
