/**
 * Facebook Graph v26 туслахууд: зар (`metaRead`, META_ADS_APP_SECRET) ба Page/Instagram
 * (`pageRead`/`pagePost`, FACEBOOK_APP_SECRET-ийн appsecret_proof). Токен URL-д хэзээ ч орохгүй.
 * Page/IG метрикийн каталог: `lib/marketing/social-metrics.ts`.
 */

import { metaRead, MetaApiError, type MetaReadOptions } from '@/lib/facebook/daily-spend';
import { isMetaInvalidParamError, isMetaPermissionError, pagePost, pageRead } from '@/lib/facebook/page-graph';
import {
    IG_ACCOUNT_METRICS, IG_MEDIA_METRICS, PAGE_DAILY_METRICS, POST_LIFETIME_METRICS,
} from '@/lib/marketing/social-metrics';
import { logger } from '@/lib/utils/logger';

// ============ Ads API ============

export interface FacebookAdAccount {
    id: string;
    account_id: string;
    name?: string;
    account_status?: number;
    currency?: string;
    business_name?: string;
    timezone_name?: string;
}

export interface FacebookAdCampaign {
    id: string;
    name: string;
    status?: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    objective?: string;
    daily_budget?: string;
    lifetime_budget?: string;
    start_time?: string;
    stop_time?: string;
    created_time?: string;
    updated_time?: string;
}

export interface FacebookCampaignInsight {
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    ctr?: string;
    cpc?: string;
    cpm?: string;
    reach?: string;
    actions?: Array<{ action_type: string; value: string }>;
    date_start?: string;
    date_stop?: string;
    // breakdowns (зөвхөн breakdowns параметр дамжуулсан үед)
    age?: string;
    gender?: string;
    publisher_platform?: string;
    platform_position?: string;
    country?: string;
}

/**
 * Хэрэглэгчийн ad account-уудыг авах
 */
export async function getAdAccounts(accessToken: string): Promise<{ data: FacebookAdAccount[] }> {
    const fields = 'id,account_id,name,account_status,currency,business_name,timezone_name';
    const data: FacebookAdAccount[] = [];
    const cursors = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
        const result = await metaRead<{ data: FacebookAdAccount[]; paging?: { next?: string; cursors?: { after?: string } } }>('me/adaccounts', accessToken,
            { fields, limit: '100', ...(after ? { after } : {}) });
        if (!Array.isArray(result.data)) throw new Error('Meta зарын дансны хариу дутуу байна.');
        data.push(...result.data);
        if (!result.paging?.next) return { data };
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) break;
        cursors.add(after);
    }
    throw new Error('Meta зарын дансны жагсаалт бүрэн татагдсангүй.');
}

/**
 * Ad account-ийн бүх campaign-ыг авах (`pageSize` = нэг хуудасны хэмжээ, cursor-оор бүгдийг).
 */
export async function fetchAdAccountCampaigns(
    adAccountId: string,
    accessToken: string,
    pageSize: number = 100
): Promise<{ data: FacebookAdCampaign[] }> {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    if (!/^act_\d+$/.test(accountId)) throw new Error('Meta зарын дансны ID буруу байна.');
    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time';
    const data: FacebookAdCampaign[] = [];
    const cursors = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
        const result = await metaRead<{ data: FacebookAdCampaign[]; paging?: { next?: string; cursors?: { after?: string } } }>(`${accountId}/campaigns`, accessToken,
            { fields, limit: String(pageSize), ...(after ? { after } : {}) });
        if (!Array.isArray(result.data)) throw new Error('Meta кампанит ажлын хариу дутуу байна.');
        data.push(...result.data);
        // Rebuild the trusted Graph URL with a cursor; never follow paging.next.
        if (!result.paging?.next) return { data };
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) break;
        cursors.add(after);
    }
    throw new Error('Meta кампанит ажлын жагсаалт бүрэн татагдсангүй.');
}

