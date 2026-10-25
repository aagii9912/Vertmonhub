import {
    fetchInstagramDailyInsights, fetchInstagramMediaInsights, fetchPageDailyInsights, getInstagramAccount, getInstagramMedia, getPagePosts,
    metaInsightToday, shiftDay, type InstagramMedia, type PagePost,
} from '@/lib/facebook/marketing-api';
import { isMetaRateLimitError, metaDeadlinePassed, metaStepSignal, MetaApiError, type MetaDeadline } from '@/lib/facebook/daily-spend';
import { instagramToken, isMetaPermissionError, isMetaTokenError } from '@/lib/facebook/page-graph';
import { decryptToken } from '@/lib/crypto/tokens';
import { IG_MEDIA_METRICS, type IgMediaMetric } from '@/lib/marketing/social-metrics';
import { ubDateStr } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Синк бүрт дахин татах Page-ийн өдөр (Meta сүүлийн өдрүүдийг засдаг тул цонхыг бүтнээр нь upsert). */
export const SOCIAL_SYNC_DAYS = 30;
const POST_LIMIT = 25;
const CHUNK = 500;
const DAILY_CONFLICT = 'shop_id,platform,object_type,object_id,day,metric';

interface SyncShop {
    id: string;
    facebook_page_id?: string | null;
    facebook_page_access_token?: string | null;
}

export interface SocialSyncResult {
    status: 'not_connected' | 'ok' | 'partial' | 'error';
    from?: string;
    to?: string;
    pageRows: number;
    postsStored: number;
    postRows: number;
    /** Meta-гийн өгөөгүй метрик (хасагдсан, эрхгүй). */
    unavailable: string[];
    /** Хэрэглэгчид харуулах монгол мессеж; URL, токен агуулахгүй. */
    errors: string[];
}

const isPostId = (id: unknown): id is string => typeof id === 'string' && /^[0-9]{1,30}_[0-9]{1,30}$/.test(id);
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const safeMessage = (error: unknown) => error instanceof MetaApiError ? error.message : 'Хадгалах үед алдаа гарлаа.';

async function upsertChunks(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
    for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
        if (error) throw new Error(`${table}: ${error.message}`);
    }
}

type KnownCounts = { likes: number | null; comments: number | null; shares: number | null; reach: number | null };

/**
 * Meta энэ удаа өгөөгүй тоо (жишээ нь эрх цуцлагдсан) өмнө хадгалсан мэдэгдэж буй утгыг дарахгүй.
 * `reach` хоосон: Meta постын давхардалгүй хүрэлтийг (post_total_media_view_unique) бүх постод 0 гэж буцаадаг
 * (2026-10-25, Elysium-ийн 330 мөр бүгд 0) — бодит тоо биш тул хадгалахгүй, өмнөх 0-ийг ч NULL болгоно.
 */
function postRow(shopId: string, { post }: PagePost, previous?: KnownCounts) {
    const row = {
        shop_id: shopId,
        platform: 'facebook' as const,
        external_post_id: post.id,
        content: post.message || post.story || null,
        media_urls: post.full_picture ? [post.full_picture] : null,
        status: 'published' as const,
        published_at: post.created_time || null,
        // Meta-гийн өгөөгүй тоо null — 0 гэж таамаглахгүй.
        likes: count(post.likes?.summary?.total_count),
        comments: count(post.comments?.summary?.total_count),
        // Graph хуваалцаагүй нийтлэлд `shares` талбарыг огт буцаадаггүй (тэг нь Meta-гийн хариу, таамаг биш).
        shares: post.shares ? count(post.shares.count) : 0,
        reach: null,
        updated_at: new Date().toISOString(),
    };
    for (const key of ['likes', 'comments', 'shares'] as const) row[key] ??= previous?.[key] ?? null;
    return row;
}

/**
 * Нэг shop-ийн Facebook Page-ийн өдрийн insights (сүүлийн SOCIAL_SYNC_DAYS дууссан өдөр, Meta-гийн PT өдөр),
 * сүүлийн нийтлэлүүд ба тэдгээрийн насан туршийн insights-ийг (Улаанбаатарын өнөөдрөөр) хадгална. Meta-гийн
 * өгөөгүй утга мөргүй/null хэвээр, өмнөх өгөгдөл устахгүй. Manual sync route ба cron хоёулаа ашиглана.
 */
