// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    read: vi.fn(), write: vi.fn(), shop: vi.fn(), accounts: vi.fn(), update: vi.fn(),
    config: null as Record<string, unknown> | null, insights: { data: null, error: null } as { data: unknown; error: unknown },
}));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value || null, encryptToken: (value: string) => `enc:v1:${value}` }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write, requireAnyModule: mocks.read, requireModuleDelete: mocks.write }));
function table(name: string) {
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q;
    q.single = async () => ({ data: name === 'shops' ? mocks.config : null, error: null });
    q.maybeSingle = async () => name === 'meta_insights_sync' ? mocks.insights : { data: null, error: null };
    q.update = (data: unknown) => mocks.update(name, data);
    return q;
}
const db = { from: table };
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, supabaseAdmin: () => db }));
vi.mock('@/lib/facebook/marketing-api', () => ({ getAdAccounts: mocks.accounts }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { metaAdsToken, metaAdsTokenSource } from '@/lib/facebook/ads-auth';
import { GET as syncState } from '@/app/api/marketing/facebook/ads/spend-sync/route';
import { POST as selectAccount } from '@/app/api/marketing/facebook/ads/accounts/route';
import { PATCH as patchShop } from '@/app/api/shop/route';
import { RECOMMENDED_PROD_ENV, REQUIRED_PROD_ENV } from '@/lib/env';

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'shop-1' });
    mocks.config = { facebook_ad_account_id: 'act_123', meta_ads_user_access_token: null, meta_ads_user_token_expires_at: null };
    mocks.insights = { data: null, error: null };
    mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
});
afterEach(() => vi.unstubAllEnvs());

it('prefers a configured system-user token over the shop user token and ignores a blank one', () => {
    const shop = { meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: future };
    vi.stubEnv('META_ADS_SYSTEM_TOKEN', '  system-token \n');
    expect(metaAdsToken(shop)).toBe('system-token');
    expect(metaAdsTokenSource(shop)).toBe('system');
    expect(metaAdsTokenSource(null)).toBe('system');

    vi.stubEnv('META_ADS_SYSTEM_TOKEN', '   ');
    expect(metaAdsToken(shop)).toBe('user-token');
    expect(metaAdsTokenSource(shop)).toBe('user');
    // NULL хугацаа = хугацаагүй (system user OAuth) — хүчинтэй.
    expect(metaAdsTokenSource({ meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: null })).toBe('user');
    expect(metaAdsTokenSource({ meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: past })).toBeNull();
    expect(() => metaAdsToken({ meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: past })).toThrow(/дууссан/);
    expect(metaAdsTokenSource({ meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: 'not-a-date' })).toBeNull();
    expect(() => metaAdsToken(null)).toThrow(/холболтоо/);
});

it('reports connection state and token source without ever returning a token', async () => {
    vi.stubEnv('META_ADS_SYSTEM_TOKEN', 'system-token');
    let body = await (await syncState()).json();
    expect(body).toMatchObject({ accountId: 'act_123', connected: true, tokenSource: 'system', expiresAt: null, insightsReady: true });

    vi.stubEnv('META_ADS_SYSTEM_TOKEN', '');
    mocks.config = { facebook_ad_account_id: '123', meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: future };
    mocks.insights = { data: { account_id: 'act_123', last_success_at: future, row_count: 40, weeks: 5, result_source: 'results' }, error: null };
    body = await (await syncState()).json();
    expect(body).toMatchObject({ connected: true, tokenSource: 'user', expiresAt: future, insights: { row_count: 40, weeks: 5 } });
    expect(JSON.stringify(body)).not.toContain('user-token');

    mocks.config = { facebook_ad_account_id: null, meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: null };
    body = await (await syncState()).json();
    expect(body).toMatchObject({ accountId: null, connected: true, tokenSource: 'user', expiresAt: null });

    mocks.config = { facebook_ad_account_id: '123', meta_ads_user_access_token: 'user-token', meta_ads_user_token_expires_at: past };
    // Дэлгэрэнгүй синкийн хүснэгт хараахан үүсээгүй бол зардлын төлөвийг унагахгүй.
    mocks.insights = { data: null, error: { code: '42P01', message: 'relation "meta_insights_sync" does not exist' } };
    const response = await syncState();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: false, tokenSource: null, insights: null, insightsReady: false });
});

it('maps the one-account-per-project unique index to 409 and validates the body', async () => {
    vi.stubEnv('META_ADS_SYSTEM_TOKEN', 'system-token');
    mocks.accounts.mockResolvedValue({ data: [{ id: 'act_555', account_id: '555' }] });
    const post = (body: unknown) => selectAccount(new NextRequest('http://localhost/api/marketing/facebook/ads/accounts', { method: 'POST', body: JSON.stringify(body) }));

    expect((await post({ ad_account_id: '555' })).status).toBe(400);
    expect((await post({ ad_account_id: 'act_999' })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.update.mockReturnValue({ eq: async () => ({ error: { code: '23505', message: 'duplicate key value violates unique constraint "shops_facebook_ad_account_unique"' } }) });
    const conflict = await post({ ad_account_id: 'act_555' });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'Энэ зарын данс өөр төсөлд холбогдсон байна' });
    expect(mocks.accounts).toHaveBeenCalledWith('system-token');

    mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
    const ok = await post({ ad_account_id: 'act_555' });
    expect(ok.status).toBe(200);
    expect(mocks.update).toHaveBeenLastCalledWith('shops', { facebook_ad_account_id: 'act_555' });
});

it('the generic shop PATCH can no longer set the ad account (bypassing the Meta ownership check)', async () => {
    const response = await patchShop(new NextRequest('http://localhost/api/shop', { method: 'PATCH', body: JSON.stringify({ facebook_ad_account_id: 'act_555' }) }));
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
});

it('lists the system token as recommended, never required', () => {
    expect(RECOMMENDED_PROD_ENV).toContain('META_ADS_SYSTEM_TOKEN');
    expect(REQUIRED_PROD_ENV).not.toContain('META_ADS_SYSTEM_TOKEN' as never);
});
