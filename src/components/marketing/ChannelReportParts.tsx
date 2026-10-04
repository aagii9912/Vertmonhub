'use client';

import {
    channelMetric, channelMetrics, formatChannelValue, peakMissedHours,
    type BreakdownRow, type ChannelSource, type ChannelTotals, type ChannelWarning, type MetricDelta,
} from '@/lib/marketing/channel-reports';
import { Alert } from '@/components/ui/Alert';

const currencyOf = (totals: ChannelTotals) => typeof totals.currency === 'string' ? totals.currency : null;

/** Үзүүлэлтийн утгыг төрлөөр нь (тоо, хувь, hh:mm:ss, валюттай мөнгө) форматлана. */
export function formatMetric(source: ChannelSource, key: string, value: unknown, totals: ChannelTotals): string {
    const def = channelMetric(source, key);
    return typeof value === 'number' && def ? formatChannelValue(value, def.kind, currencyOf(totals)) : '—';
}

function DeltaText({ delta }: { delta?: MetricDelta }) {
    if (!delta || delta.previous === null) return <span className="text-muted-foreground">Өмнөх тайлан алга</span>;
    if (!delta.comparable) return <span className="text-muted-foreground">Валют өөр тул харьцуулаагүй</span>;
    if (delta.pct === null) return <span className="text-muted-foreground">Өмнөх суурь 0 · хувь тооцоогүй</span>;
    // Өсөлт сайн эсэх нь үзүүлэлтээс хамаарна (алдсан дуудлага буурах нь сайн) тул өнгөөр үнэлэхгүй.
    return <span className="text-fg-2">{delta.pct > 0 ? '+' : ''}{delta.pct}% өмнөхөөс</span>;
}

/**
 * Нийт дүнгийн хавтан. Тооцоогүй (холбоогүй эсвэл тооцох боломжгүй) үзүүлэлтийг 0 биш
 * «Тооцоогүй» гэж харуулна. `keys` өгвөл зөвхөн тэдгээрийг.
 */
export function ChannelTotalsGrid({ source, totals, missing = [], comparison, keys }: {
    source: ChannelSource;
    totals: ChannelTotals;
    missing?: string[];
    comparison?: Record<string, MetricDelta> | null;
    keys?: string[];
}) {
    const metrics = channelMetrics(source).filter(m => keys ? keys.includes(m.key) : (typeof totals[m.key] === 'number' || missing.includes(m.key)));
    if (!metrics.length) return <p className="text-sm text-muted-foreground">Тооцсон үзүүлэлт алга.</p>;
    return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map(m => {
            const value = totals[m.key];
            return <div key={m.key} className="min-w-0 rounded-lg border border-border p-3">
                <dt className="break-words text-xs text-muted-foreground">{m.label}</dt>
                <dd className="mt-1">
                    {typeof value === 'number'
                        ? <span className="num text-base font-semibold">{formatMetric(source, m.key, value, totals)}</span>
                        : <span className="text-sm text-status-pending">Тооцоогүй</span>}
                    {comparison && typeof value === 'number' && <span className="mt-0.5 block text-xs"><DeltaText delta={comparison[m.key]} /></span>}
                </dd>
            </div>;
        })}
    </dl>;
}

/** Алдсан + тасалсан дуудлага цаг бүрээр (Улаанбаатарын цаг). */
export function MissedCallsByHour({ breakdown }: { breakdown: BreakdownRow[] }) {
    const hours = breakdown.filter(r => r.kind === 'hour');
    if (!hours.length) return null;
    const missed = hours.map(r => ({ label: r.label, missed: r.values.missed ?? 0, abandoned: r.values.abandoned ?? 0 }));
    const max = Math.max(1, ...missed.map(h => h.missed + h.abandoned));
    const peaks = peakMissedHours(breakdown);
    const summary = peaks.length ? `Оргил цаг: ${peaks.map(p => `${p.label} (${p.missed})`).join(', ')}` : 'Алдсан дуудлага бүртгэгдээгүй';
    return <figure className="min-w-0">
        <figcaption className="mb-2 text-xs text-muted-foreground">Алдсан ба тасалсан дуудлага цагаар (УБ). {summary}.</figcaption>
        <div className="flex h-28 items-end gap-0.5" role="img" aria-label={`Алдсан дуудлага цагаар. ${summary}`}>
            {missed.map(h => <div key={h.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${h.label}: алдсан ${h.missed}, тасалсан ${h.abandoned}`}>
                <div className="rounded-t-sm bg-status-pending" style={{ height: `${h.abandoned / max * 100}%` }} />
                <div className="bg-status-danger" style={{ height: `${h.missed / max * 100}%` }} />
            </div>)}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground" aria-hidden="true">{['00', '06', '12', '18', '23'].map(h => <span key={h}>{h}</span>)}</div>
        <div className="mt-1 flex gap-3 text-xs"><span className="text-status-danger">■ Алдсан</span><span className="text-status-pending">■ Тасалсан</span></div>
    </figure>;
}

/** Campaign / өдөр / бүлгийн задаргааны эхний мөрүүд. */
export function ChannelBreakdownTable({ source, rows, totals, limit = 20 }: { source: ChannelSource; rows: BreakdownRow[]; totals: ChannelTotals; limit?: number }) {
    const list = rows.filter(r => r.kind !== 'hour');
    if (!list.length) return null;
    const keys = channelMetrics(source).map(m => m.key).filter(key => list.some(r => typeof r.values[key] === 'number')).slice(0, 6);
    const title = { campaign: 'Кампанит ажил', day: 'Өдөр', group: 'Бүлэг', hour: 'Цаг' }[list[0].kind];
    return <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={`Задаргаа: ${title}`}>
        <table className="w-full text-left text-xs" style={{ minWidth: 160 + keys.length * 110 }}>
            <thead className="bg-surface-2 text-muted-foreground"><tr>
                <th scope="col" className="px-3 py-2 font-medium">{title}</th>
                {keys.map(key => <th key={key} scope="col" className="px-3 py-2 text-right font-medium">{channelMetric(source, key)?.label}</th>)}
            </tr></thead>
            <tbody>{list.slice(0, limit).map(row => <tr key={`${row.kind}:${row.label}`} className="border-t border-border">
                <th scope="row" className="max-w-64 break-words px-3 py-2 font-medium">{row.label}</th>
                {keys.map(key => <td key={key} className="num px-3 py-2 text-right">{formatMetric(source, key, row.values[key], totals)}</td>)}
            </tr>)}</tbody>
        </table>
        {list.length > limit && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Эхний {limit} мөр харагдаж байна (нийт {list.length}).</p>}
    </div>;
}

export function ChannelWarnings({ warnings }: { warnings: ChannelWarning[] }) {
    const important = warnings.filter(w => w.level === 'warning');
    const info = warnings.filter(w => w.level === 'info');
    if (!warnings.length) return null;
    return <div className="space-y-2">
        {!!important.length && <Alert variant="warning"><div className="min-w-0"><p className="font-medium">Анхааруулга ({important.length})</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">{important.map((w, i) => <li key={`${w.code}-${i}`}>{w.message}</li>)}</ul></div></Alert>}
        {!!info.length && <ul className="space-y-1 text-xs text-muted-foreground">{info.map((w, i) => <li key={`${w.code}-${i}`}>{w.message}</li>)}</ul>}
    </div>;
}
