import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { syncShopSocial } from '@/lib/marketing/socialSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET|POST /api/cron/social-insights-sync
 * Холбогдсон бүх shop-ийн Facebook organic post + page insights-ийг татаж
 * `social_posts` / `social_insights`-д snapshot хадгална. Үүгээр trend болон ROI
 * шинэлэг хэвээр байна. Vercel Cron-д зориулсан (GET + Bearer), `x-cron-secret`-ийг
 * бас зөвшөөрнө.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();
        const { data: shops } = await supabase
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .not('facebook_page_id', 'is', null)
            .not('facebook_page_access_token', 'is', null);

        let totalPosts = 0;
        let syncedShops = 0;
        for (const shop of shops || []) {
            try {
                const { postsStored } = await syncShopSocial(supabase, shop);
                totalPosts += postsStored;
                syncedShops++;
            } catch (e) {
                logger.warn('[Social Insights Cron] shop sync failed', { shopId: shop.id, error: e });
            }
        }

        logger.info('[Social Insights Cron] done', { syncedShops, totalPosts });
        return NextResponse.json({ success: true, syncedShops, totalPosts });
    } catch (error) {
        logger.error('[Social Insights Cron] error', { error });
        return NextResponse.json({ error: 'Social insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
