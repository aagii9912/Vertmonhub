// @vitest-environment node
// Cron /api/cron/ads-insights-sync: нийт хугацааны хязгаар ба хуучин ROI snapshot-ийн хурдны хязгаарын зогсолт.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ spend: vi.fn(), insights: vi.fn(), updates: [] as Array<{ shop: string; campaign: string }> }));
const SHOPS = [{ id: 'shop-a', facebook_ad_account_id: 'act_1' }, { id: 'shop-b', facebook_ad_account_id: 'act_2' }];
const campaignsOf = (shop: string) => Array.from({ length: shop === 'shop-a' ? 50 : 3 }, (_, i) => ({ external_id: String((shop === 'shop-a' ? 1000 : 2000) + i) }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/marketing/meta-spend', () => ({ syncMetaSpend: mocks.spend }));
vi.mock('@/lib/marketing/meta-insights', () => ({ syncMetaInsights: mocks.insights }));
vi.mock('@/lib/facebook/ads-auth', () => ({ metaAdsToken: () => 'ads-token' }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const filters: Record<string, string> = {};
            const q: Record<string, unknown> = {};
            for (const method of ['select', 'not', 'order']) q[method] = () => q;
            q.eq = (column: string, value: string) => { filters[column] = value; return q; };
            q.range = async () => ({ data: table === 'shops' ? SHOPS : [], error: null });
            q.update = () => q;
            q.then = (resolve: (value: unknown) => void) => {
                if (filters.external_id) { mocks.updates.push({ shop: filters.shop_id, campaign: filters.external_id }); return Promise.resolve({ error: null }).then(resolve); }
                return Promise.resolve({ data: campaignsOf(filters.shop_id), error: null }).then(resolve);
            };
            return q;
        },
    }),
}));
import { POST } from '@/app/api/cron/ads-insights-sync/route';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const http = vi.fn();
const throttled = () => reply({ error: { code: 17, message: 'User request limit reached' } }, 400);
/** shop-a-ийн кампанит ажлууд хурдны хязгаартай, shop-b-гийнх хэвийн. */
function graph(url: URL) {
    const id = url.pathname.split('/')[2];
    if (id.startsWith('1')) return throttled();
    if (url.pathname.endsWith('/insights')) return reply({ data: [{ spend: '1.5', impressions: '10', clicks: '1', actions: [{ action_type: 'lead', value: '2' }] }] });
    return reply({ id, account_id: '2' });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
    vi.stubEnv('META_ADS_APP_SECRET', 'secret');
    vi.stubGlobal('fetch', http);
    http.mockImplementation(async (url: URL) => graph(url));
    mocks.spend.mockResolvedValue({ rows: 1 });
    mocks.insights.mockResolvedValue({ rows: 1, weeks: [{ from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-04' }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('stops a shop\'s snapshot loop on the first Meta rate-limit error without stacking metaRead retries, other shops continue', async () => {
    const waits = vi.spyOn(globalThis, 'setTimeout');
    const response = await POST(new NextRequest('http://localhost/api/cron/ads-insights-sync'));
    const body = await response.json();
    // shop-a: эхний кампанит ажлын шалгалт нэг л удаа (дахин оролдлогогүй), үлдсэн 49-ийг алгасна.
    const shopA = http.mock.calls.filter(([url]) => (url as URL).pathname.split('/')[2].startsWith('1'));
    expect(shopA).toHaveLength(1);
    expect(waits.mock.calls.filter(([, ms]) => ms === 1000 || ms === 3000)).toEqual([]);
    // shop-b: 3 кампанит ажил × (данс шалгах + insights).
    expect(mocks.updates).toEqual(['2000', '2001', '2002'].map(campaign => ({ shop: 'shop-b', campaign })));
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, updated: 3, snapshotFailures: 1, snapshotSkipped: 49 });
});

it('runs every step under one deadline below maxDuration and skips snapshot work when the time runs out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    http.mockImplementation(async () => reply({ id: 'x', account_id: '0' }));
    // shop-a-ийн дэлгэрэнгүй синк бараг бүх хугацааг (268 сек) идсэн.
    mocks.insights.mockImplementationOnce(async () => { vi.setSystemTime(Date.now() + 268_000); return { rows: 1, weeks: [] }; });
    const response = await POST(new NextRequest('http://localhost/api/cron/ads-insights-sync'));
    const body = await response.json();
    const deadline = mocks.spend.mock.calls[0][3];
    // maxDuration 300 сек − 30 сек аюулгүйн зай.
    expect(deadline.at - Date.parse('2026-10-05T00:00:00Z')).toBe(270_000);
    expect(mocks.spend.mock.calls.every(call => call[3] === deadline)).toBe(true);
    expect(mocks.insights.mock.calls.map(call => [call[1], call[3]])).toEqual([['shop-a', { deadline }], ['shop-b', { deadline }]]);
    expect(http).not.toHaveBeenCalled();
    expect(body).toMatchObject({ success: false, updated: 0, snapshotFailures: 0, snapshotSkipped: 53 });
});

it('reports a partial detailed sync as not fully successful', async () => {
    http.mockImplementation(async (url: URL) => reply(url.pathname.endsWith('/insights') ? { data: [] } : { id: url.pathname.split('/')[2], account_id: url.pathname.split('/')[2].startsWith('1') ? '1' : '2' }));
    mocks.insights.mockResolvedValueOnce({ rows: 5, weeks: [{ from: '2026-09-30' }], partial: 'Синкийн хугацаа хүрэлцээгүй…' });
    const response = await POST(new NextRequest('http://localhost/api/cron/ads-insights-sync'));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ insightResults: [{ shopId: 'shop-a', success: false, partial: true, weeks: 1 }, { shopId: 'shop-b', success: true }] });
});
