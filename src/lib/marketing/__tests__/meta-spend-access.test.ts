import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), sync: vi.fn(), from: vi.fn(), cron: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/marketing/meta-spend', async original => ({ ...await original<typeof import('../meta-spend')>(), syncMetaSpend: mocks.sync }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: mocks.cron }));
vi.mock('@/lib/facebook/marketing-api', () => ({ fetchCampaignInsights: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { GET, POST } from '@/app/api/marketing/facebook/ads/spend-sync/route';
import { GET as cron } from '@/app/api/cron/ads-insights-sync/route';
const request = (body: unknown = {}) => new NextRequest('http://localhost/api/marketing/facebook/ads/spend-sync?shopId=hostile', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'allowed' }); mocks.sync.mockResolvedValue({ rows: 1 }); });
it('requires read/write permissions and rejects unauthenticated callers', async () => {
    mocks.read.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await GET()).status).toBe(403);
    mocks.write.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    mocks.shop.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it('takes shop/account from the server and validates the range/rate', async () => {
    expect((await POST(request({ shopId: 'hostile', accountId: 'act_999', mntPerUnit: -1 }))).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect((await POST(request({ shopId: 'hostile', accountId: 'act_999' }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), 'allowed', {});
});
it('requires cron authentication and reports a daily sync failure rather than success', async () => {
    mocks.cron.mockReturnValueOnce(false);
    expect((await cron(request())).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
    mocks.cron.mockReturnValue(true);
    const q = { select: () => q, not: () => q, order: () => q, range: async () => ({ data: [{ id: 'allowed', facebook_user_access_token: null }], error: null }) };
    mocks.from.mockReturnValue(q); mocks.sync.mockRejectedValue(new Error('Meta unavailable'));
    const response = await cron(request());
    expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ success: false, dailyResults: [{ shopId: 'allowed', success: false }] });
});
