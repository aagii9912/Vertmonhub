import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchCampaignInsights } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const dynamic = 'force-dynamic';

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

        const { data: shops } = await supabase
            .from('shops')
            .select('id, facebook_user_access_token, facebook_page_access_token')
            .not('facebook_page_access_token', 'is', null);

        let updated = 0;
        for (const shop of shops || []) {
            // Ads insights нь ads_read (USER token) шаардана — Page token-д БИШ.
            const token = decryptToken(shop.facebook_user_access_token) || decryptToken(shop.facebook_page_access_token);
            if (!token) continue;

            const { data: campaigns } = await supabase
                .from('ad_campaigns')
                .select('external_id')
                .eq('shop_id', shop.id)
                .eq('platform', 'facebook')
                .not('external_id', 'is', null);

            for (const c of campaigns || []) {
                try {
                    const result = await fetchCampaignInsights(c.external_id, token, 'last_30d');
                    const insight = result.data?.[0];
                    if (!insight) continue;

                    const conversions = (insight.actions || [])
                        .filter(a => /lead|complete_registration|purchase/i.test(a.action_type))
                        .reduce((sum, a) => sum + Number(a.value || 0), 0);

                    await supabase
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
                    updated++;
                } catch (e) {
                    logger.warn('[Ads Insights Cron] campaign sync failed', { campaign: c.external_id, error: e });
                }
            }
        }

        logger.info('[Ads Insights Cron] done', { updated });
        return NextResponse.json({ success: true, updated });
    } catch (error) {
        logger.error('[Ads Insights Cron] error', { error });
        return NextResponse.json({ error: 'Insights sync failed' }, { status: 500 });
    }
}

export const GET = POST;