/** Verify a campaign belongs to the shop's selected ad account before reading its insights. */
export async function campaignBelongsToAccount(campaignId: string, adAccountId: string, accessToken: string, read: MetaReadOptions = {}): Promise<boolean> {
    if (!/^\d+$/.test(campaignId) || !/^act_\d+$/.test(adAccountId)) return false;
    const campaign = await metaRead<{ id: string; account_id: string }>(campaignId, accessToken, { fields: 'id,account_id' }, read);
    return campaign.id === campaignId && campaign.account_id === adAccountId.slice(4);
}

/**
 * Кампанит ажлын insights авах (date_preset: today, yesterday, last_7d, last_30d, lifetime)
 */
export async function fetchCampaignInsights(
    campaignId: string,
    accessToken: string,
    datePreset: string = 'last_30d',
    level: 'campaign' | 'adset' | 'ad' = 'campaign',
    breakdowns?: string[],
    read: MetaReadOptions = {},
): Promise<{ data: FacebookCampaignInsight[] }> {
    if (!/^\d+$/.test(campaignId)) throw new Error('Meta campaign ID буруу байна.');
    // Level-ийн дагуу нэмэлт ID/нэр талбарууд
    const levelFields =
        level === 'ad'
            ? ',adset_id,adset_name,ad_id,ad_name'
            : level === 'adset'
            ? ',adset_id,adset_name'
            : '';
    const fields = 'spend,impressions,clicks,ctr,cpc,cpm,reach,actions,date_start,date_stop,campaign_name' + levelFields;
    const params: Record<string, string> = {
        fields,
        date_preset: datePreset,
        level,
    };
    // ⚠️ breakdowns нь combination бүрт нэг мөр буцаана. data[0]-г уншдаг дуудагч
    // breakdowns дамжуулж болохгүй.
    if (breakdowns && breakdowns.length > 0) {
        params.breakdowns = breakdowns.join(',');
    }
    return metaRead<{ data: FacebookCampaignInsight[] }>(`${campaignId}/insights`, accessToken, params, read);
}

// ============ Page / Instagram: нийтлэг ============

export interface GraphInsight {
    name: string;
    period?: string;
    title?: string;
    description?: string;
    values?: Array<{ value?: unknown; end_time?: string }>;
    total_value?: {
        value?: unknown;
        breakdowns?: Array<{ dimension_keys?: string[]; results?: Array<{ dimension_values?: string[]; value?: unknown }> }>;
    };
}

/** Graph-ийн нэг утга: тоо, эсвэл төрлөөрх задаргаа ({ like: 3, love: 1 } → value = нийлбэр). */
export interface InsightNumber { value: number; breakdown: Record<string, number> | null }

/** Тоо эсвэл задаргаа биш бол null — «байхгүй», хэзээ ч 0 гэж таамаглахгүй. */
export function parseInsightValue(raw: unknown): InsightNumber | null {
    if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw, breakdown: null } : null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const entries = Object.entries(raw);
    const breakdown: Record<string, number> = {};
    for (const [key, value] of entries) {
        if (typeof value === 'number' && Number.isFinite(value)) breakdown[key] = value;
    }
    // Хоосон задаргаа ({}) нь Meta-гийн бодит хариу (тухайн төрлийн үйлдэл алга); тоогүй өөр хэлбэр = байхгүй.
    if (entries.length > 0 && Object.keys(breakdown).length === 0) return null;
    return { value: Object.values(breakdown).reduce((total, value) => total + value, 0), breakdown };
}

/**
 * Нэг объектын (Page, нийтлэл, IG аккаунт/media) insights. Хасагдсан/хүчингүй нэг метрик (code 100) бүх
 * дуудлагыг унагадаг тул тэр үед метрик бүрийг тусад нь оролдож, Meta-гийн өгөөгүйг `unavailable`-д
 * бичнэ. Эрх, токен, хурдны хязгаар, объект олдоогүй (100/33) алдаа шууд шидэгдэнэ; метрик бүрээр
 * оролдоод нэг ч метрик ирээгүй бол анхны алдааг шиднэ (метрик биш, хүсэлт өөрөө буруу).
 */
