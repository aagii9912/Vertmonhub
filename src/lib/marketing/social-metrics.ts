/**
 * Facebook Page / Instagram органик үзүүлэлтийн каталог (Graph v26). Client-safe: серверийн татагч
 * (`lib/facebook/marketing-api.ts`) ба UI хоёулаа эндээс уншина. Хасагдсан метрик
 * (page_impressions*, post_impressions*, IG impressions/plays/profile_views) энд байхгүй.
 * docs/features/META-PAGE-INSIGHTS-2026-10-05.md
 */

/**
 * Хугацааны дүнг яаж гаргах вэ:
 *  - sum: өдрүүдийг нэмж болно (үзэлт, оролцоо);
 *  - unique: өдрийн давхардалгүй хүн — өдрүүдийг НЭМЭХГҮЙ, зөвхөн өдрөөр нь харуулна;
 *  - latest: тухайн өдрийн нийт төлөв (дагагчийн тоо) — хамгийн сүүлийн өдрийн утга.
 */
export type SocialMetricKind = 'sum' | 'unique' | 'latest';
export interface SocialMetricInfo { label: string; kind: SocialMetricKind }

/** Page-ийн өдрийн метрик (`/{page-id}/insights?period=day`). */
export const PAGE_DAILY_METRICS = [
    'page_media_view',
    'page_total_media_view_unique',
    'page_post_engagements',
    'page_follows',
    'page_daily_follows_unique',
    'page_views_total',
    'page_total_actions',
    'page_video_views',
] as const;
export type PageDailyMetric = typeof PAGE_DAILY_METRICS[number];

export const PAGE_METRIC_INFO: Record<PageDailyMetric, SocialMetricInfo> = {
    page_media_view: { label: 'Үзэлт', kind: 'sum' },
    page_total_media_view_unique: { label: 'Үзсэн хүн', kind: 'unique' },
    page_post_engagements: { label: 'Нийтлэлийн оролцоо', kind: 'sum' },
    page_follows: { label: 'Дагагч', kind: 'latest' },
    page_daily_follows_unique: { label: 'Шинэ дагагч', kind: 'sum' },
    page_views_total: { label: 'Хуудас үзсэн', kind: 'sum' },
    page_total_actions: { label: 'Товч, холбоос дарсан', kind: 'sum' },
    page_video_views: { label: 'Видео үзэлт', kind: 'sum' },
};

/** Нийтлэлийн насан туршийн (lifetime) метрик. */
export const POST_LIFETIME_METRICS = [
    'post_media_view',
    'post_total_media_view_unique',
    'post_clicks',
    'post_reactions_by_type_total',
] as const;
export type PostLifetimeMetric = typeof POST_LIFETIME_METRICS[number];

export const POST_METRIC_INFO: Record<PostLifetimeMetric, SocialMetricInfo> = {
    post_media_view: { label: 'Үзэлт', kind: 'latest' },
    post_total_media_view_unique: { label: 'Үзсэн хүн', kind: 'latest' },
    post_clicks: { label: 'Товшилт', kind: 'latest' },
    post_reactions_by_type_total: { label: 'Reaction', kind: 'latest' },
};

/** Instagram аккаунтын метрик (`metric_type=total_value`, `period=day`, since/until хугацаагаар). */
export const IG_ACCOUNT_METRICS = [
    'views',
    'reach',
    'accounts_engaged',
    'total_interactions',
    'likes',
    'comments',
    'shares',
    'saves',
    'profile_links_taps',
] as const;
export type IgAccountMetric = typeof IG_ACCOUNT_METRICS[number];

export const IG_ACCOUNT_METRIC_INFO: Record<IgAccountMetric, SocialMetricInfo> = {
    views: { label: 'Үзэлт', kind: 'sum' },
    reach: { label: 'Хүрсэн хүн', kind: 'unique' },
    accounts_engaged: { label: 'Оролцсон аккаунт', kind: 'unique' },
    total_interactions: { label: 'Нийт оролцоо', kind: 'sum' },
    likes: { label: 'Like', kind: 'sum' },
    comments: { label: 'Сэтгэгдэл', kind: 'sum' },
    shares: { label: 'Хуваалцсан', kind: 'sum' },
    saves: { label: 'Хадгалсан', kind: 'sum' },
    profile_links_taps: { label: 'Профайлын холбоос дарсан', kind: 'sum' },
};

/** Instagram media (post, reel) метрик. `saved` нь media дээрх нэр (аккаунт дээр `saves`). */
export const IG_MEDIA_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'] as const;
export type IgMediaMetric = typeof IG_MEDIA_METRICS[number];

export interface DailyMetricValue { day: string; value: number | null }

/**
 * Өдрийн мөрүүдийг хугацааны нэг тоо болгоно. Өгөгдөл байхгүй бол null («байхгүй»), хэзээ ч 0 гэж
 * таамаглахгүй. `unique` метрик өдрүүдийг нэмэхгүй тул хамгийн сүүлийн өдрийн утгыг өгнө.
 */
export function summarizeDaily(values: DailyMetricValue[], kind: SocialMetricKind): { value: number | null; day: string | null; days: number } {
    const known = values.filter((v): v is { day: string; value: number } => typeof v.value === 'number' && Number.isFinite(v.value))
        .sort((a, b) => a.day.localeCompare(b.day));
    if (known.length === 0) return { value: null, day: null, days: 0 };
    const last = known[known.length - 1];
    if (kind !== 'sum') return { value: last.value, day: last.day, days: known.length };
    return { value: known.reduce((total, v) => total + v.value, 0), day: last.day, days: known.length };
}
