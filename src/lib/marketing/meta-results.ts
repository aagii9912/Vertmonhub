/**
 * Meta зарын «Results» (үр дүн)-ийн төрөл: Ads Manager-ийн экспортын «Result indicator» болон
 * Marketing API-ийн `results` / ad set-ийн `optimization_goal`-ийг нэг толь руу буулгана.
 *
 * Өөр төрлийн үр дүнг (дуудлага, постын оролцоо, хүрсэн хүн…) нэг тоонд нэмэхгүй: төрөл бүр
 * `results_<төрөл>`, түүнд ногдох зардал `spend_<төрөл>` (кампанит ажлын зорилгоор), өртөг
 * `cost_per_result_<төрөл>` гэсэн тусдаа үзүүлэлттэй. Хүрсэн хүн (reach) өдөр, кампаниар
 * давхцдаг тул нэмэхгүй; өртгийг Meta-гийн адил 1000 хүнд ногдохоор тооцно.
 *
 * Цэвэр модуль: CSV импорт (`channel-reports.ts`), API синк хоёулаа ашиглана.
 */

export const META_RESULT_TYPES = [
    'calls', 'messages', 'leads', 'landing_page_views', 'link_clicks',
    'post_interaction', 'post_engagement', 'page_engagement', 'thruplay', 'reach', 'other',
] as const;
export type MetaResultType = (typeof META_RESULT_TYPES)[number];

export interface MetaResultTypeDef {
    type: MetaResultType;
    /** Үр дүнгийн нэр (олон тоогоор, хүснэгтийн гарчиг). */
    label: string;
    /** Нэг үр дүнгийн өртгийн нэр. */
    costLabel: string;
    /** true = өдөр/кампаниар нэмэхгүй (давхардалгүй тоо зөвхөн Meta-гаас). */
    nonAdditive: boolean;
    /** Өртгийн хуваагч: 1 = нэг үр дүнд, 1000 = 1000 хүнд (reach). */
    costScale: number;
}

export const META_RESULT_DEFS: Record<MetaResultType, MetaResultTypeDef> = {
    calls: { type: 'calls', label: 'Дуудлага (Meta)', costLabel: 'Нэг дуудлагын өртөг', nonAdditive: false, costScale: 1 },
    messages: { type: 'messages', label: 'Мессеж эхлүүлсэн', costLabel: 'Нэг мессежийн өртөг', nonAdditive: false, costScale: 1 },
    leads: { type: 'leads', label: 'Лид маягт', costLabel: 'Нэг лидийн өртөг', nonAdditive: false, costScale: 1 },
    landing_page_views: { type: 'landing_page_views', label: 'Landing page view (үр дүн)', costLabel: 'Нэг landing page view-ийн өртөг', nonAdditive: false, costScale: 1 },
    link_clicks: { type: 'link_clicks', label: 'Link click (үр дүн)', costLabel: 'Нэг link click-ийн өртөг (үр дүн)', nonAdditive: false, costScale: 1 },
    post_interaction: { type: 'post_interaction', label: 'Постын харилцаа', costLabel: 'Нэг постын харилцааны өртөг', nonAdditive: false, costScale: 1 },
    post_engagement: { type: 'post_engagement', label: 'Постын оролцоо', costLabel: 'Нэг постын оролцооны өртөг', nonAdditive: false, costScale: 1 },
    page_engagement: { type: 'page_engagement', label: 'Хуудасны оролцоо', costLabel: 'Нэг хуудасны оролцооны өртөг', nonAdditive: false, costScale: 1 },
    thruplay: { type: 'thruplay', label: 'ThruPlay (видео үзэлт)', costLabel: 'Нэг ThruPlay-ийн өртөг', nonAdditive: false, costScale: 1 },
    reach: { type: 'reach', label: 'Хүрсэн хүн (үр дүн)', costLabel: '1000 хүнд хүрэх өртөг', nonAdditive: true, costScale: 1000 },
    other: { type: 'other', label: 'Бусад үр дүн', costLabel: 'Бусад үр дүнгийн өртөг', nonAdditive: false, costScale: 1 },
};

