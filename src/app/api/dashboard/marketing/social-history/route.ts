import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/marketing/social-history
 * Хадгалсан organic post-ууд + insights-ийн trend (snapshot-ууд).
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ posts: [], insights: [] });

        const supabase = supabaseAdmin();

        const [{ data: posts }, { data: insights }] = await Promise.all([
            supabase.from('social_posts')
                .select('id, platform, content, likes, comments, shares, published_at, external_post_id')
                .eq('shop_id', authShop.id)
                .order('published_at', { ascending: false, nullsFirst: false })
                .limit(20),
            supabase.from('social_insights')
                .select('platform, captured_at, impressions, reach, engaged_users, followers')
                .eq('shop_id', authShop.id)
                .order('captured_at', { ascending: false })
                .limit(30),
        ]);

        return NextResponse.json({ posts: posts || [], insights: insights || [] });
    } catch (error) {
        logger.error('[Social History] error', { error });
        return NextResponse.json({ error: 'Татахад алдаа гарлаа' }, { status: 500 });
    }
}
