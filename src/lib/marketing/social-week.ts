import type { SupabaseClient } from '@supabase/supabase-js';
import { ubDayRange } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { PAGE_DAILY_METRICS, PAGE_METRIC_INFO, summarizeDaily, type DailyMetricValue, type PageDailyMetric, type SocialMetricKind } from './social-metrics';

/**
 * Лхагвагийн хурлын маркетингийн хэсэгт Facebook хуудасны долоо хоногийн органик үзүүлэлт: хадгалсан
 * `social_insights_daily` (cron/синк, Meta-гийн Номхон далайн цагийн өдөр) болон тухайн долоо хоногт
 * нийтэлсэн постууд (`social_posts`, Улаанбаатарын өдөр). Лид, гэрээтэй холбохгүй — маркетингийн
 * контентын хүрээ, оролцоо. Өгөгдөлгүй метрик null («—»), хэзээ ч 0 гэж таамаглахгүй.
 */
export interface SocialWeekRange { from: string; to: string }

/** Слайд, хуудсанд харуулах дараалал. `unique` метрикийг өдрүүдээр нэмж болохгүй тул энд оруулаагүй. */
export const SOCIAL_WEEK_METRICS = [
    'page_media_view',
    'page_post_engagements',
    'page_daily_follows_unique',
    'page_follows',
    'page_views_total',
    'page_total_actions',
    'page_video_views',
] as const satisfies readonly PageDailyMetric[];

/**
 * Юутай харьцуулсан бэ: бүтэн долоо хоног; долоо хоног дутуу бол өмнөх долоо хоногийн мөн өдрүүд
 * (хурлын өглөө Meta-гийн Мягмар гараг дуусаагүй байдаг); дагагч зэрэг төлөвийг 7 хоногийн өмнөх өдөртэй.
 */
export type SocialComparison = 'week' | 'same-days' | 'week-ago';

export interface SocialWeekMetric {
    metric: PageDailyMetric;
    label: string;
    kind: SocialMetricKind;
    value: number | null;
    /** Харьцуулах утга (`comparison`-ийн дагуу). */
    previous: number | null;
    comparison: SocialComparison;
    /** Утгын сүүлийн өдөр (`latest` метрикт «…-ны байдлаар»). */
    day: string | null;
    /** Өгөгдөлтэй өдрийн тоо. */
    days: number;
    /** Харьцуулах хоёр тал адил тооны өдөртэй үед л өөрчлөлт; бусад үед null. */
    delta: number | null;
    deltaPct: number | null;
}

/** Постын тоо нь сүүлийн синкийн байдлаарх нийт (lifetime) дүн. */
export interface SocialWeekPost {
    id: string;
    content: string | null;
    publishedAt: string | null;
    views: number | null;
    clicks: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    /** Үзэлт, товшилтыг хадгалсан өдөр. */
    asOf: string | null;
}

export interface SocialWeek {
    page: { id: string; name: string | null } | null;
    range: SocialWeekRange;
    previousRange: SocialWeekRange;
    /** Хамгийн сүүлд амжилттай синк хийсэн Meta-гийн өдөр. */
    syncedTo: string | null;
    /** Тайлант долоо хоногийн өдрийн тоо (7). */
    rangeDays: number;
    metrics: SocialWeekMetric[];
    /** Тайлант долоо хоногт нийтэлсэн постууд, үзэлтээр эрэмбэлсэн. */
    posts: SocialWeekPost[];
}

const DAY_MS = 86_400_000;
const daysIn = (range: SocialWeekRange) => Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS) + 1;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export interface SocialDailyRow { day: string; metric: string; value: number | null }

