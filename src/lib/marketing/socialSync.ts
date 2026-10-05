import { fetchPageDailyInsights, getPagePosts, metaInsightToday, shiftDay, type PagePost } from '@/lib/facebook/marketing-api';
import { MetaApiError } from '@/lib/facebook/daily-spend';
import { decryptToken } from '@/lib/crypto/tokens';
import { ubDateStr } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Синк бүрт дахин татах Page-ийн өдөр (Meta сүүлийн өдрүүдийг засдаг тул цонхыг бүтнээр нь upsert). */
export const SOCIAL_SYNC_DAYS = 30;
const POST_LIMIT = 25;
const CHUNK = 500;

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

/** Meta энэ удаа өгөөгүй тоо (жишээ нь эрх цуцлагдсан) өмнө хадгалсан мэдэгдэж буй утгыг дарахгүй. */
function postRow(shopId: string, { post, insights }: PagePost, previous?: KnownCounts) {
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
        reach: insights.post_total_media_view_unique?.value ?? null,
        updated_at: new Date().toISOString(),
    };
    for (const key of ['likes', 'comments', 'shares', 'reach'] as const) row[key] ??= previous?.[key] ?? null;
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
        })), 'shop_id,platform,object_type,object_id,day,metric');
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
        await upsertChunks(supabase, 'social_insights_daily', insightRows, 'shop_id,platform,object_type,object_id,day,metric');
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
