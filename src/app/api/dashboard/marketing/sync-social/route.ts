import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { getPagePosts, getPageInsights, getPageInfo } from '@/lib/facebook/marketing-api';

/**
 * POST /api/dashboard/marketing/sync-social
 * Facebook page-ийн organic post болон insights-ийг татаж `social_posts` /
 * `social_insights`-д хадгална (trend боломжтой болгоно).
 */
export async function POST() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const { data: shop } = await supabase
            .from('shops')
            .select('facebook_page_id, facebook_page_access_token')
            .eq('id', authShop.id)
            .single();

        if (!shop?.facebook_page_id || !shop?.facebook_page_access_token) {
            return NextResponse.json({ error: 'Facebook page холбогдоогүй' }, { status: 400 });
        }

        const pageId = shop.facebook_page_id;
        const token = shop.facebook_page_access_token;
        let postsStored = 0;

        // 1) Post-уудыг хадгалах (external_post_id-аар upsert)
        try {
            const { data: posts } = await getPagePosts(pageId, token, 25);
            for (const p of (posts || []) as Array<Record<string, any>>) {
                const row = {
                    shop_id: authShop.id,
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
                    .eq('shop_id', authShop.id)
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
            logger.warn('[Sync Social] posts failed', { error: e });
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
                shop_id: authShop.id,
                platform: 'facebook',
                impressions: m.get('page_impressions') || 0,
                reach: m.get('page_impressions_unique') || 0,
                engaged_users: m.get('page_engaged_users') || 0,
                page_views: m.get('page_views_total') || 0,
                followers: (info as Record<string, any>)?.followers_count || (info as Record<string, any>)?.fan_count || 0,
                raw: Object.fromEntries(m),
            });
        } catch (e) {
            logger.warn('[Sync Social] insights failed', { error: e });
        }

        return NextResponse.json({ success: true, postsStored, message: `${postsStored} нийтлэл хадгаллаа` });
    } catch (error) {
        logger.error('[Sync Social] error', { error });
        return NextResponse.json({ error: 'Sync хийхэд алдаа гарлаа' }, { status: 500 });
    }
}