export async function syncShopSocial(supabase: SupabaseClient, shop: SyncShop, days: number = SOCIAL_SYNC_DAYS): Promise<SocialSyncResult> {
    const result: SocialSyncResult = { status: 'not_connected', pageRows: 0, postsStored: 0, postRows: 0, unavailable: [], errors: [] };
    const pageId = shop.facebook_page_id?.trim();
    const token = decryptToken(shop.facebook_page_access_token);
    if (!pageId || !token) return result;
    if (!/^[0-9]{1,30}$/.test(pageId)) return { ...result, status: 'error', errors: ['Facebook Page-ийн ID буруу байна. Page-ээ дахин холбоно уу.'] };

    const to = shiftDay(metaInsightToday(), -1);
    const from = shiftDay(to, -(Math.min(Math.max(Math.trunc(days), 1), 90) - 1));
    Object.assign(result, { from, to });
    const key = { shop_id: shop.id, platform: 'facebook', page_id: pageId };
    const { error: attemptError } = await supabase.from('social_insights_sync')
        .upsert({ ...key, last_attempt_at: new Date().toISOString() }, { onConflict: 'shop_id,platform,page_id' });
    if (attemptError) throw new Error(`social_insights_sync: ${attemptError.message}`);

    // 1) Page-ийн өдрийн insights
    let pageOk = false;
    try {
        const { rows, unavailable } = await fetchPageDailyInsights(pageId, token, from, to);
        const syncedAt = new Date().toISOString();
        await upsertChunks(supabase, 'social_insights_daily', rows.map(row => ({
            ...key, object_type: 'page', object_id: pageId, day: row.day, metric: row.metric,
            value: row.value, breakdown: row.breakdown, synced_at: syncedAt,
        })), DAILY_CONFLICT);
        result.pageRows = rows.length;
        result.unavailable.push(...unavailable);
        pageOk = true;
    } catch (error) {
        logger.warn('[syncShopSocial] page insights failed', { shopId: shop.id, code: error instanceof MetaApiError ? error.code : null, error: error instanceof MetaApiError ? undefined : error });
        result.errors.push(safeMessage(error));
    }

    // 2) Нийтлэлүүд + насан туршийн insights (өнөөдрийн байдлаар)
    let postsOk = false;
    try {
        const { posts, unavailable } = await getPagePosts(pageId, token, POST_LIMIT);
        const valid = posts.filter(item => isPostId(item.post.id) && item.post.id.startsWith(`${pageId}_`));
        const previous = new Map<string, KnownCounts>();
        if (valid.length) {
            const { data: stored, error } = await supabase.from('social_posts')
                .select('external_post_id, likes, comments, shares, reach')
                .eq('shop_id', shop.id).eq('platform', 'facebook').in('external_post_id', valid.map(item => item.post.id));
            if (error) throw new Error(`social_posts: ${error.message}`);
            for (const row of stored ?? []) previous.set(row.external_post_id, row);
        }
        await upsertChunks(supabase, 'social_posts', valid.map(item => postRow(shop.id, item, previous.get(item.post.id))), 'shop_id,platform,external_post_id');
        const today = ubDateStr();
        const syncedAt = new Date().toISOString();
        const insightRows = valid.flatMap(({ post, insights }) => Object.entries(insights).flatMap(([metric, parsed]) => parsed ? [{
            ...key, object_type: 'post', object_id: post.id, day: today, metric,
            value: parsed.value, breakdown: parsed.breakdown, synced_at: syncedAt,
        }] : []));
        await upsertChunks(supabase, 'social_insights_daily', insightRows, DAILY_CONFLICT);
        result.postsStored = valid.length;
        result.postRows = insightRows.length;
        result.unavailable.push(...unavailable);
        postsOk = true;
    } catch (error) {
        logger.warn('[syncShopSocial] posts failed', { shopId: shop.id, code: error instanceof MetaApiError ? error.code : null, error: error instanceof MetaApiError ? undefined : error });
        result.errors.push(safeMessage(error));
    }

    result.unavailable = [...new Set(result.unavailable)];
    result.status = pageOk && postsOk ? (result.unavailable.length ? 'partial' : 'ok') : pageOk || postsOk ? 'partial' : 'error';
    const now = new Date().toISOString();
    const { error: statusError } = await supabase.from('social_insights_sync').upsert({
        ...key,
        last_attempt_at: now,
        ...(pageOk ? { last_success_at: now, last_from: from, last_to: to } : {}),
        unavailable_metrics: result.unavailable,
        last_error: result.errors.length ? [...new Set(result.errors)].join(' ').slice(0, 500) : null,
        page_rows: result.pageRows,
        post_rows: result.postRows,
    }, { onConflict: 'shop_id,platform,page_id' });
    if (statusError) throw new Error(`social_insights_sync: ${statusError.message}`);
    return result;
}

