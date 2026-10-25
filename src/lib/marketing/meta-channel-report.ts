/**
 * Хадгалсан Meta ad set × өдрийн мөрөөс (`meta_ad_insights_daily`, зөвхөн Meta API синк бичдэг) хурлын долоо
 * хоногийн `meta_ads` сувгийн тайлан бодох цэвэр функцууд — синк (`meta-insights.ts`) ба хурлын тайлангийн
 * ачаалагч (`channel-reports-load.ts`) хуваалцана. Сервер/токены импортгүй.
 */
import {
    CHANNEL_LIMITS, compareWithPrevious, type BreakdownRow, type ChannelTotals, type ChannelWarning, type MetricDelta,
} from './channel-reports';
import {
    META_RESULT_DEFS, META_RESULT_TYPES, metaResultCost, metaResultCostKey, metaResultKey, metaResultSpendKey,
    type MetaResultType,
} from './meta-results';
import { groupMetaResultRows, hasMetaDelivery, toMetaResultRows, type MetaInsightRow, type MetaResultGroup } from './meta-result-groups';
import type { MetaPeriodReach } from '@/lib/facebook/ads-insights';

export const META_INSIGHTS_TABLE = 'meta_ad_insights_daily';
export const META_INSIGHT_COLUMNS = 'day,campaign_id,campaign_name,adset_id,spend,impressions,reach,clicks,inline_link_clicks,landing_page_views,result_type,results,result_source';

export type { MetaInsightRow } from './meta-result-groups';
export interface MetaChannelReport { totals: ChannelTotals; breakdown: BreakdownRow[]; warnings: ChannelWarning[]; rowCount: number }
/** Хурлын долоо хоног Улаанбаатарын цагаар (Лхагва–Мягмар). */
export const MEETING_TIMEZONE = 'Asia/Ulaanbaatar';

const round = (value: number, digits = 6) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const sum = <T>(list: readonly T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);

/**
 * Хадгалсан ad set × өдрийн мөрүүдээс нэг хугацааны (хурлын 7 хоног) `meta_ads` тайлан.
 * `reach` = тухайн хугацааны Meta-гийн давхардалгүй reach; null бол reach-ийг тооцохгүй.
 * `knownTypes` = синкийн мэдэгдэх үр дүнгийн төрлүүд: энэ хугацаанд хүргэлтгүй бол 0-ээр бичнэ.
 * `timezone` = зарын дансны цагийн бүс (Улаанбаатар биш бол мэдээллийн тэмдэглэл).
 */
