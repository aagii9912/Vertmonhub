// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

import {
    MetaApiError, isMetaRateLimitError, isRetriableMetaError, metaDeadlinePassed, metaRead, metaStepSignal, metaTimeLeft, metaUsage,
} from '../daily-spend';
import { fetchAdAccountCampaigns } from '../marketing-api';

const http = vi.fn();
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', http);
    vi.stubEnv('META_ADS_APP_SECRET', 'ads-app-secret');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

/** Дахин оролдлогын хүлээлтийг (fake timer) гүйлгэж үр дүнг буцаана. */
async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
    const outcome = promise.then(value => ({ value }), error => ({ error }));
    await vi.runAllTimersAsync();
    return outcome;
}

it('retries transient Graph failures (HTTP 5xx, rate-limit codes) with bounded backoff, then succeeds', async () => {
    http.mockResolvedValueOnce(reply({ error: { code: 2, message: 'Service temporarily unavailable' } }, 500))
        .mockResolvedValueOnce(reply({ error: { code: 17, message: 'User request limit reached' } }, 400))
        .mockResolvedValueOnce(reply({ id: 'act_1' }));
    const started = Date.now();
    const result = await settle(metaRead<{ id: string }>('act_1', 'secret-token', { fields: 'id' }));
    expect(result.value).toEqual({ id: 'act_1' });
    expect(http).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBeLessThan(100); // бодит хугацаа хүлээгээгүй (fake timer)
});

it('gives up after two retries with a typed MetaApiError that never carries the URL, body or token', async () => {
    http.mockImplementation(async () => reply({ error: { code: 80004, error_subcode: 2446079, message: 'secret-token leaked in message' } }, 400));
    const { error } = await settle(metaRead('act_1/insights', 'secret-token', { fields: 'spend' }));
    expect(http).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error).toMatchObject({ code: 80004, subcode: 2446079, status: 400, message: 'Meta зардал татах алдаа (HTTP 400, code 80004). Дахин оролдоно уу.' });
    const text = JSON.stringify({ ...(error as object), message: (error as Error).message, stack: (error as Error).stack });
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('graph.facebook.com');
});

it.each([
    [190, 400, /эрх дууссан/],
    [200, 403, /ads_read/],
    [100, 400, /code 100/],
])('does not retry permanent Graph error code %i', async (code, status, message) => {
    http.mockResolvedValue(reply({ error: { code, message: 'x' } }, status));
    const { error } = await settle(metaRead('act_1', 'secret-token'));
    expect(http).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).code).toBe(code);
    expect((error as Error).message).toMatch(message);
});

it('does not retry while Meta says access is blocked for minutes, and logs high utilisation without identifiers', async () => {
    const usage = JSON.stringify({ '1234567890': [{ type: 'ads_insights', call_count: 98, total_cputime: 40, total_time: 50, estimated_time_to_regain_access: 7 }] });
    http.mockResolvedValue(reply({ error: { code: 80000 } }, 400, { 'x-business-use-case-usage': usage }));
    const { error } = await settle(metaRead('act_1/insights', 'secret-token'));
    expect(http).toHaveBeenCalledTimes(1);
    expect((error as MetaApiError).code).toBe(80000);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Meta API'), { endpoint: 'insights', header: 'x-business-use-case-usage', pct: 98, regainMinutes: 7 });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('1234567890');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-token');
});

it('reads the ads insights throttle header and stays quiet under 75%', async () => {
    http.mockResolvedValueOnce(reply({ ok: 1 }, 200, { 'x-fb-ads-insights-throttle': JSON.stringify({ app_id_util_pct: 12.5, acc_id_util_pct: 40 }) }));
    await settle(metaRead('act_1/insights', 'secret-token'));
    expect(logger.warn).not.toHaveBeenCalled();
    expect(metaUsage(new Headers({ 'x-fb-ads-insights-throttle': JSON.stringify({ app_id_util_pct: 80, acc_id_util_pct: 10 }), 'x-app-usage': 'not json' })))
        .toEqual({ pct: 80, regainMinutes: 0, header: 'x-fb-ads-insights-throttle' });
});

