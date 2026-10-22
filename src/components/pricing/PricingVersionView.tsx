'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateText } from '@/components/ui/DateText';
import { formatMNT } from '@/lib/utils/currency';
import { pricingKey } from '@/lib/sales/pricing';
import { pivotPricingRows, type PricingRuleDiff, type PricingSheetVersion, type PricingValidity } from '@/lib/sales/pricing-history';

const VALIDITY: Record<PricingValidity, { label: string; variant: 'success' | 'pending' | 'danger' }> = {
    valid: { label: 'Хүчинтэй', variant: 'success' },
    upcoming: { label: 'Эхлээгүй', variant: 'pending' },
    expired: { label: 'Хугацаа дууссан', variant: 'danger' },
};

/** Calendar days stay as typed (no timezone shift): 2026-10-01 → 2026.10.01. */
export const pricingDay = (value: string | null) => value ? value.replaceAll('-', '.') : '—';
const floors = (rule: { floor_min: number; floor_max: number }) => rule.floor_min === rule.floor_max ? String(rule.floor_min) : `${rule.floor_min}–${rule.floor_max}`;
const percent = (value: number | null) => value === null ? '—' : `${value}%`;

function PricingStatusBadge({ version }: { version: Pick<PricingSheetVersion, 'status' | 'validity'> }) {
    if (version.status === 'archived') return <Badge variant="neutral" size="md">Архивласан</Badge>;
    const state = VALIDITY[version.validity];
    return <Badge variant={state.variant} size="md">{state.label}</Badge>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
    return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm text-foreground">{children}</dd></div>;
}

function PriceCell({ row, perCellAdvance }: { row: PricingRuleDiff | undefined; perCellAdvance: boolean }) {
    if (!row) return <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>;
    const { rule, previous } = row;
    const priceMoved = row.change === 'changed' && previous && previous.price_per_sqm !== rule.price_per_sqm;
    const advanceMoved = row.change === 'changed' && previous && previous.advance_percent !== rule.advance_percent;
    return <td className={`num px-4 py-2.5 text-right${row.change === 'changed' ? ' bg-status-pending-soft' : ''}`}>
        {formatMNT(rule.price_per_sqm)}
        {row.change === 'added' && <Badge variant="info" className="ml-1.5">Шинэ</Badge>}
        {(perCellAdvance || advanceMoved) && <span className="block text-xs text-muted-foreground">урьдчилгаа {percent(rule.advance_percent)}{advanceMoved && <> · өмнө <s>{percent(previous!.advance_percent)}</s></>}</span>}
        {priceMoved && <span className="block text-xs text-muted-foreground">өмнө <s>{formatMNT(previous!.price_per_sqm)}</s></span>}
    </td>;
}

/** One activated version: its terms, rules and the difference from the version it replaced. */
export function PricingVersionView({ version }: { version: PricingSheetVersion }) {
    const compared = version.previous_version !== null;
    const changed = version.rows.filter(row => row.change === 'changed').length;
    const added = version.rows.filter(row => row.change === 'added').length;
    const table = useMemo(() => pivotPricingRows(version.rows), [version.rows]);
    const [block, setBlock] = useState<string | null>(null);
    const groups = block === null ? table.groups : table.groups.filter(group => pricingKey(group.block) === pricingKey(block));
    return <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Хувилбар {version.version}</h2>
                <PricingStatusBadge version={version} />
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Meta label="Эх сурвалж">{version.source || '—'}</Meta>
                <Meta label="Хүчинтэй хугацаа"><span className="num">{pricingDay(version.valid_from)} – {pricingDay(version.valid_until)}</span></Meta>
                <Meta label="Идэвхжүүлсэн"><DateText value={version.activated_at} format="datetime" />{version.activated_by ? ` · ${version.activated_by}` : ''}</Meta>
                {version.status === 'archived'
                    ? <Meta label="Архивт шилжсэн"><DateText value={version.archived_at} format="datetime" /></Meta>
                    : <Meta label="Үнийн мөр"><span className="num">{version.rows.length}</span></Meta>}
            </dl>
            {version.status === 'active' && version.validity !== 'valid' && <Alert variant="warning" className="mt-4">
                {version.validity === 'expired'
                    ? 'Хүчинтэй хугацаа дууссан тул уулзалтын үнийн санал тооцогдохгүй. Шинэ үнэ батлагдтал энэ үнийг харилцагчид санал болгохгүй.'
                    : `Энэ үнэ ${pricingDay(version.valid_from)}-нээс хүчинтэй болно. Тэр хүртэл уулзалтын үнийн санал тооцогдохгүй.`}
            </Alert>}
            <p className="mt-4 text-sm text-muted-foreground">
                {compared
                    ? `Хувилбар ${version.previous_version}-тэй харьцуулав: ${changed} мөр өөрчлөгдсөн · ${added} шинэ · ${version.removed.length} хасагдсан.`
                    : 'Анхны баталсан хувилбар — харьцуулах өмнөх үнэ байхгүй.'}
            </p>
        </div>

        {table.blocks.length > 1 && <div role="group" aria-label="Блокоор шүүх" className="flex flex-wrap gap-2">
            {[null, ...table.blocks].map(item => <Button key={item ?? 'all'} type="button" size="sm" variant={block === item ? 'primary' : 'secondary'}
                aria-pressed={block === item} onClick={() => setBlock(item)}>{item ?? 'Бүх блок'}</Button>)}
        </div>}

        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">Хувилбар {version.version}-ийн м² үнэ, төлбөрийн нөхцөлөөр</caption>
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Блок</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Загвар</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Давхар</th>
                    {table.conditions.map(condition => <th key={condition.key} scope="col" className="border-b border-border px-4 py-2.5 text-right font-medium">
                        <span className="text-foreground">{condition.label}</span>
                        {condition.advance_percent !== 'mixed' && <span className="block font-normal">урьдчилгаа {percent(condition.advance_percent)}</span>}
                    </th>)}
                </tr></thead>
                <tbody>{groups.map(group => <tr key={`${group.block}|${group.model}|${group.floor_min}|${group.floor_max}`} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5">{group.block}</td>
                    <td className="px-4 py-2.5">{group.model}</td>
                    <td className="num px-4 py-2.5">{floors(group)}</td>
                    {table.conditions.map(condition => <PriceCell key={condition.key} row={group.cells[condition.key]} perCellAdvance={condition.advance_percent === 'mixed'} />)}
                </tr>)}</tbody>
            </table>
        </div>
        <p className="text-xs text-muted-foreground">Нүд бүр м² үнэ. Хоосон нүд — тухайн байранд энэ нөхцөл байхгүй.{compared ? ' «Шинэ» — өмнөх хувилбарт байгаагүй; зураастай нь өмнөх үнэ.' : ''}</p>

        {version.removed.length > 0 && <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">Хасагдсан мөр</h3>
            <p className="mt-1 text-xs text-muted-foreground">Хувилбар {version.previous_version}-д байсан, энэ хувилбарт байхгүй үнэ. Давхарын зааг өөрчлөгдсөн мөр ч энд гарна.</p>
            <ul className="mt-3 space-y-1 text-sm">{version.removed.map((rule, index) => <li key={index} className="text-muted-foreground">
                {rule.block} · {rule.model} · <span className="num">{floors(rule)}</span> давхар · {rule.payment_condition}: <span className="num">{formatMNT(rule.price_per_sqm)}</span>/м², урьдчилгаа <span className="num">{percent(rule.advance_percent)}</span>
            </li>)}</ul>
        </div>}
    </div>;
}
