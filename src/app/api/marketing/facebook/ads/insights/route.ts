import { NextRequest, NextResponse } from 'next/server';
import { getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { campaignBelongsToAccount, fetchCampaignInsights } from '@/lib/facebook/marketing-api';
import { metaAdsToken } from '@/lib/facebook/ads-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/marketing/facebook/ads/insights?campaign_id=...&date_preset=last_30d
 * FB campaign-ийн insights татаад ad_campaigns мөрийг шинэчлэнэ.
 */
export async function GET(req: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sp = req.nextUrl.searchParams;
        const externalId = sp.get('campaign_id');
        const datePreset = sp.get('date_preset') || 'last_30d';

        if (!externalId) {
            return NextResponse.json({ error: 'campaign_id шаардлагатай' }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const { data: shop } = await admin
            .from('shops')
            .select('meta_ads_user_access_token, meta_ads_user_token_expires_at, facebook_ad_account_id')
            .eq('id', authShop.id)
            .single();

        const adsToken = metaAdsToken(shop);

        const adAccountId = shop?.facebook_ad_account_id;
        if (!adAccountId) return NextResponse.json({ error: 'Зарын данс сонгоно уу.' }, { status: 400 });
        if (!await campaignBelongsToAccount(externalId, adAccountId, adsToken)) {
            return NextResponse.json({ error: 'Кампанит ажил сонгосон зарын дансанд байхгүй байна.' }, { status: 403 });
        }

        const result = await fetchCampaignInsights(externalId, adsToken, datePreset);
        const insight = result.data?.[0];

        if (insight) {
            const conversions = (insight.actions || [])
                .filter(a => /lead|complete_registration|purchase/i.test(a.action_type))
                .reduce((sum, a) => sum + Number(a.value || 0), 0);

            await admin
                .from('ad_campaigns')
                .update({
                    spend: Number(insight.spend || 0),
                    impressions: Number(insight.impressions || 0),
                    clicks: Number(insight.clicks || 0),
                    ctr: Number(insight.ctr || 0),
                    cpc: Number(insight.cpc || 0),
                    cpm: Number(insight.cpm || 0),
                    reach: Number(insight.reach || 0),
                    conversions,
                    last_synced_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('shop_id', authShop.id)
                .eq('platform', 'facebook')
                .eq('external_id', externalId);
        }

        return NextResponse.json({
            insight: insight || null,
            updated: !!insight,
        });
    } catch (error: any) {
        logger.error('[FB Ads Insights] error:', { error });
        if (error?.message?.includes('190') || error?.message?.includes('token')) {
            return NextResponse.json({ error: 'Token хугацаа дууссан', token_expired: true }, { status: 401 });
        }
        return NextResponse.json({ error: 'Insights татахад алдаа' }, { status: 500 });
    }
}