export function buildMetaChannelReport(input: {
    rows: readonly MetaInsightRow[];
    currency: string;
    reach: MetaPeriodReach | null;
    breakdownLimit?: number;
    knownTypes?: Iterable<MetaResultType>;
    timezone?: string;
}): MetaChannelReport {
    const warnings: ChannelWarning[] = [];
    const info = (code: ChannelWarning['code'], message: string, level: ChannelWarning['level'] = 'info') => warnings.push({ code, level, message });
    const rows = toMetaResultRows(input.rows);
    const groups = groupMetaResultRows(rows);

    // Хүргэлтгүй (зардал, харагдалт, үр дүн бүгд 0) кампанит ажлыг хасна.
    const kept: Array<MetaResultGroup & { reach: number | null }> = groups.filter(hasMetaDelivery).map(g => ({ ...g, reach: null }));
    const perCampaign = new Map<string, number>();
    for (const group of kept) perCampaign.set(group.campaign, (perCampaign.get(group.campaign) ?? 0) + 1);
    for (const group of kept) {
        // Кампанит ажлын давхардалгүй reach нь ганц мөртэй үед л тухайн мөрийнх.
        const campaignReach = input.reach?.campaigns.get(group.campaign);
        group.reach = perCampaign.get(group.campaign) === 1 && campaignReach !== undefined ? campaignReach : null;
        if (group.type === 'reach') group.results = group.reach;
    }

    const totals: ChannelTotals = {};
    const spend = round(sum(rows, r => r.spend)), impressions = sum(rows, r => r.impressions);
    const linkClicks = sum(rows, r => r.linkClicks), landingPageViews = round(sum(rows, r => r.landingPageViews));
    totals.spend = spend;
    totals.currency = input.currency;
    totals.impressions = impressions;
    totals.link_clicks = linkClicks;
    totals.clicks_all = sum(rows, r => r.clicks);
    totals.landing_page_views = landingPageViews;
    if (input.reach) {
        totals.reach = input.reach.account;
        if (input.reach.account > 0) totals.frequency = round(impressions / input.reach.account, 2);
    } else if (rows.length) {
        info('non_additive', 'Давхардалгүй reach-ийг Meta-гаас татаж чадсангүй — Reach, Frequency тооцоогүй (өдрийн reach-ийг нэмэхгүй). Дараагийн синкээр нөхөгдөнө.', 'warning');
    }
    const derived = (key: string, numerator: number, denominator: number, scale: number) => {
        if (denominator > 0) totals[key] = round(numerator / denominator * scale, 2);
    };
    derived('cpm', spend, impressions, 1000);
    derived('cost_per_link_click', spend, linkClicks, 1);
    derived('ctr_link', linkClicks, impressions, 100);
    derived('cost_per_landing_page_view', spend, landingPageViews, 1);

    const present = META_RESULT_TYPES.filter(type => kept.some(g => g.type === type));
    for (const type of present) {
        const list = kept.filter(g => g.type === type);
        const typeSpend = round(sum(list, g => g.spend));
        totals[metaResultSpendKey(type)] = typeSpend;
        if (list.some(g => g.results === null)) {
            info(type === 'reach' ? 'non_additive' : 'no_values', type === 'reach'
                ? 'Хүрсэн хүн (үр дүн)-ийг тооцоогүй: reach зорилготой кампанит ажлын давхардалгүй reach Meta-гаас ирээгүй эсвэл тэр кампанит ажил өөр төрлийн ad set-тэй.'
                : `${META_RESULT_DEFS[type].label}: үр дүнгийн тоо Meta-гаас ирээгүй — зөвхөн зардлыг тооцсон.`);
            continue;
        }
        const results = round(sum(list, g => g.results ?? 0));
        totals[metaResultKey(type)] = results;
        const cost = metaResultCost(type, typeSpend, results);
        if (cost !== null) totals[metaResultCostKey(type)] = cost;
        if (type === 'reach' && list.length > 1) {
            info('non_additive', `Хүрсэн хүн (үр дүн) нь reach зорилготой ${list.length} кампанит ажлын давхардалгүй reach-ийн нийлбэр — кампанит ажил хооронд давхцаж болно.`);
        }
    }
    if (present.length === 1) {
        const [type] = present;
        if (typeof totals[metaResultKey(type)] === 'number') totals.results = totals[metaResultKey(type)];
        // Хуучин «Нэг үр дүнгийн өртөг» нь нэг үр дүнд (CSV-тэй адил); reach-ийн өртөг 1000 хүнд тул зөвхөн cost_per_result_reach-д.
        if (type !== 'reach' && typeof totals[metaResultCostKey(type)] === 'number') totals.cost_per_result = totals[metaResultCostKey(type)];
    }
    // Синкийн өөр долоо хоногт (эсвэл өмнөх хурлын долоо хоногт) хүргэлттэй боловч энд хүргэлтгүй төрөл = 0
    // (өртөггүй): CSV импортын адил «0 дуудлага» гарч, дараагийн долоо хоног 0-ээс харьцуулагдана. Хүргэлтгүй
    // үед хүрсэн хүн яг 0 тул reach-д ч results_reach = 0. Хуучин results/cost_per_result зөвхөн хүргэлттэй төрлөөс.
    const known = new Set(input.knownTypes ?? []);
    for (const type of META_RESULT_TYPES) {
        if (present.includes(type) || !known.has(type)) continue;
        totals[metaResultSpendKey(type)] = 0;
        totals[metaResultKey(type)] = 0;
    }
    // Reach-ийг давхардалгүйгээр тусад нь авдаг тул зорилгоор тооцсон үр дүнд оруулахгүй.
    const approximate = rows.filter(r => r.source === 'goal' && r.type && r.type !== 'reach' && (r.results ?? 0) > 0).length;
    if (approximate) {
        info('field_ignored', `${approximate} мөрийн үр дүнг Meta-гийн «results» талбаргүйгээр ad set-ийн зорилгоор (optimization goal) тооцсон — Ads Manager-ийн Results-аас бага зэрэг зөрж болно.`);
    }

    if (input.timezone && input.timezone !== MEETING_TIMEZONE) {
        info('out_of_period', `Meta өдрийг зарын дансны цагийн бүсээр (${input.timezone}) тоолдог, хурлын долоо хоног Улаанбаатарын цагаар — долоо хоногийн эхлэл, төгсгөл хэдэн цагаар зөрнө.`);
    }

    const limit = input.breakdownLimit ?? CHANNEL_LIMITS.breakdown;
    const sorted = kept.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
    if (sorted.length > limit) info('truncated', `Задаргааны эхний ${limit} мөрийг хадгална (нийт ${sorted.length}). Нийт дүнд бүх мөр орсон.`);
    const breakdown: BreakdownRow[] = sorted.slice(0, limit).map(g => {
        const groupSpend = round(g.spend);
        return {
            kind: 'campaign', label: g.name, ...(g.type ? { tag: g.type } : {}),
            values: {
                spend: groupSpend, impressions: g.impressions, link_clicks: g.linkClicks,
                ...(g.reach !== null ? { reach: g.reach } : {}),
                results: g.type ? g.results : null,
                cost_per_result: g.type ? metaResultCost(g.type, groupSpend, g.results) : null,
            },
        };
    });
    return { totals, breakdown, warnings, rowCount: rows.length };
}


