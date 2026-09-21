import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchCampaignInsights } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';
import { syncMetaSpend } from '@/lib/marketing/meta-spend';
import { fetchAllRows } from '@/lib/utils/pagination';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/cron/ads-insights-sync
 * Shop бүрийн Facebook кампанит ажлуудын insights (spend, impressions, ...)-ыг шинэчилнэ.
 * Ингэснээр ROI dashboard-ийн зардал сэргэж байна. CRON_SECRET-ээр хамгаалагдсан.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();

        const shops = await fetchAllRows<{ id: string; facebook_user_access_token: string }>((from, to) => supabase.from('shops')
            .select('id,facebook_user_access_token').not('facebook_ad_account_id', 'is', null).order('id').range(from, to));
        const dailyResults: { shopId: string; success: boolean; rows?: number }[] = [];
        let snapshotFailures = 0;
        let updated = 0;
        for (const shop of shops || []) {
            try {
                const result = await syncMetaSpend(supabase, shop.id);
                dailyResults.push({ shopId: shop.id, success: true, rows: result.rows });
            } catch {
                dailyResults.push({ shopId: shop.id, success: false });
                logger.warn('[Ads Insights Cron] daily sync failed', { shopId: shop.id });
            }
            // Ads insights нь ads_read (USER token) шаардана — Page token-д БИШ.
            const token = decryptToken(shop.facebook_user_access_token);
            if (!token) continue;

            const { data: campaigns, error: campaignError } = await supabase
                .from('ad_campaigns')
                .select('external_id')
                .eq('shop_id', shop.id)
                .eq('platform', 'facebook')
                .not('external_id', 'is', null);

            if (campaignError) { snapshotFailures++; continue; }
            for (const c of campaigns || []) {
                try {
                    const result = await fetchCampaignInsights(c.external_id, token, 'last_30d');
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
                } catch {
                    snapshotFailures++;
                    logger.warn('[Ads Insights Cron] campaign sync failed', { campaign: c.external_id });
                }
            }
        }

        logger.info('[Ads Insights Cron] done', { updated });
        const success = dailyResults.every(r => r.success) && snapshotFailures === 0;
        return NextResponse.json({ success, updated, dailyResults, snapshotFailures }, { status: success ? 200 : 500 });
    } catch (error) {
        logger.error('[Ads Insights Cron] error', { error });
        return NextResponse.json({ error: 'Insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
