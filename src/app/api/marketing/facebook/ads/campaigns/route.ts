import { NextRequest, NextResponse } from 'next/server';
import { getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { fetchAdAccountCampaigns } from '@/lib/facebook/marketing-api';
import { logger } from '@/lib/utils/logger';

const STATUS_MAP: Record<string, 'active' | 'paused' | 'completed' | 'draft'> = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    DELETED: 'completed',
    ARCHIVED: 'completed',
};

/**
 * GET /api/marketing/facebook/ads/campaigns
 * FB Ad Account-ийн campaign-уудыг татаж ad_campaigns хүснэгтэд upsert хийнэ
 */
export async function GET(req: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = supabaseAdmin();
        const { data: shop } = await admin
            .from('shops')
            .select('facebook_page_access_token, facebook_ad_account_id')
            .eq('id', authShop.id)
            .single();

        if (!shop?.facebook_page_access_token) {
            return NextResponse.json({ error: 'Facebook account холбогдоогүй' }, { status: 400 });
        }

        const adAccountId = req.nextUrl.searchParams.get('ad_account_id') || shop.facebook_ad_account_id;
        if (!adAccountId) {
            return NextResponse.json({ error: 'Ad Account ID шаардлагатай' }, { status: 400 });
        }

        const result = await fetchAdAccountCampaigns(adAccountId, shop.facebook_page_access_token);
        const campaigns = result.data || [];

        // Upsert campaigns into ad_campaigns table
        const now = new Date().toISOString();
        for (const c of campaigns) {
            const status = STATUS_MAP[c.status || 'PAUSED'] || 'draft';
            const budget = c.daily_budget
                ? Number(c.daily_budget) / 100
                : c.lifetime_budget
                    ? Number(c.lifetime_budget) / 100
                    : 0;

            await admin
                .from('ad_campaigns')
                .upsert({
                    shop_id: authShop.id,
                    platform: 'facebook',
                    external_id: c.id,
                    name: c.name,
                    status,
                    objective: c.objective || null,
                    budget,
                    start_date: c.start_time ? c.start_time.slice(0, 10) : null,
                    end_date: c.stop_time ? c.stop_time.slice(0, 10) : null,
                    last_synced_at: now,
                    updated_at: now,
                }, { onConflict: 'shop_id,platform,external_id' });
        }

        // Return synced campaigns from DB (so UI sees consistent data)
        const { data: storedCampaigns } = await admin
            .from('ad_campaigns')
            .select('*')
            .eq('shop_id', authShop.id)
            .eq('platform', 'facebook')
            .order('updated_at', { ascending: false });

        return NextResponse.json({
            synced: campaigns.length,
            campaigns: storedCampaigns || [],
        });
    } catch (error: any) {
        logger.error('[FB Ads Campaigns] error:', { error });
        if (error?.message?.includes('190') || error?.message?.includes('token')) {
            return NextResponse.json({ error: 'Token хугацаа дууссан', token_expired: true }, { status: 401 });
        }
        if (error?.message?.includes('200') || error?.message?.includes('permission')) {
            return NextResponse.json({
                error: 'ads_read зөвшөөрөл шаардлагатай.',
                permission_required: true,
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Campaigns татахад алдаа' }, { status: 500 });
    }
}
