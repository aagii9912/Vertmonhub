'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardApiError, dashboardJson } from '@/lib/api/dashboardFetch';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { formatMNTShort } from '@/lib/utils/currency';
import { ubParts } from '@/lib/utils/date';
import { unitCategoryLabel } from '@/lib/inventory/labels';
import { MONTHLY_SALES_BLOCK_LABELS, MONTHLY_SALES_BLOCKS, type MonthlySalesBlock } from '@/lib/sales/monthly';
import {
    PLAN_CANCELLED_NOTE, PLAN_LEGEND, PLAN_SOURCE_LABEL, planPctText, planValueText,
    type PlanCell, type PlanMetricKey, type PlanMonthRow, type PlanPerformance, type PlanScopeCells, type PlanYearCell,
} from '@/lib/sales/plan-performance';

type Segment = 'total' | MonthlySalesBlock;
type PlanResponse = PlanPerformance & { shopName?: string; cashHidden?: boolean };

const SEGMENTS: Array<{ key: Segment; label: string }> = [
    { key: 'total', label: 'Нийт' },
    ...MONTHLY_SALES_BLOCKS.map(block => ({ key: block, label: block === 'parking' ? 'Зогсоол' : MONTHLY_SALES_BLOCK_LABELS[block].replace(' блок', '') })),
];
const CASH_TOOLTIP = 'Тухайн сард бодитоор орсон урьдчилгаа, төлбөр: удирдлагын гараар оруулсан дүн, эс бөгөөс системд бүртгэсэн төлбөр.';
const ADVANCE_TOOLTIP = 'Тухайн сард захиалсан гэрээний нөхцлөөр төлөх ёстой дүн. Орсон мөнгө биш — төлөвлөгөөтэй харьцуулж хувь гаргахгүй.';
const LOWER_BOUND_NOTE = '«+» — огноогүй гэрээ байгаа тул доод хязгаар; тухайн сард гэрээгүй бол «—».';

const whole = (value: number) => Math.round(value).toLocaleString('en-US');
/** Тодорхойгүй (төлөвлөгөө оруулаагүй) нүд — бусад «—»-тэй адил бүдэг. */
const Missing = () => <span className="text-muted-foreground">—</span>;
const scopeCells = (row: PlanMonthRow, segment: Segment): PlanScopeCells => segment === 'total' ? row.total : row.blocks[segment];

