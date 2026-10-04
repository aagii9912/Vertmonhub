'use client';

import {
    channelMetric, channelMetrics, formatChannelValue, isMetaResultMetric, peakMissedHours, periodDays,
    type BreakdownRow, type ChannelSource, type ChannelSplitWeek, type ChannelTotals, type ChannelWarning, type MetricDelta,
} from '@/lib/marketing/channel-reports';
import {
    META_RESULT_DEFS, META_RESULT_TYPES, metaResultCostKey, metaResultKey, metaResultSpendKey, presentMetaResultTypes, type MetaResultType,
} from '@/lib/marketing/meta-results';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';

const currencyOf = (totals: ChannelTotals) => typeof totals.currency === 'string' ? totals.currency : null;
const isResultType = (tag: string | undefined): tag is MetaResultType => !!tag && (META_RESULT_TYPES as readonly string[]).includes(tag);

/** Үзүүлэлтийн утгыг төрлөөр нь (тоо, хувь, hh:mm:ss, валюттай мөнгө) форматлана. */
export function formatMetric(source: ChannelSource, key: string, value: unknown, totals: ChannelTotals): string {
    const def = channelMetric(source, key);
    return typeof value === 'number' && def ? formatChannelValue(value, def.kind, currencyOf(totals)) : '—';
}

/** «6/7 өдөр» — өгөгдөл хамарсан өдөр / тайлангийн өдөр. */
export function coverageText(period: { from: string; to: string }, data: { from: string; to: string } | null | undefined): string | null {
    if (!data) return null;
    return `${periodDays(data)}/${periodDays(period)} өдөр`;
}

function DeltaText({ delta }: { delta?: MetricDelta }) {
    if (!delta || delta.previous === null) return <span className="text-muted-foreground">Өмнөх тайлан алга</span>;
    if (!delta.comparable) return <span className="text-muted-foreground">{delta.reason === 'coverage' ? 'Өдрийн хамралт дутуу тул харьцуулаагүй' : 'Валют өөр тул харьцуулаагүй'}</span>;
    if (delta.pct === null) return <span className="text-muted-foreground">Өмнөх суурь 0 · хувь тооцоогүй</span>;
    // Өсөлт сайн эсэх нь үзүүлэлтээс хамаарна (алдсан дуудлага буурах нь сайн) тул өнгөөр үнэлэхгүй.
    return <span className="text-fg-2">{delta.pct > 0 ? '+' : ''}{delta.pct}% өмнөхөөс</span>;
}

/**
 * Нийт дүнгийн хавтан. Тооцоогүй (холбоогүй эсвэл тооцох боломжгүй) үзүүлэлтийг 0 биш
 * «Тооцоогүй» гэж харуулна. `keys` өгвөл зөвхөн тэдгээрийг. Meta-гийн үр дүнг төрлөөр нь
 * `MetaResultsByType` тусад нь харуулна.
 */
