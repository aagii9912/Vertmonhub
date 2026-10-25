import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    permission: vi.fn(), user: vi.fn(), shop: vi.fn(), read: vi.fn(), encrypt: vi.fn(), update: vi.fn(), selected: vi.fn(),
    warn: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: mocks.permission }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: mocks.user, assertShopAccess: mocks.shop,
    supabaseAdmin: () => ({ from: () => ({
        update: mocks.update,
        select: () => ({ eq: () => ({ single: async () => ({ data: { facebook_ad_account_id: mocks.selected() }, error: null }) }) }),
    }) }),
}));
vi.mock('@/lib/facebook/daily-spend', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/facebook/daily-spend')>(), metaRead: mocks.read }));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: mocks.warn, error: mocks.error, info: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ encryptToken: mocks.encrypt }));

import { GET as start } from '@/app/api/marketing/facebook/ads/connect/route';
import { GET as callback } from '@/app/api/marketing/facebook/ads/connect/callback/route';

const connection = () => new NextRequest('http://localhost/api/marketing/facebook/ads/connect?shop_id=shop-1');
const graphResponse = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
/** metaRead-ийн хариу: debug_token, me/permissions, me/adaccounts. */
function graph(options: { type?: string; expiresAt?: number; scopes?: string[]; granted?: boolean; appId?: string; accounts?: string[] } = {}) {
    mocks.read.mockImplementation(async (path: string) => {
        if (path === 'debug_token') return { data: { app_id: options.appId ?? 'new-app', type: options.type ?? 'USER', is_valid: true, expires_at: options.expiresAt ?? 0, scopes: options.scopes ?? [] } };
        if (path === 'me/permissions') return { data: [{ permission: 'ads_read', status: options.granted === false ? 'declined' : 'granted' }] };
        if (path === 'me/adaccounts') return { data: (options.accounts ?? []).map(id => ({ id, account_id: id.slice(4) })) };
        throw new Error(`unexpected ${path}`);
    });
}
async function oauth() {
    const auth = await start(connection());
    const saved = auth.cookies.get('meta_ads_oauth')!.value;
    const url = `http://localhost/api/marketing/facebook/ads/connect/callback?state=${JSON.parse(saved).state}&code=one-time-code`;
    return { saved, url, request: (target = url) => new NextRequest(target, { headers: { cookie: `meta_ads_oauth=${encodeURIComponent(saved)}` } }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('META_ADS_APP_ID', 'new-app');
    vi.stubEnv('META_ADS_APP_SECRET', 'new-secret');
    vi.stubEnv('META_ADS_LOGIN_CONFIG_ID', 'new-config');
    mocks.permission.mockResolvedValue(null);
    mocks.user.mockResolvedValue('user-1');
    mocks.shop.mockResolvedValue('shop-1');
    mocks.selected.mockReturnValue(null);
    graph();
    mocks.encrypt.mockReturnValue('enc:v1:stored');
    mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('starts the dedicated Business Login flow with a bound, HttpOnly state cookie', async () => {
    const response = await start(connection());
    const url = new URL(response.headers.get('location')!);
    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.searchParams.get('client_id')).toBe('new-app');
    expect(url.searchParams.get('config_id')).toBe('new-config');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/api/marketing/facebook/ads/connect/callback');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(JSON.parse(response.cookies.get('meta_ads_oauth')!.value)).toMatchObject({ userId: 'user-1', shopId: 'shop-1' });
});

it('accepts only the same user, shop and OAuth state, then stores the encrypted long-lived user token', async () => {
    const { url, request } = await oauth();
    const http = vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'short' }))
        .mockResolvedValueOnce(graphResponse({ access_token: 'long', expires_in: 3600 }));
    vi.stubGlobal('fetch', http);
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=connected');
    expect(http).toHaveBeenCalledTimes(2);
    for (const [target, options] of http.mock.calls) {
        expect(target).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
        expect(options.method).toBe('POST');
        expect(options.body).toBeInstanceOf(URLSearchParams);
    }
    expect(http.mock.calls[0][1].body.get('client_secret')).toBe('new-secret');
    expect(http.mock.calls[1][1].body.get('fb_exchange_token')).toBe('short');
    // debug_token нь app токеноор (app_id|secret) уншигдана; токены утга URL-д биш header-т.
    expect(mocks.read).toHaveBeenCalledWith('debug_token', 'new-app|new-secret', { input_token: 'short' });
    expect(mocks.read).toHaveBeenCalledWith('me/permissions', 'long');
    const saved = mocks.update.mock.calls[0][0];
    // Данс сонгоогүй тул дансны баганад хүрэхгүй.
    expect(saved).toMatchObject({ meta_ads_user_access_token: 'enc:v1:stored' });
    expect('facebook_ad_account_id' in saved).toBe(false);
    expect(Date.parse(saved.meta_ads_user_token_expires_at)).toBeGreaterThan(Date.now());
    expect(mocks.encrypt).toHaveBeenCalledWith('long');

    mocks.update.mockClear();
    expect((await callback(request(url.replace(/state=[^&]+/, 'state=wrong')))).headers.get('location')).toContain('meta_ads=state_error');
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue('other-user');
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=session_error');
    expect(mocks.update).not.toHaveBeenCalled();
});

