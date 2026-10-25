import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { metaDeadline } from '@/lib/facebook/daily-spend';
import { IG_SYNC_DAYS, syncShopInstagram, syncShopSocial, type InstagramSyncResult, type SocialSyncResult } from '@/lib/marketing/socialSync';
import { withRoute } from '@/lib/api/route';

// Instagram-ийн 30 өдөр өдөр бүрт 2 Graph дуудлага (+ media) тул анхдагч хугацаа хүрэлцэхгүй байж болно.
export const maxDuration = 120;
/** Функц зогсохоос 20 сек өмнө Instagram-ийн шинэ алхам эхлүүлэхгүй (татсан өдрүүд хадгалагдана). */
const RUN_BUDGET_MS = (maxDuration - 20) * 1000;

const unique = (items: string[]) => [...new Set(items)];

/**
 * POST /api/dashboard/marketing/sync-social
 * Facebook Page-ийн өдрийн insights, нийтлэл ба нийтлэлийн insights; Instagram-ийн сүүлийн 30 өдрийн аккаунтын
 * үзүүлэлт, дагагчийн тоо, media ба media-ийн insights-ийг татаж `social_insights_daily` / `social_posts`-д
 * хадгална. Page, Instagram-ийн аль нэг нь холбогдсон байхад хангалттай. Бодит ажлыг `syncShopSocial` /
 * `syncShopInstagram` (cron-той хуваалцдаг) гүйцэтгэнэ.
 */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Sync хийхэд алдаа гарлаа' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();
    const { data: shop, error } = await supabase
        .from('shops')
        .select('id, facebook_page_id, facebook_page_access_token, instagram_business_account_id, instagram_access_token')
        .eq('id', authShop.id)
        .single();
    if (error) throw new Error(error.message);

    const hasPage = !!(shop?.facebook_page_id && shop.facebook_page_access_token);
    const hasInstagram = !!(shop?.instagram_business_account_id && (shop.instagram_access_token || shop.facebook_page_access_token));
    if (!shop || (!hasPage && !hasInstagram)) {
        return NextResponse.json({ error: 'Facebook Page эсвэл Instagram холбогдоогүй' }, { status: 400 });
    }

    const deadline = metaDeadline(RUN_BUDGET_MS);
    const page: SocialSyncResult | null = hasPage ? await syncShopSocial(supabase, shop) : null;
    const instagram: InstagramSyncResult | null = hasInstagram ? await syncShopInstagram(supabase, shop, IG_SYNC_DAYS, { deadline }) : null;
    const results = [page, instagram].filter((item): item is SocialSyncResult | InstagramSyncResult => item !== null);
    if (results.every(item => item.status === 'error')) {
        const message = unique(results.flatMap(item => item.errors))[0];
        return NextResponse.json({ error: message ?? 'Facebook-аас татаж чадсангүй', ...page, instagram }, { status: 502 });
    }
    const parts = [
        page && `Facebook: ${page.pageRows} өдрийн үзүүлэлт, ${page.postsStored} нийтлэл`,
        instagram && `Instagram: ${instagram.days} өдрийн үзүүлэлт, ${instagram.postsStored} нийтлэл`,
    ].filter(Boolean);
    const unavailable = unique(results.flatMap(item => item.unavailable));
    const errors = unique(results.flatMap(item => item.errors));
    const note = unavailable.length ? ` Meta өгөөгүй: ${unavailable.join(', ')}.` : '';
    const failed = errors.length ? ` ${errors.join(' ')}` : '';
    return NextResponse.json({ success: true, ...page, instagram, message: `${parts.join('; ')} хадгаллаа.${note}${failed}` });
});
