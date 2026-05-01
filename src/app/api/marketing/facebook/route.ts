import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getPageInfo } from '@/lib/facebook/marketing-api';
import { resolveApiUser } from '@/lib/auth/resolve-user';

/**
 * GET /api/marketing/facebook
 * Facebook Page-ийн ерөнхий мэдээлэл авах
 */
export async function GET(req: NextRequest) {
    try {
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }
        const userId = user.id;

        // Get shop with facebook credentials
        const shopId = req.nextUrl.searchParams.get('shop_id');
        const admin = supabaseAdmin();
        let query = admin
            .from('shops')
            .select('id, name, facebook_page_id, facebook_page_name, facebook_page_access_token')
            .eq('user_id', userId);

        if (shopId) {
            query = query.eq('id', shopId);
        }

        const { data: shops, error: shopError } = await query.limit(1);

        if (shopError || !shops || shops.length === 0) {
            return NextResponse.json({ error: 'Дэлгүүр олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];

        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({
                connected: false,
                message: 'Facebook Page холбогдоогүй байна',
                page: null,
            });
        }

        // Fetch page info from Graph API
        try {
            const pageInfo = await getPageInfo(shop.facebook_page_id, shop.facebook_page_access_token);
            return NextResponse.json({
                connected: true,
                page: {
                    ...pageInfo,
                    stored_name: shop.facebook_page_name,
                },
            });
        } catch (fbError: any) {
            console.error('Facebook API error:', fbError.message);
            // Token might be expired
            if (fbError.message.includes('190') || fbError.message.includes('token')) {
                return NextResponse.json({
                    connected: false,
                    error: 'Facebook token хугацаа дууссан. Дахин холбоно уу.',
                    token_expired: true,
                    page: null,
                });
            }
            return NextResponse.json({
                connected: true,
                error: fbError.message,
                page: { id: shop.facebook_page_id, name: shop.facebook_page_name },
            });
        }

    } catch (error: any) {
        console.error('Marketing Facebook API Error:', error);
        return NextResponse.json({ error: 'Дотоод алдаа гарлаа' }, { status: 500 });
    }
}
