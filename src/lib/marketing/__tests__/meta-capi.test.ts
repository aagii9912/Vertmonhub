// @vitest-environment node
/**
 * Meta Conversions API (Graph v26): токен зөвхөн Authorization толгойд, лог-д зөвхөн статус ба
 * Graph code/subcode, ямар ч алдаанд caller-ийн урсгал руу throw хийхгүй.
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

import { sendMetaCapiEvent } from '@/lib/marketing/meta-capi';

const TOKEN = 'capi-dataset-token-secret';
const PIXEL = '123456789012345';
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const event = () => sendMetaCapiEvent({
    eventName: 'Lead',
    eventId: 'lead-1',
    eventSourceUrl: 'https://vertmon.mn/form',
    userData: { email: ' Bat@Example.MN ', phone: '+976 9911-2233', fbc: 'fb.1.1700000000000.abc', clientIp: '203.0.113.7', userAgent: 'UA/1.0' },
    customData: { lead_source: 'facebook' },
});

function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** logger болон console руу бичигдсэн бүх зүйл нэг мөр болгож, нууц/бие/URL байгаа эсэхийг шалгана. */
function everythingLogged(): string {
    const calls = [
        ...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls, ...logger.debug.mock.calls,
        ...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls,
    ];
    return JSON.stringify(calls);
}

describe('sendMetaCapiEvent on Graph v26', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', PIXEL);
        vi.stubEnv('META_CAPI_ACCESS_TOKEN', `${TOKEN}\n`); // Vercel-ийн сүүл newline-ийг trim хийнэ
        vi.stubEnv('META_CAPI_APP_SECRET', '');
        vi.stubEnv('FACEBOOK_APP_SECRET', 'page-app-secret');
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

    it('posts to v26 {pixel}/events with the token only in the Authorization header', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { events_received: 1, messages: [], fbtrace_id: 'trace' }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(event()).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [rawUrl, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
        const url = new URL(String(rawUrl));
        expect(url.origin + url.pathname).toBe(`https://graph.facebook.com/v26.0/${PIXEL}/events`);
        expect(url.searchParams.has('access_token')).toBe(false);
        expect(String(rawUrl)).not.toContain(TOKEN);
        expect(init.method).toBe('POST');
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(headers['Content-Type']).toBe('application/json');
        expect(init.signal).toBeInstanceOf(AbortSignal);

        const body = JSON.parse(String(init.body));
        expect(String(init.body)).not.toContain(TOKEN);
        expect(body).toEqual({
            data: [{
                event_name: 'Lead',
                event_time: expect.any(Number),
                action_source: 'website',
                event_id: 'lead-1',
                event_source_url: 'https://vertmon.mn/form',
                user_data: {
                    em: sha256('bat@example.mn'),
                    ph: sha256('97699112233'),
                    fbc: 'fb.1.1700000000000.abc',
                    client_ip_address: '203.0.113.7',
                    client_user_agent: 'UA/1.0',
                },
                custom_data: { lead_source: 'facebook' },
            }],
        });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not sign with FACEBOOK_APP_SECRET: the dataset token may belong to another app', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { events_received: 1 }));
        vi.stubGlobal('fetch', fetchMock);

        await event();

        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.has('appsecret_proof')).toBe(false);
        expect(url.search).toBe('');
    });

    it('adds appsecret_proof only from META_CAPI_APP_SECRET (the token app’s own secret)', async () => {
        vi.stubEnv('META_CAPI_APP_SECRET', ' capi-app-secret\n');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { events_received: 1 }));
        vi.stubGlobal('fetch', fetchMock);

        await event();

        const [rawUrl, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
        const url = new URL(String(rawUrl));
        expect(url.searchParams.get('appsecret_proof')).toBe(crypto.createHmac('sha256', 'capi-app-secret').update(TOKEN).digest('hex'));
        expect(url.searchParams.has('access_token')).toBe(false);
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('skips Graph silently when the pixel or token is not configured', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        vi.stubEnv('META_CAPI_ACCESS_TOKEN', '');
        await expect(event()).resolves.toBeUndefined();
        vi.stubEnv('META_CAPI_ACCESS_TOKEN', TOKEN);
        vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', ' ');
        await expect(event()).resolves.toBeUndefined();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('never builds a Graph path from a non-numeric pixel id', async () => {
        vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', '123/../me');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(event()).resolves.toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs only HTTP status and Graph code/subcode on a rejected event — no body, URL or token', async () => {
        vi.stubEnv('META_CAPI_APP_SECRET', 'capi-app-secret');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, {
            error: {
                message: `Invalid OAuth access token - Cannot parse access token ${TOKEN}`,
                type: 'OAuthException',
                code: 190,
                error_subcode: '463',
                fbtrace_id: 'trace-secret-body',
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(event()).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] non-OK response', { status: 400, code: 190, subcode: 463 });
        const logged = everythingLogged();
        for (const secret of [TOKEN, 'Invalid OAuth', 'OAuthException', 'trace-secret-body', 'graph.facebook.com', 'appsecret_proof', 'access_token']) {
            expect(logged).not.toContain(secret);
        }
    });

    it('treats a 200 with a Graph error object as a failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { error: { code: '100', error_subcode: 2804003, message: 'bad param' } })));

        await expect(event()).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] non-OK response', { status: 200, code: 100, subcode: 2804003 });
    });

    it('does not throw on a non-JSON error page', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`<html>502 ${TOKEN}</html>`, { status: 502 })));

        await expect(event()).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] non-OK response', { status: 502, code: null, subcode: null });
        expect(everythingLogged()).not.toContain(TOKEN);
    });

    it('does not throw on a network failure and logs only the error type', async () => {
        const failure = new TypeError(`fetch failed for https://graph.facebook.com/v26.0/${PIXEL}/events?access_token=${TOKEN}`);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

        await expect(event()).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] send failed', { reason: 'TypeError' });
        const logged = everythingLogged();
        expect(logged).not.toContain(TOKEN);
        expect(logged).not.toContain('graph.facebook.com');
    });

    it('does not throw when Meta does not answer in time', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError')));

        await expect(event()).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] send failed', { reason: 'TimeoutError' });
    });

    it('does not throw when the payload itself cannot be serialized', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(sendMetaCapiEvent({ eventName: 'Lead', userData: {}, customData: { value: BigInt(1) } })).resolves.toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('[Meta CAPI] send failed', { reason: 'TypeError' });
    });
});
