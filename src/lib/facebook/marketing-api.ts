/**
 * Facebook Marketing API - Graph API v21.0 utility functions
 * Marketing хэсэгт ашиглагдах Facebook Page мэдээллүүд
 */

import { appsecretProof } from '@/lib/facebook/messenger';
import { logger } from '@/lib/utils/logger';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// ============ Types ============

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

export interface FacebookPost {
    id: string;
    message?: string;
    story?: string;
    full_picture?: string;
    permalink_url?: string;
    created_time: string;
    likes?: { summary: { total_count: number } };
    comments?: { summary: { total_count: number } };
    shares?: { count: number };
    insights?: {
        data: Array<{
            name: string;
            values: Array<{ value: number | Record<string, number> }>;
        }>;
    };
}

export interface PageInsightMetric {
    name: string;
    period: string;
    title: string;
    description: string;
    values: Array<{
        value: number | Record<string, number>;
        end_time: string;
    }>;
}

export interface PublishPostResult {
    id: string;
    post_id?: string;
}

export interface FacebookApiError {
    error: {
        message: string;
        type: string;
        code: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

// ============ Helpers ============

async function fbFetch<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        const fbError = data as FacebookApiError;
        throw new Error(
            `Facebook API Error [${fbError.error.code}]: ${fbError.error.message}`
        );
    }

    return data as T;
}

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
    const url = `${GRAPH_API_BASE}/me/adaccounts?fields=${fields}&access_token=${accessToken}`;
    return fbFetch<{ data: FacebookAdAccount[] }>(url);
}

/**
 * Ad account-ийн campaign-уудыг авах
 */
export async function fetchAdAccountCampaigns(
    adAccountId: string,
    accessToken: string,
    limit: number = 50
): Promise<{ data: FacebookAdCampaign[] }> {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time';
    const url = `${GRAPH_API_BASE}/${accountId}/campaigns?fields=${fields}&limit=${limit}&access_token=${accessToken}`;
    return fbFetch<{ data: FacebookAdCampaign[] }>(url);
}

/**
 * Кампанит ажлын insights авах (date_preset: today, yesterday, last_7d, last_30d, lifetime)
 */
export async function fetchCampaignInsights(
    campaignId: string,
    accessToken: string,
    datePreset: string = 'last_30d',
    level: 'campaign' | 'adset' | 'ad' = 'campaign',
    breakdowns?: string[]
): Promise<{ data: FacebookCampaignInsight[] }> {
    // Level-ийн дагуу нэмэлт ID/нэр талбарууд
    const levelFields =
        level === 'ad'
            ? ',adset_id,adset_name,ad_id,ad_name'
            : level === 'adset'
            ? ',adset_id,adset_name'
            : '';
    const fields = 'spend,impressions,clicks,ctr,cpc,cpm,reach,actions,date_start,date_stop,campaign_name' + levelFields;
    const params = new URLSearchParams({
        fields,
        date_preset: datePreset,
        level,
        access_token: accessToken,
    });
    // ⚠️ breakdowns нь combination бүрт нэг мөр буцаана. data[0]-г уншдаг дуудагч
    // breakdowns дамжуулж болохгүй.
    if (breakdowns && breakdowns.length > 0) {
        params.set('breakdowns', breakdowns.join(','));
    }
    const url = `${GRAPH_API_BASE}/${campaignId}/insights?${params.toString()}`;
    return fbFetch<{ data: FacebookCampaignInsight[] }>(url);
}

// ============ Page Info ============

/**
 * Page-ийн ерөнхий мэдээлэл авах
 */
export async function getPageInfo(
    pageId: string,
    accessToken: string
): Promise<FacebookPageInfo> {
    const fields = 'id,name,category,fan_count,followers_count,picture,cover,about,website,link';
    const url = `${GRAPH_API_BASE}/${pageId}?fields=${fields}&access_token=${accessToken}`;
    return fbFetch<FacebookPageInfo>(url);
}

// ============ Posts ============

/**
 * Page-ийн нийтлэлүүдийг авах
 */