/** Ads Manager «Result indicator» / API `results[].indicator` (жижиг үсэг, `actions:` угтваргүй) → төрөл. */
const INDICATORS: Array<[RegExp, MetaResultType]> = [
    [/^click_to_call_native_call_placed$/, 'calls'],
    [/^click_to_call_(?:native_(?:20s|60s)_call_connect|call_confirm)$/, 'calls'],
    [/^onsite_conversion\.(?:messaging_conversation_started_7d|total_messaging_connection|messaging_first_reply)$/, 'messages'],
    [/^(?:onsite_conversion\.lead_grouped|leadgen_grouped|lead|onsite_conversion\.lead|offsite_conversion\.fb_pixel_lead)$/, 'leads'],
    [/^landing_page_view$/, 'landing_page_views'],
    [/^link_click$/, 'link_clicks'],
    [/^post_interaction_gross$/, 'post_interaction'],
    [/^post_engagement$/, 'post_engagement'],
    [/^page_engagement$/, 'page_engagement'],
    [/^video_thruplay_watched_actions$|^thruplay$/, 'thruplay'],
    [/^reach$/, 'reach'],
];

/** Хоосон бол null; танигдаагүй утга 'other'. */
export function metaResultTypeOf(indicator: string | null | undefined): MetaResultType | null {
    const value = String(indicator ?? '').trim().toLowerCase().replace(/^actions:/, '');
    if (!value || value === '-') return null;
    return INDICATORS.find(([pattern]) => pattern.test(value))?.[1] ?? 'other';
}

/** API-д `results` ирээгүй үед ad set-ийн `optimization_goal`-оос (ойролцоо) төрөл. */
const GOALS: Record<string, MetaResultType> = {
    REACH: 'reach',
    THRUPLAY: 'thruplay',
    POST_ENGAGEMENT: 'post_engagement',
    PAGE_ENGAGEMENT: 'page_engagement',
    LINK_CLICKS: 'link_clicks',
    LANDING_PAGE_VIEWS: 'landing_page_views',
    LEAD_GENERATION: 'leads',
    QUALITY_LEAD: 'leads',
    CONVERSATIONS: 'messages',
    QUALITY_CALL: 'calls',
};
export function metaResultTypeForGoal(goal: string | null | undefined): MetaResultType | null {
    const value = String(goal ?? '').trim().toUpperCase();
    if (!value) return null;
    return GOALS[value] ?? 'other';
}

/** Үр дүнгийн тоо (`actions`)-г API-ийн action_type-аас олох: төрөл бүрийн нэг (давхцахгүй) action_type. */
export const META_RESULT_ACTION_TYPES: Partial<Record<MetaResultType, readonly string[]>> = {
    calls: ['click_to_call_native_call_placed'],
    messages: ['onsite_conversion.messaging_conversation_started_7d'],
    leads: ['onsite_conversion.lead_grouped', 'lead'],
    landing_page_views: ['landing_page_view'],
    link_clicks: ['link_click'],
    post_interaction: ['post_interaction_gross'],
    post_engagement: ['post_engagement'],
    page_engagement: ['page_engagement'],
};

export const metaResultKey = (type: MetaResultType) => `results_${type}`;
export const metaResultSpendKey = (type: MetaResultType) => `spend_${type}`;
export const metaResultCostKey = (type: MetaResultType) => `cost_per_result_${type}`;

/** Өртөг: spend / үр дүн × хуваагч. 0.01-ээс бага өртгийг 4 оронтой хадгална. */
export function metaResultCost(type: MetaResultType, spend: number | null | undefined, results: number | null | undefined): number | null {
    if (typeof spend !== 'number' || typeof results !== 'number' || !(results > 0) || !Number.isFinite(spend)) return null;
    const cost = spend / results * META_RESULT_DEFS[type].costScale;
    return Number(cost.toFixed(cost < 1 ? 4 : 2));
}

/** Төрлүүдийг харуулах дараалал (тотал дахь `results_<төрөл>` түлхүүрүүдээр). */
export function presentMetaResultTypes(totals: Record<string, unknown>): MetaResultType[] {
    return META_RESULT_TYPES.filter(type => typeof totals[metaResultKey(type)] === 'number' || typeof totals[metaResultSpendKey(type)] === 'number');
}
