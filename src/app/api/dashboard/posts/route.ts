import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/auth';
import { getAccessibleShopIds } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { decryptToken } from '@/lib/crypto/tokens';

/**
 * GET /api/dashboard/posts
 * Fetch Facebook Page posts + Instagram media for the shop
 * Returns unified list for post selector dropdown
 */
export async function GET(request: NextRequest) {
    try {
        const userId = await getAuthUser();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const shopId = request.headers.get('x-shop-id');
        if (!shopId) {
            return NextResponse.json({ error: 'Төслийн ID шаардлагатай' }, { status: 400 });
        }

        // Тухайн хэрэглэгч энэ төсөлд (shop) хандах эрхтэй эсэхийг баталгаажуулна
        const accessibleIds = await getAccessibleShopIds(userId);
        if (!accessibleIds.has(shopId)) {
            return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });
        }

        const supabase = supabaseAdmin();
        const { data: shop } = await supabase
            .from('shops')
            .select('facebook_page_id, facebook_page_access_token, instagram_business_account_id, instagram_access_token')
            .eq('id', shopId)
            .single();

        if (!shop) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        const posts: Array<{
            id: string;
            message: string;
            picture: string | null;
            created_time: string;
            platform: 'facebook' | 'instagram';
            type: string;
        }> = [];

        // Токенуудыг decrypt (encrypt-at-rest)
        const fbToken = decryptToken(shop.facebook_page_access_token);

        // 1. Fetch Facebook Page posts
        if (shop.facebook_page_id && fbToken) {
            try {
                const fbRes = await fetch(
                    `https://graph.facebook.com/v21.0/${shop.facebook_page_id}/published_posts?fields=id,message,full_picture,created_time,is_published,type&limit=25&access_token=${fbToken}`
                );

                if (fbRes.ok) {
                    const fbData = await fbRes.json();
                    for (const post of fbData.data || []) {
                        posts.push({
                            id: post.id,
                            message: post.message || '(Зурагтай пост)',
                            picture: post.full_picture || null,
                            created_time: post.created_time,
                            platform: 'facebook',
                            type: post.type || 'status',
                        });
                    }
                }
            } catch (e) {
                logger.error('Error fetching FB posts:', { error: e });
            }
        }

        // 2. Fetch Instagram media
        const igToken = decryptToken(shop.instagram_access_token) || fbToken;
        if (shop.instagram_business_account_id && igToken) {
            try {
                const igRes = await fetch(
                    `https://graph.facebook.com/v21.0/${shop.instagram_business_account_id}/media?fields=id,caption,media_url,timestamp,media_type&limit=25&access_token=${igToken}`
                );

                if (igRes.ok) {
                    const igData = await igRes.json();
                    for (const media of igData.data || []) {
                        posts.push({
                            id: media.id,
                            message: media.caption || '(Instagram пост)',
                            picture: media.media_url || null,
                            created_time: media.timestamp,
                            platform: 'instagram',
                            type: media.media_type?.toLowerCase() || 'image',
                        });
                    }
                }
            } catch (e) {
                logger.error('Error fetching IG media:', { error: e });
            }
        }

        // Sort by date (newest first)
        posts.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());

        return NextResponse.json({ posts });
    } catch (error: unknown) {
        logger.error('GET posts error:', { error: error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
