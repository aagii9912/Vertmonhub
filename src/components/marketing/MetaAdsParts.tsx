'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import {
    formatMetaMoney, formatMetaPending, formatMetaSpend, hasMetaSpend, MetaAdsRangeSchema, type MetaAdsRange, type MetaResultSummary, type MetaSpend,
} from '@/lib/marketing/meta-ads-report';
import { META_RESULT_DEFS } from '@/lib/marketing/meta-results';
import { marketingInputClass } from './PerformanceEditor';

const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const count = (value: number | null) => value === null ? 'Тооцоогүй' : new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 1 }).format(value);

/** Улаанбаатарын сар (0 = энэ сар, -1 = өмнөх сар). */
export function ubMonth(offset = 0): MetaAdsRange {
    const { year, month } = ubParts();
    const range = ubMonthRange(year, month - 1 + offset);
    return { from: ubDateStr(range.start), to: ubDateStr(new Date(range.end.getTime() - 1)) };
}
/** Өнөөдрийг оруулсан сүүлийн `days` өдөр (УБ). */
export function ubLastDays(days: number): MetaAdsRange {
    const today = ubDateStr();
    return { from: shiftDay(today, -(days - 1)), to: today };
}
export const isMetaAdsRange = (range: MetaAdsRange) => MetaAdsRangeSchema.safeParse(range).success;

export function MetaRangeFilter({ range, onChange }: { range: MetaAdsRange; onChange: (range: MetaAdsRange) => void }) {
    return <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface-2 p-4">
        <label className="grid gap-1 text-xs text-muted-foreground">Эхлэх өдөр
            <input aria-label="Эхлэх өдөр" className={marketingInputClass} type="date" value={range.from} onChange={e => onChange({ ...range, from: e.target.value })} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Дуусах өдөр
            <input aria-label="Дуусах өдөр" className={marketingInputClass} type="date" value={range.to} onChange={e => onChange({ ...range, to: e.target.value })} /></label>
        <Button variant="secondary" size="sm" onClick={() => onChange(ubMonth())}>Энэ сар</Button>
        <Button variant="secondary" size="sm" onClick={() => onChange(ubMonth(-1))}>Өмнөх сар</Button>
        <Button variant="secondary" size="sm" onClick={() => onChange(ubLastDays(30))}>Сүүлийн 30 хоног</Button>
        <Button variant="secondary" size="sm" onClick={() => onChange(ubLastDays(90))}>Сүүлийн 90 хоног</Button>
        {!isMetaAdsRange(range) && <p role="alert" className="w-full text-xs text-status-danger">Эхлэх, дуусах өдрөө зөв дарааллаар сонгоно уу. Хугацаа 367 хүртэл өдөр байна.</p>}
    </div>;
}

/**
 * Зардлын хавтан: утга = төгрөгт хөрвүүлсэн хэсэг, ханшгүй эх валютыг доор тусад нь (төгрөгт нэмэхгүй).
 * Бүх зардал ханшгүй бол утга нь эх валютаар.
 */
export function metaSpendTile(spend: MetaSpend, completeHelper: string): { value: string; helper: string } {
    if (!hasMetaSpend(spend)) return { value: '—', helper: 'Зардал бүртгэгдээгүй' };
    if (spend.complete) return { value: formatMNT(spend.mnt, { compact: true }), helper: completeHelper };
    const converted = Object.keys(spend.native).some(currency => spend.native[currency] > (spend.pending[currency] ?? 0));
    return converted
        ? { value: formatMNT(spend.mnt, { compact: true }), helper: `+ ${formatMetaPending(spend)} ханшгүй — төгрөгт ороогүй` }
        : { value: formatMetaPending(spend), helper: 'Ханшгүй — төгрөгт ороогүй' };
}

const costText = (result: MetaResultSummary) => result.cost
    ? `${formatMetaMoney(result.cost)}${META_RESULT_DEFS[result.type].costScale === 1000 ? ' / 1000 хүн' : ''}` : '—';

/** Meta-гийн үр дүн төрөл бүрээр: тоо, зорилгоор ногдсон зардал, нэг үр дүнгийн өртөг. Төрлүүдийг нэмэхгүй. */
export function MetaResultsTable({ results }: { results: MetaResultSummary[] }) {
    if (!results.length) return <p className="text-sm text-muted-foreground">Энэ хугацаанд төрлөөр тоологдсон Meta үр дүн алга.</p>;
    return <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Meta-гийн үр дүн төрлөөр">
        <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground"><tr>
                <th scope="col" className="px-3 py-2 font-medium">Үр дүн</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Тоо</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Ногдсон зардал</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Нэг үр дүнгийн өртөг</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{results.map(result => <tr key={result.type}>
                <td className="px-3 py-2 font-medium">{result.label}</td>
                <td className="num px-3 py-2 text-right">{count(result.results)}</td>
                <td className="num px-3 py-2 text-right">{formatMetaSpend(result.spend, { compact: true })}</td>
                <td className="num px-3 py-2 text-right" title={result.costLabel}>{costText(result)}</td>
            </tr>)}</tbody>
        </table>
    </div>;
}

/** Кампанит ажлын мөрөнд: «Дуудлага (Meta) 45 · 21,000₮». */
export function MetaResultList({ results }: { results: MetaResultSummary[] }) {
    if (!results.length) return <span className="text-muted-foreground">—</span>;
    return <ul className="space-y-0.5 text-xs">{results.map(result => <li key={result.type} className="whitespace-nowrap">
        <span className="text-muted-foreground">{result.label}:</span> <span className="num font-medium text-foreground">{count(result.results)}</span>
        {result.cost && <span className="text-muted-foreground"> · {costText(result)}</span>}
    </li>)}</ul>;
}

export function MetaReportNotes({ notes }: { notes: string[] }) {
    if (!notes.length) return null;
    return <Alert variant="warning"><ul className="list-disc space-y-1 pl-4">{notes.map(note => <li key={note}>{note}</li>)}</ul></Alert>;
}