export function ChannelTotalsGrid({ source, totals, missing = [], comparison, keys }: {
    source: ChannelSource;
    totals: ChannelTotals;
    missing?: string[];
    comparison?: Record<string, MetricDelta> | null;
    keys?: string[];
}) {
    const metrics = channelMetrics(source).filter(m => keys ? keys.includes(m.key)
        : (source !== 'meta_ads' || !isMetaResultMetric(m.key)) && (typeof totals[m.key] === 'number' || missing.includes(m.key)));
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

/** Нэг үр дүнгийн өртөг: reach бол «/1000 хүн». */
function costText(type: MetaResultType, value: unknown, currency: string | null): string {
    if (typeof value !== 'number') return '—';
    return `${formatChannelValue(value, 'money', currency)}${META_RESULT_DEFS[type].costScale === 1000 ? ' / 1000 хүн' : ''}`;
}

/**
 * Meta-гийн үр дүн төрөл бүрээр: тоо, кампанит ажлын зорилгоор хуваарилсан зардал, нэг үр дүнгийн
 * өртөг. Хүрсэн хүн (reach)-ийг өдрөөр нэмдэггүй тул тоо нь «—» байж болно (зардлыг харуулна).
 */
export function MetaResultsByType({ totals, comparison }: { totals: ChannelTotals; comparison?: Record<string, MetricDelta> | null }) {
    const types = presentMetaResultTypes(totals);
    if (!types.length) {
        if (typeof totals.results !== 'number') return null;
        // Төрөлгүй (Result indicator сонгоогүй) хуучин тайлан.
        return <p className="text-sm"><span className="text-muted-foreground">Results (үр дүн, төрөл тодорхойгүй):</span> <span className="num font-semibold">{formatChannelValue(totals.results, 'count')}</span>
            {typeof totals.cost_per_result === 'number' && <span className="text-muted-foreground"> · нэг үр дүн {formatChannelValue(totals.cost_per_result, 'money', currencyOf(totals))}</span>}</p>;
    }
    return <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Үр дүн төрлөөр">
        <table className="w-full min-w-[420px] text-left text-xs">
            <caption className="px-3 pt-2 text-left text-xs font-semibold text-foreground">Үр дүн төрлөөр <span className="font-normal text-muted-foreground">· зардлыг кампанит ажлын зорилгоор хуваарилсан</span></caption>
            <thead className="text-muted-foreground"><tr>
                {['Үр дүн', 'Тоо', 'Зардал', 'Нэг үр дүнгийн өртөг'].map((label, i) => <th key={label} scope="col" className={`px-3 py-2 font-medium ${i ? 'text-right' : ''}`}>{label}</th>)}
            </tr></thead>
            <tbody>{types.map(type => {
                const def = META_RESULT_DEFS[type];
                const results = totals[metaResultKey(type)];
                return <tr key={type} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 font-medium">{def.label}</th>
                    <td className="num px-3 py-2 text-right">
                        {typeof results === 'number' ? formatChannelValue(results, 'count') : <span className="text-muted-foreground" title="Хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй">—</span>}
                        {comparison && typeof results === 'number' && <span className="block text-[11px]"><DeltaText delta={comparison[metaResultKey(type)]} /></span>}
                    </td>
                    <td className="num px-3 py-2 text-right">{formatMetric('meta_ads', metaResultSpendKey(type), totals[metaResultSpendKey(type)], totals)}</td>
                    <td className="num px-3 py-2 text-right" title={def.costLabel}>{costText(type, totals[metaResultCostKey(type)], currencyOf(totals))}</td>
                </tr>;
            })}</tbody>
        </table>
    </div>;
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

/** Meta-гийн кампанит ажлын задаргааны багана: үр дүнгийн хажууд төрлийг нь заана. */
const META_BREAKDOWN_KEYS = ['spend', 'impressions', 'link_clicks', 'reach', 'results', 'cost_per_result'] as const;

/** Campaign / өдөр / бүлгийн задаргааны эхний мөрүүд. */
export function ChannelBreakdownTable({ source, rows, totals, limit = 20 }: { source: ChannelSource; rows: BreakdownRow[]; totals: ChannelTotals; limit?: number }) {
    const list = rows.filter(r => r.kind !== 'hour');
    if (!list.length) return null;
    const meta = source === 'meta_ads';
    const keys = meta
        ? META_BREAKDOWN_KEYS.filter(key => list.some(r => typeof r.values[key] === 'number'))
        : channelMetrics(source).map(m => m.key).filter(key => list.some(r => typeof r.values[key] === 'number')).slice(0, 6);
    const typed = meta && list.some(r => isResultType(r.tag));
    const title = { campaign: 'Кампанит ажил', day: 'Өдөр', group: 'Бүлэг', hour: 'Цаг' }[list[0].kind];
    const header = (key: string) => meta && key === 'results' ? 'Үр дүн' : meta && key === 'cost_per_result' ? 'Нэг үр дүнгийн өртөг' : channelMetric(source, key)?.label;
    const cell = (row: BreakdownRow, key: string) => {
        const value = row.values[key];
        if (meta && isResultType(row.tag) && key === 'cost_per_result') return costText(row.tag, value, currencyOf(totals));
        if (meta && key === 'results') return typeof value === 'number' ? formatChannelValue(value, 'count') : '—';
        return formatMetric(source, key, value, totals);
    };
    return <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label={`Задаргаа: ${title}`}>
        <table className="w-full text-left text-xs" style={{ minWidth: 160 + (keys.length + (typed ? 1 : 0)) * 110 }}>
            <thead className="bg-surface-2 text-muted-foreground"><tr>
                <th scope="col" className="px-3 py-2 font-medium">{title}</th>
                {keys.map(key => <th key={key} scope="col" className="px-3 py-2 text-right font-medium">{header(key)}</th>)}
                {typed && <th scope="col" className="px-3 py-2 font-medium">Үр дүнгийн төрөл</th>}
            </tr></thead>
            <tbody>{list.slice(0, limit).map((row, index) => <tr key={`${row.kind}:${row.label}:${row.tag ?? ''}:${index}`} className="border-t border-border">
                <th scope="row" className="max-w-64 break-words px-3 py-2 font-medium">{row.label}</th>
                {keys.map(key => <td key={key} className="num px-3 py-2 text-right">{cell(row, key)}</td>)}
                {typed && <td className="px-3 py-2 text-muted-foreground">{isResultType(row.tag) ? META_RESULT_DEFS[row.tag].label : 'Тодорхойгүй'}</td>}
            </tr>)}</tbody>
        </table>
        {list.length > limit && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Эхний {limit} мөр харагдаж байна (нийт {list.length}).</p>}
    </div>;
}

/**
 * Хурлын долоо хоногоор хуваах урьдчилсан харагдац: долоо хоног бүрийн зардал, Meta-гийн дуудлага,
 * өдрийн хамралт, хадгалсан тайлантай эсэх. Файлд дуудлагын кампанит ажил байвал тухайн долоо хоногт
 * хүргэлтгүй бол 0 (файлыг бүхэлд нь уншсан тул).
 */
export function ChannelSplitWeeks({ weeks, currency, showCalls }: { weeks: ChannelSplitWeek[]; currency: string | null; showCalls: boolean }) {
    return <div className="max-w-full overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Хурлын долоо хоногууд">
        <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface-2 text-muted-foreground"><tr>
                {['Долоо хоног (Лхагва–Мягмар)', 'Зардал', ...(showCalls ? ['Дуудлага (Meta)', 'Нэг дуудлагын өртөг'] : []), 'Өдөр', 'Хадгалсан'].map((label, i) => <th key={label} scope="col" className={`px-3 py-2 font-medium ${i && i < (showCalls ? 4 : 2) ? 'text-right' : ''}`}>{label}</th>)}
            </tr></thead>
            <tbody>{weeks.map(week => {
                const coverage = coverageText(week, week.dataPeriod);
                const partial = !!week.dataPeriod && periodDays(week.dataPeriod) < periodDays(week);
                const calls = week.totals[metaResultKey('calls')];
                return <tr key={week.from} className="border-t border-border">
                    <th scope="row" className="num whitespace-nowrap px-3 py-2 font-medium">{week.from} – {week.to}</th>
                    <td className="num px-3 py-2 text-right">{typeof week.totals.spend === 'number' ? formatChannelValue(week.totals.spend, 'money', currency) : '—'}</td>
                    {showCalls && <td className="num px-3 py-2 text-right">{typeof calls === 'number' ? formatChannelValue(calls, 'count') : '0'}</td>}
                    {showCalls && <td className="num px-3 py-2 text-right">{costText('calls', week.totals[metaResultCostKey('calls')], currency)}</td>}
                    <td className="whitespace-nowrap px-3 py-2">{coverage ? <span className={partial ? 'text-status-pending' : undefined} title={week.missingDays.length ? `Өгөгдөлгүй: ${week.missingDays.join(', ')}` : undefined}>{coverage}</span> : '—'}</td>
                    <td className="px-3 py-2">{!week.existing ? <span className="text-muted-foreground">Шинэ</span>
                        : week.existing.origin === 'api' ? <Badge variant="danger">Meta API — солихгүй</Badge>
                        : week.existing.sameFile ? <Badge variant="neutral">Ижил файл</Badge>
                        : <Badge variant="warning">Солигдоно</Badge>}</td>
                </tr>;
            })}</tbody>
        </table>
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
