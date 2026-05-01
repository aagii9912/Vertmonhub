import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getPagePosts } from '@/lib/facebook/marketing-api';
import { resolveApiUser } from '@/lib/auth/resolve-user';

/**
 * GET /api/marketing/facebook/posts
 * Facebook Page-ийн нийтлэлүүдийг авах
 */
export async function GET(req: NextRequest) {
    try {
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }
        const userId = user.id;

        const shopId = req.nextUrl.searchParams.get('shop_id');
        const limit = parseInt(req.nextUrl.searchParams.get('limit') || '25');
        const admin = supabaseAdmin();

        let query = admin
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('user_id', userId);

        if (shopId) query = query.eq('id', shopId);

        const { data: shops, error } = await query.limit(1);
        if (error || !shops?.length) {
            return NextResponse.json({ error: 'Дэлгүүр олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];
        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({ posts: [], message: 'Facebook Page холбогдоогүй' });
        }

        const result = await getPagePosts(shop.facebook_page_id, shop.facebook_page_access_token, limit);

        // Transform posts for frontend
        const posts = (result.data || []).map(post => ({
            id: post.id,
            message: post.message || post.story || '',
            image: post.full_picture || null,
            permalink: post.permalink_url || null,
            created_time: post.created_time,
            likes: post.likes?.summary?.total_count || 0,
            comments: post.comments?.summary?.total_count || 0,
            shares: post.shares?.count || 0,
        }));

        return NextResponse.json({ posts, paging: result.paging });

    } catch (error: any) {
        console.error('Marketing Facebook Posts API Error:', error);
        if (error.message?.includes('190') || error.message?.includes('token')) {
            return NextResponse.json({ posts: [], error: 'Token хугацаа дууссан', token_expired: true });
        }
        return NextResponse.json({ error: 'Facebook posts авахад алдаа гарлаа' }, { status: 500 });
    }
}
