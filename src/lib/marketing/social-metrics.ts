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
    // Татаж хадгална, гэхдээ харуулахгүй: Meta Elysium-ийн бүх өдөрт 0 буцаадаг (2026-10-25, 42 өдөр; хуудас
    // үзсэн нь өдөрт 94–1209). Постын давхардалгүй хүрэлттэй адил — 0 нь бодит тоо биш (social-week.ts).
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

/**
 * Нийтлэлийн насан туршийн (lifetime) метрик. `post_total_media_view_unique`-ийг (давхардалгүй үзсэн хүн) асуухгүй:
 * Meta бүх постод 0 гэж буцаадаг (2026-10-25, Elysium-ийн 330 мөр бүгд 0) — бодит тоо биш тул хадгалахгүй, харуулахгүй.
 */
export const POST_LIFETIME_METRICS = [
    'post_media_view',
    'post_clicks',
    'post_reactions_by_type_total',
] as const;
export type PostLifetimeMetric = typeof POST_LIFETIME_METRICS[number];

export const POST_METRIC_INFO: Record<PostLifetimeMetric, SocialMetricInfo> = {
    post_media_view: { label: 'Үзэлт', kind: 'latest' },
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

/**
 * Instagram аккаунтын дагалт: `follows_and_unfollows` (`breakdown=follow_type`, `metric_type=total_value`).
 * Задаргааны FOLLOWER = дагасан, NON_FOLLOWER = дагахаа больсон (эсвэл Instagram-аас гарсан).
 */
export const IG_FOLLOWS_METRIC = 'follows_and_unfollows';
export const IG_FOLLOW_TYPES = { FOLLOWER: 'follows', NON_FOLLOWER: 'unfollows' } as const;

/**
 * Hub-д хадгалах Instagram аккаунтын өдрийн мөр (`social_insights_daily`: platform 'instagram', object_type 'page',
 * page_id = object_id = IG аккаунтын ID, Meta-гийн Номхон далайн цагийн өдөр): аккаунтын total_value метрик
 * (өдөр бүрт нэг дуудлага), `follows_and_unfollows`-ийн задаргаа (`follows`, `unfollows`) ба дагагчийн тоо
 * (`followers_count` — аккаунтын талбар, синк хийсэн Meta-гийн өдрийн төлөв).
 */
export const IG_DAILY_METRICS = [...IG_ACCOUNT_METRICS, 'follows', 'unfollows', 'followers_count'] as const;
export type IgDailyMetric = typeof IG_DAILY_METRICS[number];

export const IG_DAILY_METRIC_INFO: Record<IgDailyMetric, SocialMetricInfo> = {
    ...IG_ACCOUNT_METRIC_INFO,
    follows: { label: 'Шинэ дагагч', kind: 'sum' },
    unfollows: { label: 'Дагахаа больсон', kind: 'sum' },
    followers_count: { label: 'Дагагч', kind: 'latest' },
};

/** Instagram media (post, reel) метрик. `saved` нь media дээрх нэр (аккаунт дээр `saves`). */
export const IG_MEDIA_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'] as const;
export type IgMediaMetric = typeof IG_MEDIA_METRICS[number];

/**
 * Media-ийн насан туршийн (lifetime) утга — синк бүр Улаанбаатарын өдрөөр мөр нэмдэг тул хамгийн сүүлийнх.
 * Facebook постоос ялгаатай нь IG media-ийн `reach` бодит давхардалгүй хүн (Meta 0 гэж буцаадаггүй).
 */
export const IG_MEDIA_METRIC_INFO: Record<IgMediaMetric, SocialMetricInfo> = {
    views: { label: 'Үзэлт', kind: 'latest' },
    reach: { label: 'Хүрсэн хүн', kind: 'latest' },
    likes: { label: 'Like', kind: 'latest' },
    comments: { label: 'Сэтгэгдэл', kind: 'latest' },
    shares: { label: 'Хуваалцсан', kind: 'latest' },
    saved: { label: 'Хадгалсан', kind: 'latest' },
    total_interactions: { label: 'Нийт оролцоо', kind: 'latest' },
};

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

/**
 * Долоо хоногийн «N/7 өдрийн өгөгдөл»: нийлбэр (`sum`) метрикийн хамгийн их өдрийн тоо. Дагагч зэрэг төлөв (`latest`)
 * синк хийсэн, дуусаагүй Meta-гийн өдрийнх байж болох тул тоолохгүй — тэгвэл дутуу долоо хоног бүтэн мэт харагдана.
 */
export function weekCoverageDays(metrics: readonly { kind: SocialMetricKind; days: number }[]): number {
    return Math.max(0, ...metrics.filter(metric => metric.kind === 'sum').map(metric => metric.days));
}

/**
 * Харьцуулах (өмнөх) талын өгөгдөлтэй өдөр харьцуулсан өдрөөс цөөн бол «3/7 өдөр» — хэсэгчилсэн нийлбэрийг бүтэн
 * хугацааны дүн мэт харуулахгүй (өөрчлөлтийг ч тооцдоггүй). Төлөв (`latest`) метрикт хамаарахгүй.
 */
export function previousCoverageNote(metric: { kind: SocialMetricKind; previous: number | null; previousDays?: number; days: number }): string | null {
    if (metric.kind === 'latest' || metric.previous === null || metric.previousDays === undefined || metric.previousDays >= metric.days) return null;
    return `${metric.previousDays}/${metric.days} өдөр`;
}