/** Цэвэр: өдрийн мөрүүд → долоо хоногийн метрикүүд. Тест ба loader хоёулаа ашиглана. */
export function summarizeSocialWeek(rows: SocialDailyRow[], range: SocialWeekRange, previousRange: SocialWeekRange): SocialWeekMetric[] {
    const full = daysIn(range);
    const series = (metric: string, keep: (day: string) => boolean): DailyMetricValue[] => rows
        .filter(row => row.metric === metric && keep(row.day))
        .map(row => ({ day: row.day, value: row.value }));
    return SOCIAL_WEEK_METRICS.map(metric => {
        const info = PAGE_METRIC_INFO[metric];
        const currentRows = series(metric, day => day >= range.from && day <= range.to);
        const current = summarizeDaily(currentRows, info.kind);
        let comparison: SocialComparison;
        let previousRows: DailyMetricValue[];
        if (info.kind === 'latest') {
            comparison = 'week-ago';
            previousRows = current.day ? series(metric, day => day === shift(current.day!, -7)) : [];
        } else if (current.days === full) {
            comparison = 'week';
            previousRows = series(metric, day => day >= previousRange.from && day <= previousRange.to);
        } else {
            comparison = 'same-days';
            const known = new Set(currentRows.filter(row => row.value !== null).map(row => shift(row.day, -7)));
            previousRows = series(metric, day => known.has(day));
        }
        const previous = summarizeDaily(previousRows, info.kind);
        const expected = info.kind === 'latest' ? 1 : current.days;
        const delta = current.value !== null && previous.value !== null && current.days > 0 && previous.days === expected ? current.value - previous.value : null;
        return {
            metric, label: info.label, kind: info.kind,
            value: current.value, previous: previous.value, comparison, day: current.day, days: current.days,
            delta, deltaPct: delta !== null && previous.value ? Math.round(delta / previous.value * 1000) / 10 : null,
        };
    });
}

const POST_METRICS = { views: 'post_media_view', clicks: 'post_clicks' } as const;

/** Хуудас холбогдоогүй бол `page: null`, метрик хоосон. Алдааг дуудагч руу шиднэ. */
export async function loadSocialWeek(db: SupabaseClient, shopId: string, range: SocialWeekRange, previousRange: SocialWeekRange): Promise<SocialWeek> {
    const empty: SocialWeek = { page: null, range, previousRange, syncedTo: null, rangeDays: daysIn(range), metrics: [], posts: [] };
    const { data: shop, error: shopError } = await db.from('shops').select('facebook_page_id, facebook_page_name').eq('id', shopId).single();
    if (shopError) throw new Error(shopError.message);
    const pageId: string | null = shop?.facebook_page_id ?? null;
    if (!pageId) return empty;

    const start = ubDayRange(new Date(`${range.from}T00:00:00+08:00`)).start.toISOString();
    const end = ubDayRange(new Date(`${range.to}T00:00:00+08:00`)).end.toISOString();
    const [sync, daily, posts] = await Promise.all([
        db.from('social_insights_sync').select('last_to')
            .eq('shop_id', shopId).eq('platform', 'facebook').eq('page_id', pageId).maybeSingle(),
        // 8 метрик × 14 өдөр — 1000 мөрөөс хол бага.
        db.from('social_insights_daily').select('day, metric, value')
            .eq('shop_id', shopId).eq('platform', 'facebook').eq('page_id', pageId).eq('object_type', 'page')
            .in('metric', [...PAGE_DAILY_METRICS])
            .gte('day', previousRange.from).lte('day', range.to),
        db.from('social_posts').select('external_post_id, content, likes, comments, shares, published_at')
            .eq('shop_id', shopId).eq('platform', 'facebook')
            .gte('published_at', start).lt('published_at', end)
            .order('published_at', { ascending: false }).limit(100),
    ]);
    for (const result of [sync, daily, posts]) if (result.error) throw new Error(result.error.message);

    // Постын насан туршийн үзэлт, товшилт: синк бүр Улаанбаатарын өдрөөр мөр нэмдэг тул хамгийн сүүлийн өдрийнхийг авна.
    // Meta постын давхардалгүй хүрэлтийг (post_total_media_view_unique) 0 гэж буцаадаг тул ашиглахгүй.
    const ids = (posts.data ?? []).map(row => String(row.external_post_id));
    const postRows = ids.length ? await fetchAllRows<{ object_id: string; metric: string; value: unknown; day: string }>((from, to) => db.from('social_insights_daily')
        .select('object_id, metric, value, day')
        .eq('shop_id', shopId).eq('platform', 'facebook').eq('object_type', 'post')
        .in('object_id', ids).in('metric', Object.values(POST_METRICS))
        .order('day', { ascending: false }).order('object_id').order('metric').range(from, to)) : [];
    const latest = new Map<string, { value: number | null; day: string }>();
    for (const row of postRows) {
        const key = `${row.object_id}|${row.metric}`;
        if (!latest.has(key)) latest.set(key, { value: num(row.value), day: String(row.day) });
    }

    const weekPosts: SocialWeekPost[] = (posts.data ?? []).map(row => {
        const id = String(row.external_post_id);
        const views = latest.get(`${id}|${POST_METRICS.views}`);
        const clicks = latest.get(`${id}|${POST_METRICS.clicks}`);
        return {
            id, content: row.content ?? null, publishedAt: row.published_at ?? null,
            views: views?.value ?? null, clicks: clicks?.value ?? null,
            likes: num(row.likes), comments: num(row.comments), shares: num(row.shares),
            asOf: views?.day ?? clicks?.day ?? null,
        };
    }).sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    return {
        ...empty,
        page: { id: pageId, name: shop?.facebook_page_name ?? null },
        syncedTo: sync.data?.last_to ? String(sync.data.last_to) : null,
        metrics: summarizeSocialWeek(rows(daily.data), range, previousRange),
        posts: weekPosts,
    };
}

