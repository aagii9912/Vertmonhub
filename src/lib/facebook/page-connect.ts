/**
 * Facebook Page / Instagram холболт — бүхэлдээ серверт (docs/features/META-PAGE-INSIGHTS-2026-10-05.md).
 *
 *  1) start: `?shop_id=`-ийг гишүүнчлэлээр шалгаж, state + хэрэглэгч + төслийг httpOnly cookie-д холбоно.
 *  2) callback: code → long-lived user токен (POST, Graph v26) → `me/accounts` (токенгүй жагсаалт) ба
 *     олгосон эрхүүд → `meta_page_connect_pending`-д шифрлэгдсэн user токентой 30 минут хадгална.
 *  3) GET pages: зөвхөн id, нэр, ангилал, IG нэр, дутуу эрх. Токен браузерт хэзээ ч очихгүй.
 *  4) POST select: сонгосон Page жагсаалтад байгааг шалгаж, Page токеныг Graph-аас авч шифрлээд shop-д
 *     хадгална, pending мөрийг устгана. /api/shop PATCH токен хүлээж авахгүй.
 */
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertShopAccess, getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { decryptToken, encryptToken } from '@/lib/crypto/tokens';
import { META_GRAPH_VERSION, MetaApiError } from '@/lib/facebook/daily-spend';
import { pageRead } from '@/lib/facebook/page-graph';
import { subscribePageToApp } from '@/lib/facebook/marketing-api';
import { logger } from '@/lib/utils/logger';

export type PageConnectFlow = 'facebook' | 'instagram';

/**
 * Facebook Page: жагсаах, нийтлэл/engagement унших, DM, webhook, Page insights (read_insights).
 * ⚠️ 'email' нь энэ FB-Login-for-Business аппад invalid scope (dialog-ийг блоклодог). Login for Business
 * `config_id` ашиглавал эрхүүдийг тохиргоонд нь нэмнэ (scope параметрийг үл тооно).
 */
export const PAGE_OAUTH_SCOPES = [
    'pages_show_list', 'pages_read_engagement', 'read_insights', 'pages_messaging', 'pages_manage_metadata',
    'ads_read', 'business_management', 'public_profile',
] as const;
/** Instagram: Page-тэй холбогдсон Business аккаунт, DM, сэтгэгдэл, insights. */
export const IG_OAUTH_SCOPES = [
    'pages_show_list', 'pages_read_engagement', 'pages_messaging', 'pages_manage_metadata',
    'instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments', 'instagram_manage_insights', 'public_profile',
] as const;
/** Insights-д заавал хэрэгтэй эрх — олгоогүй бол сонгох цонхонд анхааруулна. */
const REQUIRED_INSIGHT_SCOPES: Record<PageConnectFlow, readonly string[]> = {
    facebook: ['pages_read_engagement', 'read_insights'],
    instagram: ['pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'],
};

const PENDING_TTL_MS = 30 * 60 * 1000;
const MAX_PAGES = 100;
const FLOW = {
    facebook: { cookie: 'fb_oauth', callback: '/api/auth/facebook/callback', scopes: PAGE_OAUTH_SCOPES, param: 'fb' },
    instagram: { cookie: 'ig_oauth', callback: '/api/auth/instagram/callback', scopes: IG_OAUTH_SCOPES, param: 'ig' },
} as const;

type OAuthState = { state: string; userId: string; shopId: string };
export interface PendingPage {
    id: string;
    name: string;
    category?: string;
    instagram?: { id: string; username?: string; name?: string };
}
interface GraphAccount {
    id?: unknown;
    name?: unknown;
    category?: unknown;
    instagram_business_account?: { id?: unknown; username?: unknown; name?: unknown };
}

const isGraphId = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,30}$/.test(value);
const text = (value: unknown, max = 200): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

function socialRedirect(request: NextRequest, flow: PageConnectFlow, result: string, extra: Record<string, string> = {}) {
    const url = new URL('/marketing/social', request.nextUrl.origin);
    url.searchParams.set(result === 'success' ? `${FLOW[flow].param}_success` : `${FLOW[flow].param}_error`, result === 'success' ? 'true' : result);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    const response = NextResponse.redirect(url);
    response.cookies.set(FLOW[flow].cookie, '', { maxAge: 0, path: FLOW[flow].callback });
    return response;
}

/**
 * OAuth эхлэл: төслийн гишүүнчлэл, state cookie нь зөвхөн callback зам дээр илгээгдэнэ.
 * Дуудагч route `requireModuleWrite('marketing-roi')`-ийг ӨМНӨ нь шалгана.
 */
