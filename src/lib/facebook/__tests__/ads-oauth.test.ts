// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugTokenExpiry, exchangeMetaAdsCode } from '../ads-oauth';

const NOW = Date.parse('2026-10-25T04:00:00Z');
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const input = { appId: 'ads-app', appSecret: 'ads-secret', redirectUri: 'https://www.vertmon.mn/api/marketing/facebook/ads/connect/callback', code: 'one-time-code' };

type Debug = Record<string, unknown>;
/**
 * Graph-ийн хуурмаг: oauth/access_token (code / fb_exchange_token) ба debug_token (input_token-оор).
 * `long` = fb_exchange_token-ийн хариу (Response эсвэл 'network'), `debug` = токен бүрийн debug өгөгдөл.
 */
function graph(options: { short?: Response | 'network'; long?: Response | 'network'; debug?: Record<string, Debug | Response> } = {}) {
    const http = vi.fn(async (target: URL | string, init?: RequestInit) => {
        const url = new URL(String(target));
        if (url.pathname === '/v26.0/oauth/access_token') {
            const exchange = new URLSearchParams(String(init?.body)).get('grant_type') === 'fb_exchange_token';
            const answer = exchange ? options.long ?? reply({ access_token: 'long-token', token_type: 'bearer', expires_in: 5_184_000 })
                : options.short ?? reply({ access_token: 'short-token', token_type: 'bearer', expires_in: 3600 });
            if (answer === 'network') throw new TypeError('fetch failed');
            return answer.clone();
        }
        if (url.pathname === '/v26.0/debug_token') {
            const debug = options.debug?.[url.searchParams.get('input_token') ?? ''];
            if (debug instanceof Response) return debug.clone();
            return reply({ data: { app_id: 'ads-app', type: 'USER', is_valid: true, expires_at: at('2026-10-25T06:00:00Z'), data_access_expires_at: at('2027-01-23T04:00:00Z'), scopes: ['ads_read'], ...debug } });
        }
        throw new Error(`unexpected ${url.pathname}`);
    });
    vi.stubGlobal('fetch', http);
    return http;
}
const calls = (http: ReturnType<typeof graph>, path: string) => http.mock.calls.filter(([target]) => new URL(String(target)).pathname === path);

beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.stubEnv('META_ADS_APP_SECRET', 'ads-secret');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** fb_exchange_token-ийн дахин оролдлогын хүлээлтийг (fake timer) гүйлгэнэ. */
async function exchange(value = input) {
    const result = exchangeMetaAdsCode(value);
    await vi.runAllTimersAsync();
    return result;
}
/** Урт токен Graph-ийн URL-д (query) хэзээ ч орохгүй. */
const urlsCarry = (http: ReturnType<typeof graph>, token: string) => http.mock.calls.some(([target]) => String(target).includes(token));

