/**
 * Messenger send reliability tests
 * postToGraph дамжуулсан илгээлтийн retry зан төлөв
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Backoff-ийн хүлээлтийг арилгаж тестийг хурдан/тогтвортой болгоно
vi.mock('@/lib/webhook/retryService', () => ({
    calculateBackoffDelay: () => 0,
}));

import { sendTextMessage } from '@/lib/facebook/messenger';

function mockResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    } as Response;
}

describe('sendTextMessage retry behaviour', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.FACEBOOK_APP_SECRET = '';
    });
    afterEach(() => vi.restoreAllMocks());

    it('returns response on first success', async () => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { message_id: 'm1' }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await sendTextMessage({ recipientId: 'u1', message: 'hi', pageAccessToken: 't' });

        expect(result).toEqual({ message_id: 'm1' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 then succeeds', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(mockResponse(429, { error: { message: 'rate limited' } }))
            .mockResolvedValueOnce(mockResponse(200, { message_id: 'm2' }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await sendTextMessage({ recipientId: 'u1', message: 'hi', pageAccessToken: 't' });

        expect(result).toEqual({ message_id: 'm2' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 up to max attempts then throws', async () => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(503, { error: { message: 'unavailable' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            sendTextMessage({ recipientId: 'u1', message: 'hi', pageAccessToken: 't' })
        ).rejects.toThrow(/Failed to send message/);

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fails fast on non-retryable 400 (no retry)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(mockResponse(400, { error: { message: 'invalid recipient' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            sendTextMessage({ recipientId: 'bad', message: 'hi', pageAccessToken: 't' })
        ).rejects.toThrow(/invalid recipient/);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