function cellTitle(cell: PlanCell | undefined): string | undefined {
    if (!cell) return undefined;
    const parts = [
        cell.source ? `Эх сурвалж: ${PLAN_SOURCE_LABEL[cell.source]}` : null,
        cell.lowerBound ? 'Огноогүй гэрээ байгаа тул бүрэн биш' : null,
        !cell.inTotal ? 'Задаргаа системийн, нийтэд ороогүй' : null,
        cell.source === 'manual' && cell.auto.value !== null ? `Систем: ${whole(cell.auto.value)}${cell.auto.lowerBound ? '+' : ''}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
}

/** Гүйцэтгэлийн нүд: «N+» доод хязгаар, «*» системийн (эсвэл холимог), «—» тодорхойгүй. */
function Actual({ cell, format = whole }: { cell: PlanCell | undefined; format?: (value: number) => string }) {
    if (!cell || cell.actual === null) return <span className="text-muted-foreground">—</span>;
    return <span className={cn(!cell.inTotal && 'text-muted-foreground')} title={cellTitle(cell)}>
        {format(cell.actual)}{cell.lowerBound ? '+' : ''}{cell.source && cell.source !== 'manual' && <span className="text-muted-foreground">*</span>}
    </span>;
}

function Pct({ pct, lowerBound }: { pct: number | null; lowerBound: boolean }) {
    return <span className={cn(pct === null ? 'text-muted-foreground' : pct >= 100 ? 'font-semibold text-gold' : 'text-foreground')}>{planPctText(pct, lowerBound)}</span>;
}

function Tile({ label, value, helper, tone, title }: { label: string; value: ReactNode; helper?: ReactNode; tone?: 'danger'; title?: string }) {
    return <div className="border-border p-3 sm:border-r sm:last:border-r-0" title={title}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('mt-1.5 text-xl font-semibold num', tone === 'danger' && 'text-status-danger')}>{value}</p>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>;
}

const short = (value: number | null, lowerBound = false) => planValueText(value, lowerBound, formatMNTShort);

function yearCellOf(data: PlanPerformance, segment: Segment, key: PlanMetricKey): PlanYearCell | undefined {
    return segment === 'total' ? data.ytd.total.metrics[key] : data.ytd.blocks[segment].metrics[key];
}

function PlanContent() {
    const { shop, user } = useAuth();
    const [year, setYear] = useState(() => ubParts().year);
    const [segment, setSegment] = useState<Segment>('total');
    const { data, error, isPending, isFetching, refetch } = useQuery<PlanResponse>({
        queryKey: ['plan-performance', shop?.id, user?.id, user?.role, year],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/plan-performance?year=${year}`, { signal }),
        enabled: !!shop?.id,
        staleTime: 60_000,
        // 403 = хязгаарлагдсан (хувийн горимын) хэрэглэгч — давтахгүй.
        retry: (count, err) => !(err instanceof DashboardApiError && err.status === 403) && count < 1,
    });
    const forbidden = error instanceof DashboardApiError && error.status === 403;
    const years = data?.years?.length ? data.years : [year];
    const segmentLabel = SEGMENTS.find(item => item.key === segment)!.label;

    return <div className="space-y-4">
        <PageHeader title="Төлөвлөгөөний биелэлт" subtitle="Сар, блок тус бүрийн гэрээ ба мөнгөн урсгалын төлөвлөгөө, гүйцэтгэл."
            secondaryActions={<Button variant="secondary" onClick={() => refetch()} disabled={isFetching || !shop?.id}><RefreshCw className="size-4" />Шинэчлэх</Button>} />
        {!forbidden && <div className="flex flex-wrap items-center gap-3">
            <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
                <SelectTrigger className="h-9 w-28 text-sm" aria-label="Он сонгох"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(item => <SelectItem key={item} value={String(item)}>{item} он</SelectItem>)}</SelectContent>
            </Select>
            <div role="group" aria-label="Блок" className="inline-flex h-9 items-center rounded-md border border-border bg-surface p-0.5">
                {SEGMENTS.map(item => <button key={item.key} type="button" aria-pressed={segment === item.key} onClick={() => setSegment(item.key)}
                    className={cn('h-full rounded px-3 text-sm', segment === item.key ? 'bg-surface-2 font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>{item.label}</button>)}
            </div>
        </div>}
        {!shop?.id && <Alert variant="info"><AlertDescription>Идэвхтэй төслөө сонгож тайлангаа харна уу.</AlertDescription></Alert>}
        {forbidden && <Alert variant="info"><AlertDescription>Багийн төлөвлөгөөний биелэлт удирдлагад харагдана.</AlertDescription></Alert>}
        {error && !forbidden && <Alert variant="danger"><AlertTitle>Тайлан гарсангүй</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
        {isPending && shop?.id && !error && <p role="status" className="py-12 text-center text-muted-foreground">Тайлан нэгтгэж байна…</p>}
        {data && !error && <PlanReport data={data} segment={segment} segmentLabel={segmentLabel} />}
    </div>;
}

function PlanReport({ data, segment, segmentLabel }: { data: PlanResponse; segment: Segment; segmentLabel: string }) {
    const cashVisible = !!data.cash && !data.cashHidden;
    const tileMonth = data.months[(data.currentMonth ?? data.throughMonth ?? 1) - 1];
    const monthCells = scopeCells(tileMonth, segment);
    const monthAmount = monthCells.metrics.contract;
    const monthCount = monthCells.metrics.contract_count;
    const ytdAmount = yearCellOf(data, segment, 'contract');
    const ytdCash = yearCellOf(data, segment, 'cashflow');
    const overdue = segment === 'total' ? { amount: data.overdue.amount, count: data.overdue.count } : data.overdue.byBlock[segment];
    // Блокоор задлаагүй төлөвлөгөөтэй (гүйцэтгэлтэй) сард бусад блокийн орон сууц «Нийт»-д орно (`countsTowardPlan`).
    const otherInTotal = data.months.some(row => row.status !== 'future' && !row.blockPlanned);
    const undatedInScope = segment === 'total'
        ? data.undated.byScope.b1 + data.undated.byScope.b2 + data.undated.byScope.parking + (otherInTotal ? data.undated.byScope.residential_other : 0)
        : data.undated.byScope[segment];
    const outside = data.months.reduce((sum, row) => ({ count: sum.count + row.outside.count, amount: sum.amount + row.outside.amount }), { count: 0, amount: 0 });
    const outsideTypes = new Map<string, { count: number; amount: number }>();
    for (const row of data.months) for (const type of row.outside.byType) {
        const entry = outsideTypes.get(type.label) ?? { count: 0, amount: 0 };
        outsideTypes.set(type.label, { count: entry.count + type.count, amount: entry.amount + type.amount });
    }
    const otherResidential = data.months.filter(row => row.otherResidential.inTotal).reduce((sum, row) => sum + row.otherResidential.count, 0);

    return <>
        <section aria-label="Товч үзүүлэлт" className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface sm:grid sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
            <Tile label={`${tileMonth.month}-р сар${tileMonth.status === 'current' ? ' · явцын' : ''} · ${segmentLabel}`}
                value={<>{short(monthAmount?.actual ?? null, !!monthAmount?.lowerBound)}<span className="text-sm font-normal text-muted-foreground"> / {short(monthAmount?.plan ?? null)}</span></>}
                helper={`${planPctText(monthAmount?.pct ?? null, !!monthAmount?.lowerBound)} · ${monthCount?.actual === null || monthCount?.actual === undefined ? '—' : `${monthCount.actual}${monthCount.lowerBound ? '+' : ''}`} гэрээ${monthCount?.source && monthCount.source !== 'manual' ? '*' : ''}`} />
            <Tile label={data.throughMonth ? `Он эхнээс (1–${data.throughMonth} сар)` : 'Он эхнээс'}
                value={<>{short(ytdAmount?.actual ?? null, !!ytdAmount?.lowerBound)}<span className="text-sm font-normal text-muted-foreground"> · {planPctText(ytdAmount?.pct ?? null, !!ytdAmount?.lowerBound)}</span></>}
                helper={`Жилийн төлөвлөгөөнөөс ${planPctText(ytdAmount?.yearPct ?? null, !!ytdAmount?.lowerBound)} · төлөвлөгөө ${short(ytdAmount?.yearPlan ?? null)}`} />
            {cashVisible
                ? <Tile label="Орсон мөнгө (он эхнээс)" title={CASH_TOOLTIP}
                    value={ytdCash?.actual === null || ytdCash?.actual === undefined ? (data.cash!.availability === 'none' ? 'Оруулаагүй' : data.cash!.availability === 'no_ledger' ? 'Бүртгэл алга' : '—') : short(ytdCash.actual, ytdCash.lowerBound)}
                    helper={`Төлөвлөгөө ${short(ytdCash?.plan ?? null)}${ytdCash?.pct !== null && ytdCash?.pct !== undefined ? ` · ${planPctText(ytdCash.pct, ytdCash.lowerBound)}` : ''}`} />
                : <Tile label="Орсон мөнгө" value={<span className="text-base">Санхүүгийн эрх шаардлагатай</span>} helper="Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна." />}
            <Tile label="Төлбөр хоцролт" tone={overdue.amount ? 'danger' : undefined}
                value={data.overdue.available ? short(overdue.amount) : '—'}
                helper={!data.overdue.available ? 'Хоцролтын мэдээлэл алга' : `${overdue.count} гэрээ${data.overdue.asOf ? ` · ${data.overdue.asOf}-ны файлаар` : ''}${segment === 'total' && data.overdue.stale ? ` · ${data.overdue.stale} хуучирсан` : ''}`} />
        </section>

        {data.undated.count > 0 && <Alert variant="warning">
            <AlertTitle>Огноогүй {data.undated.count} гэрээ сарын гүйцэтгэлд ороогүй</AlertTitle>
            <AlertDescription>
                {undatedInScope > 0 ? `Энэ хэсэгт ${undatedInScope} нь хамаарна; хувь «+» тэмдэгтэй.` : 'Энэ хэсгийн хувьд бүрэн.'} Гэрээний дэлгэрэнгүйгээс «Захиалга өгсөн огноо»-г оруулбал тооцогдоно.{' '}
                <Link href="/dashboard/contracts?filter=undated" className="underline">Гэрээний жагсаалтаас харах</Link>
                <details className="mt-2">
                    <summary className="cursor-pointer font-medium">Огноогүй гэрээнүүд</summary>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                        {data.undated.contracts.map(item => <li key={item.id}>
                            <Link href={`/dashboard/contracts/${item.id}`} className="underline">{item.label || 'Байргүй'}</Link>
                            <span className="text-foreground/80"> · {item.productType ? unitCategoryLabel(item.productType) : 'Төрөлгүй'} · <span className="num">{item.amount === null ? '—' : whole(item.amount)}</span></span>
                        </li>)}
                    </ul>
                    {data.undated.count > data.undated.contracts.length && <p className="mt-2">… бусад <span className="num">{data.undated.count - data.undated.contracts.length}</span> гэрээг жагсаалтаас харна уу.</p>}
                </details>
            </AlertDescription>
        </Alert>}

        <section className="overflow-hidden rounded-md border border-border bg-surface">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5">
                <h2 className="text-sm font-semibold">Гэрээ · {segmentLabel}</h2>
                <p className="text-xs text-muted-foreground">Дүн ₮-өөр · {PLAN_LEGEND}</p>
            </header>
            <div className="max-h-[calc(100dvh-16rem)] overflow-auto">
                <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                    <caption className="sr-only">{data.year} оны {segmentLabel} гэрээний тоо, дүнгийн төлөвлөгөө, гүйцэтгэл, биелэлт</caption>
                    <thead className="sticky top-0 z-10 bg-surface-2 text-xs text-muted-foreground">
                        <tr>
                            <th rowSpan={2} scope="col" className="border-b border-r border-border px-3 py-2 text-left font-medium">Сар</th>
                            <th colSpan={3} scope="colgroup" className="border-b border-r border-border px-3 py-2 text-center font-medium text-foreground">Гэрээний тоо</th>
                            <th colSpan={3} scope="colgroup" className="border-b border-r border-border px-3 py-2 text-center font-medium text-foreground">Гэрээний дүн</th>
                            <th rowSpan={2} scope="col" title={ADVANCE_TOOLTIP} className="border-b border-l-2 border-border px-3 py-2 text-right font-medium">Нөхцлөөр төлөх урьдчилгаа<span className="block font-normal">мэдээлэл · орсон мөнгө биш</span></th>
                        </tr>
                        <tr>
                            {['contract_count', 'contract'].map(key => [
                                <th key={`${key}-plan`} scope="col" className="border-b border-border px-3 py-2 text-right font-medium text-gold">Төлөвлөгөө</th>,
                                <th key={`${key}-actual`} scope="col" className="border-b border-border px-3 py-2 text-right font-medium">Гүйцэтгэл</th>,
                                <th key={`${key}-pct`} scope="col" className="border-b border-r border-border px-3 py-2 text-right font-medium">Биелэлт</th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {data.months.map(row => {
                            const cells = scopeCells(row, segment);
                            const count = cells.metrics.contract_count;
                            const amount = cells.metrics.contract;
                            return <tr key={row.month} className={cn(row.status === 'future' && 'text-muted-foreground')}>
                                <th scope="row" className="whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium">
                                    {row.month}-р сар{row.status === 'current' && <span className="ml-2 rounded bg-status-info-soft px-1.5 py-0.5 text-xs font-normal text-status-info">явцын</span>}
                                </th>
                                <td className="num border-b border-border px-3 py-2 text-right">{count?.plan === null || count?.plan === undefined ? <Missing /> : whole(count.plan)}</td>
                                <td className="num border-b border-border px-3 py-2 text-right"><Actual cell={count} /></td>
                                <td className="num border-b border-r border-border px-3 py-2 text-right"><Pct pct={count?.pct ?? null} lowerBound={!!count?.lowerBound} /></td>
                                <td className="num border-b border-border px-3 py-2 text-right">{amount?.plan === null || amount?.plan === undefined ? <Missing /> : whole(amount.plan)}</td>
                                <td className="num border-b border-border px-3 py-2 text-right"><Actual cell={amount} /></td>
                                <td className="num border-b border-r border-border px-3 py-2 text-right"><Pct pct={amount?.pct ?? null} lowerBound={!!amount?.lowerBound} /></td>
                                <td className="num border-b border-l-2 border-border px-3 py-2 text-right text-muted-foreground">{cells.prepaymentDue === null ? '—' : whole(cells.prepaymentDue)}</td>
                            </tr>;
                        })}
                    </tbody>
                    <tfoot className="bg-surface-2 font-medium">
                        {(['ytd', 'year'] as const).map(kind => {
                            const count = yearCellOf(data, segment, 'contract_count');
                            const amount = yearCellOf(data, segment, 'contract');
                            const plan = (cell: PlanYearCell | undefined) => kind === 'ytd' ? cell?.plan ?? null : cell?.yearPlan ?? null;
                            const pct = (cell: PlanYearCell | undefined) => kind === 'ytd' ? cell?.pct ?? null : cell?.yearPct ?? null;
                            const actual = (cell: PlanYearCell | undefined) => cell?.actual === null || cell?.actual === undefined ? <Missing /> : `${whole(cell.actual)}${cell.lowerBound ? '+' : ''}`;
                            return <tr key={kind}>
                                <th scope="row" className="whitespace-nowrap border-b border-r border-border px-3 py-2 text-left">{kind === 'ytd' ? (data.throughMonth ? `Он эхнээс (1–${data.throughMonth} сар)` : 'Он эхнээс') : 'Жилийн төлөвлөгөөнөөс'}</th>
                                <td className="num border-b border-border px-3 py-2 text-right">{plan(count) === null ? <Missing /> : whole(plan(count)!)}</td>
                                <td className="num border-b border-border px-3 py-2 text-right">{actual(count)}</td>
                                <td className="num border-b border-r border-border px-3 py-2 text-right"><Pct pct={pct(count)} lowerBound={!!count?.lowerBound} /></td>
                                <td className="num border-b border-border px-3 py-2 text-right">{plan(amount) === null ? <Missing /> : whole(plan(amount)!)}</td>
                                <td className="num border-b border-border px-3 py-2 text-right">{actual(amount)}</td>
                                <td className="num border-b border-r border-border px-3 py-2 text-right"><Pct pct={pct(amount)} lowerBound={!!amount?.lowerBound} /></td>
                                <td className="border-b border-l-2 border-border px-3 py-2" />
                            </tr>;
                        })}
                        {segment === 'total' && outside.count > 0 && <tr className="font-normal">
                            <th scope="row" className="whitespace-nowrap border-r border-border px-3 py-2 text-left font-medium">Төлөвлөгөөгүй</th>
                            <td colSpan={7} className="px-3 py-2 text-muted-foreground">
                                {[...outsideTypes].map(([label, entry]) => `${label} — ${entry.count} гэрээ · ${whole(entry.amount)}`).join(' · ')}
                                <span className="block text-xs">Агуулах, Үйлчилгээ, төлөвлөгөөнд ороогүй блок «Нийт»-д орохгүй.</span>
                            </td>
                        </tr>}
                    </tfoot>
                </table>
            </div>
            <div className="space-y-1 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
                <p>{LOWER_BOUND_NOTE} Гараар оруулсан гүйцэтгэл одгүй, «+»-гүй; системийн дүнтэй нэмж нийлбэрлэхгүй.</p>
                {otherResidential > 0 && segment === 'total' && <p>Блокоор задлаагүй төлөвлөгөөтэй сард бусад блокийн орон сууцны {otherResidential} гэрээ «Нийт»-д орсон.</p>}
                {data.cancelled.count > 0 && <p>{PLAN_CANCELLED_NOTE} Энэ онд цуцлагдсан: {data.cancelled.count} гэрээ · {whole(data.cancelled.amount)}
                    {' '}({data.months.filter(row => row.cancelled.count > 0).map(row => `${row.month}-р сар ${row.cancelled.count} · ${whole(row.cancelled.amount)}`).join('; ')}).</p>}
                {data.transferred > 0 && <p>«Тоот шилжсэн» {data.transferred} гэрээ гүйцэтгэлд орсон — байр сольсон бол шинэ гэрээтэйгээ давхар тоологдож болно.</p>}
            </div>
        </section>

        {cashVisible ? <CashTable data={data} segment={segment} segmentLabel={segmentLabel} />
            : <p className="text-sm text-muted-foreground">Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.</p>}
    </>;
}

function CashTable({ data, segment, segmentLabel }: { data: PlanResponse; segment: Segment; segmentLabel: string }) {
    const cash = data.cash!;
    const ytd = yearCellOf(data, segment, 'cashflow');
    return <section className="overflow-hidden rounded-md border border-border bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5">
            <h2 className="text-sm font-semibold" title={CASH_TOOLTIP}>Мөнгөн урсгал · {segmentLabel}</h2>
            <p className="text-xs text-muted-foreground">Дүн ₮-өөр · бэлэн, банк, ипотек; бартер орохгүй</p>
        </header>
        {cash.availability === 'none' && <div className="border-b border-border p-3"><Alert variant="info">
            <AlertTitle>Орсон мөнгө бүртгэгдээгүй</AlertTitle>
            <AlertDescription>HUB файлд төлсөн дүн байхгүй тул автоматаар тооцохгүй. Сарын дүнг «Төлөвлөгөө ба баг» хуудсанд оруулах, эсвэл файлдаа «Нийт төлсөн дүн» багана нэмбэл хоёр дахь файлаас эхлэн зөрүүгээр тооцно.</AlertDescription>
        </Alert></div>}
        {cash.availability === 'no_ledger' && <div className="border-b border-border p-3"><Alert variant="info">
            <AlertTitle>Системд төлбөр бүртгэгдээгүй (Бүртгэл алга)</AlertTitle>
            <AlertDescription>Гэрээний төлсөн дүн мэдэгдэж байгаа ч сар бүр орсон төлбөр системд бүртгэгдээгүй тул сарын орсон мөнгийг 0 гэж тооцохгүй. Сарын дүнг «Төлөвлөгөө ба баг» хуудсанд гараар оруулна уу.</AlertDescription>
        </Alert></div>}
        {cash.availability !== 'no_ledger' && cash.availability !== 'none' && cash.ledgerSince && cash.ledgerSince.slice(0, 4) === String(data.year) && cash.ledgerSince.slice(5, 7) !== '01'
            && <p className="border-b border-border px-3.5 py-2.5 text-xs text-muted-foreground">Төлбөрийн бүртгэл <span className="num">{cash.ledgerSince}</span>-аас эхэлсэн — өмнөх сарын орсон мөнгө «—».</p>}
        {cash.availability === 'partial' && <p className="border-b border-border px-3.5 py-2.5 text-xs text-status-pending">{cash.unknownPaid} гэрээний төлсөн дүн тодорхойгүй тул бүртгэсэн төлбөр доод хязгаар («+»).</p>}
        <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                <caption className="sr-only">{data.year} оны {segmentLabel} орсон мөнгөний төлөвлөгөө, гүйцэтгэл, биелэлт</caption>
                <thead className="bg-surface-2 text-xs text-muted-foreground"><tr>
                    <th scope="col" className="border-b border-r border-border px-3 py-2 text-left font-medium">Сар</th>
                    <th scope="col" className="border-b border-border px-3 py-2 text-right font-medium text-gold">Төлөвлөгөө</th>
                    <th scope="col" title={CASH_TOOLTIP} className="border-b border-border px-3 py-2 text-right font-medium">Орсон мөнгө</th>
                    <th scope="col" className="border-b border-border px-3 py-2 text-right font-medium">Биелэлт</th>
                </tr></thead>
                <tbody>{data.months.map(row => {
                    const cell = scopeCells(row, segment).metrics.cashflow;
                    return <tr key={row.month} className={cn(row.status === 'future' && 'text-muted-foreground')}>
                        <th scope="row" className="whitespace-nowrap border-b border-r border-border px-3 py-2 text-left font-medium">{row.month}-р сар</th>
                        <td className="num border-b border-border px-3 py-2 text-right">{cell?.plan === null || cell?.plan === undefined ? <Missing /> : whole(cell.plan)}</td>
                        <td className="num border-b border-border px-3 py-2 text-right"><Actual cell={cell} /></td>
                        <td className="num border-b border-border px-3 py-2 text-right"><Pct pct={cell?.pct ?? null} lowerBound={!!cell?.lowerBound} /></td>
                    </tr>;
                })}</tbody>
                <tfoot className="bg-surface-2 font-medium"><tr>
                    <th scope="row" className="whitespace-nowrap border-r border-border px-3 py-2 text-left">{data.throughMonth ? `Он эхнээс (1–${data.throughMonth} сар)` : 'Он эхнээс'}</th>
                    <td className="num px-3 py-2 text-right">{ytd?.plan === null || ytd?.plan === undefined ? <Missing /> : whole(ytd.plan)}</td>
                    <td className="num px-3 py-2 text-right">{ytd?.actual === null || ytd?.actual === undefined ? <Missing /> : `${whole(ytd.actual)}${ytd.lowerBound ? '+' : ''}`}</td>
                    <td className="num px-3 py-2 text-right"><Pct pct={ytd?.pct ?? null} lowerBound={!!ytd?.lowerBound} /></td>
                </tr></tfoot>
            </table>
        </div>
        <p className="border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">Гэрээний нөхцлөөр төлөх урьдчилгаа, төлбөр хоцролтыг орсон мөнгө гэж тооцохгүй. Гараар оруулсан дүн байвал түүнийг, эс бөгөөс системд бүртгэсэн төлбөрийг харуулна — хоёрыг нэмэхгүй.</p>
    </section>;
}

export default function PlanPerformancePage() {
    return <PlanContent />;
}
