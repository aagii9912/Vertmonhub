'use client';

import { cn } from '@/lib/utils';
import type { WeeklySalesReport } from '@/lib/dashboard/weekly-sales';

type FloorMapData = NonNullable<WeeklySalesReport['inventory']>['floorMaps'][number];
type Cell = FloorMapData['floors'][number]['cells'][string][number];

const shortName = (name: string | null) => name?.split('.')[0]?.trim() || null;
const tone = (cell: Cell) => cell.barter && cell.status !== 'available' ? 'bg-status-neutral-soft text-fg-2'
    : cell.status === 'sold' || cell.status === 'handed_over' ? 'bg-status-success-soft text-foreground'
        : cell.status === 'available' ? 'bg-surface text-fg-2'
            : 'bg-status-pending-soft text-foreground';

/** Давхрын зураглал: давхар × загвар, зарагдсан байранд менежерийн нэр (Лхагвагийн тайлангийн загвар). */
export function FloorMap({ map, statusLabels }: { map: FloorMapData; statusLabels: Record<string, string> }) {
    return (
        <div className="max-w-full overflow-x-auto rounded-xl border border-border focus-ring print:overflow-visible" tabIndex={0} role="region" aria-label={`${map.block} блокийн давхрын зураглал`}>
            <table className="w-full min-w-[720px] border-collapse text-center text-[11.5px]">
                <caption className="sr-only">{map.block} блокийн орон сууцны давхрын зураглал</caption>
                <thead className="bg-surface-2 text-[11px] text-muted-foreground">
                    <tr>
                        <th scope="col" className="px-2 py-2 text-left font-medium">Давхар</th>
                        {map.models.map(model => <th key={model} scope="col" className="px-2 py-2 font-medium">{model}</th>)}
                        <th scope="col" className="border-l border-border px-2 py-2 font-medium">Гэрээтэй</th>
                        <th scope="col" className="px-2 py-2 font-medium">Худалдаанд</th>
                        <th scope="col" className="px-2 py-2 font-medium">Бусад</th>
                        <th scope="col" className="px-2 py-2 font-medium">Бартер</th>
                    </tr>
                </thead>
                <tbody>
                    {map.floors.map(row => (
                        <tr key={row.floor} className="border-t border-border">
                            <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-fg-2">{row.floor} давхар</th>
                            {map.models.map(model => {
                                const cells = row.cells[model] ?? [];
                                return <td key={model} className="p-0.5 align-middle">
                                    {cells.map(cell => (
                                        <div key={cell.code} title={`${cell.code} · ${cell.statusLabel || statusLabels[cell.status ?? 'unknown']}${cell.barter ? ' · бартер' : ''}`}
                                            className={cn('rounded px-1 py-1 leading-tight', tone(cell))}>
                                            <span className="num font-medium">{cell.area !== null ? `${cell.area.toLocaleString('en-US', { maximumFractionDigits: 2 })} м²` : cell.code}</span>
                                            {shortName(cell.manager) && cell.status !== 'available' && <span className="block truncate text-[10.5px] text-fg-2">{shortName(cell.manager)}</span>}
                                        </div>
                                    ))}
                                </td>;
                            })}
                            <td className="num border-l border-border px-2">{row.counts.sold}</td>
                            <td className="num px-2">{row.counts.available}</td>
                            <td className="num px-2">{row.counts.other}</td>
                            <td className="num px-2">{row.counts.barter}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="border-t border-border-strong bg-surface-2 font-semibold">
                    <tr>
                        <th scope="row" className="px-2 py-2 text-left" colSpan={map.models.length + 1}>Нийт</th>
                        <td className="num border-l border-border px-2">{map.totals.sold}</td>
                        <td className="num px-2">{map.totals.available}</td>
                        <td className="num px-2">{map.totals.other}</td>
                        <td className="num px-2">{map.totals.barter}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export function FloorMapLegend() {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Тайлбар">
            <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-status-success-soft ring-1 ring-border" />Гэрээтэй (зарагдсан, хүлээлгэсэн)</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-surface ring-1 ring-border" />Худалдаанд</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-status-pending-soft ring-1 ring-border" />Бусад (захиалсан, хадгалсан)</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-status-neutral-soft ring-1 ring-border" />Бартер</li>
        </ul>
    );
}