it('stores a system-user token without the user-token exchange and keeps a still-readable ad account', async () => {
    const { request } = await oauth();
    graph({ type: 'SYSTEM_USER', expiresAt: 0, scopes: ['ads_read', 'business_management'], accounts: ['act_111', 'act_222'] });
    mocks.selected.mockReturnValue('222');
    const http = vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'system-token' }));
    vi.stubGlobal('fetch', http);
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=connected');
    expect(http).toHaveBeenCalledTimes(1); // fb_exchange_token хийгээгүй
    expect(mocks.encrypt).toHaveBeenCalledWith('system-token');
    expect(mocks.read).not.toHaveBeenCalledWith('me/permissions', expect.anything());
    expect(mocks.read).toHaveBeenCalledWith('me/adaccounts', 'system-token', expect.anything());
    const saved = mocks.update.mock.calls[0][0];
    expect(saved).toEqual({ meta_ads_user_access_token: 'enc:v1:stored', meta_ads_user_token_expires_at: null });
    expect('facebook_ad_account_id' in saved).toBe(false);
});

it('records a system-user expiry when Meta reports one and resets an account the new token cannot read', async () => {
    const { request } = await oauth();
    const expires = Math.floor(Date.now() / 1000) + 86400 * 60;
    graph({ type: 'SYSTEM_USER', expiresAt: expires, scopes: ['ads_read'], accounts: ['act_111'] });
    mocks.selected.mockReturnValue('act_999');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'system-token' })));
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=connected');
    expect(mocks.update.mock.calls[0][0]).toEqual({
        meta_ads_user_access_token: 'enc:v1:stored', meta_ads_user_token_expires_at: new Date(expires * 1000).toISOString(), facebook_ad_account_id: null,
    });
});

it('keeps the selected ad account when the new user token\'s account listing fails (only a successful listing may reset it)', async () => {
    const { request } = await oauth();
    mocks.selected.mockReturnValue('act_222');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'short' }))
        .mockResolvedValueOnce(graphResponse({ access_token: 'long', expires_in: 3600 })));
    graph();
    const listing = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async (path: string, ...rest: unknown[]) => {
        if (path === 'me/adaccounts') throw new Error('Meta зардал татах алдаа (HTTP 400, code 17). Дахин оролдоно уу.');
        return listing(path, ...rest);
    });
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=connected');
    expect(mocks.read).toHaveBeenCalledWith('me/adaccounts', 'long', expect.anything());
    const saved = mocks.update.mock.calls[0][0];
    expect(saved).toMatchObject({ meta_ads_user_access_token: 'enc:v1:stored' });
    expect('facebook_ad_account_id' in saved).toBe(false);
});