/**
 * Маркетингийн самбарын «сүүлийн 7 хоног»: хамгийн сүүлд синк хийсэн Meta-гийн өдрөөр дуусах 7 хоног ба
 * түүний өмнөх 7 хоног. Явж буй хурлын долоо хоногийг харуулахгүй — нэг өдрийн Page өгөгдөл Номхон далайн
 * цагаар өдөр дууссаны дараа (УБ-ын маргааш үдээс хойш) л бүрэн болдог тул тэр долоо хоног ихэнхдээ хоосон.
 * Синк хийгдээгүй бол өчигдрөөр (`today` = Улаанбаатарын өдөр) дуусна.
 */
export function latestSocialRanges(lastTo: string | null, today: string): { range: SocialWeekRange; previousRange: SocialWeekRange } {
    const yesterday = shift(today, -1);
    const end = lastTo && lastTo < yesterday ? lastTo : yesterday;
    return { range: { from: shift(end, -6), to: end }, previousRange: { from: shift(end, -13), to: shift(end, -7) } };
}

/** `latestSocialRanges`-ийн 7 хоногийг уншина. Алдааг дуудагч руу шиднэ. */
export async function loadLatestSocialWeek(db: SupabaseClient, shopId: string, today: string): Promise<SocialWeek> {
    const { data: shop, error } = await db.from('shops').select('facebook_page_id').eq('id', shopId).single();
    if (error) throw new Error(error.message);
    let lastTo: string | null = null;
    if (shop?.facebook_page_id) {
        const sync = await db.from('social_insights_sync').select('last_to')
            .eq('shop_id', shopId).eq('platform', 'facebook').eq('page_id', shop.facebook_page_id).maybeSingle();
        if (sync.error) throw new Error(sync.error.message);
        lastTo = sync.data?.last_to ? String(sync.data.last_to).slice(0, 10) : null;
    }
    const { range, previousRange } = latestSocialRanges(lastTo, today);
    return loadSocialWeek(db, shopId, range, previousRange);
}

function rows(data: { day: unknown; metric: unknown; value: unknown }[] | null): SocialDailyRow[] {
    return (data ?? []).map(row => ({ day: String(row.day), metric: String(row.metric), value: num(row.value) }));
}
