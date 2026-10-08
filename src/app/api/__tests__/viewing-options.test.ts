// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { elysiumViewingConditions } from '@/lib/sales/viewing-conditions';

const mocks = vi.hoisted(() => ({ read: vi.fn(), shop: vi.fn(), scope: vi.fn(), project: vi.fn(), options: vi.fn(), conditions: vi.fn(), sole: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.read, requireModuleDelete: mocks.read, requireAnyModule: mocks.read }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: async () => 'actor' }));
vi.mock('@/lib/sales/project-scope', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/sales/project-scope')>(), resolveSalesProjectScope: mocks.scope }));
vi.mock('@/lib/projects/shop-project', () => ({ soleShopProjectId: mocks.sole }));
vi.mock('@/lib/viewings/options', () => ({ loadViewingOptions: mocks.options }));
vi.mock('@/lib/sales/pricing-store', () => ({ loadViewingPricingConditions: mocks.conditions }));
const query = { select: () => query, eq: () => query, maybeSingle: mocks.project };
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => query }) }));
import { GET } from '@/app/api/dashboard/viewings/options/route';

const projectId = '30000000-0000-4000-8000-000000000001';
const scope = { projectIds: [projectId], managerName: 'Номин' };
const units = [{ id: 'unit', project_id: projectId, block: 'Б2', model: 'A', area_sqm: 59.05, floor: 2, unit_number: '0201', code: 'Б2-0201', status: 'available' }];
const request = (id = projectId) => new NextRequest(`http://localhost/api/dashboard/viewings/options?project=${id}`);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'shop' }); mocks.scope.mockResolvedValue(scope);
    mocks.project.mockResolvedValue({ data: { id: projectId }, error: null }); mocks.options.mockResolvedValue(units);
    mocks.conditions.mockResolvedValue({ conditions: elysiumViewingConditions('Elysium Residence', units), reason: 'Үнэ батлагдаагүй' });
});

it('returns payment choices with no approved price using verified project inventory', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ project_id: projectId, units,
        conditions: elysiumViewingConditions('Elysium Residence', units), reason: 'Үнэ батлагдаагүй' });
    expect(mocks.options).toHaveBeenCalledWith(expect.anything(), 'shop', scope, projectId);
    expect(mocks.conditions).toHaveBeenCalledWith(expect.anything(), 'shop', scope, undefined, { projectId, units });
});

it('requires viewings access and organization access before reading conditions', async () => {
    mocks.read.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledWith('viewings');
    expect(mocks.conditions).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(null); mocks.shop.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.conditions).not.toHaveBeenCalled();
});

it('rejects inaccessible and foreign projects before returning conditions', async () => {
    expect((await GET(request('30000000-0000-4000-8000-000000000002'))).status).toBe(403);
    expect(mocks.options).not.toHaveBeenCalled(); expect(mocks.conditions).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValue({ projectIds: null, managerName: null });
    mocks.project.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404);
    expect(mocks.conditions).not.toHaveBeenCalled();
});
