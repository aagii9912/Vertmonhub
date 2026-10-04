/**
 * Meta Marketing API-ийн дэлгэрэнгүй синк: ad set × өдрийн insights-ийг `meta_ad_insights_daily`-д
 * хадгалж, хурлын долоо хоног (Лхагва–Мягмар) бүрээр `marketing_channel_reports`-д `meta_ads`
 * тайлан (origin = 'api') бичнэ. Тайлангийн түлхүүрүүд CSV импорттой ижил гэрээтэй
 * (docs/features/META-INSIGHTS-API-2026-10-05.md):
 *
 *  - Нийт: spend, currency, impressions, link_clicks (= inline_link_clicks), clicks_all (= clicks),
 *    landing_page_views, reach/frequency (зөвхөн Meta-гийн хугацааны давхардалгүй reach), cpm,
 *    cost_per_link_click, ctr_link, cost_per_landing_page_view.
 *  - Үр дүнгийн төрөл T бүрт results_T, spend_T (кампанит ажлын зорилгоор: тухайн кампанит
 *    ажлын бүх зардал, үр дүнгүй өдрүүд ч), cost_per_result_T. Ганц төрөлтэй бол results /
 *    cost_per_result (хуучин түлхүүр).
 *  - Задаргаа: кампанит ажил (төрөл бүрээр тусдаа мөр), зардлаар буурахаар, 100 мөр.
 *
 * Өдрийн reach-ийг хэзээ ч нэмэхгүй; Meta-аас татаж чадаагүй бол reach-гүй (таамаглахгүй).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { metaAdsToken } from '@/lib/facebook/ads-auth';
import { fetchMetaAccount } from '@/lib/facebook/daily-spend';
import { fetchMetaAdsetInsights, fetchMetaPeriodReach, type MetaPeriodReach } from '@/lib/facebook/ads-insights';
import { reviewWeekOf, reviewWeeksBetween, shiftReviewDate } from '@/lib/dashboard/weekly-review';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';
import { CHANNEL_LIMITS, type BreakdownRow, type ChannelTotals, type ChannelWarning } from './channel-reports';
import {
    META_RESULT_DEFS, META_RESULT_TYPES, metaResultCost, metaResultCostKey, metaResultKey, metaResultSpendKey, type MetaResultType,
} from './meta-results';
import { dateSchema } from './performance';

export const META_INSIGHTS_TABLE = 'meta_ad_insights_daily';
export const META_INSIGHTS_STATUS_TABLE = 'meta_insights_sync';
export const META_INSIGHT_COLUMNS = 'day,campaign_id,campaign_name,adset_id,spend,impressions,reach,clicks,inline_link_clicks,landing_page_views,result_type,results,result_source';

/** `meta_ad_insights_daily`-ийн тайланд хэрэгтэй багана (PostgREST numeric-ийг string-ээр ч буцааж болно). */
export interface MetaInsightRow {
    day: string;
    campaign_id: string;
    campaign_name: string;
    adset_id: string;
    spend: number | string;
    impressions: number | string;
    reach: number | string | null;
    clicks: number | string;
    inline_link_clicks: number | string;
    landing_page_views: number | string;
    result_type: string | null;
    results: number | string | null;
    result_source: string;
}
export interface MetaChannelReport { totals: ChannelTotals; breakdown: BreakdownRow[]; warnings: ChannelWarning[]; rowCount: number }

const round = (value: number, digits = 6) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const num = (value: unknown) => { const n = typeof value === 'number' ? value : Number(value); return Number.isFinite(n) ? n : 0; };
const isResultType = (value: unknown): value is MetaResultType => (META_RESULT_TYPES as readonly unknown[]).includes(value);
const sum = <T>(list: readonly T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);

interface Row {
    day: string; campaign: string; name: string; adset: string; spend: number; impressions: number; clicks: number;
    linkClicks: number; landingPageViews: number; type: MetaResultType | null; results: number | null; source: string;
}
interface Group {
    campaign: string; name: string; nameDay: string; type: MetaResultType | null;
    spend: number; impressions: number; linkClicks: number; results: number | null; reach: number | null;
}

