import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * GET /api/marketing/instagram
 * Instagram Business Account мэдээлэл + posts
 */
export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
        );

        const { data: { session } } = await supabase.auth.getSession();
        let userId: string | null = session?.user?.id || null;
        if (!userId) {
            const sessionCookie = cookieStore.get('vertmon-session');
            if (sessionCookie) {
                try {
                    const parsed = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
                    userId = parsed.user_id;
                } catch { /* ignore */ }
            }
        }

        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const shopId = req.nextUrl.searchParams.get('shop_id');
        const admin = supabaseAdmin();

        let query = admin
            .from('shops')
            .select('id, instagram_business_account_id, instagram_access_token, instagram_username, facebook_page_access_token')
            .eq('user_id', userId);
        if (shopId) query = query.eq('id', shopId);

        const { data: shops, error } = await query.limit(1);
        if (error || !shops?.length) {
            return NextResponse.json({ error: 'Дэлгүүр олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];
        const igId = shop.instagram_business_account_id;
        const accessToken = shop.instagram_access_token || shop.facebook_page_access_token;

        if (!igId || !accessToken) {
            return NextResponse.json({
                connected: false,
                message: 'Instagram холбогдоогүй байна',
                account: null,
                posts: [],
            });
        }

        try {
            // Get account info
            const accountRes = await fetch(
                `${GRAPH_API_BASE}/${igId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography&access_token=${accessToken}`
            );
            const account = await accountRes.json();

            if (account.error) {
                return NextResponse.json({
                    connected: false,
                    error: account.error.message,
                    token_expired: account.error.code === 190,
                    account: null,
                    posts: [],
                });
            }

            // Get recent media
            const limit = parseInt(req.nextUrl.searchParams.get('limit') || '25');
            const mediaRes = await fetch(
                `${GRAPH_API_BASE}/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${accessToken}`
            );
            const mediaData = await mediaRes.json();

            const posts = (mediaData.data || []).map((post: any) => ({
                id: post.id,
                caption: post.caption || '',
                media_type: post.media_type,
                media_url: post.media_url || post.thumbnail_url || null,
                permalink: post.permalink,
                timestamp: post.timestamp,
                likes: post.like_count || 0,
                comments: post.comments_count || 0,
            }));

            return NextResponse.json({
                connected: true,
                account: {
                    id: account.id,
                    username: account.username,
                    name: account.name,
                    profile_picture_url: account.profile_picture_url,
                    followers_count: account.followers_count || 0,
                    follows_count: account.follows_count || 0,
                    media_count: account.media_count || 0,
                    biography: account.biography,
                },
                posts,
            });

        } catch (fbError: any) {
            console.error('Instagram API error:', fbError.message);
            return NextResponse.json({
                connected: false,
                error: fbError.message,
                account: null,
                posts: [],
            });
        }

    } catch (error: any) {
        console.error('Marketing Instagram API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}
