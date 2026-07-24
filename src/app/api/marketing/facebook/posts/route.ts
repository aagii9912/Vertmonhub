import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAccessibleShopIds } from '@/lib/auth/supabase-auth';
import { getPagePosts } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';
import { resolveApiUser } from '@/lib/auth/resolve-user';

/**
 * GET /api/marketing/facebook/posts
 * Facebook Page-ийн нийтлэлүүдийг авах
 */
export async function GET(req: NextRequest) {
    try {
        const authUser = await resolveApiUser();
        if (!authUser) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }
        const userId = authUser.id;

        const shopId = req.nextUrl.searchParams.get('shop_id');
        const limit = parseInt(req.nextUrl.searchParams.get('limit') || '25');
        const admin = supabaseAdmin();

        // Хэрэглэгчийн хандах эрхтэй төслүүдээс зорилтот shop-ыг баталгаажуулна
        const accessibleIds = await getAccessibleShopIds(userId);
        const targetShopId = shopId || accessibleIds.values().next().value;
        if (!targetShopId || !accessibleIds.has(targetShopId)) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        const { data: shops, error } = await admin
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('id', targetShopId)
            .limit(1);
        if (error || !shops?.length) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];
        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({ posts: [], message: 'Facebook Page холбогдоогүй' });
        }

        const pageToken = decryptToken(shop.facebook_page_access_token) || '';
        const result = await getPagePosts(shop.facebook_page_id, pageToken, limit);

        // Transform posts for frontend
        const posts = (result.data || []).map(post => {
            // Per-post insights-ийг metric нэрээр map болгож задлах
            const im: Record<string, number | Record<string, number>> = {};
            for (const m of post.insights?.data || []) {
                const v = m.values?.[0]?.value;
                if (v !== undefined) im[m.name] = v;
            }
            return {
                id: post.id,
                message: post.message || post.story || '',
                image: post.full_picture || null,
                permalink: post.permalink_url || null,
                created_time: post.created_time,
                likes: post.likes?.summary?.total_count || 0,
                comments: post.comments?.summary?.total_count || 0,
                shares: post.shares?.count || 0,
                insights: {
                    reach: (im.post_impressions_unique as number) || 0,
                    clicks: (im.post_clicks as number) || 0,
                    reactions: (im.post_reactions_by_type_total as Record<string, number>) || {},
                },
            };
        });

        return NextResponse.json({ posts, paging: result.paging });

    } catch (error: any) {
        console.error('Marketing Facebook Posts API Error:', error);
        if (error.message?.includes('190') || error.message?.includes('token')) {
            return NextResponse.json({ posts: [], error: 'Token хугацаа дууссан', token_expired: true });
        }
        return NextResponse.json({ error: 'Facebook posts авахад алдаа гарлаа' }, { status: 500 });
    }
}
