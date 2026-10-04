import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { syncShopSocial } from '@/lib/marketing/socialSync';
import { withRoute } from '@/lib/api/route';

/**
 * POST /api/dashboard/marketing/sync-social
 * Facebook page-ийн organic post болон insights-ийг татаж `social_posts` /
 * `social_insights`-д хадгална (trend боломжтой болгоно). Бодит ажлыг
 * `syncShopSocial` (cron-той хуваалцдаг) гүйцэтгэнэ.
 */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Sync хийхэд алдаа гарлаа' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();
    const { data: shop } = await supabase
        .from('shops')
        .select('id, facebook_page_id, facebook_page_access_token')
        .eq('id', authShop.id)
        .single();

    if (!shop?.facebook_page_id || !shop?.facebook_page_access_token) {
        return NextResponse.json({ error: 'Facebook page холбогдоогүй' }, { status: 400 });
    }

    const { postsStored } = await syncShopSocial(supabase, shop);
    return NextResponse.json({ success: true, postsStored, message: `${postsStored} нийтлэл хадгаллаа` });
});