describe('with META_ADS_SYSTEM_TOKEN set', () => {
    beforeEach(() => { vi.stubEnv('META_ADS_SYSTEM_TOKEN', 'system-env-token'); });

    it('refuses to start a user OAuth connection for a marketing writer (409, no state cookie)', async () => {
        const response = await start(connection());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Системийн хэрэглэгчийн токен идэвхтэй тул Meta Ads-ийг хэрэглэгчээр холбох шаардлагагүй. Зарын дансыг админ сонгоно.' });
        expect(response.cookies.get('meta_ads_oauth')).toBeUndefined();
        // Эрхийн шалгалт эхэлж хийгдэнэ.
        expect(mocks.permission).toHaveBeenCalledWith('marketing-roi');
    });

    it('stops a callback with a state cookie issued before the system token was set: no token exchange, no write', async () => {
        vi.stubEnv('META_ADS_SYSTEM_TOKEN', '');
        const { request } = await oauth();
        vi.stubEnv('META_ADS_SYSTEM_TOKEN', 'system-env-token');
        mocks.selected.mockReturnValue('act_222');
        const http = vi.fn();
        vi.stubGlobal('fetch', http);
        const response = await callback(request());
        expect(response.headers.get('location')).toContain('meta_ads=system_token');
        expect(response.headers.get('set-cookie')).toMatch(/meta_ads_oauth=;/);
        expect(http).not.toHaveBeenCalled();
        expect(mocks.read).not.toHaveBeenCalled();
        expect(mocks.encrypt).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});

it('rejects tokens issued for another app or reported invalid', async () => {
    const { request } = await oauth();
    graph({ appId: 'other-app' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(graphResponse({ access_token: 'short' })));
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=token_error');
    expect(mocks.update).not.toHaveBeenCalled();
});

it('does not store a token when ads_read was not granted', async () => {
    const { request } = await oauth();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'short' }))
        .mockResolvedValueOnce(graphResponse({ access_token: 'long', expires_in: 3600 })));
    graph({ granted: false });
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=ads_read_error');
    expect(mocks.update).not.toHaveBeenCalled();
});

