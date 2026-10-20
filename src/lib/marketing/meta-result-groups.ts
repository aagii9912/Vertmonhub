/**
 * `meta_ad_insights_daily`-ийн ad set × өдрийн мөрүүдийг кампанит ажил × үр дүнгийн төрлөөр бүлэглэнэ.
 * Хурлын долоо хоногийн тайлан (`buildMetaChannelReport`) болон самбарын огноотой Meta тайлан
 * (`buildMetaAdsReport`) хоёулаа энэ нэг дүрмийг ашиглана. Цэвэр модуль (сервер, браузерт хоёуланд).
 *
 * Дүрэм (docs/features/META-INSIGHTS-API-2026-10-05.md «Кампанит ажлын төрөл»):
 *  - Ad set-ийн төрөл = үр дүн гарсан өдрүүдийнх; үр дүнгүй бол зорилгын (indicator/goal) төрөл.
 *  - Кампанит ажил ганц төрлийн үр дүнтэй бол бүх зардал тэр төрөлд; өөр өөр бол ad set бүр өөрийн
 *    төрлийн мөрөнд, эдгээр төрлийн аль нь ч биш ad set-ийн зардал хамгийн их зардалтай төрөлд.
 *  - Зөвхөн ижил нэгжийн үр дүнг нэмнэ; reach-ийг өдөр, ad set-ээр хэзээ ч нэмэхгүй (results = null).
 */
import { META_RESULT_TYPES, isMetaResultType, type MetaResultType } from './meta-results';

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

export interface MetaResultRow {
    day: string; campaign: string; name: string; adset: string; spend: number;
    /** Төгрөгт хөрвүүлсэн зардал; ханшгүй бол null. */
    spendMnt: number | null;
    impressions: number; clicks: number; linkClicks: number; landingPageViews: number;
    type: MetaResultType | null; results: number | null; source: string;
}

export interface MetaResultGroup {
    campaign: string; name: string; nameDay: string; type: MetaResultType | null;
    spend: number;
    /** Бүлгийн бүх мөр ханштай үед л төгрөгийн нийлбэр. */
    spendMnt: number | null;
    impressions: number; linkClicks: number;
    /** Ижил нэгжийн үр дүнгийн нийлбэр; тоо ирээгүй мөртэй бол null. Reach-д 0 (давхардалгүйг тусад нь). */
    results: number | null;
}

export const metaNumber = (value: unknown) => { const n = typeof value === 'number' ? value : Number(value); return Number.isFinite(n) ? n : 0; };

export function toMetaResultRows<T extends MetaInsightRow>(rows: readonly T[], mntOf?: (row: T) => number | null): MetaResultRow[] {
    return rows.map(r => ({
        day: r.day, campaign: r.campaign_id, name: r.campaign_name || r.campaign_id, adset: r.adset_id,
        spend: metaNumber(r.spend), spendMnt: mntOf ? mntOf(r) : null,
        impressions: metaNumber(r.impressions), clicks: metaNumber(r.clicks), linkClicks: metaNumber(r.inline_link_clicks),
        landingPageViews: metaNumber(r.landing_page_views), type: isMetaResultType(r.result_type) ? r.result_type : null,
        results: r.results === null || r.results === undefined ? null : metaNumber(r.results), source: r.result_source,
    }));
}

/** Хамгийн олон өдөр давтагдсан төрөл; тэнцвэл хамгийн сүүлийн өдрийнх. */
function dominantType(rows: readonly MetaResultRow[]): MetaResultType | null {
    const counts = new Map<MetaResultType, { days: number; last: string }>();
    for (const row of rows) {
        if (!row.type) continue;
        const entry = counts.get(row.type) ?? { days: 0, last: '' };
        counts.set(row.type, { days: entry.days + 1, last: row.day > entry.last ? row.day : entry.last });
    }
    return [...counts].sort(([, a], [, b]) => b.days - a.days || b.last.localeCompare(a.last))[0]?.[0] ?? null;
}

/** Кампанит ажил × төрлийн бүлгүүд (хүргэлтгүй бүлгийг ч оруулна — `hasMetaDelivery`-ээр шүүнэ). */
export function groupMetaResultRows(rows: readonly MetaResultRow[]): MetaResultGroup[] {
    const adsets = new Map<string, { campaign: string; rows: MetaResultRow[] }>();
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
    const groupTypeOf = (row: MetaResultRow): MetaResultType | null => {
        const types = campaignTypes.get(row.campaign)!;
        if (types.size === 1) return [...types][0];
        const own = adsetInfo.get(row.adset)!.type;
        return own && types.has(own) ? own : campaignMainType.get(row.campaign) ?? own;
    };

    const groups = new Map<string, MetaResultGroup>();
    const unknownResults = new Set<string>();
    for (const row of rows) {
        const type = groupTypeOf(row);
        const key = `${row.campaign}\u0000${type ?? ''}`;
        const group = groups.get(key) ?? { campaign: row.campaign, name: row.name, nameDay: row.day, type, spend: 0, spendMnt: 0, impressions: 0, linkClicks: 0, results: 0 };
        group.spend += row.spend;
        group.spendMnt = group.spendMnt === null || row.spendMnt === null ? null : group.spendMnt + row.spendMnt;
        group.impressions += row.impressions;
        group.linkClicks += row.linkClicks;
        if (row.day >= group.nameDay) { group.name = row.name; group.nameDay = row.day; }
        // Зөвхөн ижил нэгжийн үр дүнг нэмнэ; reach-ийг өдрөөр нэмэхгүй.
        if (type && type !== 'reach' && row.type === type) {
            if (row.results === null) unknownResults.add(key);
            else if (group.results !== null) group.results += row.results;
        }
        groups.set(key, group);
    }
    for (const key of unknownResults) groups.get(key)!.results = null;
    return [...groups.values()];
}

/** Хүргэлтгүй (зардал, харагдалт, үр дүн бүгд 0) бүлгийг тайланд оруулахгүй. */
export const hasMetaDelivery = (group: MetaResultGroup) =>
    group.spend > 0 || group.impressions > 0 || (group.type !== 'reach' && (group.results ?? 0) > 0);
