import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DateText } from '@/components/ui/DateText';
import { formatMNT } from '@/lib/utils/currency';
import type { PricingRule } from '@/lib/sales/pricing';
import type { PricingRuleDiff, PricingSheetVersion, PricingValidity } from '@/lib/sales/pricing-history';

const VALIDITY: Record<PricingValidity, { label: string; variant: 'success' | 'pending' | 'danger' }> = {
    valid: { label: 'Хүчинтэй', variant: 'success' },
    upcoming: { label: 'Эхлээгүй', variant: 'pending' },
    expired: { label: 'Хугацаа дууссан', variant: 'danger' },
};

/** Calendar days stay as typed (no timezone shift): 2026-10-01 → 2026.10.01. */
export const pricingDay = (value: string | null) => value ? value.replaceAll('-', '.') : '—';
const floors = (rule: PricingRule) => rule.floor_min === rule.floor_max ? String(rule.floor_min) : `${rule.floor_min}–${rule.floor_max}`;
const percent = (value: number | null) => value === null ? '—' : `${value}%`;

function PricingStatusBadge({ version }: { version: Pick<PricingSheetVersion, 'status' | 'validity'> }) {
    if (version.status === 'archived') return <Badge variant="neutral" size="md">Архивласан</Badge>;
    const state = VALIDITY[version.validity];
    return <Badge variant={state.variant} size="md">{state.label}</Badge>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
    return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm text-foreground">{children}</dd></div>;
}

function ChangeCell({ row }: { row: PricingRuleDiff }) {
    if (row.change === 'added') return <Badge variant="info">Шинэ</Badge>;
    if (row.change === 'changed') return <Badge variant="pending">Өөрчлөгдсөн</Badge>;
    return <span className="text-xs text-muted-foreground">Хэвээр</span>;
}

/** One activated version: its terms, rules and the difference from the version it replaced. */
export function PricingVersionView({ version }: { version: PricingSheetVersion }) {
    const compared = version.previous_version !== null;
    const changed = version.rows.filter(row => row.change === 'changed').length;
    const added = version.rows.filter(row => row.change === 'added').length;
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
                    : <Meta label="Мөрийн тоо"><span className="num">{version.rows.length}</span></Meta>}
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

        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="sr-only">Хувилбар {version.version}-ийн үнэ, төлбөрийн нөхцөл</caption>
                <thead><tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Блок</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Загвар</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Давхар</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Төлбөрийн нөхцөл</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 text-right font-medium">м² үнэ</th>
                    <th scope="col" className="border-b border-border px-4 py-2.5 text-right font-medium">Эхний урьдчилгаа</th>
                    {compared && <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Өмнөхөөс</th>}
                </tr></thead>
                <tbody>{version.rows.map((row, index) => {
                    const priceMoved = row.change === 'changed' && row.previous && row.previous.price_per_sqm !== row.rule.price_per_sqm;
                    const advanceMoved = row.change === 'changed' && row.previous && row.previous.advance_percent !== row.rule.advance_percent;
                    return <tr key={index} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2.5">{row.rule.block}</td>
                        <td className="px-4 py-2.5">{row.rule.model}</td>
                        <td className="num px-4 py-2.5">{floors(row.rule)}</td>
                        <td className="px-4 py-2.5">{row.rule.payment_condition}</td>
                        <td className="num px-4 py-2.5 text-right">
                            {formatMNT(row.rule.price_per_sqm)}
                            {priceMoved && <span className="block text-xs text-muted-foreground">өмнө <s>{formatMNT(row.previous!.price_per_sqm)}</s></span>}
                        </td>
                        <td className="num px-4 py-2.5 text-right">
                            {percent(row.rule.advance_percent)}
                            {advanceMoved && <span className="block text-xs text-muted-foreground">өмнө <s>{percent(row.previous!.advance_percent)}</s></span>}
                        </td>
                        {compared && <td className="px-4 py-2.5"><ChangeCell row={row} /></td>}
                    </tr>;
                })}</tbody>
            </table>
        </div>

        {version.removed.length > 0 && <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">Хасагдсан мөр</h3>
            <p className="mt-1 text-xs text-muted-foreground">Хувилбар {version.previous_version}-д байсан, энэ хувилбарт байхгүй үнэ. Давхарын зааг өөрчлөгдсөн мөр ч энд гарна.</p>
            <ul className="mt-3 space-y-1 text-sm">{version.removed.map((rule, index) => <li key={index} className="text-muted-foreground">
                {rule.block} · {rule.model} · <span className="num">{floors(rule)}</span> давхар · {rule.payment_condition}: <span className="num">{formatMNT(rule.price_per_sqm)}</span>/м², урьдчилгаа <span className="num">{percent(rule.advance_percent)}</span>
            </li>)}</ul>
        </div>}
    </div>;
}
