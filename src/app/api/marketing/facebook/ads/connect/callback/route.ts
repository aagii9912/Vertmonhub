import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserId, assertShopAccess, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { encryptToken } from '@/lib/crypto/tokens';
import { metaAdsSystemToken } from '@/lib/facebook/ads-auth';
import { exchangeMetaAdsCode, metaErrorDetails, NO_GRAPH_DETAILS, type MetaAdsOAuthStep, type MetaGraphDetails } from '@/lib/facebook/ads-oauth';
import { MetaApiError, metaRead } from '@/lib/facebook/daily-spend';
import { getAdAccounts } from '@/lib/facebook/marketing-api';
import { META_ADS_OAUTH_RETURN, type MetaAdsOAuthResult } from '@/lib/marketing/meta-ads-oauth-result';
import { logger } from '@/lib/utils/logger';
import { META_ADS_CALLBACK_PATH, META_ADS_OAUTH_COOKIE } from '../route';

export const dynamic = 'force-dynamic';

type OAuthState = { state: string; userId: string; shopId: string };
/** Connect route-ийн state: 32 байтын hex. Хэлбэрийг шалгасны дараа л timingSafeEqual (ижил байтын урт). */
const isState = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
/** Лог руу зөвхөн аюулгүй тэмдэгттэй төслийн ID (cookie-оос, шалгахаас өмнө ч). */
const loggableShop = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : null;
/** Серверийн / Meta-гийн талын алдаа (error); бусад нь хэрэглэгчийн урсгалын үр дүн (warn). */
const SERVER_FAULTS = new Set<MetaAdsOAuthResult>(['config_error', 'token_error', 'save_error', 'connection_error']);