export async function getPagePosts(
    pageId: string,
    accessToken: string,
    limit: number = 25
): Promise<{ data: FacebookPost[]; paging?: { next?: string; previous?: string } }> {
    const baseFields = 'id,message,story,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares';
    const withInsights = `${baseFields},insights.metric(post_impressions_unique,post_clicks,post_reactions_by_type_total)`;
    const buildUrl = (f: string) => `${GRAPH_API_BASE}/${pageId}/posts?fields=${f}&limit=${limit}&access_token=${accessToken}`;
    type R = { data: FacebookPost[]; paging?: { next?: string; previous?: string } };
    try {
        return await fbFetch<R>(buildUrl(withInsights));
    } catch (err) {
        // insights метрик буруу/устгагдсан бол бүхэл /posts унадаг — insights-гүйгээр
        // дахин татаж нийтлэлийн жагсаалт хэзээ ч хоосрохгүй болгоно (fail-safe).
        logger.warn('getPagePosts with insights failed, retrying without insights', { error: String(err) });
        return await fbFetch<R>(buildUrl(baseFields));
    }
}

/**
 * Нэг post-ийн дэлгэрэнгүй мэдээлэл авах
 */
export async function getPostDetails(
    postId: string,
    accessToken: string
): Promise<FacebookPost> {
    const baseFields = 'id,message,story,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares';
    const withInsights = `${baseFields},insights.metric(post_impressions_unique,post_clicks,post_reactions_by_type_total)`;
    const buildUrl = (f: string) => `${GRAPH_API_BASE}/${postId}?fields=${f}&access_token=${accessToken}`;
    try {
        return await fbFetch<FacebookPost>(buildUrl(withInsights));
    } catch {
        return await fbFetch<FacebookPost>(buildUrl(baseFields));
    }
}

// ============ Insights ============

/**
 * Page insights авах (28 хоногийн)
 */
export async function getPageInsights(
    pageId: string,
    accessToken: string,
    // ⚠️ Graph v21-д page_impressions, page_engaged_users, page_fan_adds,
    // page_fan_removes зэрэг нь DEPRECATED. Нэг буруу метрик бүхэл дуудлагыг
    // унагадаг тул зөвхөн хүчинтэй метрик ашиглана.
    metrics: string[] = [
        'page_impressions_unique',
        'page_post_engagements',
        'page_views_total',
        'page_daily_follows_unique',
        'page_total_actions',
    ],
    period: 'day' | 'week' | 'days_28' = 'day'
): Promise<{ data: PageInsightMetric[] }> {
    const fetchMetrics = async (ms: string[]): Promise<PageInsightMetric[]> => {
        const url = `${GRAPH_API_BASE}/${pageId}/insights?metric=${ms.join(',')}&period=${period}&access_token=${accessToken}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        return (json.data || []) as PageInsightMetric[];
    };
    try {
        // Хурдан зам: бүх метрикийг нэг дуудлагаар.
        return { data: await fetchMetrics(metrics) };
    } catch (err) {
        // Нэг буруу/устгагдсан метрик бүхэл батчийг унагасан байж магадгүй — метрик
        // бүрийг тусад нь оролдож, хүчинтэйг нь л цуглуулна (fail-safe). Ингэснээр
        // ирээдүйд Meta өөр метрик уствал бусад нь хэвээр ажиллана.
        logger.warn('getPageInsights batch failed, retrying per-metric', { error: String(err) });
        const data: PageInsightMetric[] = [];
        for (const m of metrics) {
            try {
                data.push(...(await fetchMetrics([m])));
            } catch {
                logger.warn('getPageInsights metric skipped (invalid/unavailable)', { metric: m });
            }
        }
        return { data };
    }
}

// ============ Publish ============

/**
 * Text post нийтлэх
 */
export async function publishTextPost(
    pageId: string,
    accessToken: string,
    message: string
): Promise<PublishPostResult> {
    const url = `${GRAPH_API_BASE}/${pageId}/feed`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            access_token: accessToken,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Facebook API Error: ${data.error.message}`);
    }
    return data;
}

/**
 * Зурагтай post нийтлэх
 */