it('retries a dropped connection but not an aborted request', async () => {
    http.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(reply({ id: 'act_1' }));
    expect((await settle(metaRead('act_1', 'secret-token'))).value).toEqual({ id: 'act_1' });
    http.mockReset();
    const controller = new AbortController();
    controller.abort();
    http.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const { error } = await settle(metaRead('act_1', 'secret-token', {}, { signal: controller.signal }));
    expect(http).toHaveBeenCalledTimes(1);
    expect((error as Error).message).toMatch(/холболт тасарлаа/);
});

it('classifies retriable statuses and codes', () => {
    expect(isRetriableMetaError(429, null)).toBe(true);
    expect(isRetriableMetaError(503, 190)).toBe(true);
    for (const code of [1, 2, 4, 17, 32, 613, 80000, 80014]) expect(isRetriableMetaError(400, code)).toBe(true);
    for (const code of [10, 100, 190, 200, 80015]) expect(isRetriableMetaError(400, code)).toBe(false);
});

it('can skip retries for loops that stop on their own, and classifies rate-limit errors', async () => {
    http.mockResolvedValue(reply({ error: { code: 17, message: 'User request limit reached' } }, 400));
    const { error } = await settle(metaRead('42', 'secret-token', { fields: 'id' }, { retry: false }));
    expect(http).toHaveBeenCalledTimes(1);
    expect(isMetaRateLimitError(error)).toBe(true);
    for (const code of [4, 17, 32, 613, 80000, 80014]) expect(isMetaRateLimitError(new MetaApiError('x', { code, status: 400 }))).toBe(true);
    expect(isMetaRateLimitError(new MetaApiError('x', { status: 429 }))).toBe(true);
    // Түр алдаа (1, 2, 5xx) ба байнгын алдаа нь хурдны хязгаар биш.
    for (const details of [{ code: 1 }, { code: 2 }, { status: 503 }, { code: 100 }, { code: 190 }, { code: 80015 }]) {
        expect(isMetaRateLimitError(new MetaApiError('x', details))).toBe(false);
    }
    expect(isMetaRateLimitError(new Error('code 17'))).toBe(false);
});

it('stops waiting and retrying when the shared sync deadline aborts, and step signals honour it', async () => {
    const controller = new AbortController();
    http.mockImplementation(async () => { controller.abort(); return reply({ error: { code: 2 } }, 500); });
    const { error } = await settle(metaRead('act_1', 'secret-token', {}, { signal: metaStepSignal(20000, { at: Date.now() + 60_000, signal: controller.signal }) }));
    expect(http).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(MetaApiError);
    const passed = new AbortController();
    passed.abort();
    expect(metaStepSignal(20000, { at: Date.now() + 60_000, signal: passed.signal }).aborted).toBe(true);
    expect(metaStepSignal(20000).aborted).toBe(false);
    expect(metaDeadlinePassed({ at: Date.now() + 60_000, signal: passed.signal })).toBe(true);
    expect(metaDeadlinePassed({ at: Date.now() - 1, signal: new AbortController().signal })).toBe(true);
    expect(metaDeadlinePassed(undefined)).toBe(false);
    expect(metaTimeLeft(undefined)).toBe(Infinity);
    expect(metaTimeLeft({ at: Date.now() + 5000, signal: passed.signal })).toBeLessThanOrEqual(5000);
});

it('pages ad account campaigns by rebuilding the trusted URL with the cursor', async () => {
    http.mockResolvedValueOnce(reply({ data: [{ id: '1', name: 'A' }], paging: { next: 'https://evil.test/?access_token=leak', cursors: { after: 'c1' } } }))
        .mockResolvedValueOnce(reply({ data: [{ id: '2', name: 'B' }] }));
    const { value } = await settle(fetchAdAccountCampaigns('123', 'secret-token'));
    expect(value!.data.map(c => c.id)).toEqual(['1', '2']);
    const urls = http.mock.calls.map(([url]) => url as URL);
    expect(urls.every(url => url.origin === 'https://graph.facebook.com' && url.pathname === '/v26.0/act_123/campaigns')).toBe(true);
    expect(urls[1].searchParams.get('after')).toBe('c1');

    http.mockReset();
    http.mockResolvedValue(reply({ data: [], paging: { next: 'more', cursors: { after: 'same' } } }));
    expect((await settle(fetchAdAccountCampaigns('act_123', 'secret-token'))).error).toBeInstanceOf(Error);
});