describe('exchangeMetaAdsCode', () => {
    it('exchanges the code, checks the short token and stores a long-lived token with its expires_in', async () => {
        const http = graph();
        const result = await exchangeMetaAdsCode(input);
        expect(result).toEqual({ ok: true, fallback: null, grant: { token: 'long-token', expiresAt: '2026-12-24T04:00:00.000Z', scopes: ['ads_read'], kind: 'long_lived' } });
        const [first, second] = calls(http, '/v26.0/oauth/access_token');
        expect(Object.fromEntries(new URLSearchParams(String(first[1]?.body)))).toEqual({ client_id: 'ads-app', client_secret: 'ads-secret', redirect_uri: input.redirectUri, code: 'one-time-code' });
        expect(new URLSearchParams(String(second[1]?.body)).get('fb_exchange_token')).toBe('short-token');
        // debug_token: app токен зөвхөн Authorization толгойд, appsecret_proof заавал.
        const [debug] = calls(http, '/v26.0/debug_token');
        const url = new URL(String(debug[0]));
        expect(url.searchParams.get('input_token')).toBe('short-token');
        expect(url.searchParams.has('access_token')).toBe(false);
        expect(url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
        expect((debug[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ads-app|ads-secret');
    });

    it('caps the long-lived expiry at the data access expiry and never sends the long token to debug_token', async () => {
        const http = graph({ debug: { 'short-token': { data_access_expires_at: at('2026-11-20T00:00:00Z') } } });
        expect(await exchange()).toMatchObject({ ok: true, fallback: null, grant: { token: 'long-token', expiresAt: '2026-11-20T00:00:00.000Z', kind: 'long_lived' } });
        expect(calls(http, '/v26.0/debug_token')).toHaveLength(1);
        expect(urlsCarry(http, 'long-token')).toBe(false);
    });

    it('uses the data access expiry when fb_exchange_token has no expires_in (no second debug_token call)', async () => {
        const http = graph({ long: reply({ access_token: 'long-token', token_type: 'bearer' }) });
        expect(await exchange()).toMatchObject({ ok: true, fallback: null, grant: { token: 'long-token', expiresAt: '2027-01-23T04:00:00.000Z', kind: 'long_lived' } });
        expect(calls(http, '/v26.0/debug_token').map(([target]) => new URL(String(target)).searchParams.get('input_token'))).toEqual(['short-token']);
        expect(urlsCarry(http, 'long-token')).toBe(false);

        // Хугацаагүй (data_access_expires_at = 0), expires_in буруу — хугацаагүй гэж хадгална.
        graph({ long: reply({ access_token: 'long-token', expires_in: 'never' }), debug: { 'short-token': { data_access_expires_at: 0 } } });
        expect(await exchange()).toMatchObject({ ok: true, grant: { token: 'long-token', expiresAt: null, kind: 'long_lived' } });
    });

    it('keeps the valid short token with its debug expiry when the long-lived exchange is refused (no retry for a permanent error)', async () => {
        const http = graph({ long: reply({ error: { message: 'secret detail long-token', type: 'OAuthException', code: 100, error_subcode: 33 } }, 400) });
        const result = await exchange();
        expect(result).toEqual({
            ok: true,
            grant: { token: 'short-token', expiresAt: '2026-10-25T06:00:00.000Z', scopes: ['ads_read'], kind: 'short_lived' },
            fallback: { step: 'long_exchange', httpStatus: 400, graphCode: 100, graphSubcode: 33, graphType: 'OAuthException' },
        });
        expect(JSON.stringify(result.ok && result.fallback)).not.toContain('secret');
        expect(calls(http, '/v26.0/oauth/access_token')).toHaveLength(2);
    });

    it('retries a transient fb_exchange_token failure (network, 5xx, 429) before falling back to the short token', async () => {
        let attempts = 0;
        const http = graph();
        const base = http.getMockImplementation()!;
        http.mockImplementation(async (target: URL | string, init?: RequestInit) => {
            const exchangeCall = new URLSearchParams(String(init?.body)).get('grant_type') === 'fb_exchange_token';
            if (exchangeCall && ++attempts === 1) throw new TypeError('fetch failed');
            if (exchangeCall && attempts === 2) return reply({ error: { code: 2, type: 'OAuthException' } }, 503);
            return base(target, init);
        });
        expect(await exchange()).toMatchObject({ ok: true, fallback: null, grant: { token: 'long-token', kind: 'long_lived' } });
        expect(calls(http, '/v26.0/oauth/access_token')).toHaveLength(4); // code + 3 солилт

        const down = graph({ long: 'network' });
        expect(await exchange()).toMatchObject({ ok: true, grant: { token: 'short-token', kind: 'short_lived' }, fallback: { step: 'long_exchange', httpStatus: null } });
        expect(calls(down, '/v26.0/oauth/access_token')).toHaveLength(4); // code + 1 + 2 дахин

        const limited = graph({ long: reply({ error: { code: 4, type: 'OAuthException' } }, 429) });
        expect(await exchange()).toMatchObject({ ok: true, grant: { kind: 'short_lived' }, fallback: { step: 'long_exchange', httpStatus: 429, graphCode: 4 } });
        expect(calls(limited, '/v26.0/oauth/access_token')).toHaveLength(4);
    });

    it('keeps a Business Login system-user token as is (no fb_exchange_token)', async () => {
        const http = graph({ debug: { 'short-token': { type: 'SYSTEM_USER', expires_at: 0, data_access_expires_at: 0, scopes: ['ads_read', 'business_management'] } } });
        expect(await exchangeMetaAdsCode(input)).toEqual({ ok: true, fallback: null, grant: { token: 'short-token', expiresAt: null, scopes: ['ads_read', 'business_management'], kind: 'system_user' } });
        expect(calls(http, '/v26.0/oauth/access_token')).toHaveLength(1);
    });

    it('fails with the step and Graph numbers, never the response body, when the code exchange is refused', async () => {
        graph({ short: reply({ error: { message: 'This authorization code has been used. one-time-code', type: 'OAuthException', code: 100, error_subcode: 36009 } }, 400) });
        const result = await exchangeMetaAdsCode(input);
        expect(result).toEqual({ ok: false, result: 'token_error', step: 'code_exchange', httpStatus: 400, graphCode: 100, graphSubcode: 36009, graphType: 'OAuthException' });
        expect(JSON.stringify(result)).not.toContain('one-time-code');

        graph({ short: 'network' });
        expect(await exchangeMetaAdsCode(input)).toMatchObject({ ok: false, result: 'connection_error', step: 'code_exchange', httpStatus: null });
    });

    it('rejects an invalid or foreign token and reports a refused debug_token call as a token error', async () => {
        graph({ debug: { 'short-token': { is_valid: false } } });
        expect(await exchangeMetaAdsCode(input)).toMatchObject({ ok: false, result: 'token_error', step: 'token_invalid' });
        graph({ debug: { 'short-token': { app_id: 'other-app' } } });
        expect(await exchangeMetaAdsCode(input)).toMatchObject({ ok: false, result: 'token_error', step: 'token_app_mismatch' });
        graph({ debug: { 'short-token': reply({ error: { code: 190, type: 'OAuthException' } }, 400) } });
        expect(await exchangeMetaAdsCode(input)).toMatchObject({ ok: false, result: 'token_error', step: 'debug_token', httpStatus: 400, graphCode: 190 });
    });
});

describe('debugTokenExpiry', () => {
    it('uses the earlier of expires_at and data_access_expires_at; 0 means non-expiring', () => {
        expect(debugTokenExpiry({ expires_at: 0, data_access_expires_at: 0 })).toBeNull();
        expect(debugTokenExpiry({})).toBeNull();
        expect(debugTokenExpiry({ expires_at: at('2026-12-01T00:00:00Z'), data_access_expires_at: 0 })).toBe('2026-12-01T00:00:00.000Z');
        expect(debugTokenExpiry({ expires_at: at('2026-12-01T00:00:00Z'), data_access_expires_at: at('2026-11-01T00:00:00Z') })).toBe('2026-11-01T00:00:00.000Z');
    });
});
