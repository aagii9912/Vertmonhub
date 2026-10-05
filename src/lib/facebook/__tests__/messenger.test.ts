// @vitest-environment node
/**
 * Messenger send reliability tests
 * Send API (Graph v26) илгээлт: токен толгойд, appsecret_proof заавал, retry зан төлөв
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

// Backoff-ийн хүлээлтийг арилгаж тестийг хурдан/тогтвортой болгоно
vi.mock('@/lib/webhook/retryService', () => ({
    calculateBackoffDelay: () => 0,
}));

import { MetaApiError } from '@/lib/facebook/daily-spend';
import { sendTextMessage } from '@/lib/facebook/messenger';

const TOKEN = 'page-token-secret';
const proof = crypto.createHmac('sha256', 'page-app-secret').update(TOKEN).digest('hex');
const send = (recipientId = 'u1') => sendTextMessage({ recipientId, message: 'hi', pageAccessToken: TOKEN });

function mockResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status });
}

describe('sendTextMessage on Graph v26', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('FACEBOOK_APP_SECRET', ' page-app-secret\n'); // Vercel-ийн сүүл зай/newline-ийг trim хийнэ
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

    it('posts to v26 me/messages with the token only in the Authorization header and an appsecret_proof', async () => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { recipient_id: 'u1', message_id: 'm1' }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await send()).toEqual({ recipient_id: 'u1', message_id: 'm1' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const url = new URL(rawUrl);
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/me/messages');
        expect(url.searchParams.get('appsecret_proof')).toBe(proof);
        expect(url.searchParams.has('access_token')).toBe(false);
        expect(rawUrl).not.toContain(TOKEN);
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
        expect(JSON.parse(String(init.body))).toEqual({
            recipient: { id: 'u1' },
            messaging_type: 'RESPONSE',
            message: { text: 'hi' },
        });
        expect(String(init.body)).not.toContain(TOKEN);
    });

    it('fails closed without FACEBOOK_APP_SECRET before calling Graph', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', '');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(send()).rejects.toThrow(/FACEBOOK_APP_SECRET/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retries on 429 then succeeds', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(mockResponse(429, { error: { code: 613, message: 'rate limited' } }))
            .mockResolvedValueOnce(mockResponse(200, { message_id: 'm2' }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await send()).toEqual({ message_id: 'm2' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // Дахин оролдлого бүр ижил proof, токен толгойд
        for (const [rawUrl, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
            expect(new URL(rawUrl).searchParams.get('appsecret_proof')).toBe(proof);
            expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
        }
    });

    it('retries a network error then succeeds', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError(`fetch failed for https://graph.facebook.com/?access_token=${TOKEN}`))
            .mockResolvedValueOnce(mockResponse(200, { message_id: 'm3' }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await send()).toEqual({ message_id: 'm3' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 up to max attempts then throws a MetaApiError without the token or Meta text', async () => {
        const fetchMock = vi.fn(async () => mockResponse(503, { error: { code: 2, message: `unavailable ${TOKEN}` } }));
        vi.stubGlobal('fetch', fetchMock);

        const error = await send().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MetaApiError);
        expect(error).toMatchObject({ status: 503, code: 2 });
        expect((error as Error).message).toMatch(/Messenger мессеж илгээж чадсангүй \(HTTP 503, code 2\)/);
        expect((error as Error).message).not.toContain(TOKEN);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('graph.facebook.com');
    });

    it('throws after the last network failure without leaking the request URL', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError(`fetch failed ${TOKEN}`));
        vi.stubGlobal('fetch', fetchMock);

        const error = await send().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MetaApiError);
        expect((error as Error).message).toMatch(/Meta холболт тасарлаа/);
        expect((error as Error).message).not.toContain(TOKEN);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fails fast on non-retryable 400 (no retry)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(400, { error: { code: 100, error_subcode: 2018001, message: 'No matching user found' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(send('bad')).rejects.toMatchObject({ status: 400, code: 100, subcode: 2018001 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        [190, undefined, /Page-ээ дахин холбоно/],
        [10, 2018278, /24 цаг өнгөрсөн/],
        [551, 1545041, /хүлээн авах боломжгүй/],
    ])('maps Send API code %i (subcode %s) to a Mongolian message', async (code, subcode, message) => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(400, { error: { code, error_subcode: subcode, message: 'x' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(send()).rejects.toThrow(message);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