// ============ Instagram ============

/** Гараар синк ба анхны синк: сүүлийн 30 дууссан Meta-гийн өдөр (өдөр бүрт 2 Graph дуудлага). */
export const IG_SYNC_DAYS = 30;
/** Cron (6 цаг тутам) амжилттай синкийн дараа: Meta сүүлийн өдрүүдийг засдаг тул 14 өдрийг дахин бичнэ. */
export const IG_CRON_DAYS = 14;
const IG_MEDIA_LIMIT = 25;

interface InstagramSyncShop {
    id: string;
    instagram_business_account_id?: string | null;
    instagram_access_token?: string | null;
    facebook_page_access_token?: string | null;
}

export interface InstagramSyncResult {
    status: SocialSyncResult['status'];
    from?: string;
    to?: string;
    /** Хадгалсан аккаунтын өдрийн мөр (дагагчийн тооны мөр орно). */
    accountRows: number;
    /** Татаж дууссан Meta-гийн өдөр. */
    days: number;
    followers: number | null;
    postsStored: number;
    postRows: number;
    /** Meta-гийн өгөөгүй метрик; media-гийнх `media:` угтвартай (аккаунтын нэртэй давхцдаг). */
    unavailable: string[];
    errors: string[];
}

const isIgId = (id: unknown): id is string => typeof id === 'string' && /^[0-9]{1,30}$/.test(id);

/** IG media-ийн `social_posts` мөр. Meta энэ удаа өгөөгүй тоо өмнө хадгалсан утгыг дарахгүй (Facebook-тэй адил). */
export function instagramPostRow(shopId: string, media: InstagramMedia, values: Partial<Record<IgMediaMetric, number>> = {}, previous?: KnownCounts) {
    const row = {
        shop_id: shopId,
        platform: 'instagram' as const,
        external_post_id: media.id,
        content: media.caption?.trim() || null,
        // Instagram-ийн CDN холбоос (media_url, thumbnail_url) хэдхэн хоногт хүчингүй болдог тул хадгалахгүй.
        media_urls: null,
        status: 'published' as const,
        published_at: media.timestamp || null,
        likes: count(media.like_count) ?? values.likes ?? null,
        comments: count(media.comments_count) ?? values.comments ?? null,
        shares: values.shares ?? null,
        // IG media-ийн reach бол бодит давхардалгүй хүн (Facebook постынх шиг 0 биш).
        reach: values.reach ?? null,
        updated_at: new Date().toISOString(),
    };
    for (const key of ['likes', 'comments', 'shares', 'reach'] as const) row[key] ??= previous?.[key] ?? null;
    return row;
}

