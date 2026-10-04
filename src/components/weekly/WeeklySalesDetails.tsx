'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import type { WeeklySalesReport } from '@/lib/dashboard/weekly-sales';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { FloorMap, FloorMapLegend } from './FloorMap';

export type WeeklySalesResponse = WeeklySalesReport & { meetingDate: string; projectName: string };

const area = (value: number | null) => value === null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const money = (value: number | null) => value === null ? '—' : formatMNT(value);

export function useWeeklySales(meetingDate: string, enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<WeeklySalesResponse>({
        queryKey: ['weekly-sales', shop?.id, user?.id, meetingDate],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/weekly-sales?meetingDate=${meetingDate}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && enabled, staleTime: 60_000, retry: 1,
    });
}

/** Лхагвагийн тайлангийн борлуулалтын дэлгэрэнгүй: гэрээ, сарын явц, менежер, авлага, үлдэгдэл, давхрын зураглал. */
export function WeeklySalesDetails({ query, canOpenErp }: { query: ReturnType<typeof useWeeklySales>; canOpenErp: boolean }) {
    const report = query.data;
    const [block, setBlock] = useState<string | null>(null);
    if (query.isPending) return <Skeleton className="h-64" />;
    if (!report) return <p className="rounded-xl bg-surface-2 p-5 text-sm text-muted-foreground">Долоо хоногийн борлуулалтын дэлгэрэнгүйг ачаалж чадсангүй. {query.error?.message}</p>;
    const maps = report.inventory?.floorMaps ?? [];
    const activeMap = maps.find(map => map.block === block) ?? maps[0];

    return (
        <div className="space-y-6">
            <SourceLine report={report} canOpenErp={canOpenErp} />

            <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border p-5 lg:grid-cols-4">
                <Figure label="Энэ 7 хоногийн гэрээ" value={`${report.week.count}`} helper={`${formatMNTShort(report.week.total)} · өмнөх ${report.previousWeek.count} (${formatMNTShort(report.previousWeek.total)})`} />
                <Figure label={`${Number(report.month.month.slice(5))}-р сарын гэрээ`} value={`${report.month.count}`}
                    helper={report.month.target ? `${formatMNTShort(report.month.total)} / төлөвлөгөө ${formatMNTShort(report.month.target)} · ${report.month.attainmentPct}%` : `${formatMNTShort(report.month.total)} · сарын төлөвлөгөө тохируулаагүй`} />
                <Figure label="Мөнгөн орлого (ERP)" value={report.cash ? formatMNTShort(report.cash.delta) : '—'} helper={report.cash ? `${report.cash.from} → ${report.cash.to}` : 'Хоёр долоо хоногийн ERP экспорт хэрэгтэй'} />
                <Figure label="Төлбөрийн хоцролт" value={report.receivables ? formatMNTShort(report.receivables.overdue) : '—'}
                    helper={report.receivables ? `${report.receivables.overdueContracts} гэрээ · үлдэгдэл ${formatMNTShort(report.receivables.balance)}` : 'ERP гэрээний экспорт хэрэгтэй'} />
            </div>
            {report.cash && <p className="text-xs leading-relaxed text-muted-foreground">{report.cash.basis}{report.cash.unknown ? ` Төлсөн дүн хоосон ${report.cash.unknown} мөр тооцоонд ороогүй.` : ''}</p>}

            <section className="break-inside-avoid space-y-2">
                <h3 className="text-sm font-medium">Энэ долоо хоногийн гэрээ</h3>
                {report.week.lines.length ? <Table label="Энэ долоо хоногийн гэрээ" head={['Огноо', 'Бүтээгдэхүүн', 'Блок', 'Тоот', 'Захиалагч', 'м²', 'Нийт үнэ', 'Урьдчилгаа', 'Төлсөн', 'Менежер', 'Суваг']}>
                    {report.week.lines.map(line => <tr key={line.key} className="border-t border-border">
                        <td className="num whitespace-nowrap px-2 py-2">{line.date?.slice(5) ?? '—'}</td>
                        <td className="px-2">{line.kindLabel}</td>
                        <td className="px-2">{line.block ?? '—'}</td>
                        <td className="whitespace-nowrap px-2">{line.unit ?? '—'}</td>
                        <td className="max-w-[160px] truncate px-2">{line.customer ?? '—'}</td>
                        <td className="num px-2 text-right">{area(line.area)}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{money(line.total)}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{line.advance !== null ? money(line.advance) : '—'}{line.advanceCondition && <span className="block text-[11px] text-muted-foreground">{line.advanceCondition}</span>}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{money(line.paid)}</td>
                        <td className="whitespace-nowrap px-2" title={line.manager ?? undefined}>{line.manager?.split('.')[0] ?? '—'}</td>
                        <td className="px-2">{line.channel ?? '—'}</td>
                    </tr>)}
                </Table> : <Empty>Тайлант долоо хоногт гэрээ бүртгэгдээгүй.</Empty>}
                {report.week.byKind.length > 0 && <p className="text-xs text-muted-foreground">{report.week.byKind.map(kind => `${kind.label} ${kind.count} · ${formatMNTShort(kind.total)}`).join(' · ')}{report.week.barter ? ` · бартер ${report.week.barter}` : ''}</p>}
            </section>

            <section className="break-inside-avoid space-y-2">
                <h3 className="text-sm font-medium">Сарын гэрээ долоо хоногоор</h3>
                {report.month.byWeek.length ? <Table label="Сарын гэрээ долоо хоногоор" head={['Бүтээгдэхүүн', ...report.month.weeks.map(week => `${week.label} (${week.from.slice(5)}–${week.to.slice(5)})`), 'Сарын нийт', 'Дүн']}>
                    {report.month.byWeek.map(row => <tr key={row.kind} className="border-t border-border">
                        <th scope="row" className="px-2 py-2 text-left font-medium">{row.label}</th>
                        {row.weeks.map((count, index) => <td key={index} className="num px-2 text-right">{count || '—'}</td>)}
                        <td className="num px-2 text-right font-medium">{row.count}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{formatMNTShort(row.total)}</td>
                    </tr>)}
                </Table> : <Empty>Энэ сард гэрээ бүртгэгдээгүй.</Empty>}
                {report.month.missingTotals > 0 && <p className="text-xs text-muted-foreground">Нийт дүн хоосон {report.month.missingTotals} гэрээ дүнд ороогүй.</p>}
            </section>

            {report.byManager.length > 0 && <section className="break-inside-avoid space-y-2">
                <h3 className="text-sm font-medium">Менежерээр</h3>
                <Table label="Менежерээр" head={['Менежер', '7 хоног', '7 хоногийн дүн', 'Сар', 'Сарын дүн', 'Мөнгөн орлого']}>
                    {report.byManager.map(row => <tr key={row.manager} className="border-t border-border">
                        <th scope="row" className="px-2 py-2 text-left font-medium">{row.manager}</th>
                        <td className="num px-2 text-right">{row.weekCount}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{formatMNTShort(row.weekTotal)}</td>
                        <td className="num px-2 text-right">{row.monthCount}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{formatMNTShort(row.monthTotal)}</td>
                        <td className="num whitespace-nowrap px-2 text-right">{row.cash === null ? '—' : formatMNTShort(row.cash)}</td>
                    </tr>)}
                </Table>
            </section>}

            {report.inventory && <section className="break-inside-avoid space-y-2">
                <h3 className="text-sm font-medium">Үлдэгдэл блокоор</h3>
                <Table label="Үлдэгдэл блокоор" head={['Блок', 'Төрөл', 'Нийт', 'Худалдаанд', 'Захиалсан', 'Хадгалсан', 'Зарагдсан', 'Хүлээлгэсэн', 'Бартер']}>
                    {report.inventory.blocks.map(row => <tr key={`${row.block}-${row.kind}`} className="border-t border-border">
                        <th scope="row" className="px-2 py-2 text-left font-medium">{row.block}</th>
                        <td className="px-2">{row.label}</td>
                        <td className="num px-2 text-right">{row.total}</td>
                        {(['available', 'ordered', 'reserved', 'sold', 'handed_over'] as const).map(status => <td key={status} className={cn('num px-2 text-right', status === 'available' && 'font-medium text-foreground')}>{row.statuses[status] ?? 0}</td>)}
                        <td className="num px-2 text-right">{row.barter}</td>
                    </tr>)}
                </Table>
            </section>}

            {activeMap && <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">Давхрын зураглал — {activeMap.block} блок</h3>
                    {maps.length > 1 && <div role="tablist" aria-label="Блок сонгох" className="flex gap-1 print:hidden">
                        {maps.map(map => <button key={map.block} type="button" role="tab" aria-selected={map.block === activeMap.block} onClick={() => setBlock(map.block)}
                            className={cn('min-h-9 rounded-md px-3 text-xs focus-ring', map.block === activeMap.block ? 'bg-foreground text-background' : 'bg-surface-2 text-fg-2 hover:text-foreground')}>{map.block}</button>)}
                    </div>}
                </div>
                <FloorMapLegend />
                <FloorMap map={activeMap} statusLabels={report.inventory!.statusLabels} />
            </section>}

            {report.notes.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{report.notes.map(note => <li key={note}>• {note}</li>)}</ul>}
        </div>
    );
}

