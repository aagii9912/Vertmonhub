import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserId, assertShopAccess, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { encryptToken } from '@/lib/crypto/tokens';
import { metaRead } from '@/lib/facebook/daily-spend';
import { META_ADS_CALLBACK_PATH, META_ADS_OAUTH_COOKIE } from '../route';

export const dynamic = 'force-dynamic';

type OAuthState = { state: string; userId: string; shopId: string };

export async function GET(request: NextRequest) {
    const finish = (result: string) => {
        const url = new URL('/marketing', request.nextUrl.origin);
        url.searchParams.set('meta_ads', result);
        const response = NextResponse.redirect(url);
        response.cookies.set(META_ADS_OAUTH_COOKIE, '', { maxAge: 0, path: '/api/marketing/facebook/ads/connect' });
        return response;
    };
    let saved: OAuthState | null = null;
    try { saved = JSON.parse(request.cookies.get(META_ADS_OAUTH_COOKIE)?.value || 'null') as OAuthState | null; }
    catch { return finish('state_error'); }
    const state = request.nextUrl.searchParams.get('state');
    if (typeof saved?.state !== 'string' || typeof saved.userId !== 'string' || typeof saved.shopId !== 'string' || !state || saved.state.length !== state.length ||
        !crypto.timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) return finish('state_error');
    if (request.nextUrl.searchParams.has('error')) return finish('denied');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return finish('missing_code');

    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return finish('permission_error');
    const userId = await getUserId();
    const shopId = await assertShopAccess(saved.shopId);
    if (!userId || userId !== saved.userId || shopId !== saved.shopId) return finish('session_error');

    const appId = process.env.META_ADS_APP_ID?.trim();
    const appSecret = process.env.META_ADS_APP_SECRET?.trim();
    if (!appId || !appSecret) return finish('config_error');
    const redirectUri = `${request.nextUrl.origin}${META_ADS_CALLBACK_PATH}`;
    try {
        const shortUrl = new URL('https://graph.facebook.com/v26.0/oauth/access_token');
        for (const [key, value] of Object.entries({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })) shortUrl.searchParams.set(key, value);
        const short = await fetch(shortUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        const shortData = await short.json().catch(() => null);
        if (!short.ok || typeof shortData?.access_token !== 'string') return finish('token_error');

        const longUrl = new URL('https://graph.facebook.com/v26.0/oauth/access_token');
        for (const [key, value] of Object.entries({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortData.access_token })) longUrl.searchParams.set(key, value);
        const long = await fetch(longUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        const longData = await long.json().catch(() => null);
        if (!long.ok || typeof longData?.access_token !== 'string' || !Number.isFinite(longData.expires_in) || longData.expires_in <= 0) return finish('token_error');

        const token = longData.access_token as string;
        const permissions = await metaRead<{ data: Array<{ permission: string; status: string }> }>('me/permissions', token);
        if (!Array.isArray(permissions.data) || !permissions.data.some(p => p.permission === 'ads_read' && p.status === 'granted')) return finish('ads_read_error');
        const encrypted = encryptToken(token);
        if (!encrypted?.startsWith('enc:v1:')) return finish('save_error');

        const db = supabaseAdmin();
        const { error } = await db.from('shops').update({
            meta_ads_user_access_token: encrypted,
            meta_ads_user_token_expires_at: new Date(Date.now() + longData.expires_in * 1000).toISOString(),
            facebook_ad_account_id: null,
        }).eq('id', shopId);
        if (error) return finish('save_error');

        return finish('connected');
    } catch { return finish('connection_error'); }
}
