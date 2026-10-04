import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), sync: vi.fn(), insights: vi.fn(), from: vi.fn(), cron: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/marketing/meta-spend', async original => ({ ...await original<typeof import('../meta-spend')>(), syncMetaSpend: mocks.sync }));
vi.mock('@/lib/marketing/meta-insights', async original => ({ ...await original<typeof import('../meta-insights')>(), syncMetaInsights: mocks.insights }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: mocks.cron }));
vi.mock('@/lib/facebook/marketing-api', () => ({ fetchCampaignInsights: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { GET, POST } from '@/app/api/marketing/facebook/ads/spend-sync/route';
import { GET as cron } from '@/app/api/cron/ads-insights-sync/route';
const request = (body: unknown = {}) => new NextRequest('http://localhost/api/marketing/facebook/ads/spend-sync?shopId=hostile', { method: 'POST', body: JSON.stringify(body) });
const insightsResult = { rows: 12, from: '2026-09-01', to: '2026-10-05', currency: 'USD', weeks: [{ from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-05' }], resultFields: true };
beforeEach(() => {
    vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'allowed' });
    mocks.sync.mockResolvedValue({ rows: 1 }); mocks.insights.mockResolvedValue(insightsResult);
});
it('requires read/write permissions and rejects unauthenticated callers', async () => {
    mocks.read.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await GET()).status).toBe(403);
    mocks.write.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    mocks.shop.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled(); expect(mocks.insights).not.toHaveBeenCalled();
});
it('takes shop/account from the server and validates the range/rate', async () => {
    expect((await POST(request({ shopId: 'hostile', accountId: 'act_999', mntPerUnit: -1 }))).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect((await POST(request({ shopId: 'hostile', accountId: 'act_999' }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), 'allowed', {});
});
it('runs the detailed insights sync as a second step over the same range and reports its failure separately', async () => {
    const response = await POST(request({ from: '2026-09-01', to: '2026-09-30' }));
    expect(response.status).toBe(200);
    expect(mocks.insights).toHaveBeenCalledWith(expect.anything(), 'allowed', { from: '2026-09-01', to: '2026-09-30' });
    expect(await response.json()).toMatchObject({ success: true, rows: 1, insights: { rows: 12, weeks: [{ from: '2026-09-30' }] } });

    mocks.insights.mockRejectedValueOnce(new Error('Meta дэлгэрэнгүй үр дүнг хадгалж чадсангүй.'));
    const failed = await POST(request());
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ success: true, rows: 1, insights: { error: 'Meta дэлгэрэнгүй үр дүнг хадгалж чадсангүй.' } });

    // Зардлын синк амжилтгүй бол дэлгэрэнгүй синк ажиллахгүй.
    mocks.insights.mockClear(); mocks.sync.mockRejectedValueOnce(new Error('Meta unavailable'));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.insights).not.toHaveBeenCalled();
});
it('requires cron authentication and reports a daily sync failure rather than success', async () => {
    mocks.cron.mockReturnValueOnce(false);
    expect((await cron(request())).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
    mocks.cron.mockReturnValue(true);
    const q = { select: () => q, not: () => q, order: () => q, range: async () => ({ data: [{ id: 'allowed', meta_ads_user_access_token: null, meta_ads_user_token_expires_at: null }], error: null }) };
    mocks.from.mockReturnValue(q); mocks.sync.mockRejectedValue(new Error('Meta unavailable'));
    const response = await cron(request());
    expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ success: false, dailyResults: [{ shopId: 'allowed', success: false }] });
});
it('cron runs the detailed sync for every shop and records failures without stopping other shops', async () => {
    mocks.cron.mockReturnValue(true);
    const shops = [{ id: 'a', meta_ads_user_access_token: null }, { id: 'b', meta_ads_user_access_token: null }];
    const q = { select: () => q, not: () => q, order: () => q, range: async () => ({ data: shops, error: null }) };
    mocks.from.mockReturnValue(q);
    mocks.insights.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce(insightsResult);
    const response = await cron(request());
    expect(mocks.insights.mock.calls.map(call => call[1])).toEqual(['a', 'b']);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, insightResults: [{ shopId: 'a', success: false }, { shopId: 'b', success: true, rows: 12, weeks: 1 }] });

    mocks.insights.mockResolvedValue(insightsResult);
    const ok = await cron(request());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ success: true, dailyResults: [{ success: true }, { success: true }] });
});
