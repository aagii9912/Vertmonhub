import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { publishTextPost, publishPhotoPost } from '@/lib/facebook/marketing-api';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * POST /api/marketing/facebook/publish
 * Facebook Page-д post нийтлэх
 */
export async function POST(req: NextRequest) {
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

        const body = await req.json();
        const { message, imageUrl, shop_id: shopId } = body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'Нийтлэлийн текст оруулна уу' }, { status: 400 });
        }

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
            return NextResponse.json({ error: 'Facebook Page холбогдоогүй байна' }, { status: 400 });
        }

        let result;
        if (imageUrl) {
            result = await publishPhotoPost(
                shop.facebook_page_id,
                shop.facebook_page_access_token,
                message.trim(),
                imageUrl
            );
        } else {
            result = await publishTextPost(
                shop.facebook_page_id,
                shop.facebook_page_access_token,
                message.trim()
            );
        }

        return NextResponse.json({
            success: true,
            post: result,
            message: 'Нийтлэл амжилттай нийтлэгдлээ!',
        });

    } catch (error: any) {
        console.error('Marketing Facebook Publish API Error:', error);
        if (error.message?.includes('190') || error.message?.includes('token')) {
            return NextResponse.json({ error: 'Token хугацаа дууссан. Facebook дахин холбоно уу.' }, { status: 401 });
        }
        if (error.message?.includes('permission') || error.message?.includes('publish')) {
            return NextResponse.json({
                error: 'Post нийтлэх зөвшөөрөл байхгүй. pages_manage_posts permission шаардлагатай.',
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Post нийтлэхэд алдаа гарлаа' }, { status: 500 });
    }
}