export async function startPageOAuth(request: NextRequest, flow: PageConnectFlow): Promise<NextResponse> {
    const userId = await getUserId();
    const shopId = await assertShopAccess(request.nextUrl.searchParams.get('shop_id'));
    if (!userId || !shopId) return NextResponse.json({ error: 'Нэвтрэх эсвэл төслийн эрх шаардлагатай.' }, { status: 401 });
    const appId = process.env.FACEBOOK_APP_ID?.trim();
    if (!appId || !process.env.FACEBOOK_APP_SECRET?.trim()) {
        return NextResponse.json({ error: 'Facebook app-ийн тохиргоо (FACEBOOK_APP_ID, FACEBOOK_APP_SECRET) дутуу байна.' }, { status: 503 });
    }

    const state = crypto.randomBytes(32).toString('hex');
    const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', `${request.nextUrl.origin}${FLOW[flow].callback}`);
    url.searchParams.set('scope', FLOW[flow].scopes.join(','));
    // Facebook Login for Business-ийн тохиргоо (зөвхөн Page урсгалд, сонголтоор).
    const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim();
    if (flow === 'facebook' && configId && process.env.FACEBOOK_LOGIN_USE_CONFIG?.trim().toLowerCase() === 'true') {
        url.searchParams.set('config_id', configId);
    }
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);

    const response = NextResponse.redirect(url);
    // Хуучин урсгал Page/user токенуудыг эдгээр cookie-д (base64) 24 цаг хадгалдаг байсан — арилгана.
    for (const legacy of ['fb_pages', 'ig_accounts']) response.cookies.set(legacy, '', { maxAge: 0, path: '/' });
    // sameSite:'lax' ЗААВАЛ — facebook.com-оос буцах redirect дээр cookie илгээгдэнэ.
    response.cookies.set(FLOW[flow].cookie, JSON.stringify({ state, userId, shopId } satisfies OAuthState), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: FLOW[flow].callback,
    });
    return response;
}

async function exchangeToken(params: Record<string, string>): Promise<{ access_token: string; expires_in?: number } | null> {
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => null);
    return response.ok && typeof data?.access_token === 'string' ? data : null;
}

function pendingPages(accounts: GraphAccount[], flow: PageConnectFlow): PendingPage[] {
    const pages: PendingPage[] = [];
    for (const account of accounts) {
        if (!isGraphId(account.id)) continue;
        const ig = account.instagram_business_account;
        const instagram = ig && isGraphId(ig.id) ? { id: ig.id, username: text(ig.username, 100), name: text(ig.name) } : undefined;
        if (flow === 'instagram' && !instagram) continue;
        pages.push({ id: account.id, name: text(account.name) ?? account.id, category: text(account.category, 100), ...(instagram ? { instagram } : {}) });
        if (pages.length >= MAX_PAGES) break;
    }
    return pages;
}

/**
 * OAuth callback: токенуудыг зөвхөн серверт солиод сонголтыг pending мөрөнд хадгална. Дуудагч route
 * `requireModuleWrite('marketing-roi')`-ийг ӨМНӨ нь шалгана; энд state, хэрэглэгч, төслийг тулгана.
 */
