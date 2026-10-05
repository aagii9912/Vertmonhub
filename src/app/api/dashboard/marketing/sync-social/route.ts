import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { syncShopSocial } from '@/lib/marketing/socialSync';
import { withRoute } from '@/lib/api/route';

/**
 * POST /api/dashboard/marketing/sync-social
 * Facebook Page-ийн өдрийн insights, нийтлэл ба нийтлэлийн insights-ийг татаж `social_insights_daily` /
 * `social_posts`-д хадгална. Бодит ажлыг `syncShopSocial` (cron-той хуваалцдаг) гүйцэтгэнэ.
 */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Sync хийхэд алдаа гарлаа' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();
    const { data: shop, error } = await supabase
        .from('shops')
        .select('id, facebook_page_id, facebook_page_access_token')
        .eq('id', authShop.id)
        .single();
    if (error) throw new Error(error.message);

    if (!shop?.facebook_page_id || !shop?.facebook_page_access_token) {
        return NextResponse.json({ error: 'Facebook page холбогдоогүй' }, { status: 400 });
    }

    const result = await syncShopSocial(supabase, shop);
    if (result.status === 'error') {
        return NextResponse.json({ error: result.errors[0] ?? 'Facebook-аас татаж чадсангүй', ...result }, { status: 502 });
    }
    const parts = [`${result.pageRows} өдрийн үзүүлэлт`, `${result.postsStored} нийтлэл`];
    const note = result.unavailable.length ? ` Meta өгөөгүй: ${result.unavailable.join(', ')}.` : '';
    const failed = result.errors.length ? ` ${[...new Set(result.errors)].join(' ')}` : '';
    return NextResponse.json({ success: true, ...result, message: `${parts.join(', ')} хадгаллаа.${note}${failed}` });
});
