/**
 * Facebook Marketing API - Graph API v21.0 utility functions
 * Marketing хэсэгт ашиглагдах Facebook Page мэдээллүүд
 */

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
            values: Array<{ value: number }>;
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
    const fields = 'id,message,story,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares';
    const url = `${GRAPH_API_BASE}/${pageId}/posts?fields=${fields}&limit=${limit}&access_token=${accessToken}`;
    return fbFetch<{ data: FacebookPost[]; paging?: { next?: string; previous?: string } }>(url);
}

/**
 * Нэг post-ийн дэлгэрэнгүй мэдээлэл авах
 */
export async function getPostDetails(
    postId: string,
    accessToken: string
): Promise<FacebookPost> {
    const fields = 'id,message,story,full_picture,permalink_url,created_time,likes.summary(true),comments.summary(true),shares';
    const url = `${GRAPH_API_BASE}/${postId}?fields=${fields}&access_token=${accessToken}`;
    return fbFetch<FacebookPost>(url);
}

// ============ Insights ============

/**
 * Page insights авах (28 хоногийн)
 */
export async function getPageInsights(
    pageId: string,
    accessToken: string,
    metrics: string[] = [
        'page_impressions',
        'page_impressions_unique',
        'page_engaged_users',
        'page_post_engagements',
        'page_fan_adds',
        'page_fan_removes',
        'page_views_total',
    ],
    period: 'day' | 'week' | 'days_28' = 'day'
): Promise<{ data: PageInsightMetric[] }> {
    const metricStr = metrics.join(',');
    const url = `${GRAPH_API_BASE}/${pageId}/insights?metric=${metricStr}&period=${period}&access_token=${accessToken}`;
    return fbFetch<{ data: PageInsightMetric[] }>(url);
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
