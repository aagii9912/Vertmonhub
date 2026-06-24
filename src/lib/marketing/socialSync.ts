import { getPagePosts, getPageInsights, getPageInfo } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';
import { logger } from '@/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

interface SyncShop {
    id: string;
    facebook_page_id?: string | null;
    facebook_page_access_token?: string | null;
}

/**
 * Нэг shop-ийн Facebook organic post + page insights-ийг татаж `social_posts` /
 * `social_insights`-д хадгална. Manual sync route ба cron хоёулаа ашиглана.
 * Токеныг decrypt хийдэг (encrypt-at-rest). Холбогдоогүй бол 0 буцаана.
 */
export async function syncShopSocial(
    supabase: SupabaseClient,
    shop: SyncShop
): Promise<{ postsStored: number }> {
    const pageId = shop.facebook_page_id;
    const token = decryptToken(shop.facebook_page_access_token);
    if (!pageId || !token) return { postsStored: 0 };

    let postsStored = 0;

    // 1) Post-уудыг хадгалах (external_post_id-аар upsert)
    try {
        const { data: posts } = await getPagePosts(pageId, token, 25);
        for (const p of (posts || []) as Array<Record<string, any>>) {
            const row = {
                shop_id: shop.id,
                platform: 'facebook' as const,
                external_post_id: p.id,
                content: p.message || p.story || null,
                media_urls: p.full_picture ? [p.full_picture] : null,
                status: 'published' as const,
                published_at: p.created_time || null,
                likes: p.likes?.summary?.total_count || 0,
                comments: p.comments?.summary?.total_count || 0,
                shares: p.shares?.count || 0,
                updated_at: new Date().toISOString(),
            };

            const { data: existing } = await supabase
                .from('social_posts')
                .select('id')
                .eq('shop_id', shop.id)
                .eq('external_post_id', p.id)
                .maybeSingle();

            if (existing) {
                await supabase.from('social_posts').update(row).eq('id', existing.id);
            } else {
                await supabase.from('social_posts').insert(row);
            }
            postsStored++;
        }
    } catch (e) {
        logger.warn('[syncShopSocial] posts failed', { shopId: shop.id, error: e });
    }

    // 2) Insights snapshot хадгалах
    try {
        const [{ data: metrics }, info] = await Promise.all([
            getPageInsights(pageId, token),
            getPageInfo(pageId, token).catch(() => null),
        ]);

        const m = new Map<string, number>();
        for (const metric of (metrics || []) as Array<Record<string, any>>) {
            const last = metric.values?.[metric.values.length - 1]?.value;
            m.set(metric.name, typeof last === 'number' ? last : 0);
        }

        await supabase.from('social_insights').insert({
            shop_id: shop.id,
            platform: 'facebook',
            // page_impressions / page_engaged_users нь v21-д deprecated — хүчинтэй
            // метрикүүдээр орлуулав (impressions ≈ unique reach).
            impressions: m.get('page_impressions_unique') || 0,
            reach: m.get('page_impressions_unique') || 0,
            engaged_users: m.get('page_post_engagements') || 0,
            page_views: m.get('page_views_total') || 0,
            followers: (info as Record<string, any>)?.followers_count || (info as Record<string, any>)?.fan_count || 0,
            raw: Object.fromEntries(m),
        });
    } catch (e) {
        logger.warn('[syncShopSocial] insights failed', { shopId: shop.id, error: e });
    }

    return { postsStored };
}