/** Хамгийн олон өдөр давтагдсан төрөл; тэнцвэл хамгийн сүүлийн өдрийнх. */
function dominantType(rows: readonly Row[]): MetaResultType | null {
    const counts = new Map<MetaResultType, { days: number; last: string }>();
    for (const row of rows) {
        if (!row.type) continue;
        const entry = counts.get(row.type) ?? { days: 0, last: '' };
        counts.set(row.type, { days: entry.days + 1, last: row.day > entry.last ? row.day : entry.last });
    }
    return [...counts].sort(([, a], [, b]) => b.days - a.days || b.last.localeCompare(a.last))[0]?.[0] ?? null;
}

/**
 * Хадгалсан ad set × өдрийн мөрүүдээс нэг хугацааны (хурлын 7 хоног) `meta_ads` тайлан.
 * `reach` = тухайн хугацааны Meta-гийн давхардалгүй reach; null бол reach-ийг тооцохгүй.
 */
export function buildMetaChannelReport(input: {
    rows: readonly MetaInsightRow[];
    currency: string;
    reach: MetaPeriodReach | null;
    breakdownLimit?: number;
}): MetaChannelReport {
    const warnings: ChannelWarning[] = [];
    const info = (code: ChannelWarning['code'], message: string, level: ChannelWarning['level'] = 'info') => warnings.push({ code, level, message });
    const rows: Row[] = input.rows.map(r => ({
        day: r.day, campaign: r.campaign_id, name: r.campaign_name || r.campaign_id, adset: r.adset_id,
        spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), linkClicks: num(r.inline_link_clicks),
        landingPageViews: num(r.landing_page_views), type: isResultType(r.result_type) ? r.result_type : null,
        results: r.results === null || r.results === undefined ? null : num(r.results), source: r.result_source,
    }));

    // Ad set-ийн төрөл: үр дүн гарсан өдрүүдийнх; үр дүнгүй бол зорилгын (indicator/goal) төрөл.
    const adsets = new Map<string, { campaign: string; rows: Row[] }>();
    for (const row of rows) {
        const adset = adsets.get(row.adset) ?? { campaign: row.campaign, rows: [] };
        adset.rows.push(row);
        adsets.set(row.adset, adset);
    }
    const adsetInfo = new Map<string, { campaign: string; type: MetaResultType | null; hasResults: boolean }>();
    for (const [id, adset] of adsets) {
        const withResults = adset.rows.filter(r => r.type && (r.results ?? 0) > 0);
        adsetInfo.set(id, { campaign: adset.campaign, type: dominantType(withResults.length ? withResults : adset.rows), hasResults: withResults.length > 0 });
    }
    // Кампанит ажлын төрөл: үр дүнтэй ad set-үүдийнх. Ганц бол бүх зардал тэр төрөлд (зорилгоор хуваарилна);
    // өөр өөр бол ad set бүр өөрийн төрлийн мөрөнд, харин эдгээр төрлийн аль нь ч биш (үр дүнгүй, өөр
    // зорилготой) ad set-ийн зардал кампанит ажлын хамгийн их зардалтай үр дүнгийн төрөлд — кампанит
    // ажил гаргаагүй төрөл тайланд гарахгүй.
    const campaignTypes = new Map<string, Set<MetaResultType>>();
    const campaignMainType = new Map<string, MetaResultType>();
    for (const campaign of new Set(rows.map(r => r.campaign))) {
        const infos = [...adsetInfo.values()].filter(i => i.campaign === campaign);
        const withResults = infos.filter(i => i.hasResults && i.type);
        const types = new Set((withResults.length ? withResults : infos).flatMap(i => i.type ? [i.type] : []));
        campaignTypes.set(campaign, types);
        if (types.size < 2) continue;
        const spendByType = new Map<MetaResultType, number>();
        for (const row of rows) {
            const type = adsetInfo.get(row.adset)!.type;
            if (row.campaign === campaign && type && types.has(type)) spendByType.set(type, (spendByType.get(type) ?? 0) + row.spend);
        }
        campaignMainType.set(campaign, [...types].sort((a, b) => (spendByType.get(b) ?? 0) - (spendByType.get(a) ?? 0)
            || META_RESULT_TYPES.indexOf(a) - META_RESULT_TYPES.indexOf(b))[0]);
    }
    const groupTypeOf = (row: Row): MetaResultType | null => {
        const types = campaignTypes.get(row.campaign)!;
        if (types.size === 1) return [...types][0];
        const own = adsetInfo.get(row.adset)!.type;
        return own && types.has(own) ? own : campaignMainType.get(row.campaign) ?? own;
    };

    const groups = new Map<string, Group>();
    const unknownResults = new Set<string>();
    for (const row of rows) {
        const type = groupTypeOf(row);
        const key = `${row.campaign}\u0000${type ?? ''}`;
        const group = groups.get(key) ?? { campaign: row.campaign, name: row.name, nameDay: row.day, type, spend: 0, impressions: 0, linkClicks: 0, results: 0, reach: null };
        group.spend += row.spend;
        group.impressions += row.impressions;
        group.linkClicks += row.linkClicks;
        if (row.day >= group.nameDay) { group.name = row.name; group.nameDay = row.day; }
        // Зөвхөн ижил нэгжийн үр дүнг нэмнэ; reach-ийг өдрөөр нэмэхгүй (доор давхардалгүйгээр).
        if (type && type !== 'reach' && row.type === type) {
            if (row.results === null) unknownResults.add(key);
            else if (group.results !== null) group.results += row.results;
        }
        groups.set(key, group);
    }
    for (const key of unknownResults) groups.get(key)!.results = null;

    // Хүргэлтгүй (зардал, харагдалт, үр дүн бүгд 0) кампанит ажлыг хасна.
    const kept = [...groups.values()].filter(g => g.spend > 0 || g.impressions > 0 || (g.type !== 'reach' && (g.results ?? 0) > 0));
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
    // Reach-ийг давхардалгүйгээр тусад нь авдаг тул зорилгоор тооцсон үр дүнд оруулахгүй.
    const approximate = rows.filter(r => r.source === 'goal' && r.type && r.type !== 'reach' && (r.results ?? 0) > 0).length;
    if (approximate) {
        info('field_ignored', `${approximate} мөрийн үр дүнг Meta-гийн «results» талбаргүйгээр ad set-ийн зорилгоор (optimization goal) тооцсон — Ads Manager-ийн Results-аас бага зэрэг зөрж болно.`);
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

export const MetaInsightsInput = z.object({ from: dateSchema.optional(), to: dateSchema.optional() })
    .refine(v => !!v.from === !!v.to && (!v.from || (v.to! >= v.from && Date.parse(v.to!) - Date.parse(v.from) <= 92 * 86400000)), '93 хүртэл өдрийн хугацаа сонгоно уу');
export type MetaInsightsOptions = z.infer<typeof MetaInsightsInput>;
export interface MetaInsightsStatus {
    account_id: string; last_attempt_at: string; last_success_at: string | null; last_from: string | null; last_to: string | null;
    last_error: string | null; row_count: number | null; weeks: number | null; result_source: 'results' | 'goal' | null;
}
export interface MetaInsightsResult {
    rows: number; from: string; to: string; currency: string;
    /** Тайлан бичсэн хурлын долоо хоногууд (`dataTo` < `to` бол тухайн долоо хоног дуусаагүй). */
    weeks: Array<{ from: string; to: string; dataTo: string }>;
    /** false = Meta `results` талбарыг татгалзсан; үр дүнг зорилгоор тооцсон. */
    resultFields: boolean;
}

/**
 * Татах эхлэл: cron/анхдагч — сүүлийн 35 өдөр. Гараар сонгосон хугацаа хурлын долоо хоногийн дундаас
 * эхэлбэл (жишээ нь самбарын «энэ сар» = сарын 1) тэр долоо хоногийг бүтнээр нь татаж бичнэ —
 * хадгалах RPC-ийн 93 өдрийн хязгаарт багтвал.
 */
function insightsStart(inputFrom: string | undefined, to: string): string {
    if (!inputFrom) return shiftReviewDate(to, -34);
    const weekStart = reviewWeekOf(inputFrom).from;
    return weekStart >= shiftReviewDate(to, -92) ? weekStart : inputFrom;
}

async function readStoredRows(db: SupabaseClient, shopId: string, accountId: string, from: string, to: string): Promise<MetaInsightRow[]> {
    try {
        return await fetchAllRows<MetaInsightRow>((start, end) => db.from(META_INSIGHTS_TABLE).select(META_INSIGHT_COLUMNS)
            .eq('shop_id', shopId).eq('account_id', accountId).gte('day', from).lte('day', to)
            .order('day').order('adset_id').range(start, end));
    } catch (failure) {
        // Өгөгдлийн сангийн түүхий алдааг хэрэглэгч, төлөвт харуулахгүй — зөвхөн серверийн логт.
        logger.error('[Meta insights] хадгалсан мөрийг уншиж чадсангүй', { message: failure instanceof Error ? failure.message : 'unknown' });
        throw new Error('Хадгалсан Meta үр дүнг уншиж чадсангүй. Дахин оролдоно уу.');
    }
}

/** Файлаас импортолсон (origin ≠ 'api') `meta_ads` тайлантай долоо хоногууд (`from:to`). */
async function fileReportWeeks(db: SupabaseClient, shopId: string, weeks: ReadonlyArray<{ from: string; to: string }>): Promise<Set<string>> {
    if (!weeks.length) return new Set();
    const { data, error } = await db.from('marketing_channel_reports').select('period_from,period_to,origin')
        .eq('shop_id', shopId).eq('source', 'meta_ads').in('period_from', weeks.map(week => week.from));
    if (error) throw new Error('Хурлын долоо хоногийн Meta тайлангуудыг уншиж чадсангүй. Сувгийн тайлангийн шинэчлэл суулгасан эсэхийг шалгана уу.');
    return new Set((data ?? []).filter(r => r.origin !== 'api').map(r => `${r.period_from}:${r.period_to}`));
}

async function recordInsightsStatus(db: SupabaseClient, status: Partial<MetaInsightsStatus> & { shop_id: string; account_id: string; last_attempt_at: string }) {
    const { error } = await db.from(META_INSIGHTS_STATUS_TABLE).upsert(status, { onConflict: 'shop_id,account_id' });
    if (error) logger.warn('[Meta insights] төлөв хадгалж чадсангүй', { shopId: status.shop_id });
}

/**
 * Сүүлийн 35 өдрийг (эсвэл 93 хүртэл өдрийн сонгосон хугацааг, эхний хурлын долоо хоногийг бүтнээр)
 * дансны цагийн бүсээр татаж хадгална, дараа нь [from, to] дотор эхэлсэн хурлын долоо хоног бүрийн
 * `meta_ads` тайланг дахин бодно. Өнөөдрийг агуулсан долоо хоног дуусаагүй ч бичигдэнэ
 * (data_to = өнөөдөр); өнгөрсөн хугацааны дунд дуусах долоо хоногийг хагасаар бичихгүй.
 * Мөргүй долоо хоногийг зөвхөн цонхонд түүнээс өмнө дансны өгөгдөл байгаа бол 0-ээр бичнэ
 * (шинээр холбосон/сольсон дансны өмнөх долоо хоногийг 0 болгохгүй), файлын тайланг хэзээ ч
 * 0-ээр дарахгүй.
 */
export async function syncMetaInsights(db: SupabaseClient, shopId: string, options: MetaInsightsOptions = {}): Promise<MetaInsightsResult> {
    const input = MetaInsightsInput.parse(options);
    const started = new Date().toISOString();
    const { data: shop, error } = await db.from('shops').select('facebook_ad_account_id,meta_ads_user_access_token,meta_ads_user_token_expires_at').eq('id', shopId).single();
    if (error) throw new Error('Meta тохиргоог уншиж чадсангүй.');
    const accountId = `act_${String(shop?.facebook_ad_account_id || '').replace(/^act_/, '')}`;
    if (!/^act_\d+$/.test(accountId)) throw new Error('Эхлээд Meta зарын дансаа сонгоно уу.');
    try {
        const token = metaAdsToken(shop);
        const account = await fetchMetaAccount(accountId, token);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: account.timezone_name, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const to = input.to && input.to < today ? input.to : today;
        if (input.from && input.from > to) throw new Error('Ирээдүйн өдрийн өгөгдлийг татах боломжгүй.');
        const from = insightsStart(input.from, to);
        const { rows, resultFields } = await fetchMetaAdsetInsights(account, token, from, to);
        const { data: saved, error: saveError } = await db.rpc('save_meta_ad_insights', { p_shop: shopId, p_account: accountId, p_from: from, p_to: to, p_rows: rows });
        if (saveError) throw new Error('Meta дэлгэрэнгүй үр дүнг хадгалж чадсангүй. Шинэчлэл суулгасан эсэх, сонгосон дансаа шалгаад дахин оролдоно уу.');

        const candidates = reviewWeeksBetween(from, to)
            .filter(week => week.from >= from && (week.to <= to || to === today))
            .map(week => ({ ...week, dataTo: week.to < to ? week.to : to }));
        const weeks: MetaInsightsResult['weeks'] = [];
        if (candidates.length) {
            const stored = await readStoredRows(db, shopId, accountId, candidates[0].from, to);
            const plans = candidates.map(week => ({ week, rows: stored.filter(r => r.day >= week.from && r.day <= week.dataTo) }));
            // Мөргүй долоо хоног: тэг үү, эсвэл энэ дансны өгөгдөл биш үү (өөр данс, файл) — ялгах боломжгүй.
            const firstDataDay = rows.reduce<string | null>((first, r) => first === null || r.day < first ? r.day : first, null);
            const emptyAfterData = plans.filter(p => !p.rows.length && firstDataDay !== null && firstDataDay < p.week.from).map(p => p.week);
            const fileWeeks = await fileReportWeeks(db, shopId, emptyAfterData);
            const zeroWeeks = new Set(emptyAfterData.filter(w => !fileWeeks.has(`${w.from}:${w.to}`)).map(w => w.from));
            for (const { week, rows: weekRows } of plans) {
                if (!weekRows.length && !zeroWeeks.has(week.from)) continue;
                let reach: MetaPeriodReach | null = { account: 0, campaigns: new Map() };
                if (weekRows.length) {
                    try { reach = await fetchMetaPeriodReach(account, token, week.from, week.dataTo); }
                    catch { reach = null; logger.warn('[Meta insights] долоо хоногийн reach татагдсангүй', { shopId, week: week.from }); }
                }
                const report = buildMetaChannelReport({ rows: weekRows, currency: account.currency, reach });
                // API өгөгдөл тухайн долоо хоногийн файл импортыг зориуд орлоно (баримт бичигт тайлбартай).
                const { error: reportError } = await db.from('marketing_channel_reports').upsert({
                    shop_id: shopId, source: 'meta_ads', period_from: week.from, period_to: week.to,
                    origin: 'api', data_from: week.from, data_to: week.dataTo,
                    file_name: null, content_hash: null, mapping: {}, imported_by: null, note: null,
                    totals: report.totals, breakdown: report.breakdown, warnings: report.warnings, row_count: report.rowCount,
                }, { onConflict: 'shop_id,source,period_from,period_to' });
                if (reportError) throw new Error('Хурлын долоо хоногийн Meta тайланг хадгалж чадсангүй. Сувгийн тайлангийн шинэчлэл суулгасан эсэхийг шалгана уу.');
                weeks.push(week);
            }
        }
        const rowCount = Number(saved) || 0;
        await recordInsightsStatus(db, {
            shop_id: shopId, account_id: accountId, last_attempt_at: started, last_success_at: new Date().toISOString(),
            last_from: from, last_to: to, last_error: null, row_count: rowCount, weeks: weeks.length, result_source: resultFields ? 'results' : 'goal',
        });
        return { rows: rowCount, from, to, currency: account.currency, weeks, resultFields };
    } catch (failure) {
        const message = failure instanceof Error ? failure.message : 'Meta дэлгэрэнгүй синк амжилтгүй боллоо.';
        await recordInsightsStatus(db, { shop_id: shopId, account_id: accountId, last_attempt_at: started, last_error: message.slice(0, 500) });
        throw failure;
    }
}
