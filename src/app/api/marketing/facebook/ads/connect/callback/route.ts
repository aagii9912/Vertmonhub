import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserId, assertShopAccess, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { encryptToken } from '@/lib/crypto/tokens';
import { metaRead } from '@/lib/facebook/daily-spend';
import { getAdAccounts } from '@/lib/facebook/marketing-api';
import { META_ADS_CALLBACK_PATH, META_ADS_OAUTH_COOKIE } from '../route';

export const dynamic = 'force-dynamic';

type OAuthState = { state: string; userId: string; shopId: string };
type DebugToken = { data?: { app_id?: string | number; type?: string; is_valid?: boolean; expires_at?: number; scopes?: unknown } };

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
        const tokenUrl = 'https://graph.facebook.com/v26.0/oauth/access_token';
        const short = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }),
            cache: 'no-store',
            signal: AbortSignal.timeout(20000),
        });
        const shortData = await short.json().catch(() => null);
        if (!short.ok || typeof shortData?.access_token !== 'string') return finish('token_error');

        // Токены төрөл, хугацаа: Login for Business-ийн system-user тохиргоо хугацаагүй (expires_at = 0)
        // SYSTEM_USER токен өгдөг — түүнийг богино хугацаат user токен шиг солихгүй.
        const debug = await metaRead<DebugToken>('debug_token', `${appId}|${appSecret}`, { input_token: shortData.access_token });
        if (debug.data?.is_valid !== true || String(debug.data.app_id ?? '') !== appId) return finish('token_error');
        let token: string, expiresAt: string | null;
        if (debug.data.type === 'SYSTEM_USER') {
            token = shortData.access_token;
            const expires = Number(debug.data.expires_at);
            expiresAt = Number.isFinite(expires) && expires > 0 ? new Date(expires * 1000).toISOString() : null;
        } else {
            const long = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortData.access_token }),
                cache: 'no-store',
                signal: AbortSignal.timeout(20000),
            });
            const longData = await long.json().catch(() => null);
            if (!long.ok || typeof longData?.access_token !== 'string' || !Number.isFinite(longData.expires_in) || longData.expires_in <= 0) return finish('token_error');
            token = longData.access_token;
            expiresAt = new Date(Date.now() + longData.expires_in * 1000).toISOString();
        }

        const scopes = Array.isArray(debug.data.scopes) ? debug.data.scopes : [];
        if (!scopes.includes('ads_read')) {
            const permissions = await metaRead<{ data: Array<{ permission: string; status: string }> }>('me/permissions', token);
            if (!Array.isArray(permissions.data) || !permissions.data.some(p => p.permission === 'ads_read' && p.status === 'granted')) return finish('ads_read_error');
        }
        const encrypted = encryptToken(token);
        if (!encrypted?.startsWith('enc:v1:')) return finish('save_error');

        const db = supabaseAdmin();
        // Шинэ токен сонгосон дансыг уншиж чадвал сонголтыг хадгална; эс бөгөөс дахин сонгуулна.
        const { data: current, error: readError } = await db.from('shops').select('facebook_ad_account_id').eq('id', shopId).single();
        if (readError) return finish('save_error');
        const selected = current?.facebook_ad_account_id ? `act_${String(current.facebook_ad_account_id).replace(/^act_/, '')}` : null;
        let keepAccount = false;
        if (selected) {
            try { keepAccount = (await getAdAccounts(token)).data.some(account => account.id === selected); }
            catch { keepAccount = false; }
        }
        const { error } = await db.from('shops').update({
            meta_ads_user_access_token: encrypted,
            meta_ads_user_token_expires_at: expiresAt,
            ...(keepAccount ? {} : { facebook_ad_account_id: null }),
        }).eq('id', shopId);
        if (error) return finish('save_error');

        return finish('connected');
    } catch { return finish('connection_error'); }
}
