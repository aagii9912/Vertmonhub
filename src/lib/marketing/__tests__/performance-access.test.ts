import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), load: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: vi.fn(async () => 'user') }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/marketing/performance-load', () => ({ loadMarketingPerformance: mocks.load }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
import { GET } from '@/app/api/marketing/performance/route';
import { POST } from '@/app/api/marketing/performance/records/route';
import { executeDataTool } from '@/lib/ai/data-assistant';

const id = '00000000-0000-4000-8000-000000000001';
const request = (body?: unknown) => new NextRequest('http://localhost/api/marketing/performance?from=2026-08-01&to=2026-08-31&shopId=hostile', body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
beforeEach(() => {
    vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: 'allowed' }); mocks.load.mockResolvedValue({ report: { totals: {} } });
});
it('rejects unauthorized reads and writes before loading any data', async () => {
    mocks.read.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await GET(request())).status).toBe(403);
    mocks.write.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await POST(request({ kind: 'handoff', lead_id: id }))).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it('uses the verified shop and fails without masking read errors', async () => {
    expect((await GET(request())).status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'allowed', expect.not.objectContaining({ shopId: 'hostile' }));
    mocks.load.mockRejectedValueOnce(new Error('private database detail'));
    const response = await GET(request());
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('private database detail');
});
it('validates input and requires lead-write permission for attribution/handoff', async () => {
    expect((await POST(request({ kind: 'target', budget: -2 }))).status).toBe(400);
    mocks.write.mockImplementation(async module => module === 'leads' ? NextResponse.json({}, { status: 403 }) : null);
    expect((await POST(request({ kind: 'handoff', lead_id: id }))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
});
it('cannot use a project in another shop', async () => {
    const eq = vi.fn(); const q = { select: () => q, eq, maybeSingle: async () => ({ data: null, error: null }) }; eq.mockReturnValue(q); mocks.from.mockReturnValue(q);
    expect((await POST(request({ kind: 'target', project_id: id, marketing_owner_name: 'Owner', month: '2026-08-01', lead_target: 1, deal_target: 1, budget: 1 }))).status).toBe(404);
    expect(eq).toHaveBeenCalledWith('shop_id', 'allowed');
});
it('AI uses module permission and server shop, ignoring client shop overrides', async () => {
    const permissions = { role: 'marketing', canWrite: false, canDelete: false, modules: [] as string[] };
    expect(await executeDataTool('get_marketing_performance', {}, 'allowed', permissions, 'user')).toHaveProperty('error');
    expect(mocks.load).not.toHaveBeenCalled();
    await executeDataTool('get_marketing_performance', { shopId: 'hostile' }, 'allowed', { ...permissions, modules: ['marketing-roi'] }, 'user');
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'allowed', expect.anything());
});
