import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getPagePosts } from '@/lib/facebook/marketing-api';
import { loadShopPage } from '@/lib/facebook/page-connect';
import { isMetaTokenError } from '@/lib/facebook/page-graph';
import { MetaApiError } from '@/lib/facebook/daily-spend';

const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * GET /api/marketing/facebook/posts?limit=25
 * Page-ийн нийтлэлүүд + насан туршийн insights (Graph v26). Meta-гийн өгөөгүй утга null («—»), 0 биш.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Facebook posts авахад алдаа гарлаа' }, async ({ request, shop }) => {
    const page = await loadShopPage(shop.id);
    if (!page) return NextResponse.json({ posts: [], message: 'Facebook Page холбогдоогүй' });
    const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '25', 10);
    try {
        const { posts, unavailable } = await getPagePosts(page.pageId, page.token, limit);
        return NextResponse.json({
            posts: posts.map(({ post, insights }) => ({
                id: post.id,
                message: post.message || post.story || '',
                image: post.full_picture || null,
                permalink: post.permalink_url || null,
                created_time: post.created_time,
                likes: count(post.likes?.summary?.total_count),
                comments: count(post.comments?.summary?.total_count),
                // Graph хуваалцаагүй нийтлэлд `shares` талбарыг буцаадаггүй.
                shares: post.shares ? count(post.shares.count) : 0,
                insights: {
                    views: insights.post_media_view?.value ?? null,
                    viewers: insights.post_total_media_view_unique?.value ?? null,
                    clicks: insights.post_clicks?.value ?? null,
                    reactions: insights.post_reactions_by_type_total?.breakdown ?? null,
                },
            })),
            unavailable,
        });
    } catch (error) {
        if (isMetaTokenError(error)) return NextResponse.json({ posts: [], error: 'Token хугацаа дууссан', token_expired: true });
        if (error instanceof MetaApiError) return NextResponse.json({ posts: [], error: error.message }, { status: 502 });
        throw error;
    }
});