export async function publishPhotoPost(
    pageId: string,
    accessToken: string,
    message: string,
    imageUrl: string
): Promise<PublishPostResult> {
    const url = `${GRAPH_API_BASE}/${pageId}/photos`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            url: imageUrl,
            access_token: accessToken,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Facebook API Error: ${data.error.message}`);
    }
    return data;
}

// ============ Page Messaging Insights ============

/**
 * Messenger харилцааны хэмжээний метрик. pages_messaging эрх шаардана. Эдгээрийг
 * default getPageInsights массивт нэмбэл эрхгүй shop-уудад БҮХ дуудлага унах тул
 * ТУСДАА, isolated helper болгов. page_messages_new_conversations_unique нь v21-д
 * deprecated — ихэнх Page-д хоосон буцаана.
 */
export async function getPageMessagingInsights(
    pageId: string,
    accessToken: string
): Promise<Record<string, number>> {
    try {
        const metrics = 'page_messages_total_messaging_connections,page_messages_new_conversations_unique';
        const url = `${GRAPH_API_BASE}/${pageId}/insights?metric=${metrics}&period=day&access_token=${accessToken}`;
        const res = await fetch(url);
        const json: { data?: PageInsightMetric[]; error?: { message: string } } = await res.json();
        if (json.error) throw new Error(json.error.message);
        const out: Record<string, number> = {};
        for (const m of json.data || []) {
            const v = m.values?.[m.values.length - 1]?.value;
            if (typeof v === 'number') out[m.name] = v;
        }
        return out;
    } catch (error) {
        logger.warn('getPageMessagingInsights failed', { error: String(error) });
        return {};
    }
}

// ============ Instagram Insights ============

export interface InstagramAccountInsights {
    reach?: number;
    impressions?: number;
    follower_count?: number;
    profile_views?: number;
    accounts_engaged?: number;
    partial?: boolean; // зарим метрик авч чадаагүй (deprecated гэх мэт)
}

interface IgInsightResponse {
    data?: Array<{
        name: string;
        period?: string;
        values?: Array<{ value: number; end_time?: string }>;
        total_value?: { value: number };
    }>;
    error?: { message: string; code: number };
}

/**
 * Instagram business account insights. v21-д хоёр төрлийн метрик нэг дуудлагад
 * багтахгүй тул 2 тусдаа fetch:
 *   1) time-series: reach, impressions, follower_count (period-based, values[])
 *   2) total_value: profile_views, accounts_engaged (metric_type=total_value)
 * impressions нь 2024-07-02-оос хойш үүссэн account-д deprecated — тусдаа
 * try/catch-аар бүрхэж partial flag тавина. instagram_manage_insights эрх шаардана.
 */
export async function getInstagramInsights(
    igId: string,
    accessToken: string,
    period: 'day' | 'week' | 'days_28' = 'day'
): Promise<InstagramAccountInsights> {
    const result: InstagramAccountInsights = {};
    const setNum = (k: string, v: number) => {
        (result as unknown as Record<string, number>)[k] = v;
    };

    // Family 1: time-series. follower_count зөвхөн period=day дээр хүчинтэй.
    const tsMetrics = period === 'day' ? ['reach', 'impressions', 'follower_count'] : ['reach', 'impressions'];
    try {
        const url = `${GRAPH_API_BASE}/${igId}/insights?metric=${tsMetrics.join(',')}&period=${period}&access_token=${accessToken}`;
        const res = await fetch(url);
        const json: IgInsightResponse = await res.json();
        if (json.error) throw new Error(json.error.message);
        for (const m of json.data || []) {
            const v = m.values?.[m.values.length - 1]?.value;
            if (typeof v === 'number') setNum(m.name, v);
        }
    } catch (error) {
        // impressions deprecated байж болзошгүй — reach-ийг дангаар нь оролдоно
        result.partial = true;
        try {
            const url = `${GRAPH_API_BASE}/${igId}/insights?metric=reach&period=${period}&access_token=${accessToken}`;
            const res = await fetch(url);
            const json: IgInsightResponse = await res.json();
            const v = json.data?.[0]?.values?.[0]?.value;
            if (typeof v === 'number') setNum('reach', v);
        } catch {
            // орхино
        }
        logger.warn('getInstagramInsights time-series partial', { error: String(error) });
    }

    // Family 2: total_value
    try {
        const url = `${GRAPH_API_BASE}/${igId}/insights?metric=profile_views,accounts_engaged&metric_type=total_value&period=day&access_token=${accessToken}`;
        const res = await fetch(url);
        const json: IgInsightResponse = await res.json();
        if (json.error) throw new Error(json.error.message);
        for (const m of json.data || []) {
            const v = m.total_value?.value;
            if (typeof v === 'number') setNum(m.name, v);
        }
    } catch (error) {
        result.partial = true;
        logger.warn('getInstagramInsights total_value partial', { error: String(error) });
    }

    return result;
}

export interface InstagramMediaInsights {
    reach?: number;
    saved?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    total_interactions?: number;
    plays?: number;
    partial?: boolean;
}

/**
 * Instagram media (post/reel) insights. media_type-аас хамаарч хүчинтэй метрик
 * өөр: VIDEO/REELS дээр plays нэмэгдэнэ (legacy video_views БИШ). impressions нь
 * media дээр deprecated тул оруулахгүй.
 */
export async function getInstagramMediaInsights(
    mediaId: string,
    accessToken: string,
    mediaType?: string
): Promise<InstagramMediaInsights> {
    const base = ['reach', 'saved', 'likes', 'comments', 'shares', 'total_interactions'];
    const isVideo = mediaType === 'VIDEO' || mediaType === 'REELS';
    const metrics = isVideo ? [...base, 'plays'] : base;
    try {
        const url = `${GRAPH_API_BASE}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${accessToken}`;
        const res = await fetch(url);
        const json: IgInsightResponse = await res.json();
        if (json.error) throw new Error(json.error.message);
        const out: InstagramMediaInsights = {};
        for (const m of json.data || []) {
            const v = m.values?.[0]?.value;
            if (typeof v === 'number') (out as unknown as Record<string, number>)[m.name] = v;
        }
        return out;
    } catch (error) {
        logger.warn('getInstagramMediaInsights failed', { mediaId, error: String(error) });
        return { partial: true };
    }
}

// ============ Webhook subscription ============

export const DEFAULT_PAGE_SUBSCRIBE_FIELDS = [
    'messages',
    'messaging_postbacks',
    'message_reactions',
    'messaging_optins',
    'feed',
];

export interface SubscribeResult {
    success: boolean;
    error?: string;
}

/**
 * Page-ийг app-ийн webhook-д subscribe хийнэ (POST /{page-id}/subscribed_apps).
 * Idempotent — дахин дуудахад асуудалгүй. Хэзээ ч throw хийхгүй (Page холболтыг
 * блоклохгүй). pages_manage_metadata эрх шаардана.
 */
export async function subscribePageToApp(
    pageId: string,
    pageAccessToken: string,
    fields: string[] = DEFAULT_PAGE_SUBSCRIBE_FIELDS
): Promise<SubscribeResult> {
    try {
        const params = new URLSearchParams({
            subscribed_fields: fields.join(','),
            access_token: pageAccessToken,
        });
        const proof = appsecretProof(pageAccessToken);
        if (proof) params.set('appsecret_proof', proof);
        const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`;
        const res = await fetch(url, { method: 'POST' });
        const json = await res.json();
        if (json.error) {
            logger.warn('subscribePageToApp error', { pageId, error: json.error.message });
            return { success: false, error: json.error.message };
        }
        return { success: json.success !== false };
    } catch (error) {
        logger.warn('subscribePageToApp failed', { pageId, error: String(error) });
        return { success: false, error: String(error) };
    }
}

/**
 * Page-ийн идэвхтэй subscribed_apps жагсаалт (баталгаажуулалт / health endpoint-д).
 */
export async function getPageSubscribedApps(
    pageId: string,
    pageAccessToken: string
): Promise<Array<{ id?: string; name?: string; subscribed_fields?: string[] }>> {
    try {
        const params = new URLSearchParams({ access_token: pageAccessToken });
        const proof = appsecretProof(pageAccessToken);
        if (proof) params.set('appsecret_proof', proof);
        const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.error) return [];
        return json.data || [];
    } catch {
        return [];
    }
}