describe('callback result page and failure logging', () => {
    const SECRETS = ['short-user-token', 'long-user-token', 'one-time-code', 'new-secret', 'enc:v1:stored'];
    const logged = () => JSON.stringify([...mocks.warn.mock.calls, ...mocks.error.mock.calls]);
    const noSecrets = () => SECRETS.forEach(secret => expect(logged()).not.toContain(secret));
    const result = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('meta_ads');
    const tokens = (long: unknown = { access_token: 'long-user-token', expires_in: 3600 }) => vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(graphResponse({ access_token: 'short-user-token' }))
        .mockResolvedValueOnce(long instanceof Response ? long : graphResponse(long)));

    it('returns to the records tab where MetaSpendSync shows the result, without logging a failure', async () => {
        const { request } = await oauth();
        tokens();
        const location = new URL((await callback(request())).headers.get('location')!);
        expect(location.pathname).toBe('/marketing');
        expect(Object.fromEntries(location.searchParams)).toEqual({ tab: 'records', meta_ads: 'connected' });
        expect(mocks.warn).not.toHaveBeenCalled();
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it('logs one structured line for a refused code exchange and never the token, code, URL or response body', async () => {
        const { request } = await oauth();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: { message: 'This authorization code has been used: one-time-code', type: 'OAuthException', code: 100, error_subcode: 36009 },
        }), { status: 400 })));
        expect(result(await callback(request()))).toBe('token_error');
        expect(mocks.error).toHaveBeenCalledTimes(1);
        expect(mocks.error).toHaveBeenCalledWith('[Meta Ads OAuth] холболт амжилтгүй', {
            result: 'token_error', step: 'code_exchange', shopId: 'shop-1', httpStatus: 400, graphCode: 100, graphSubcode: 36009, graphType: 'OAuthException',
        });
        expect(logged()).not.toContain('graph.facebook.com');
        noSecrets();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('stores the valid short token with its debug expiry (and warns) when the long-lived exchange fails', async () => {
        const { request } = await oauth();
        const expires = Math.floor(Date.now() / 1000) + 3600;
        graph({ expiresAt: expires, scopes: ['ads_read'] });
        tokens(new Response(JSON.stringify({ error: { type: 'OAuthException', code: 1, message: 'long-user-token' } }), { status: 500 }));
        expect(result(await callback(request()))).toBe('connected');
        expect(mocks.encrypt).toHaveBeenCalledWith('short-user-token');
        expect(mocks.update.mock.calls[0][0]).toEqual({ meta_ads_user_access_token: 'enc:v1:stored', meta_ads_user_token_expires_at: new Date(expires * 1000).toISOString() });
        expect(mocks.warn).toHaveBeenCalledTimes(1);
        expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('богино токеныг'), expect.objectContaining({
            result: 'connected', step: 'long_exchange', shopId: 'shop-1', httpStatus: 500, graphCode: 1, graphType: 'OAuthException',
        }));
        expect(mocks.error).not.toHaveBeenCalled();
        noSecrets();
    });

    it('reads a missing expires_in from debug_token on the long token instead of failing with token_error', async () => {
        const { request } = await oauth();
        graph({ scopes: ['ads_read'] }); // expires_at = 0 → хугацаагүй
        tokens({ access_token: 'long-user-token', token_type: 'bearer' });
        expect(result(await callback(request()))).toBe('connected');
        expect(mocks.read).toHaveBeenCalledWith('debug_token', 'new-app|new-secret', { input_token: 'long-user-token' });
        expect(mocks.encrypt).toHaveBeenCalledWith('long-user-token');
        expect(mocks.update.mock.calls[0][0]).toEqual({ meta_ads_user_access_token: 'enc:v1:stored', meta_ads_user_token_expires_at: null });
        expect(mocks.warn).not.toHaveBeenCalled();
    });

    type Case = { name: string; result: string; step: string; level: 'warn' | 'error'; shopId?: string | null; prepare: (flow: Awaited<ReturnType<typeof oauth>>) => NextRequest };
    const cases: Case[] = [
        { name: 'no state cookie', result: 'state_error', step: 'state_cookie', level: 'warn', shopId: null, prepare: ({ url }) => new NextRequest(url) },
        { name: 'forged state', result: 'state_error', step: 'state_mismatch', level: 'warn', prepare: ({ url, request }) => request(url.replace(/state=[^&]+/, `state=${'0'.repeat(64)}`)) },
        { name: 'denied on Facebook', result: 'denied', step: 'oauth_denied', level: 'warn', prepare: ({ url, request }) => request(`${url}&error=access_denied`) },
        { name: 'no code', result: 'missing_code', step: 'oauth_code', level: 'warn', prepare: ({ url, request }) => request(url.replace('&code=one-time-code', '')) },
        { name: 'no marketing write', result: 'permission_error', step: 'permission', level: 'warn', prepare: ({ request }) => { mocks.permission.mockResolvedValue(new Response(null, { status: 403 })); return request(); } },
        { name: 'other user', result: 'session_error', step: 'session', level: 'warn', prepare: ({ request }) => { mocks.user.mockResolvedValue('user-2'); return request(); } },
        { name: 'system token set', result: 'system_token', step: 'system_token', level: 'warn', prepare: ({ request }) => { vi.stubEnv('META_ADS_SYSTEM_TOKEN', 'system-env-token'); return request(); } },
        { name: 'app secret missing', result: 'config_error', step: 'app_config', level: 'error', prepare: ({ request }) => { vi.stubEnv('META_ADS_APP_SECRET', ''); return request(); } },
        { name: 'network down', result: 'connection_error', step: 'code_exchange', level: 'error', prepare: ({ request }) => { vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed'))); return request(); } },
        { name: 'invalid token', result: 'token_error', step: 'token_invalid', level: 'error', prepare: ({ request }) => {
            tokens();
            mocks.read.mockResolvedValue({ data: { app_id: 'new-app', is_valid: false, error: { code: 190, subcode: 463 } } });
            return request();
        } },
        { name: 'ads_read declined', result: 'ads_read_error', step: 'ads_read', level: 'warn', prepare: ({ request }) => { tokens(); graph({ granted: false }); return request(); } },
        { name: 'encryption unavailable', result: 'save_error', step: 'encrypt', level: 'error', prepare: ({ request }) => { tokens(); mocks.encrypt.mockReturnValue(null); return request(); } },
        { name: 'shop update fails', result: 'save_error', step: 'shop_update', level: 'error', prepare: ({ request }) => {
            tokens();
            mocks.update.mockReturnValue({ eq: async () => ({ error: { code: '42501', message: 'permission denied' } }) });
            return request();
        } },
    ];
    it.each(cases)('logs exactly one structured line for $name → $result ($step)', async ({ result: expected, step, level, shopId, prepare }) => {
        const flow = await oauth();
        const response = await callback(prepare(flow));
        expect(result(response)).toBe(expected);
        expect(response.headers.get('set-cookie')).toMatch(/meta_ads_oauth=;/);
        const [used, other] = level === 'warn' ? [mocks.warn, mocks.error] : [mocks.error, mocks.warn];
        expect(used).toHaveBeenCalledTimes(1);
        expect(other).not.toHaveBeenCalled();
        expect(used.mock.calls[0][0]).toBe('[Meta Ads OAuth] холболт амжилтгүй');
        expect(used.mock.calls[0][1]).toMatchObject({ result: expected, step, shopId: shopId === undefined ? 'shop-1' : shopId });
        expect(Object.keys(used.mock.calls[0][1]).slice(0, 7)).toEqual(['result', 'step', 'shopId', 'httpStatus', 'graphCode', 'graphSubcode', 'graphType']);
        noSecrets();
    });
});