export async function fetchInsightMetrics(
    objectId: string,
    accessToken: string,
    metrics: readonly string[],
    params: Record<string, string>,
    read: MetaReadOptions = {},
): Promise<{ data: GraphInsight[]; unavailable: string[] }> {
    const call = async (names: readonly string[]) => {
        const result = await pageRead<{ data?: GraphInsight[] }>(`${objectId}/insights`, accessToken, { ...params, metric: names.join(',') }, read);
        if (!Array.isArray(result.data)) throw new MetaApiError('Facebook insights-ийн хариу дутуу байна.');
        return result.data.filter(metric => names.includes(metric.name));
    };
    const missing = (data: GraphInsight[], names: readonly string[]) => names.filter(name => !data.some(metric => metric.name === name));
    let batchError: unknown;
    try {
        const data = await call(metrics);
        return { data, unavailable: missing(data, metrics) };
    } catch (error) {
        // 100/33 = объект олдоогүй эсвэл хандах эрхгүй (устгасан Page, буруу ID) — метрикийн асуудал биш.
        if (!isMetaInvalidParamError(error) || (error as MetaApiError).subcode === 33) throw error;
        if (metrics.length === 1) return { data: [], unavailable: [...metrics] };
        batchError = error;
    }
    const data: GraphInsight[] = [];
    const unavailable: string[] = [];
    for (const metric of metrics) {
        try {
            const found = await call([metric]);
            data.push(...found);
            unavailable.push(...missing(found, [metric]));
        } catch (error) {
            if (!isMetaInvalidParamError(error)) throw error;
            unavailable.push(metric);
        }
    }
    if (data.length === 0) throw batchError;
    if (unavailable.length) logger.warn('[Page insights] Meta зарим метрикийг өгсөнгүй', { metrics: unavailable });
    return { data, unavailable };
}

const META_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Meta-гийн Page/IG өдрийн insights Номхон далайн цагаар (America/Los_Angeles) тасардаг: өдөр D-ийн утгын
 * `end_time` = D+1-ийн 00:00 PT. Тиймээс өдөр = (end_time − 1 мс)-ийн PT огноо. УБ-ын өдөр БИШ.
 */
export function metaInsightDay(endTime: string | undefined): string | null {
    const at = endTime ? Date.parse(endTime) : NaN;
    return Number.isFinite(at) ? META_DAY.format(new Date(at - 1)) : null;
}

/** Meta-гийн одоогийн (дуусаагүй) өдөр, PT. */
export function metaInsightToday(now: Date = new Date()): string {
    return META_DAY.format(now);
}

/** YYYY-MM-DD огноог n өдрөөр шилжүүлнэ (цагийн бүсгүй хуанлийн тооцоо). */
export function shiftDay(day: string, days: number): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// ============ Page Info ============

export interface FacebookPageInfo {
    id: string;
    name: string;
    category?: string;
    fan_count?: number;
    followers_count?: number;
    picture?: { data: { url: string } };
    cover?: { source: string };
    about?: string;
    website?: string;
    link?: string;
}

const PAGE_INFO_FIELDS = 'id,name,category,followers_count,fan_count,picture,cover,about,website,link';

export async function getPageInfo(pageId: string, accessToken: string): Promise<FacebookPageInfo> {
    try {
        return await pageRead<FacebookPageInfo>(pageId, accessToken, { fields: PAGE_INFO_FIELDS });
    } catch (error) {
        // Meta Page-ийн like (fan_count)-ийг дагагчаар сольж байгаа — талбар хасагдвал түүнгүйгээр дахин.
        if (!isMetaInvalidParamError(error)) throw error;
        return pageRead<FacebookPageInfo>(pageId, accessToken, { fields: PAGE_INFO_FIELDS.replace(',fan_count', '') });
    }
}

// ============ Page insights (өдрөөр) ============

export interface PageDailyRow { day: string; metric: string; value: number; breakdown: Record<string, number> | null }

/**
 * Page-ийн өдрийн insights [from, to] (Meta-гийн PT өдөр). Өдрийг `end_time`-аар өөрсдөө тооцож, хүрээнээс
 * гадуурх болон дуусаагүй (өнөөдрийн) өдрийг хаяна. Meta-гийн өгөөгүй метрик `unavailable`-д.
 */
