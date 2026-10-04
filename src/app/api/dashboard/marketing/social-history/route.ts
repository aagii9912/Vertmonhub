import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/dashboard/marketing/social-history
 * Хадгалсан organic post-ууд + insights-ийн trend (snapshot-ууд).
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Татахад алдаа гарлаа' }, async ({ shop: authShop }) => {
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
});
