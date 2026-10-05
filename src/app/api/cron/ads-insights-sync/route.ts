import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { campaignBelongsToAccount, fetchCampaignInsights } from '@/lib/facebook/marketing-api';
import { metaAdsToken } from '@/lib/facebook/ads-auth';
import { isMetaRateLimitError, metaDeadline, metaStepSignal, metaTimeLeft, type MetaReadOptions } from '@/lib/facebook/daily-spend';
import { syncMetaSpend } from '@/lib/marketing/meta-spend';
import { syncMetaInsights } from '@/lib/marketing/meta-insights';
import { fetchAllRows } from '@/lib/utils/pagination';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
/** Бүх shop-ийн нийт хугацаа: Vercel функцийг зогсоохоос 30 сек өмнө шинэ алхам эхлүүлэхгүй, Graph хүсэлтийг таслана. */
const RUN_BUDGET_MS = (maxDuration - 30) * 1000;
/** Нэг кампанит ажлын snapshot (2 дуудлага, дахин оролдлогогүй) эхлүүлэхэд үлдсэн байх ёстой хугацаа. */
const SNAPSHOT_MIN_MS = 5_000;

/**
 * POST /api/cron/ads-insights-sync
 * Shop бүрийн Meta зарын дансны: (1) өдрийн кампанит ажлын зардал (meta_daily_spend),
 * (2) ad set × өдрийн дэлгэрэнгүй үр дүн + хурлын долоо хоногийн `meta_ads` тайлан
 * (meta_ad_insights_daily, marketing_channel_reports), (3) хуучин ROI-ийн 30 хоногийн snapshot.
 * Нэг shop-ийн алдаа бусдыг зогсоохгүй. Бүх ажил нэг хугацааны хязгаартай: хугацаа дутвал үлдсэн
 * алхмууд алдаагаа бүртгээд алгасна. Snapshot-ийн давталт Meta хурдны хязгаарт хүрмэгц тэр shop-д
 * зогсоно (дуудлага бүрийг дахин оролдохгүй). CRON_SECRET-ээр хамгаалагдсан.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();
        const deadline = metaDeadline(RUN_BUDGET_MS);

        const shops = await fetchAllRows<{ id: string; facebook_ad_account_id: string; meta_ads_user_access_token: string | null; meta_ads_user_token_expires_at: string | null }>((from, to) => supabase.from('shops')
            .select('id,facebook_ad_account_id,meta_ads_user_access_token,meta_ads_user_token_expires_at').not('facebook_ad_account_id', 'is', null).order('id').range(from, to));
        const dailyResults: { shopId: string; success: boolean; rows?: number }[] = [];
        const insightResults: { shopId: string; success: boolean; rows?: number; weeks?: number; partial?: boolean }[] = [];
        let snapshotFailures = 0;
        let snapshotSkipped = 0;
        let updated = 0;
        for (const shop of shops || []) {
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
            let token: string;
            try { token = metaAdsToken(shop); }
            catch { continue; }

            const { data: campaigns, error: campaignError } = await supabase
                .from('ad_campaigns')
                .select('external_id')
                .eq('shop_id', shop.id)
                .eq('platform', 'facebook')
                .not('external_id', 'is', null);

            if (campaignError) { snapshotFailures++; continue; }
            const list = campaigns || [];
            // Олон кампанит ажилтай давталтад metaRead-ийн дахин оролдлого (1+3 сек) давхцахгүй.
            const read = (): MetaReadOptions => ({ retry: false, signal: metaStepSignal(20000, deadline) });
            for (let index = 0; index < list.length; index++) {
                const c = list[index];
                if (metaTimeLeft(deadline) < SNAPSHOT_MIN_MS) {
                    snapshotSkipped += list.length - index;
                    logger.warn('[Ads Insights Cron] time budget reached — snapshot loop stopped', { shopId: shop.id, skipped: list.length - index });
                    break;
                }
                try {
                    if (!await campaignBelongsToAccount(c.external_id, shop.facebook_ad_account_id, token, read())) continue;
                    const result = await fetchCampaignInsights(c.external_id, token, 'last_30d', 'campaign', undefined, read());
                    const insight = result.data?.[0];
                    if (!insight) continue;

                    const conversions = (insight.actions || [])
                        .filter(a => /lead|complete_registration|purchase/i.test(a.action_type))
                        .reduce((sum, a) => sum + Number(a.value || 0), 0);

                    const { error: updateError } = await supabase
                        .from('ad_campaigns')
                        .update({
                            spend: Number(insight.spend) || 0,
                            impressions: Number(insight.impressions) || 0,
                            clicks: Number(insight.clicks) || 0,
                            ctr: Number(insight.ctr) || 0,
                            cpc: Number(insight.cpc) || 0,
                            cpm: Number(insight.cpm) || 0,
                            reach: Number(insight.reach) || 0,
                            conversions,
                            last_synced_at: new Date().toISOString(),
                        })
                        .eq('shop_id', shop.id)
                        .eq('external_id', c.external_id);
                    if (updateError) throw new Error('Snapshot save failed');
                    updated++;
                } catch (error) {
                    snapshotFailures++;
                    if (isMetaRateLimitError(error)) {
                        // Meta хурдны хязгаарт хүрсэн: үлдсэн кампанит ажлыг дараагийн cron-д (6 цаг).
                        snapshotSkipped += list.length - index - 1;
                        logger.warn('[Ads Insights Cron] Meta rate limit — snapshot loop stopped', { shopId: shop.id, skipped: list.length - index - 1 });
                        break;
                    }
                    logger.warn('[Ads Insights Cron] campaign sync failed', { campaign: c.external_id });
                }
            }
        }

        logger.info('[Ads Insights Cron] done', { updated, snapshotSkipped });
        const success = dailyResults.every(r => r.success) && insightResults.every(r => r.success) && snapshotFailures === 0 && snapshotSkipped === 0;
        return NextResponse.json({ success, updated, dailyResults, insightResults, snapshotFailures, snapshotSkipped }, { status: success ? 200 : 500 });
    } catch (error) {
        logger.error('[Ads Insights Cron] error', { error });
        return NextResponse.json({ error: 'Insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
