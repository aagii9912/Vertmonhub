// @vitest-environment node
import crypto from 'crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

import { MetaApiError, metaRead } from '../daily-spend';
import { isMetaInvalidParamError, isMetaPermissionError, isMetaTokenError, pagePost, pageRead } from '../page-graph';

const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const proof = (secret: string, token: string) => crypto.createHmac('sha256', secret).update(token).digest('hex');

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', http);
    vi.stubEnv('FACEBOOK_APP_SECRET', ' page-app-secret\n'); // Vercel-ийн сүүл зай/newline-ийг trim хийнэ
    vi.stubEnv('META_ADS_APP_SECRET', 'ads-app-secret');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
    const outcome = promise.then(value => ({ value }), error => ({ error }));
    await vi.runAllTimersAsync();
    return outcome;
}

it('reads Page/IG data on Graph v26 with a FACEBOOK_APP_SECRET appsecret_proof and the token only in the header', async () => {
    http.mockResolvedValueOnce(reply({ id: '42', name: 'Page' }));
    expect(await pageRead('42', 'page-token', { fields: 'id,name' })).toEqual({ id: '42', name: 'Page' });
    const [url, init] = http.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/42');
    expect(url.searchParams.get('fields')).toBe('id,name');
    expect(url.searchParams.get('appsecret_proof')).toBe(proof('page-app-secret', 'page-token'));
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(url.toString()).not.toContain('page-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer page-token');
});

it('keeps ads reads on the Meta Ads app secret', async () => {
    http.mockResolvedValueOnce(reply({ id: 'act_1' }));
    await metaRead('act_1', 'ads-token');
    expect((http.mock.calls[0][0] as URL).searchParams.get('appsecret_proof')).toBe(proof('ads-app-secret', 'ads-token'));
});

it('fails closed without FACEBOOK_APP_SECRET before calling Graph', async () => {
    vi.stubEnv('FACEBOOK_APP_SECRET', '');
    await expect(pageRead('42', 'page-token')).rejects.toThrow(/FACEBOOK_APP_SECRET/);
    await expect(pagePost('42/feed', 'page-token', { message: 'x' })).rejects.toThrow(/FACEBOOK_APP_SECRET/);
    expect(http).not.toHaveBeenCalled();
});

it('posts with the token in the header and the proof in the form body, and never retries a publish', async () => {
    http.mockResolvedValue(reply({ error: { code: 2, message: 'temporary page-token' } }, 500));
    const { error } = await settle(pagePost('42/feed', 'page-token', { message: 'Сайн байна уу' }));
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v26.0/42/feed');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('message')).toBe('Сайн байна уу');
    expect(body.get('appsecret_proof')).toBe(proof('page-app-secret', 'page-token'));
    expect(body.has('access_token')).toBe(false);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(JSON.stringify({ message: (error as Error).message })).not.toContain('page-token');
});

it.each([
    [190, isMetaTokenError, /дахин холбоно/],
    [10, isMetaPermissionError, /read_insights/],
    [200, isMetaPermissionError, /read_insights/],
    [100, isMetaInvalidParamError, /code 100/],
])('maps Graph code %i to a Mongolian message and a classifier', async (code, classify, message) => {
    http.mockResolvedValue(reply({ error: { code, message: 'x' } }, 400));
    const { error } = await settle(pageRead('42/insights', 'page-token'));
    expect(http).toHaveBeenCalledTimes(1);
    expect(classify(error)).toBe(true);
    expect((error as Error).message).toMatch(message);
});