export async function GET(request: NextRequest) {
    let shopId: string | null = null;
    const finish = (result: MetaAdsOAuthResult) => {
        // MetaSpendSync байрладаг таб руу буцаана — үр дүнгийн мессеж тэнд харагдана.
        const url = new URL(META_ADS_OAUTH_RETURN.path, request.nextUrl.origin);
        url.searchParams.set('tab', META_ADS_OAUTH_RETURN.tab);
        url.searchParams.set(META_ADS_OAUTH_RETURN.param, result);
        const response = NextResponse.redirect(url);
        response.cookies.set(META_ADS_OAUTH_COOKIE, '', { maxAge: 0, path: '/api/marketing/facebook/ads/connect' });
        return response;
    };
    /** Амжилтгүй гаралт бүр нэг бүтэцтэй лог мөр бичнэ: токен, code, URL, хариуны бие хэзээ ч биш. */
    const fail = (result: Exclude<MetaAdsOAuthResult, 'connected' | 'connected_short'>, step: MetaAdsOAuthStep, details: Partial<MetaGraphDetails> & { dbCode?: string | null } = {}) => {
        const entry = {
            result, step, shopId,
            httpStatus: details.httpStatus ?? null, graphCode: details.graphCode ?? null, graphSubcode: details.graphSubcode ?? null, graphType: details.graphType ?? null,
            ...(details.dbCode ? { dbCode: details.dbCode } : {}),
        };
        if (SERVER_FAULTS.has(result)) logger.error('[Meta Ads OAuth] холболт амжилтгүй', entry);
        else logger.warn('[Meta Ads OAuth] холболт амжилтгүй', entry);
        return finish(result);
    };

    let saved: OAuthState | null = null;
    try { saved = JSON.parse(request.cookies.get(META_ADS_OAUTH_COOKIE)?.value || 'null') as OAuthState | null; }
    catch { return fail('state_error', 'state_cookie'); }
    if (!isState(saved?.state) || typeof saved.userId !== 'string' || typeof saved.shopId !== 'string') return fail('state_error', 'state_cookie');
    shopId = loggableShop(saved.shopId);
    const state = request.nextUrl.searchParams.get('state');
    if (!isState(state) || !crypto.timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) return fail('state_error', 'state_mismatch');
    if (request.nextUrl.searchParams.has('error')) return fail('denied', 'oauth_denied');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return fail('missing_code', 'oauth_code');

    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return fail('permission_error', 'permission');
    const userId = await getUserId();
    const accessible = await assertShopAccess(saved.shopId);
    if (!userId || userId !== saved.userId || accessible !== saved.shopId) return fail('session_error', 'session');
    // System User токентой үед (env-ийг state cookie олгосны дараа тохируулсан ч) токен солих, хадгалах,
    // дансны сонголтод хүрэхгүй: синк хэрэглэгчийн токеныг ашигладаггүй, дансыг админ сонгоно.
    if (metaAdsSystemToken()) return fail('system_token', 'system_token');

    const appId = process.env.META_ADS_APP_ID?.trim();
    const appSecret = process.env.META_ADS_APP_SECRET?.trim();
    if (!appId || !appSecret) return fail('config_error', 'app_config');
    const redirectUri = `${request.nextUrl.origin}${META_ADS_CALLBACK_PATH}`;
    let step: MetaAdsOAuthStep = 'code_exchange';
    try {
        const exchange = await exchangeMetaAdsCode({ appId, appSecret, redirectUri, code });
        if (!exchange.ok) return fail(exchange.result, exchange.step, exchange);
        const { token, expiresAt, scopes } = exchange.grant;
        if (exchange.fallback) {
            const { step: fallbackStep, ...details } = exchange.fallback;
            logger.warn('[Meta Ads OAuth] урт хугацаат токен авч чадсангүй — хүчинтэй богино токеныг хадгална', {
                result: 'connected_short', step: fallbackStep, shopId, ...NO_GRAPH_DETAILS, ...details, expiresAt,
            });
        }

        step = 'ads_read';
        if (!scopes.includes('ads_read')) {
            const permissions = await metaRead<{ data: Array<{ permission: string; status: string }> }>('me/permissions', token);
            if (!Array.isArray(permissions.data) || !permissions.data.some(p => p.permission === 'ads_read' && p.status === 'granted')) return fail('ads_read_error', 'ads_read');
        }
        step = 'encrypt';
        const encrypted = encryptToken(token);
        if (!encrypted?.startsWith('enc:v1:')) return fail('save_error', 'encrypt');

        step = 'shop_read';
        const db = supabaseAdmin();
        // Сонгосон дансыг зөвхөн шинэ токены АМЖИЛТТАЙ жагсаалтад байхгүй бол дахин сонгуулна. Жагсаалт
        // татагдаагүй (хурдны хязгаар, сүлжээ) бол сонголт хэвээр — синк Meta-гийн эрхийн алдааг өөрөө харуулна.
        const { data: current, error: readError } = await db.from('shops').select('facebook_ad_account_id').eq('id', saved.shopId).single();
        if (readError) return fail('save_error', 'shop_read', { dbCode: readError.code });
        const selected = current?.facebook_ad_account_id ? `act_${String(current.facebook_ad_account_id).replace(/^act_/, '')}` : null;
        let keepAccount = true;
        if (selected) {
            try { keepAccount = (await getAdAccounts(token)).data.some(account => account.id === selected); }
            catch (error) {
                logger.warn('[Meta Ads OAuth] зарын дансны жагсаалт татагдсангүй — сонгосон дансыг хэвээр үлдээв', { shopId, ...metaErrorDetails(error) });
            }
        }
        step = 'shop_update';
        const { error } = await db.from('shops').update({
            meta_ads_user_access_token: encrypted,
            meta_ads_user_token_expires_at: expiresAt,
            ...(keepAccount ? {} : { facebook_ad_account_id: null }),
        }).eq('id', saved.shopId);
        if (error) return fail('save_error', 'shop_update', { dbCode: error.code });

        // Богино (1–2 цагийн) токен хадгалсан бол амжилт гэж бүү хэл — удахгүй дахин холбохыг анхааруулна.
        return finish(exchange.fallback ? 'connected_short' : 'connected');
    } catch (error) {
        // HTTP хариу ирсэн Graph алдаа = токен/эрхийн асуудал; бусад нь сүлжээ, хугацаа.
        const graphFailure = error instanceof MetaApiError && error.status !== null;
        return fail(graphFailure ? 'token_error' : 'connection_error', step, metaErrorDetails(error));
    }
}
