// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), shop: vi.fn(), subscribe: vi.fn(), ops: [] as Array<{ table: string; op: string; args: unknown[] }>, pending: null as Record<string, unknown> | null }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({
    encryptToken: (value: string) => `enc:v1:${value}`,
    decryptToken: (value: string | null) => value?.startsWith('enc:v1:') ? value.slice(7) : value ?? null,
}));
vi.mock('@/lib/facebook/marketing-api', () => ({ subscribePageToApp: mocks.subscribe }));
/** Supabase-ийн гинжин дуудлагыг бичиж авна; `maybeSingle` нь pending мөрийг буцаана. */
function chain(table: string) {
    const record = (op: string, args: unknown[]) => mocks.ops.push({ table, op, args });
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'delete', 'update', 'upsert', 'eq', 'lt']) {
        builder[op] = (...args: unknown[]) => { record(op, args); return builder; };
    }
    builder.maybeSingle = async () => ({ data: mocks.pending, error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
    return builder;
}
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: mocks.user,
    assertShopAccess: mocks.shop,
    supabaseAdmin: () => ({ from: (table: string) => chain(table) }),
}));

import { finishPageOAuth, listPendingPages, selectPendingPage, startPageOAuth } from '../page-connect';

const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ops = (table: string, op: string) => mocks.ops.filter(o => o.table === table && o.op === op);
const SECRETS = ['short-user-token', 'long-user-token', 'page-token-1', 'page-token-2', 'app-secret'];
const noSecrets = (text: string) => SECRETS.forEach(secret => expect(text).not.toContain(secret));

function graph(options: { granted?: string[]; accounts?: unknown[] } = {}) {
    http.mockImplementation(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/v26.0/oauth/access_token') {
            const body = new URLSearchParams(String(init?.body));
            return reply(body.get('grant_type') === 'fb_exchange_token'
                ? { access_token: 'long-user-token', expires_in: 5184000 }
                : { access_token: 'short-user-token', expires_in: 3600 });
        }
        if (url.pathname === '/v26.0/me/accounts') {
            return reply({ data: options.accounts ?? [
                { id: '101', name: 'Mandala Garden', category: 'Real Estate', access_token: 'page-token-1', instagram_business_account: { id: '1789', username: 'mandala' } },
                { id: '102', name: 'Elysium', access_token: 'page-token-2' },
            ] });
        }
        if (url.pathname === '/v26.0/me/permissions') {
            return reply({ data: (options.granted ?? ['pages_show_list', 'pages_read_engagement', 'read_insights']).map(permission => ({ permission, status: 'granted' })) });
        }
        if (url.pathname === '/v26.0/101') return reply({ id: '101', name: 'Mandala Garden', access_token: 'page-token-1', instagram_business_account: { id: '1789', username: 'mandala' } });
        throw new Error(`unexpected ${url.pathname}`);
    });
}

async function connect(flow: 'facebook' | 'instagram' = 'facebook') {
    const started = await startPageOAuth(new NextRequest(`http://localhost/api/auth/${flow}?shop_id=shop-1`), flow);
    const cookieName = flow === 'facebook' ? 'fb_oauth' : 'ig_oauth';
    const saved = started.cookies.get(cookieName)!.value;
    const state = JSON.parse(saved).state as string;
    const callback = (query = `state=${state}&code=one-time-code`, cookie = saved) => finishPageOAuth(new NextRequest(
        `http://localhost/api/auth/${flow}/callback?${query}`, { headers: { cookie: `${cookieName}=${encodeURIComponent(cookie)}` } }), flow);
    return { started, saved, callback };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.ops.length = 0;
    mocks.pending = null;
    vi.stubGlobal('fetch', http);
    vi.stubEnv('FACEBOOK_APP_ID', 'fb-app');
    vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
    mocks.user.mockResolvedValue('user-1');
    mocks.shop.mockImplementation(async (id: string | null) => id === 'shop-1' ? 'shop-1' : null);
    mocks.subscribe.mockResolvedValue({ success: true });
    graph();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); http.mockReset(); });