export async function fetchPageDailyInsights(
    pageId: string,
    accessToken: string,
    from: string,
    to: string,
    read: MetaReadOptions = {},
): Promise<{ rows: PageDailyRow[]; unavailable: string[] }> {
    // Unix секундээр, нэг өдрөөр өргөн (PT-ийн шилжилтээс үл хамааран бүх өдөр орно); until ирээдүйд гарахгүй.
    const unix = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
    const { data, unavailable } = await fetchInsightMetrics(pageId, accessToken, PAGE_DAILY_METRICS, {
        period: 'day',
        since: String(unix(shiftDay(from, -1))),
        until: String(Math.min(unix(shiftDay(to, 2)), Math.floor(Date.now() / 1000))),
    }, read);
    const today = metaInsightToday();
    const rows: PageDailyRow[] = [];
    const seen = new Set<string>();
    for (const metric of data) {
        if (metric.period && metric.period !== 'day') continue;
        for (const point of metric.values ?? []) {
            const day = metaInsightDay(point.end_time);
            const parsed = parseInsightValue(point.value);
            if (!day || !parsed || day < from || day > to || day >= today || seen.has(`${metric.name}:${day}`)) continue;
            seen.add(`${metric.name}:${day}`);
            rows.push({ day, metric: metric.name, ...parsed });
        }
    }
    return { rows, unavailable };
}

// ============ Posts ============

export interface FacebookPost {
    id: string;
    message?: string;
    story?: string;
    full_picture?: string;
    permalink_url?: string;
    created_time: string;
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
    insights?: { data?: GraphInsight[] };
}

/** Нийтлэл + насан туршийн insights; Meta-гийн өгөөгүй метрик объектод байхгүй (= null). */
export interface PagePost { post: FacebookPost; insights: Partial<Record<string, InsightNumber>> }

const POST_FIELDS = 'id,message,story,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares';

function postInsights(post: FacebookPost): Partial<Record<string, InsightNumber>> {
    const out: Partial<Record<string, InsightNumber>> = {};
    for (const metric of post.insights?.data ?? []) {
        if (!(POST_LIFETIME_METRICS as readonly string[]).includes(metric.name)) continue;
        const parsed = parseInsightValue(metric.values?.[0]?.value);
        if (parsed) out[metric.name] = parsed;
    }
    return out;
}

/**
 * Page-ийн сүүлийн нийтлэлүүд + насан туршийн insights (field expansion, нэг дуудлага). Хүчингүй метрик бүх
 * /posts-ийг унагадаг тул тэр үед эхний нийтлэл дээр метрик бүрийг шалгаад хүчинтэйгээр нь дахин татна.
 * Insights-ийн эрхгүй бол нийтлэлүүдийг insights-гүйгээр буцааж, бүх метрикийг `unavailable` гэнэ.
 */
export async function getPagePosts(
    pageId: string,
    accessToken: string,
    limit: number = 25,
    read: MetaReadOptions = {},
): Promise<{ posts: PagePost[]; unavailable: string[] }> {
    const size = String(Math.min(Math.max(Math.trunc(limit) || 25, 1), 100));
    const load = async (metrics: readonly string[]) => {
        const fields = metrics.length ? `${POST_FIELDS},insights.metric(${metrics.join(',')})` : POST_FIELDS;
        const result = await pageRead<{ data?: FacebookPost[] }>(`${pageId}/posts`, accessToken, { fields, limit: size }, read);
        if (!Array.isArray(result.data)) throw new MetaApiError('Facebook нийтлэлийн хариу дутуу байна.');
        return result.data;
    };
    const wrap = (posts: FacebookPost[]) => posts.map(post => ({ post, insights: postInsights(post) }));
    try {
        return { posts: wrap(await load(POST_LIFETIME_METRICS)), unavailable: [] };
    } catch (error) {
        if (!isMetaInvalidParamError(error) && !isMetaPermissionError(error)) throw error;
        logger.warn('[Page posts] insights-тэй татаж чадсангүй, insights-гүйгээр дахин', { code: (error as MetaApiError).code });
        const posts = await load([]);
        if (isMetaPermissionError(error) || posts.length === 0) return { posts: wrap(posts), unavailable: isMetaPermissionError(error) ? [...POST_LIFETIME_METRICS] : [] };
        let probe: { data: GraphInsight[]; unavailable: string[] };
        try { probe = await fetchInsightMetrics(posts[0].id, accessToken, POST_LIFETIME_METRICS, { period: 'lifetime' }, read); }
        catch (probeError) {
            if (!isMetaInvalidParamError(probeError) && !isMetaPermissionError(probeError)) throw probeError;
            return { posts: wrap(posts), unavailable: [...POST_LIFETIME_METRICS] };
        }
        const valid = POST_LIFETIME_METRICS.filter(metric => !probe.unavailable.includes(metric));
        return { posts: wrap(valid.length ? await load(valid) : posts), unavailable: probe.unavailable };
    }
}

