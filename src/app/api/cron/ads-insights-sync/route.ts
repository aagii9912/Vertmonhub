import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { metaDeadline } from '@/lib/facebook/daily-spend';
import { syncMetaSpend } from '@/lib/marketing/meta-spend';
import { syncMetaInsights } from '@/lib/marketing/meta-insights';
import { fetchAllRows } from '@/lib/utils/pagination';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
/** Бүх shop-ийн нийт хугацаа: Vercel функцийг зогсоохоос 30 сек өмнө шинэ алхам эхлүүлэхгүй, Graph хүсэлтийг таслана. */
const RUN_BUDGET_MS = (maxDuration - 30) * 1000;

/**
 * POST /api/cron/ads-insights-sync
 * Shop бүрийн Meta зарын дансны: (1) өдрийн кампанит ажлын зардал (meta_daily_spend),
 * (2) ad set × өдрийн дэлгэрэнгүй үр дүн + хурлын долоо хоногийн `meta_ads` тайлан
 * (meta_ad_insights_daily, marketing_channel_reports). ROI, «Сурталчилгаа», AI эдгээр огноотой
 * хүснэгтийг уншдаг тул хуучин 30 хоногийн `ad_campaigns` snapshot-ийг татахаа больсон (2026-10-05).
 * Нэг shop-ийн алдаа бусдыг зогсоохгүй. Бүх ажил нэг хугацааны хязгаартай: хугацаа дутвал үлдсэн
 * алхмууд алдаагаа бүртгээд алгасна. CRON_SECRET-ээр хамгаалагдсан.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();
        const deadline = metaDeadline(RUN_BUDGET_MS);

        const shops = await fetchAllRows<{ id: string }>((from, to) => supabase.from('shops')
            .select('id').not('facebook_ad_account_id', 'is', null).order('id').range(from, to));
        const dailyResults: { shopId: string; success: boolean; rows?: number }[] = [];
        const insightResults: { shopId: string; success: boolean; rows?: number; weeks?: number; partial?: boolean }[] = [];
        for (const shop of shops) {
            try {
                const result = await syncMetaSpend(supabase, shop.id, {}, deadline);
                dailyResults.push({ shopId: shop.id, success: true, rows: result.rows });
            } catch {
                dailyResults.push({ shopId: shop.id, success: false });
                logger.warn('[Ads Insights Cron] daily sync failed', { shopId: shop.id });
            }
            // Ad set × өдрийн үр дүн + хурлын долоо хоногийн тайлан. Алдаа, хугацаа дутсан нь meta_insights_sync-д бичигдэнэ.
            try {
                const result = await syncMetaInsights(supabase, shop.id, {}, { deadline });
                insightResults.push({ shopId: shop.id, success: !result.partial, rows: result.rows, weeks: result.weeks.length, ...(result.partial ? { partial: true } : {}) });
            } catch {
                insightResults.push({ shopId: shop.id, success: false });
                logger.warn('[Ads Insights Cron] detailed insights sync failed', { shopId: shop.id });
            }
        }

        const success = dailyResults.every(r => r.success) && insightResults.every(r => r.success);
        logger.info('[Ads Insights Cron] done', { shops: shops.length, success });
        return NextResponse.json({ success, dailyResults, insightResults }, { status: success ? 200 : 500 });
    } catch (error) {
        logger.error('[Ads Insights Cron] error', { error });
        return NextResponse.json({ error: 'Insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
