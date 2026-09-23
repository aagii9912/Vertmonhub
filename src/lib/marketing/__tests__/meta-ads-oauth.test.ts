import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    permission: vi.fn(), user: vi.fn(), shop: vi.fn(), read: vi.fn(), encrypt: vi.fn(), update: vi.fn(),
}));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: mocks.permission }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: mocks.user, assertShopAccess: mocks.shop,
    supabaseAdmin: () => ({ from: () => ({ update: mocks.update }) }),
}));
vi.mock('@/lib/facebook/daily-spend', () => ({ metaRead: mocks.read }));
vi.mock('@/lib/crypto/tokens', () => ({ encryptToken: mocks.encrypt }));

import { GET as start } from '@/app/api/marketing/facebook/ads/connect/route';
import { GET as callback } from '@/app/api/marketing/facebook/ads/connect/callback/route';
import { campaignBelongsToAccount } from '@/lib/facebook/marketing-api';

const connection = () => new NextRequest('http://localhost/api/marketing/facebook/ads/connect?shop_id=shop-1');
const graphResponse = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('META_ADS_APP_ID', 'new-app');
    vi.stubEnv('META_ADS_APP_SECRET', 'new-secret');
    vi.stubEnv('META_ADS_LOGIN_CONFIG_ID', 'new-config');
    mocks.permission.mockResolvedValue(null);
    mocks.user.mockResolvedValue('user-1');
    mocks.shop.mockResolvedValue('shop-1');
    mocks.read.mockResolvedValue({ data: [{ permission: 'ads_read', status: 'granted' }] });
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

it('accepts only the same user, shop and OAuth state, then stores the encrypted Ads token without selecting an account', async () => {
    const auth = await start(connection());
    const saved = auth.cookies.get('meta_ads_oauth')!.value;
    const state = JSON.parse(saved).state;
    const http = vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'short' }))
        .mockResolvedValueOnce(graphResponse({ access_token: 'long', expires_in: 3600 }));
    vi.stubGlobal('fetch', http);
    const url = `http://localhost/api/marketing/facebook/ads/connect/callback?state=${state}&code=one-time-code`;
    const request = () => new NextRequest(url, { headers: { cookie: `meta_ads_oauth=${encodeURIComponent(saved)}` } });
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=connected');
    expect(http).toHaveBeenCalledTimes(2);
    for (const [url, options] of http.mock.calls) {
        expect(url).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
        expect(options.method).toBe('POST');
        expect(options.body).toBeInstanceOf(URLSearchParams);
    }
    expect(http.mock.calls[0][1].body.get('client_secret')).toBe('new-secret');
    expect(http.mock.calls[1][1].body.get('fb_exchange_token')).toBe('short');
    expect(mocks.read).toHaveBeenCalledWith('me/permissions', 'long');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ meta_ads_user_access_token: 'enc:v1:stored', facebook_ad_account_id: null }));

    mocks.update.mockClear();
    expect((await callback(new NextRequest(url.replace(`state=${state}`, 'state=wrong'), { headers: { cookie: `meta_ads_oauth=${encodeURIComponent(saved)}` } }))).headers.get('location')).toContain('meta_ads=state_error');
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue('other-user');
    expect((await callback(request())).headers.get('location')).toContain('meta_ads=session_error');
    expect(mocks.update).not.toHaveBeenCalled();
});

it('only accepts campaigns returned by Meta for the selected ad account', async () => {
    mocks.read.mockResolvedValueOnce({ id: '42', account_id: '123' })
        .mockResolvedValueOnce({ id: '42', account_id: '999' });
    expect(await campaignBelongsToAccount('42', 'act_123', 'ads-token')).toBe(true);
    expect(await campaignBelongsToAccount('42', 'act_123', 'ads-token')).toBe(false);
    expect(await campaignBelongsToAccount('../42', 'act_123', 'ads-token')).toBe(false);
    expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('does not store a token when ads_read was not granted', async () => {
    const auth = await start(connection());
    const saved = auth.cookies.get('meta_ads_oauth')!.value;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(graphResponse({ access_token: 'short' }))
        .mockResolvedValueOnce(graphResponse({ access_token: 'long', expires_in: 3600 })));
    mocks.read.mockResolvedValue({ data: [{ permission: 'ads_read', status: 'declined' }] });
    const response = await callback(new NextRequest(`http://localhost/api/marketing/facebook/ads/connect/callback?state=${JSON.parse(saved).state}&code=code`,
        { headers: { cookie: `meta_ads_oauth=${encodeURIComponent(saved)}` } }));
    expect(response.headers.get('location')).toContain('meta_ads=ads_read_error');
    expect(mocks.update).not.toHaveBeenCalled();
});
