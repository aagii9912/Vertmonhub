import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getInstagramAccount, getInstagramInsights, getInstagramMedia, getInstagramMediaInsights } from '@/lib/facebook/marketing-api';
import { loadShopInstagram } from '@/lib/facebook/page-connect';
import { isMetaPermissionError, isMetaTokenError } from '@/lib/facebook/page-graph';
import { MetaApiError } from '@/lib/facebook/daily-spend';

const RANGE: Record<string, 1 | 7 | 28> = { day: 1, week: 7, days_28: 28 };
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * GET /api/marketing/instagram?period=week&limit=25&media_insights=1
 * Instagram Business аккаунт, хугацааны нийт үзүүлэлт (views, reach, …), сүүлийн нийтлэлүүд (Graph v26).
 * Meta-гийн өгөөгүй утга null («—»), 0 биш.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Instagram мэдээлэл татаж чадсангүй' }, async ({ request, shop }) => {
    const ig = await loadShopInstagram(shop.id);
    if (!ig) return NextResponse.json({ connected: false, message: 'Instagram холбогдоогүй байна', account: null, posts: [] });
    const params = request.nextUrl.searchParams;
    try {
        const account = await getInstagramAccount(ig.igId, ig.token);
        // Insights-ийн эрхгүй ч аккаунт, нийтлэлүүд харагдана.
        const insights = await getInstagramInsights(ig.igId, ig.token, RANGE[params.get('period') ?? 'week'] ?? 7)
            .catch(error => {
                if (!isMetaPermissionError(error) && !(error instanceof MetaApiError && error.code === 100)) throw error;
                return null;
            });
        const media = await getInstagramMedia(ig.igId, ig.token, Number.parseInt(params.get('limit') || '25', 10));
        // ?media_insights=1 үед нийтлэл бүрийн insights (N нэмэлт Graph дуудлага → хурдны хязгаарын эрсдэл).
        const withMediaInsights = params.get('media_insights') === '1';
        const posts = await Promise.all(media.map(async post => ({
            id: post.id,
            caption: post.caption || '',
            media_type: post.media_type,
            media_url: post.media_url || post.thumbnail_url || null,
            permalink: post.permalink,
            timestamp: post.timestamp,
            likes: count(post.like_count),
            comments: count(post.comments_count),
            ...(withMediaInsights ? { insights: await getInstagramMediaInsights(post.id, ig.token) } : {}),
        })));
        return NextResponse.json({
            connected: true,
            account: {
                id: account.id,
                username: account.username ?? ig.username,
                name: account.name,
                profile_picture_url: account.profile_picture_url,
                followers_count: count(account.followers_count),
                follows_count: count(account.follows_count),
                media_count: count(account.media_count),
                biography: account.biography,
            },
            insights,
            insights_error: insights ? null : 'Instagram insights-ийн эрх (instagram_manage_insights) олгогдоогүй байна.',
            posts,
        });
    } catch (error) {
        if (error instanceof MetaApiError) {
            return NextResponse.json({ connected: false, error: error.message, token_expired: isMetaTokenError(error), account: null, posts: [] });
        }
        throw error;
    }
});