// ============ Publish ============

export interface PublishPostResult {
    id: string;
    post_id?: string;
}

/** Text post нийтлэх (дахин оролдохгүй — давхар нийтлэлээс сэргийлнэ). */
export function publishTextPost(pageId: string, accessToken: string, message: string): Promise<PublishPostResult> {
    return pagePost<PublishPostResult>(`${pageId}/feed`, accessToken, { message });
}

/** Зурагтай post нийтлэх. */
export function publishPhotoPost(pageId: string, accessToken: string, message: string, imageUrl: string): Promise<PublishPostResult> {
    return pagePost<PublishPostResult>(`${pageId}/photos`, accessToken, { message, url: imageUrl });
}

// ============ Instagram ============

export interface InstagramAccount {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    biography?: string;
}

export interface InstagramMedia {
    id: string;
    caption?: string;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
}

export function getInstagramAccount(igId: string, accessToken: string): Promise<InstagramAccount> {
    return pageRead<InstagramAccount>(igId, accessToken, {
        fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography',
    });
}

export async function getInstagramMedia(igId: string, accessToken: string, limit: number = 25): Promise<InstagramMedia[]> {
    const result = await pageRead<{ data?: InstagramMedia[] }>(`${igId}/media`, accessToken, {
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
        limit: String(Math.min(Math.max(Math.trunc(limit) || 25, 1), 100)),
    });
    if (!Array.isArray(result.data)) throw new MetaApiError('Instagram нийтлэлийн хариу дутуу байна.');
    return result.data;
}

export interface InstagramAccountInsights {
    /** Хугацаа (Unix секунд): Meta `since`/`until`. */
    since: number;
    until: number;
    /** Meta-гийн өгөөгүй метрик null. */
    metrics: Record<string, number | null>;
    follows: number | null;
    unfollows: number | null;
    unavailable: string[];
}