export async function finishPageOAuth(request: NextRequest, flow: PageConnectFlow): Promise<NextResponse> {
    let saved: OAuthState | null = null;
    try { saved = JSON.parse(request.cookies.get(FLOW[flow].cookie)?.value || 'null') as OAuthState | null; }
    catch { return socialRedirect(request, flow, 'state_mismatch'); }
    const state = request.nextUrl.searchParams.get('state');
    // State нь 32 байтын hex; хэлбэрийг шалгасны дараа л timingSafeEqual (ижил байтын урт).
    const isState = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    if (!isState(saved?.state) || typeof saved.userId !== 'string' || typeof saved.shopId !== 'string' || !isState(state) ||
        !crypto.timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) {
        return socialRedirect(request, flow, 'state_mismatch');
    }
    if (request.nextUrl.searchParams.has('error')) return socialRedirect(request, flow, 'denied');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return socialRedirect(request, flow, 'no_code');

    const userId = await getUserId();
    const shopId = await assertShopAccess(saved.shopId);
    if (!userId || userId !== saved.userId || shopId !== saved.shopId) return socialRedirect(request, flow, 'session_error');

    const appId = process.env.FACEBOOK_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!appId || !appSecret) return socialRedirect(request, flow, 'config_missing');

    try {
        const short = await exchangeToken({ client_id: appId, client_secret: appSecret, redirect_uri: `${request.nextUrl.origin}${FLOW[flow].callback}`, code });
        if (!short) return socialRedirect(request, flow, 'token_error');
        // Long-lived user токен: түүнээс үүсэх Page токен хугацаагүй. Алдаа бол богино токеноор үргэлжилнэ.
        const long = await exchangeToken({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token })
            .catch(() => null);
        const userToken = long?.access_token ?? short.access_token;
        const expiresIn = long ? long.expires_in : short.expires_in;

        // instagram_business_account-ийг зөвхөн IG урсгалд (instagram_basic эрхтэй үед) асууна.
        const fields = flow === 'instagram' ? 'id,name,category,instagram_business_account{id,username,name}' : 'id,name,category';
        const [accounts, permissions] = await Promise.all([
            pageRead<{ data?: GraphAccount[] }>('me/accounts', userToken, { fields, limit: String(MAX_PAGES) }),
            pageRead<{ data?: Array<{ permission?: string; status?: string }> }>('me/permissions', userToken).catch(() => ({ data: undefined })),
        ]);
        if (!Array.isArray(accounts.data)) return socialRedirect(request, flow, 'pages_error');
        const pages = pendingPages(accounts.data, flow);
        if (pages.length === 0) return socialRedirect(request, flow, flow === 'instagram' ? 'no_instagram_account' : 'no_pages');
        const granted = Array.isArray(permissions.data)
            ? permissions.data.filter(p => p.status === 'granted' && typeof p.permission === 'string').map(p => p.permission as string)
            : [];

        const encrypted = encryptToken(userToken);
        if (!encrypted?.startsWith('enc:v1:')) return socialRedirect(request, flow, 'save_error');
        await purgeExpiredPageConnections();
        const { error } = await supabaseAdmin().from('meta_page_connect_pending').upsert({
            user_id: userId, shop_id: shopId, flow,
            user_token: encrypted,
            user_token_expires_at: typeof expiresIn === 'number' && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
            pages, granted_scopes: granted,
            expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
            created_at: new Date().toISOString(),
        }, { onConflict: 'user_id,shop_id,flow' });
        if (error) {
            logger.warn('[Page OAuth] pending хадгалсангүй', { flow, error: error.message });
            return socialRedirect(request, flow, 'save_error');
        }
        return socialRedirect(request, flow, 'success', { page_count: String(pages.length) });
    } catch (error) {
        logger.warn('[Page OAuth] callback алдаа', { flow, code: error instanceof MetaApiError ? error.code : null });
        return socialRedirect(request, flow, 'exception');
    }
}

interface PendingRow {
    user_token: string;
    user_token_expires_at: string | null;
    pages: PendingPage[];
    granted_scopes: string[] | null;
    expires_at: string;
}

async function loadPending(userId: string, shopId: string, flow: PageConnectFlow): Promise<PendingRow | null> {
    const { data, error } = await supabaseAdmin().from('meta_page_connect_pending')
        .select('user_token, user_token_expires_at, pages, granted_scopes, expires_at')
        .eq('user_id', userId).eq('shop_id', shopId).eq('flow', flow).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (!(Date.parse(data.expires_at) > Date.now()) || !Array.isArray(data.pages)) {
        // Хугацаа дууссан шифрлэгдсэн токеныг хадгалж үлдээхгүй.
        await supabaseAdmin().from('meta_page_connect_pending').delete().eq('user_id', userId).eq('shop_id', shopId).eq('flow', flow);
        return null;
    }
    return data as PendingRow;
}

const SESSION_EXPIRED = { pages: [], code: 'SESSION_EXPIRED', message: 'Facebook холболтын хугацаа дууссан. Дахин холбоно уу.' };

/** Сонгох боломжтой Page-үүд (токенгүй) ба insights-д дутуу эрх. Шалгалт: marketing-roi бичих эрх + төсөл. */
export async function listPendingPages(flow: PageConnectFlow, shopId: string): Promise<Response> {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const pending = await loadPending(userId, shopId, flow);
    if (!pending) return NextResponse.json(SESSION_EXPIRED);
    const granted = new Set(pending.granted_scopes ?? []);
    return NextResponse.json({
        pages: pending.pages.map(page => ({ id: page.id, name: page.name, category: page.category, instagram: page.instagram })),
        missing_permissions: granted.size ? REQUIRED_INSIGHT_SCOPES[flow].filter(scope => !granted.has(scope)) : [],
    });
}

