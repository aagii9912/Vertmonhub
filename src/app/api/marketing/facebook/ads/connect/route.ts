import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserId, assertShopAccess } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';

export const dynamic = 'force-dynamic';

export const META_ADS_OAUTH_COOKIE = 'meta_ads_oauth';
export const META_ADS_CALLBACK_PATH = '/api/marketing/facebook/ads/connect/callback';

export async function GET(request: NextRequest) {
    // The state cookie and registered redirect must share the same browser host.
    if (process.env.NODE_ENV === 'production' && request.nextUrl.origin !== 'https://www.vertmon.mn') {
        const canonical = new URL('/api/marketing/facebook/ads/connect', 'https://www.vertmon.mn');
        const shopId = request.nextUrl.searchParams.get('shop_id');
        if (shopId) canonical.searchParams.set('shop_id', shopId);
        return NextResponse.redirect(canonical);
    }

    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return denied;
    const userId = await getUserId();
    const shopId = await assertShopAccess(request.nextUrl.searchParams.get('shop_id'));
    if (!userId || !shopId) return NextResponse.json({ error: 'Нэвтрэх эсвэл төслийн эрх шаардлагатай.' }, { status: 401 });

    const appId = process.env.META_ADS_APP_ID?.trim();
    const configId = process.env.META_ADS_LOGIN_CONFIG_ID?.trim();
    if (!appId || !configId || !process.env.META_ADS_APP_SECRET?.trim()) {
        return NextResponse.json({ error: 'Meta Ads app-ийн холболтын тохиргоо дутуу байна.' }, { status: 503 });
    }

    const state = crypto.randomBytes(32).toString('hex');
    const redirectUri = `${request.nextUrl.origin}${META_ADS_CALLBACK_PATH}`;
    const url = new URL('https://www.facebook.com/v26.0/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('config_id', configId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('override_default_response_type', 'true');
    url.searchParams.set('state', state);

    const response = NextResponse.redirect(url);
    response.cookies.set(META_ADS_OAUTH_COOKIE, JSON.stringify({ state, userId, shopId }), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600,
        path: '/api/marketing/facebook/ads/connect',
    });
    return response;
}