const nullMetrics = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, null])) as Record<string, number | null>;
const totalValue = (metric: GraphInsight): number | null => {
    const value = metric.total_value?.value ?? metric.values?.[0]?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/**
 * Instagram аккаунтын сүүлийн `days` өдрийн нийт үзүүлэлт (`metric_type=total_value`). `reach`,
 * `accounts_engaged` нь давхардалгүй хүн тул өдрүүдээр нэмэхгүй — Meta хугацааны дүнг өөрөө өгнө.
 * instagram_manage_insights эрх шаардана.
 */
export async function getInstagramInsights(igId: string, accessToken: string, days: 1 | 7 | 28 = 7): Promise<InstagramAccountInsights> {
    const until = Math.floor(Date.now() / 1000);
    const since = until - days * 86400;
    const range = { period: 'day', metric_type: 'total_value', since: String(since), until: String(until) };
    const { data, unavailable } = await fetchInsightMetrics(igId, accessToken, IG_ACCOUNT_METRICS, range);
    const metrics = nullMetrics(IG_ACCOUNT_METRICS);
    for (const metric of data) metrics[metric.name] = totalValue(metric);

    let follows: number | null = null;
    let unfollows: number | null = null;
    const followData = await fetchInsightMetrics(igId, accessToken, ['follows_and_unfollows'], { ...range, breakdown: 'follow_type' });
    unavailable.push(...followData.unavailable);
    for (const result of followData.data[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
        if (typeof result.value !== 'number' || !Number.isFinite(result.value)) continue;
        if (result.dimension_values?.[0] === 'FOLLOWER') follows = result.value;
        else if (result.dimension_values?.[0] === 'NON_FOLLOWER') unfollows = result.value;
    }
    return { since, until, metrics, follows, unfollows, unavailable };
}

/** Instagram media (post, reel)-ийн насан туршийн үзүүлэлт. Алдаа гарвал бүгд null (жагсаалтыг унагахгүй). */
export async function getInstagramMediaInsights(mediaId: string, accessToken: string): Promise<{ metrics: Record<string, number | null>; unavailable: string[] }> {
    try {
        const { data, unavailable } = await fetchInsightMetrics(mediaId, accessToken, IG_MEDIA_METRICS, {});
        const metrics = nullMetrics(IG_MEDIA_METRICS);
        for (const metric of data) metrics[metric.name] = totalValue(metric);
        return { metrics, unavailable };
    } catch (error) {
        logger.warn('[Instagram media insights] татагдсангүй', { code: error instanceof MetaApiError ? error.code : null });
        return { metrics: nullMetrics(IG_MEDIA_METRICS), unavailable: [...IG_MEDIA_METRICS] };
    }
}

// ============ Webhook subscription ============

export const DEFAULT_PAGE_SUBSCRIBE_FIELDS = [
    'messages',
    'messaging_postbacks',
    'message_reactions',
    'messaging_optins',
    'feed',
    // Facebook Lead Ads — leads_retrieval эрх шаардана (lib/facebook/leadgen).
    'leadgen',
];

export interface SubscribeResult {
    success: boolean;
    error?: string;
    /** `leadgen` талбар subscribe хийгдсэн эсэх. */
    leadgen: boolean;
    /** Зөвхөн leadgen унасан (DM-ийн талбарууд subscribe хийгдсэн) үеийн тайлбар. */
    leadgenError?: string;
}

const LEADGEN_SUBSCRIBE_ERROR = 'Lead Ads (leadgen) webhook идэвхжсэнгүй — leads_retrieval эрхтэйгээр Facebook Page-ээ дахин холбоно уу.';

async function postSubscribedApps(pageId: string, pageAccessToken: string, fields: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const json = await pagePost<{ success?: boolean }>(`${pageId}/subscribed_apps`, pageAccessToken, { subscribed_fields: fields.join(',') });
        return { success: json.success !== false };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('subscribePageToApp failed', { pageId, fields: fields.join(','), code: error instanceof MetaApiError ? error.code : null, error: message });
        return { success: false, error: message };
    }
}

/**
 * Page-ийг app-ийн webhook-д subscribe хийнэ (POST /{page-id}/subscribed_apps). Idempotent. Хэзээ ч throw
 * хийхгүй (Page холболтыг блоклохгүй). pages_manage_metadata эрх шаардана; `leadgen` нь leads_retrieval
 * шаарддаг бөгөөд эрхгүй бол Meta бүх хүсэлтийг унагадаг тул DM-ийн талбаруудыг leadgen-гүйгээр дахин
 * subscribe хийж, leadgen-ийн алдааг тусад нь буцаана.
 */
export async function subscribePageToApp(
    pageId: string,
    pageAccessToken: string,
    fields: string[] = DEFAULT_PAGE_SUBSCRIBE_FIELDS
): Promise<SubscribeResult> {
    const all = await postSubscribedApps(pageId, pageAccessToken, fields);
    const wantsLeadgen = fields.includes('leadgen');
    if (all.success || !wantsLeadgen) return { ...all, leadgen: all.success && wantsLeadgen };
    const rest = fields.filter(field => field !== 'leadgen');
    if (rest.length === 0) return { success: false, error: all.error, leadgen: false, leadgenError: LEADGEN_SUBSCRIBE_ERROR };
    const withoutLeadgen = await postSubscribedApps(pageId, pageAccessToken, rest);
    return withoutLeadgen.success
        ? { success: true, leadgen: false, leadgenError: LEADGEN_SUBSCRIBE_ERROR }
        : { success: false, error: withoutLeadgen.error, leadgen: false, leadgenError: LEADGEN_SUBSCRIBE_ERROR };
}