/** Сонгосон Page/IG-г shop-д серверээс хадгална. Токен хариунд орохгүй. */
export async function selectPendingPage(flow: PageConnectFlow, shopId: string, pageId: unknown): Promise<Response> {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (!isGraphId(pageId)) return NextResponse.json({ error: 'Page сонгоно уу.' }, { status: 400 });
    const pending = await loadPending(userId, shopId, flow);
    if (!pending) return NextResponse.json({ error: SESSION_EXPIRED.message, code: SESSION_EXPIRED.code }, { status: 400 });
    const page = pending.pages.find(p => p.id === pageId);
    if (!page || (flow === 'instagram' && !page.instagram)) return NextResponse.json({ error: 'Сонгосон Page жагсаалтад алга.' }, { status: 404 });
    const userToken = decryptToken(pending.user_token);
    if (!userToken) return NextResponse.json({ error: SESSION_EXPIRED.message, code: SESSION_EXPIRED.code }, { status: 400 });

    let pageToken: string;
    let instagram = page.instagram;
    try {
        const detail = await pageRead<{ id?: string; name?: string; access_token?: string; instagram_business_account?: GraphAccount['instagram_business_account'] }>(
            pageId, userToken, { fields: flow === 'instagram' ? 'id,name,access_token,instagram_business_account{id,username,name}' : 'id,name,access_token' });
        if (detail.id !== pageId || typeof detail.access_token !== 'string' || !detail.access_token) {
            return NextResponse.json({ error: 'Энэ Page-ийн эрх танд алга. Facebook-ийн Page-ийн тохиргоогоо шалгана уу.' }, { status: 403 });
        }
        pageToken = detail.access_token;
        const ig = detail.instagram_business_account;
        if (flow === 'instagram') {
            if (!ig || ig.id !== page.instagram?.id) return NextResponse.json({ error: 'Instagram аккаунт энэ Page-ээс салсан байна. Дахин холбоно уу.' }, { status: 409 });
            instagram = { id: ig.id as string, username: text(ig.username, 100), name: text(ig.name) };
        }
    } catch (error) {
        const message = error instanceof MetaApiError ? error.message : 'Facebook-оос Page-ийн эрх авч чадсангүй.';
        return NextResponse.json({ error: message }, { status: 502 });
    }

    const encrypted = encryptToken(pageToken);
    if (!encrypted?.startsWith('enc:v1:')) return NextResponse.json({ error: 'Токен хадгалж чадсангүй.' }, { status: 500 });
    const tokenExpiresAt = pending.user_token_expires_at;
    const update = flow === 'facebook'
        ? { facebook_page_id: page.id, facebook_page_name: page.name, facebook_page_access_token: encrypted, facebook_token_expires_at: tokenExpiresAt }
        : { instagram_business_account_id: instagram!.id, instagram_username: instagram!.username ?? null, instagram_access_token: encrypted, instagram_token_expires_at: tokenExpiresAt };
    const db = supabaseAdmin();
    const { error } = await db.from('shops').update(update).eq('id', shopId);
    if (error) {
        logger.warn('[Page OAuth] shop хадгалсангүй', { flow, error: error.message });
        return NextResponse.json({ error: 'Хадгалж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
    }
    await db.from('meta_page_connect_pending').delete().eq('user_id', userId).eq('shop_id', shopId).eq('flow', flow);

    // DM webhook: Page-ийг app-д subscribe (idempotent, блоклохгүй).
    const webhookSubscribed = flow === 'facebook' ? (await subscribePageToApp(page.id, pageToken)).success : undefined;
    return NextResponse.json({
        success: true,
        page: flow === 'facebook' ? { id: page.id, name: page.name } : { id: instagram!.id, name: instagram!.username ?? instagram!.name ?? page.name },
        webhookSubscribed,
    });
}

/** Хугацаа дууссан бүх сонголтыг (шифрлэгдсэн user токен) устгана — cron болон callback дуудна. */
export async function purgeExpiredPageConnections(): Promise<void> {
    const { error } = await supabaseAdmin().from('meta_page_connect_pending').delete().lt('expires_at', new Date().toISOString());
    if (error) logger.warn('[Page OAuth] хугацаа дууссан сонголтыг устгаж чадсангүй', { error: error.message });
}

/** Shop-ийн холбосон Page (токен тайлсан) — зөвхөн серверийн route-д. */
export async function loadShopPage(shopId: string): Promise<{ pageId: string; pageName: string | null; token: string } | null> {
    const { data, error } = await supabaseAdmin().from('shops')
        .select('facebook_page_id, facebook_page_name, facebook_page_access_token').eq('id', shopId).maybeSingle();
    if (error) throw new Error(error.message);
    const token = decryptToken(data?.facebook_page_access_token);
    if (!data?.facebook_page_id || !token) return null;
    return { pageId: data.facebook_page_id, pageName: data.facebook_page_name ?? null, token };
}

/** Shop-ийн холбосон Instagram Business аккаунт (IG токен, эс бөгөөс Page токен). */
export async function loadShopInstagram(shopId: string): Promise<{ igId: string; username: string | null; token: string } | null> {
    const { data, error } = await supabaseAdmin().from('shops')
        .select('instagram_business_account_id, instagram_username, instagram_access_token, facebook_page_access_token').eq('id', shopId).maybeSingle();
    if (error) throw new Error(error.message);
    const token = decryptToken(data?.instagram_access_token) || decryptToken(data?.facebook_page_access_token);
    if (!data?.instagram_business_account_id || !token) return null;
    return { igId: data.instagram_business_account_id, username: data.instagram_username ?? null, token };
}
