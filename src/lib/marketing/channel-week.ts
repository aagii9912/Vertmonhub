/**
 * Хурлын долоо хоногийн сувгийн тайланг (Meta зар, Facebook хуудас, CallPro, SMS) харуулах цэвэр
 * туслахууд. Хурлын хуудас (`components/weekly/WeeklyMarketingChannels.tsx`) ба Лхагвагийн слайд
 * (`lib/dashboard/weekly-deck.ts`) хоёулаа ашиглана — дүрэм нэг газарт.
 *
 * Meta зарыг Ads Manager-ийн хураангуй шиг харуулна: нийт үзүүлэлт, үр дүн төрлөөр (нэг үр дүнгийн
 * өртөгтэй), кампанит ажлын задаргаа. Дүрэм:
 *  - Зардал зарын дансны валютаар (ихэвчлэн USD): ₮ гэж бичихгүй, төгрөгийн дүнд нэмэхгүй.
 *  - Өөр төрлийн үр дүнг нэг тоонд нэмэхгүй; хүрсэн хүн (reach)-ийг өдөр, кампанит ажлаар нэмэхгүй.
 *  - Үр дүн нь Meta-гийн зарын платформын тоо — CRM-ийн бүртгэлтэй холбож тооцохгүй.
 *  - Хоосон утга «—», 0 биш.
 */
import {
    channelMetric, formatChannelValue, type BreakdownRow, type ChannelSource, type ChannelTotals, type MetricDelta,
} from './channel-reports';
import {
    META_RESULT_DEFS, isMetaResultType, metaResultCostKey, metaResultKey, metaResultSpendKey, presentMetaResultTypes, type MetaResultType,
} from './meta-results';

/** Хурлын тайлангийн Meta-гийн нийт үзүүлэлт (Ads Manager-ийн хураангуйн дараалал). */
export const META_WEEK_KEYS = ['spend', 'impressions', 'reach', 'frequency', 'link_clicks', 'ctr_link', 'cpm', 'cost_per_link_click'] as const;

export const channelCurrency = (totals: ChannelTotals): string | null => typeof totals.currency === 'string' ? totals.currency : null;

/**
 * Үзүүлэлтийн утга: мөнгө валюттай (0.01-ээс бага өртөг 4 оронтой), хувь, «ц мин», тоо.
 * Утгагүй бол «—».
 */
export function formatChannelMetric(source: ChannelSource, key: string, value: unknown, currency?: string | null): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string') return value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const kind = channelMetric(source, key)?.kind;
    if (kind === 'percent') return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    if (kind === 'duration') {
        const seconds = Math.round(value);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours ? `${hours} ц ${minutes} мин` : `${minutes} мин ${seconds % 60} сек`;
    }
    return formatChannelValue(value, kind === 'money' || kind === 'count' ? kind : 'decimal', currency);
}

/** «+50.38 (+20.2%)» — харьцуулах боломжтой үед л; үгүй бол null. */
export function formatChannelDelta(delta: MetricDelta | null | undefined): string | null {
    if (!delta?.comparable || delta.delta === null) return null;
    const sign = delta.delta > 0 ? '+' : '';
    return `${sign}${delta.delta.toLocaleString('en-US', { maximumFractionDigits: 2 })}${delta.pct !== null ? ` (${sign}${delta.pct}%)` : ''}`;
}

/** Аль нэг тайлангийн өдрийн хамралт дутуу (6/7 өдөр) тул өмнөхтэй харьцуулаагүй эсэх. */
export function comparisonBlockedByCoverage(comparison: Record<string, MetricDelta> | null | undefined): boolean {
    return Object.values(comparison ?? {}).some(delta => delta.reason === 'coverage');
}

/** Нэг үр дүнгийн өртөг: «1.86 USD», хүрсэн хүн бол «3.2 USD / 1000 хүн». */
export function metaCostText(type: MetaResultType, value: unknown, currency?: string | null): string {
    if (typeof value !== 'number') return '—';
    return `${formatChannelValue(value, 'money', currency)}${META_RESULT_DEFS[type].costScale === 1000 ? ' / 1000 хүн' : ''}`;
}

export interface MetaTypeResult {
    type: MetaResultType;
    label: string;
    /** Үр дүнгийн тоо; хүрсэн хүнийг нэмж болохгүй үед null («—»). */
    results: number | null;
    /** Кампанит ажлын зорилгоор хуваарилсан зардал (дансны валютаар). */
    spend: number | null;
    /** Нэг үр дүнгийн өртөг (reach бол 1000 хүнд). */
    cost: number | null;
    /** Синкийн/файлын өөр долоо хоногт хүргэлттэй, энэ долоо хоногт хүргэлтгүй (0 үр дүн, 0 зардал). */
    idle: boolean;
}

/** Тайланд байгаа үр дүнгийн төрөл бүр (тогтмол дараалал) — төрөл хооронд нийлбэргүй. */
export function metaResultsByType(totals: ChannelTotals): MetaTypeResult[] {
    const num = (key: string) => typeof totals[key] === 'number' ? totals[key] as number : null;
    return presentMetaResultTypes(totals).map(type => {
        const results = num(metaResultKey(type));
        const spend = num(metaResultSpendKey(type));
        return { type, label: META_RESULT_DEFS[type].label, results, spend, cost: num(metaResultCostKey(type)), idle: results === 0 && (spend ?? 0) === 0 };
    });
}

/**
 * Үр дүнгийн төрөлд хуваарилаагүй зардал = нийт зардал − Σ төрлийн зардал (≥ 0.01 бол).
 * Meta API төрөлгүй кампанит ажлын зардлыг анхааруулгагүйгээр нийтэд л оруулдаг тул энд тооцно.
 * Төрөлгүй хуучин тайлан эсвэл валют холилдсон (нийт зардалгүй) бол null.
 */
export function metaUntypedSpend(totals: ChannelTotals): number | null {
    if (typeof totals.spend !== 'number') return null;
    const typed = metaResultsByType(totals).filter(row => row.spend !== null);
    if (!typed.length) return null;
    const rest = Math.round((totals.spend - typed.reduce((sum, row) => sum + row.spend!, 0)) * 100) / 100;
    return rest >= 0.01 ? rest : null;
}

/**
 * Кампанит ажлын задаргаа (кампанит ажил × үр дүнгийн төрөл), зардлаар буурахаар; зардалгүй мөр
 * сүүлд. Нийт зардал байхгүй бол (өөр валют холилдсон файл) мөрийн зардал, өртгийг хасна — өөр
 * валютын дүнг нэг баганад харуулахгүй.
 */
export function metaCampaignRows(report: { totals: ChannelTotals; breakdown: readonly BreakdownRow[] }): BreakdownRow[] {
    const money = typeof report.totals.spend === 'number';
    return report.breakdown
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.kind === 'campaign')
        .sort((a, b) => (b.row.values.spend ?? -1) - (a.row.values.spend ?? -1) || a.index - b.index)
        .map(({ row }) => money ? row : { ...row, values: { ...row.values, spend: null, cost_per_result: null } });
}

/** Задаргааны мөрийн үр дүнгийн төрлийн нэр; төрөлгүй бол «Тодорхойгүй». */
export const metaRowTypeLabel = (row: BreakdownRow) => isMetaResultType(row.tag) ? META_RESULT_DEFS[row.tag].label : 'Тодорхойгүй';
