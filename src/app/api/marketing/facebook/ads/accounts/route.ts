import { NextRequest, NextResponse } from 'next/server';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getAdAccounts } from '@/lib/facebook/marketing-api';
import { metaAdsToken } from '@/lib/facebook/ads-auth';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/marketing/facebook/ads/accounts
 * Хэрэглэгчийн боломжтой Facebook Ad Account-уудыг буцаана
 */
export async function GET(_req: NextRequest) {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = supabaseAdmin();
        const { data: shop } = await admin
            .from('shops')
            .select('meta_ads_user_access_token, meta_ads_user_token_expires_at, facebook_ad_account_id')
            .eq('id', authShop.id)
            .single();

        const adsToken = metaAdsToken(shop);

        const result = await getAdAccounts(adsToken);

        return NextResponse.json({
            accounts: result.data || [],
            selected_id: shop?.facebook_ad_account_id || null,
        });
    } catch (error: any) {
        logger.error('[FB Ads Accounts] error:', { error });
        if (error?.message?.includes('дууссан')) {
            return NextResponse.json({ error: 'Token хугацаа дууссан', token_expired: true }, { status: 401 });
        }
        if (error?.message?.includes('холболтоо')) return NextResponse.json({ error: 'Meta Ads холболтоо хийнэ үү.', connect_required: true }, { status: 400 });
        if (error?.message?.includes('200') || error?.message?.includes('permission') || error?.message?.includes('ads_read')) {
            return NextResponse.json({
                error: 'ads_read зөвшөөрөл шаардлагатай. Facebook-аар дахин нэвтэрнэ үү.',
                permission_required: true,
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Ad account-ийн жагсаалт татахад алдаа' }, { status: 500 });
    }
}

/**
 * POST /api/marketing/facebook/ads/accounts
 * Хэрэглэгч сонгосон ad_account_id-г shops-д хадгална
 */
export async function POST(req: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const adAccountId = String(body?.ad_account_id || '').trim();
        if (!/^act_\d+$/.test(adAccountId)) {
            return NextResponse.json({ error: 'ad_account_id шаардлагатай' }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const { data: shop, error: readError } = await admin.from('shops')
            .select('meta_ads_user_access_token,meta_ads_user_token_expires_at').eq('id', authShop.id).single();
        if (readError) return NextResponse.json({ error: 'Meta Ads тохиргоог уншиж чадсангүй.' }, { status: 503 });
        const accounts = await getAdAccounts(metaAdsToken(shop));
        if (!accounts.data.some(account => account.id === adAccountId)) {
            return NextResponse.json({ error: 'Энэ зарын данс Meta Ads холболтод байхгүй байна.' }, { status: 403 });
        }
        const { error } = await admin
            .from('shops')
            .update({ facebook_ad_account_id: adAccountId })
            .eq('id', authShop.id);

        if (error) {
            logger.error('[FB Ads Accounts POST] error:', { error });
            return NextResponse.json({ error: 'Хадгалахад алдаа' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, ad_account_id: adAccountId });
    } catch (error) {
        logger.error('[FB Ads Accounts POST] error:', { error });
        return NextResponse.json({ error: 'Хадгалахад алдаа' }, { status: 500 });
    }
}
