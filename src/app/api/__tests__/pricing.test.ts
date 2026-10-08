// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ProjectScopeError } from '@/lib/sales/project-scope';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), admin: vi.fn(), overview: vi.fn(), save: vi.fn(), quote: vi.fn(), scope: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write, requireModuleDelete: mocks.write, requireAnyModule: mocks.read }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: async () => 'actor' }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: mocks.admin }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/sales/project-scope', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/sales/project-scope')>(), resolveSalesProjectScope: mocks.scope }));
vi.mock('@/lib/sales/pricing-store', () => ({ loadPricingOverview: mocks.overview, savePricingConfig: mocks.save, quoteViewingSelection: mocks.quote }));
import { GET, PUT } from '@/app/api/admin/pricing/route';
import { POST } from '@/app/api/dashboard/viewings/quote/route';
import { EMPTY_PRICING_DRAFT } from '@/lib/sales/pricing';

const body = { block: 'Б1', model: 'E6', area_sqm: 51.72, floor: 2 };
const request = (path: string, payload: unknown, method = 'POST') => new NextRequest(`http://localhost${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
beforeEach(() => {
    vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: 'shop' }); mocks.admin.mockResolvedValue({ id: 'actor', role: 'super_admin' });
    mocks.scope.mockResolvedValue({ projectIds: ['project'], managerName: 'Бат' });
    mocks.quote.mockResolvedValue({ available: false, reason: 'Үнийн тохиргоо байхгүй', quote: null });
    mocks.overview.mockResolvedValue({ latest: null, active: null }); mocks.save.mockResolvedValue({ version: 1 });
});
it('requires dedicated modules and shop access before loading or writing pricing', async () => {
    mocks.read.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await POST(request('/api/dashboard/viewings/quote', body))).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledWith('viewings'); expect(mocks.quote).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(null); mocks.shop.mockResolvedValue(null);
    expect((await GET(new NextRequest('http://localhost/api/admin/pricing'))).status).toBe(403);
    expect(mocks.overview).not.toHaveBeenCalled();
});
it('requires super admin independently of settings permission and uses verified actor/shop', async () => {
    const input = { expected_version: 0, status: 'draft', config: EMPTY_PRICING_DRAFT };
    mocks.admin.mockResolvedValue(null);
    expect((await PUT(request('/api/admin/pricing', input, 'PUT'))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ id: 'actor' });
    expect((await PUT(request('/api/admin/pricing', input, 'PUT'))).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith('settings');
    expect(mocks.save).toHaveBeenCalledWith({}, 'shop', 'actor', input);
});
it('quote preview is read only, scoped, and rejects client totals before calculation', async () => {
    expect((await POST(request('/api/dashboard/viewings/quote', { ...body, total_amount: 1 }))).status).toBe(400);
    expect(mocks.quote).not.toHaveBeenCalled();
    const response = await POST(request('/api/dashboard/viewings/quote', body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: false });
    expect(mocks.quote).toHaveBeenCalledWith({}, 'shop', body, { projectIds: ['project'], managerName: 'Бат' });
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it('preserves an identifiable foreign-selection error', async () => {
    mocks.quote.mockRejectedValue(new ProjectScopeError(404, 'Байр олдсонгүй'));
    expect((await POST(request('/api/dashboard/viewings/quote', body))).status).toBe(404);
});
