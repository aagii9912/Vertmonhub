import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { syncShopSocial } from '@/lib/marketing/socialSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET|POST /api/cron/social-insights-sync
 * Facebook Page холбосон бүх shop-ийн Page-ийн өдрийн insights (сүүлийн 30 дууссан өдөр), нийтлэл ба
 * нийтлэлийн insights-ийг `social_insights_daily` / `social_posts`-д хадгална (Graph v26). Vercel Cron-д
 * зориулсан (GET + Bearer), `x-cron-secret`-ийг бас зөвшөөрнө.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();
        const { data: shops, error } = await supabase
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .not('facebook_page_id', 'is', null)
            .not('facebook_page_access_token', 'is', null);
        if (error) throw new Error(error.message);

        const statuses: Record<string, number> = {};
        let totalPosts = 0;
        let pageRows = 0;
        for (const shop of shops || []) {
            try {
                const result = await syncShopSocial(supabase, shop);
                statuses[result.status] = (statuses[result.status] ?? 0) + 1;
                totalPosts += result.postsStored;
                pageRows += result.pageRows;
            } catch (e) {
                statuses.error = (statuses.error ?? 0) + 1;
                logger.warn('[Social Insights Cron] shop sync failed', { shopId: shop.id, error: e });
            }
        }

        logger.info('[Social Insights Cron] done', { statuses, totalPosts, pageRows });
        return NextResponse.json({ success: true, statuses, totalPosts, pageRows });
    } catch (error) {
        logger.error('[Social Insights Cron] error', { error });
        return NextResponse.json({ error: 'Social insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
