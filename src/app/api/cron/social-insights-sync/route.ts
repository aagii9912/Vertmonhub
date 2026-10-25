import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { metaDeadline, metaDeadlinePassed } from '@/lib/facebook/daily-spend';
import { IG_CRON_DAYS, IG_SYNC_DAYS, syncShopInstagram, syncShopSocial } from '@/lib/marketing/socialSync';
import { purgeExpiredPageConnections } from '@/lib/facebook/page-connect';
import { fetchAllRows } from '@/lib/utils/pagination';

export const dynamic = 'force-dynamic';
// Instagram-ийн өдрийн үзүүлэлт өдөр бүрт 2 Graph дуудлага (анхны синк 30 өдөр ≈ 60 + media 25) тул 60 сек хүрэлцэхгүй;
// ads-insights-sync-тэй адил Vercel-ийн 300 сек.
export const maxDuration = 300;
/** Бүх shop-ийн нийт хугацаа: функц зогсохоос 30 сек өмнө шинэ алхам эхлүүлэхгүй, Graph хүсэлтийг таслана. */
const RUN_BUDGET_MS = (maxDuration - 30) * 1000;
/** Зэрэг синк хийх shop (Graph-ийн хурдны хязгаар токен тус бүрт). */
const CONCURRENCY = 2;

type ShopRow = {
    id: string;
    facebook_page_id: string | null;
    facebook_page_access_token: string | null;
    instagram_business_account_id: string | null;
    instagram_access_token: string | null;
};

/**
 * GET|POST /api/cron/social-insights-sync
 * Facebook Page эсвэл Instagram холбосон бүх shop: Page-ийн өдрийн insights (сүүлийн 30 дууссан өдөр, нэг
 * дуудлага), нийтлэл ба нийтлэлийн insights; Instagram-ийн аккаунтын өдрийн үзүүлэлт (анхны синк 30, дараа нь
 * 14 өдөр), дагагчийн тоо, media ба media-ийн insights-ийг `social_insights_daily` / `social_posts`-д хадгална
 * (Graph v26). Shop бүрт Page, дараа нь Instagram; shop-уудыг 2-оор зэрэг. Нэг shop-ийн алдаа бусдыг зогсоохгүй.
 * Vercel Cron-д зориулсан (GET + Bearer), `x-cron-secret`-ийг бас зөвшөөрнө.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();
        const deadline = metaDeadline(RUN_BUDGET_MS);
        // Дуусаагүй орхисон Page сонголтын шифрлэгдсэн user токеныг цэвэрлэнэ.
        await purgeExpiredPageConnections();
        const shops = await fetchAllRows<ShopRow>((from, to) => supabase
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token, instagram_business_account_id, instagram_access_token')
            .or('facebook_page_id.not.is.null,instagram_business_account_id.not.is.null')
            .order('id').range(from, to));
        // Instagram-ийг амжилттай синк хийсэн бол 14 өдөр, эс бөгөөс (анх удаа) 30 өдөр.
        const synced = await fetchAllRows<{ shop_id: string; page_id: string }>((from, to) => supabase
            .from('social_insights_sync').select('shop_id, page_id')
            .eq('platform', 'instagram').not('last_success_at', 'is', null)
            .order('shop_id').order('page_id').range(from, to));
        const syncedIg = new Set(synced.map(row => `${row.shop_id}|${row.page_id}`));

        const statuses: Record<string, number> = {};
        const instagram: Record<string, number> = {};
        const bump = (target: Record<string, number>, status: string) => { target[status] = (target[status] ?? 0) + 1; };
        let totalPosts = 0;
        let pageRows = 0;
        let instagramRows = 0;
        const queue = [...shops];
        const worker = async () => {
            for (let shop = queue.shift(); shop; shop = queue.shift()) {
                const igId = shop.instagram_business_account_id?.trim();
                if (metaDeadlinePassed(deadline)) {
                    if (shop.facebook_page_id) bump(statuses, 'skipped');
                    if (igId) bump(instagram, 'skipped');
                    continue;
                }
                if (shop.facebook_page_id) {
                    try {
                        const result = await syncShopSocial(supabase, shop);
                        bump(statuses, result.status);
                        totalPosts += result.postsStored;
                        pageRows += result.pageRows;
                    } catch (e) {
                        bump(statuses, 'error');
                        logger.warn('[Social Insights Cron] shop sync failed', { shopId: shop.id, error: e });
                    }
                }
                if (!igId) continue;
                if (metaDeadlinePassed(deadline)) { bump(instagram, 'skipped'); continue; }
                try {
                    const days = syncedIg.has(`${shop.id}|${igId}`) ? IG_CRON_DAYS : IG_SYNC_DAYS;
                    const result = await syncShopInstagram(supabase, shop, days, { deadline });
                    bump(instagram, result.status);
                    totalPosts += result.postsStored;
                    instagramRows += result.accountRows;
                } catch (e) {
                    bump(instagram, 'error');
                    logger.warn('[Social Insights Cron] Instagram sync failed', { shopId: shop.id, error: e });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

        logger.info('[Social Insights Cron] done', { statuses, instagram, totalPosts, pageRows, instagramRows });
        return NextResponse.json({ success: true, statuses, instagram, totalPosts, pageRows, instagramRows });
    } catch (error) {
        logger.error('[Social Insights Cron] error', { error });
        return NextResponse.json({ error: 'Social insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