/** Мөн өдрүүдийн харьцуулалтад оруулахгүй: давхардалгүй reach-ийг өдрөөр нэмэхгүй тул reach, frequency, reach-ийн үр дүн, өртөг. */
export const META_SAME_DAYS_SKIP: ReadonlySet<string> = new Set(['reach', 'frequency', metaResultKey('reach'), metaResultCostKey('reach')]);

const omitSkipped = (totals: ChannelTotals): ChannelTotals => Object.fromEntries(Object.entries(totals).filter(([key]) => !META_SAME_DAYS_SKIP.has(key)));

/**
 * Meta API-ийн дуусаагүй долоо хоногийг (хурлын өглөө дансны сүүлийн өдөр дуусаагүй) харьцуулах суурь: өмнөх долоо
 * хоногийн мөн өдрүүдийн (`days`) нийлбэр үзүүлэлт — зардал, харагдалт, link click, үр дүн төрлөөр ба тэдгээрээс
 * гарах CPM, CPC, CTR, нэг үр дүнгийн өртөг. `rows` = өмнөх долоо хоногийн API тайлангийн хамарсан өдрүүдийн
 * хадгалсан мөр (одоогийн дансны). Тэр тайланг ижил мөрөөс дахин бодоход зардал, харагдалт таарахгүй бол (данс
 * солигдсон, мөр дахин бичигдсэн) null — таамгаар харьцуулахгүй. Reach, frequency-г оруулахгүй (`META_SAME_DAYS_SKIP`).
 */
export function metaSameDaysTotals(input: {
    rows: readonly MetaInsightRow[];
    previous: { totals: ChannelTotals; data_from: string; data_to: string };
    days: { from: string; to: string };
    knownTypes: Iterable<MetaResultType>;
}): ChannelTotals | null {
    const { previous, days } = input;
    const currency = typeof previous.totals.currency === 'string' ? previous.totals.currency : null;
    if (!currency || typeof previous.totals.spend !== 'number' || typeof previous.totals.impressions !== 'number') return null;
    if (days.from < previous.data_from || days.to > previous.data_to || days.to < days.from) return null;
    const rows = input.rows.filter(row => row.day >= previous.data_from && row.day <= previous.data_to);
    const full = buildMetaChannelReport({ rows, currency, reach: null }).totals;
    if (Math.abs((full.spend as number) - previous.totals.spend) > 0.005 || full.impressions !== previous.totals.impressions) return null;
    const same = buildMetaChannelReport({ rows: rows.filter(row => row.day >= days.from && row.day <= days.to), currency, reach: null, knownTypes: input.knownTypes }).totals;
    return omitSkipped(same);
}

/** Дуусаагүй долоо хоног ↔ өмнөх долоо хоногийн мөн өдрүүд (`metaSameDaysTotals`): reach, frequency-гүй. */
export function compareMetaSameDays(current: ChannelTotals, sameDays: ChannelTotals): Record<string, MetricDelta> {
    return compareWithPrevious(omitSkipped(current), sameDays, 'meta_ads');
}