it('starts the v26 dialog with read_insights and a state cookie bound to the user, project and callback path', async () => {
    const { started, saved } = await connect();
    const url = new URL(started.headers.get('location')!);
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect(url.searchParams.get('scope')!.split(',')).toEqual(expect.arrayContaining(['read_insights', 'pages_read_engagement', 'pages_show_list']));
    expect(url.searchParams.get('scope')).not.toContain('email');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/facebook/callback');
    expect(JSON.parse(saved)).toEqual({ state: url.searchParams.get('state'), userId: 'user-1', shopId: 'shop-1' });
    const cookies = started.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/fb_oauth=.*Path=\/api\/auth\/facebook\/callback.*HttpOnly/i);
    // Хуучин урсгалын токентой cookie-уудыг арилгана.
    expect(cookies).toMatch(/fb_pages=;.*Max-Age=0/i);
    expect(cookies).toMatch(/ig_accounts=;.*Max-Age=0/i);
});

it('refuses to start for a project the user cannot access', async () => {
    const response = await startPageOAuth(new NextRequest('http://localhost/api/auth/facebook?shop_id=other'), 'facebook');
    expect(response.status).toBe(401);
});

it('keeps every token server-side: POST exchanges, encrypted pending row, token-free redirect', async () => {
    const { callback } = await connect();
    const response = await callback();
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/marketing/social');
    expect(location.searchParams.get('fb_success')).toBe('true');
    expect(location.searchParams.get('page_count')).toBe('2');
    noSecrets(response.headers.get('location')! + response.headers.getSetCookie().join('\n'));

    // Code солих хүсэлтүүд POST биеэр (URL-д нууц, код орохгүй).
    const exchanges = http.mock.calls.filter(([input]) => String(input).includes('/oauth/access_token'));
    expect(exchanges).toHaveLength(2);
    for (const [input, init] of exchanges) {
        expect(String(input)).toBe('https://graph.facebook.com/v26.0/oauth/access_token');
        expect((init as RequestInit).method).toBe('POST');
    }
    const accounts = http.mock.calls.map(([input]) => input).find(input => String(input).includes('/me/accounts')) as URL;
    expect(accounts.searchParams.has('access_token')).toBe(false);
    expect(accounts.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
    expect(accounts.searchParams.get('fields')).toBe('id,name,category');

    const [row] = ops('meta_page_connect_pending', 'upsert')[0].args as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({
        user_id: 'user-1', shop_id: 'shop-1', flow: 'facebook', user_token: 'enc:v1:long-user-token',
        granted_scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'],
        pages: [{ id: '101', name: 'Mandala Garden', category: 'Real Estate' }, { id: '102', name: 'Elysium' }],
    });
    expect(JSON.stringify(row.pages)).not.toContain('token');
    expect(ops('meta_page_connect_pending', 'lt')).toHaveLength(1); // хугацаа дууссан мөрүүдийг цэвэрлэнэ
});

it('rejects a forged state or another user before any Graph call', async () => {
    const { callback, saved } = await connect();
    expect(new URL((await callback('state=forged&code=x')).headers.get('location')!).searchParams.get('fb_error')).toBe('state_mismatch');
    mocks.user.mockResolvedValue('user-2');
    const state = JSON.parse(saved).state;
    expect(new URL((await callback(`state=${state}&code=x`)).headers.get('location')!).searchParams.get('fb_error')).toBe('session_error');
    expect(http).not.toHaveBeenCalled();
    expect(mocks.ops).toEqual([]);
});

it('lists pending pages without tokens and flags missing insight permissions', async () => {
    mocks.pending = {
        user_token: 'enc:v1:long-user-token', user_token_expires_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(),
        pages: [{ id: '101', name: 'Mandala Garden' }], granted_scopes: ['pages_show_list', 'pages_read_engagement'],
    };
    const response = await listPendingPages('facebook', 'shop-1');
    const body = await response.json();
    expect(body).toEqual({ pages: [{ id: '101', name: 'Mandala Garden' }], missing_permissions: ['read_insights'] });
    noSecrets(JSON.stringify(body));

    mocks.pending = { ...mocks.pending, expires_at: new Date(Date.now() - 1).toISOString() };
    expect((await (await listPendingPages('facebook', 'shop-1')).json()).code).toBe('SESSION_EXPIRED');
});

it('selects a listed page server-side: fresh page token, encrypted on the project, pending row removed, nothing secret returned', async () => {
    mocks.pending = {
        user_token: 'enc:v1:long-user-token', user_token_expires_at: '2026-12-01T00:00:00.000Z', expires_at: new Date(Date.now() + 60_000).toISOString(),
        pages: [{ id: '101', name: 'Mandala Garden' }], granted_scopes: [],
    };
    expect((await selectPendingPage('facebook', 'shop-1', '102')).status).toBe(404);
    expect(ops('shops', 'update')).toEqual([]);

    const response = await selectPendingPage('facebook', 'shop-1', '101');
    const body = await response.json();
    expect(body).toEqual({ success: true, page: { id: '101', name: 'Mandala Garden' }, webhookSubscribed: true });
    noSecrets(JSON.stringify(body));
    expect(ops('shops', 'update')[0].args[0]).toEqual({
        facebook_page_id: '101', facebook_page_name: 'Mandala Garden', facebook_page_access_token: 'enc:v1:page-token-1',
        facebook_token_expires_at: '2026-12-01T00:00:00.000Z',
    });
    expect(ops('shops', 'eq')[0].args).toEqual(['id', 'shop-1']);
    expect(ops('meta_page_connect_pending', 'delete')).toHaveLength(1);
    expect(mocks.subscribe).toHaveBeenCalledWith('101', 'page-token-1');
    const detail = http.mock.calls.map(([input]) => input as URL).find(url => url.pathname === '/v26.0/101')!;
    expect(detail.searchParams.get('fields')).toBe('id,name,access_token');
});

it('runs the Instagram flow through the same server-side selection', async () => {
    const { callback } = await connect('instagram');
    const response = await callback();
    expect(new URL(response.headers.get('location')!).searchParams.get('ig_success')).toBe('true');
    const [row] = ops('meta_page_connect_pending', 'upsert')[0].args as [Record<string, unknown>];
    expect(row.flow).toBe('instagram');
    expect(row.pages).toEqual([{ id: '101', name: 'Mandala Garden', category: 'Real Estate', instagram: { id: '1789', username: 'mandala' } }]);

    mocks.ops.length = 0;
    mocks.pending = { user_token: 'enc:v1:long-user-token', user_token_expires_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(), pages: row.pages, granted_scopes: [] };
    const selected = await selectPendingPage('instagram', 'shop-1', '101');
    expect(await selected.json()).toEqual({ success: true, page: { id: '1789', name: 'mandala' } });
    expect(ops('shops', 'update')[0].args[0]).toEqual({
        instagram_business_account_id: '1789', instagram_username: 'mandala', instagram_access_token: 'enc:v1:page-token-1', instagram_token_expires_at: null,
    });
    expect(mocks.subscribe).not.toHaveBeenCalled();
});

it('reports pages without an Instagram account instead of storing an empty selection', async () => {
    graph({ accounts: [{ id: '102', name: 'Elysium', access_token: 'page-token-2' }] });
    const { callback } = await connect('instagram');
    expect(new URL((await callback()).headers.get('location')!).searchParams.get('ig_error')).toBe('no_instagram_account');
    expect(ops('meta_page_connect_pending', 'upsert')).toEqual([]);
});