function SourceLine({ report, canOpenErp }: { report: WeeklySalesResponse; canOpenErp: boolean }) {
    const contracts = report.sources.contracts === 'erp' && report.sources.sales
        ? `ERP «${report.sources.sales.source}» ${report.sources.sales.date}${report.sources.previousSales ? ` (өмнөх ${report.sources.previousSales.date})` : ''}`
        : report.sources.contracts === 'crm' ? 'CRM-ийн гэрээ' : 'алга';
    const inventory = report.inventory ? `${report.inventory.source.kind === 'erp' ? `ERP «${report.inventory.source.source}»` : report.inventory.source.source} ${report.inventory.source.date}` : 'алга';
    return <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Гэрээ: {contracts}</span><span>Үлдэгдэл: {inventory}</span>
        {canOpenErp && <Link href="/dashboard/reports/erp" className="inline-flex items-center gap-1 text-brand hover:underline focus-ring print:hidden">ERP экспорт оруулах<ArrowUpRight className="size-3" /></Link>}
    </p>;
}

function Figure({ label, value, helper }: { label: string; value: string; helper?: string }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className="num mt-2 text-[24px] font-semibold tracking-tight">{value}</p>{helper && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</p>}</div>;
}

function Table({ label, head, children }: { label: string; head: string[]; children: React.ReactNode }) {
    return <div className="max-w-full overflow-x-auto rounded-xl border border-border focus-ring print:overflow-visible" tabIndex={0} role="region" aria-label={label}>
        <table className="w-full text-left text-[12.5px]">
            <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>{head.map(cell => <th key={cell} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">{cell}</th>)}</tr></thead>
            <tbody>{children}</tbody>
        </table>
    </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">{children}</p>;
}