/**
 * Нэг shop-ийн Instagram Business аккаунт: (1) дагагчийн тоо — одоогийн (дуусаагүй) Meta-гийн өдрийн төлөв,
 * өдрийн дотор дараагийн синк дарж бичнэ; (2) сүүлийн `days` дууссан Meta-гийн (PT) өдрийн аккаунтын үзүүлэлт
 * (`fetchInstagramDailyInsights`); (3) сүүлийн 25 media ба насан туршийн insights (Улаанбаатарын өнөөдрөөр).
 * Бүгд `social_insights_daily`-д platform 'instagram' (аккаунт: object_type 'page', object_id = page_id = IG ID).
 * Токен `loadShopInstagram`-ийн дүрмээр (`instagramToken`). Meta-гийн өгөөгүй утга мөргүй/null, хуучин өгөгдөл
 * устахгүй. Алхам бүр бие даасан; `deadline` дуусвал үлдсэнийг алгасаад `partial`. Cron ба гар синк ашиглана.
 */
export async function syncShopInstagram(
    supabase: SupabaseClient,
    shop: InstagramSyncShop,
    days: number = IG_SYNC_DAYS,
    options: { deadline?: MetaDeadline | null } = {},
): Promise<InstagramSyncResult> {
    const result: InstagramSyncResult = { status: 'not_connected', accountRows: 0, days: 0, followers: null, postsStored: 0, postRows: 0, unavailable: [], errors: [] };
    const igId = shop.instagram_business_account_id?.trim();
    const token = instagramToken(shop);
    if (!igId || !token) return result;
    if (!isIgId(igId)) return { ...result, status: 'error', errors: ['Instagram аккаунтын ID буруу байна. Instagram-аа дахин холбоно уу.'] };

    const { deadline = null } = options;
    const today = metaInsightToday();
    const to = shiftDay(today, -1);
    const from = shiftDay(to, -(Math.min(Math.max(Math.trunc(days), 1), 90) - 1));
    Object.assign(result, { from, to });
    const key = { shop_id: shop.id, platform: 'instagram', page_id: igId };
    const accountKey = { ...key, object_type: 'page', object_id: igId };
    const read = () => ({ signal: metaStepSignal(20000, deadline) });
    const failed = (step: string, error: unknown) => {
        logger.warn(`[syncShopInstagram] ${step} failed`, { shopId: shop.id, code: error instanceof MetaApiError ? error.code : null, error: error instanceof MetaApiError ? undefined : error });
        result.errors.push(safeMessage(error));
    };
    const { error: attemptError } = await supabase.from('social_insights_sync')
        .upsert({ ...key, last_attempt_at: new Date().toISOString() }, { onConflict: 'shop_id,platform,page_id' });
    if (attemptError) throw new Error(`social_insights_sync: ${attemptError.message}`);

    // 1) Дагагчийн тоо (аккаунтын талбар) — Meta өгөөгүй бол мөргүй.
    let followersOk = false;
    try {
        const account = await getInstagramAccount(igId, token, read());
        const followers = count(account.followers_count);
        if (followers !== null) {
            await upsertChunks(supabase, 'social_insights_daily', [{
                ...accountKey, day: today, metric: 'followers_count', value: followers, breakdown: null, synced_at: new Date().toISOString(),
            }], DAILY_CONFLICT);
            result.followers = followers;
            result.accountRows++;
        } else result.unavailable.push('followers_count');
        followersOk = true;
    } catch (error) { failed('account', error); }

    // 2) Аккаунтын өдрийн үзүүлэлт (PT өдөр бүрт total_value)
    let dailyOk = false;
    try {
        const daily = await fetchInstagramDailyInsights(igId, token, from, to, { deadline });
        const syncedAt = new Date().toISOString();
        await upsertChunks(supabase, 'social_insights_daily', daily.rows.map(row => ({
            ...accountKey, day: row.day, metric: row.metric, value: row.value, breakdown: null, synced_at: syncedAt,
        })), DAILY_CONFLICT);
        result.accountRows += daily.rows.length;
        result.days = daily.days;
        result.unavailable.push(...daily.unavailable);
        if (daily.stopped) result.errors.push(daily.stopped);
        else dailyOk = true;
    } catch (error) { failed('daily insights', error); }

    // 3) Media + насан туршийн insights (өнөөдрийн байдлаар). Боломжит метрик media-ийн төрлөөс хамаарна:
    //    нэг төрөлд code 100-аар татгалзсан метрикийг тэр төрлийн дараагийн media-д асуухгүй.
    let mediaOk = false;
    try {
        if (metaDeadlinePassed(deadline)) throw new MetaApiError('Instagram нийтлэлийг татах хугацаа дууслаа — дараагийн синк үргэлжлүүлнэ.');
        const media = (await getInstagramMedia(igId, token, IG_MEDIA_LIMIT, read())).filter(item => isIgId(item.id));
        const values = new Map<string, Partial<Record<IgMediaMetric, number>>>();
        const invalidByType = new Map<string, Set<IgMediaMetric>>();
        const invalidAll = new Set<IgMediaMetric>();
        let stopped: string | null = null;
        for (const item of media) {
            if (metaDeadlinePassed(deadline)) { stopped = 'Instagram нийтлэлийн үзүүлэлтийг татах хугацаа дууслаа — дараагийн синк үргэлжлүүлнэ.'; break; }
            const type = `${item.media_product_type ?? ''}:${item.media_type ?? ''}`;
            const invalid = invalidByType.get(type) ?? new Set<IgMediaMetric>();
            invalidByType.set(type, invalid);
            const metrics = IG_MEDIA_METRICS.filter(metric => !invalid.has(metric));
            if (!metrics.length) continue;
            try {
                const found = await fetchInstagramMediaInsights(item.id, token, metrics, read());
                for (const metric of found.invalid as IgMediaMetric[]) { invalid.add(metric); invalidAll.add(metric); }
                values.set(item.id, found.values);
            } catch (error) {
                if (!(error instanceof MetaApiError)) throw error;
                // Эрх, токен, хурдны хязгаар үлдсэн media-д ч адил — зогсооно. Бусад (бизнес аккаунтаас өмнөх media) — тэр media л.
                if (isMetaPermissionError(error) || isMetaTokenError(error) || isMetaRateLimitError(error)) { stopped = error.message; break; }
            }
        }
        const previous = new Map<string, KnownCounts>();
        if (media.length) {
            const { data: stored, error } = await supabase.from('social_posts')
                .select('external_post_id, likes, comments, shares, reach')
                .eq('shop_id', shop.id).eq('platform', 'instagram').in('external_post_id', media.map(item => item.id));
            if (error) throw new Error(`social_posts: ${error.message}`);
            for (const row of stored ?? []) previous.set(row.external_post_id, row);
        }
        await upsertChunks(supabase, 'social_posts', media.map(item => instagramPostRow(shop.id, item, values.get(item.id), previous.get(item.id))), 'shop_id,platform,external_post_id');
        const day = ubDateStr();
        const syncedAt = new Date().toISOString();
        const insightRows = media.flatMap(item => Object.entries(values.get(item.id) ?? {}).map(([metric, value]) => ({
            ...key, object_type: 'post', object_id: item.id, day, metric, value, breakdown: null, synced_at: syncedAt,
        })));
        await upsertChunks(supabase, 'social_insights_daily', insightRows, DAILY_CONFLICT);
        result.postsStored = media.length;
        result.postRows = insightRows.length;
        result.unavailable.push(...[...invalidAll].map(metric => `media:${metric}`));
        if (stopped) result.errors.push(stopped);
        else mediaOk = true;
    } catch (error) { failed('media', error); }

    result.unavailable = [...new Set(result.unavailable)];
    const anyData = followersOk || result.days > 0 || result.postsStored > 0;
    result.status = followersOk && dailyOk && mediaOk ? (result.unavailable.length ? 'partial' : 'ok') : anyData ? 'partial' : 'error';
    const now = new Date().toISOString();
    const { error: statusError } = await supabase.from('social_insights_sync').upsert({
        ...key,
        last_attempt_at: now,
        ...(dailyOk ? { last_success_at: now, last_from: from, last_to: to } : {}),
        unavailable_metrics: result.unavailable,
        last_error: result.errors.length ? [...new Set(result.errors)].join(' ').slice(0, 500) : null,
        page_rows: result.accountRows,
        post_rows: result.postRows,
    }, { onConflict: 'shop_id,platform,page_id' });
    if (statusError) throw new Error(`social_insights_sync: ${statusError.message}`);
    return result;
}
