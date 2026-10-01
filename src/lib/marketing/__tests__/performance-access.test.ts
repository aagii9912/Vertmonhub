import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), permissions: vi.fn(), shop: vi.fn(), load: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write, resolvePermissions: mocks.permissions }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: vi.fn(async () => 'user') }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/marketing/performance-load', () => ({ loadMarketingPerformance: mocks.load }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
import { GET } from '@/app/api/marketing/performance/route';
import { POST } from '@/app/api/marketing/performance/records/route';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { buildMarketingPerformance } from '../performance';

const id = '00000000-0000-4000-8000-000000000001';
const unrestricted = { projectIds: null, managerName: null };
const request = (body?: unknown) => new NextRequest('http://localhost/api/marketing/performance?from=2026-08-01&to=2026-08-31&shopId=hostile', body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
function query(data: unknown, error: unknown = null) {
    const result = { data, error };
    const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
        maybeSingle: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of [q.select, q.eq, q.order, q.range]) method.mockReturnValue(q);
    return q;
}
function marketingActor(table: string) {
    if (table === 'user_profiles') return query({ full_name: 'Маркетинг' });
    if (table === 'sales_managers') return query([]);
    throw new Error(`Unexpected query: ${table}`);
}
beforeEach(() => {
    vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null);
    mocks.permissions.mockResolvedValue({ role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true, canDelete: false } });
    mocks.from.mockImplementation(marketingActor);
    mocks.shop.mockResolvedValue({ id: 'allowed' }); mocks.load.mockResolvedValue({ report: buildMarketingPerformance({ projects: [], leads: [], contracts: [], activities: [], targets: [], spend: [] }, { from: '2026-08-01', to: '2026-08-31' }) });
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
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'allowed', expect.not.objectContaining({ shopId: 'hostile' }), unrestricted);
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
    const project = query(null);
    mocks.from.mockImplementation(table => table === 'projects' ? project : marketingActor(table));
    expect((await POST(request({ kind: 'target', project_id: id, marketing_owner_name: 'Owner', month: '2026-08-01', lead_target: 1, deal_target: 1, budget: 1 }))).status).toBe(404);
    expect(project.eq).toHaveBeenCalledWith('shop_id', 'allowed');
    expect(project.eq).toHaveBeenCalledWith('id', id);
});
it('AI uses module permission and server shop, ignoring client shop overrides', async () => {
    const permissions = { role: 'marketing', canWrite: false, canDelete: false, modules: [] as string[] };
    expect(await executeDataTool('get_marketing_performance', {}, 'allowed', permissions, 'user')).toHaveProperty('error');
    expect(mocks.load).not.toHaveBeenCalled();
    const result = await executeDataTool('get_marketing_performance', { shopId: 'hostile' }, 'allowed', { ...permissions, modules: ['marketing-roi'] }, 'user');
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'allowed', expect.anything(), unrestricted);
    expect(result.departmentKpis.categories.map((category: { weight: number }) => category.weight)).toEqual([40, 25, 15, 10, 5, 5]);
    expect(result.guidance).toContain('онооны дүрмийг зохиохгүй');
});
