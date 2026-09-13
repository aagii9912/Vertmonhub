import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
    denied: null as Response | null, isManager: true,
    result: { data: { id: 'lead' } as { id: string } | null, error: null as object | null },
    calls: [] as [string, ...unknown[]][],
}));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: async () => state.denied }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-a' }), getUserId: async () => 'user-a' }));
vi.mock('@/lib/sales/manager-identity', () => ({ resolveManagerIdentity: async () => ({ isManager: state.isManager, managerName: 'Менежер' }) }));
vi.mock('@/lib/leads/activities', () => ({ logLeadActivity: async () => ({ id: 'activity' }) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => {
    const q: Record<string, unknown> = {};
    for (const method of ['update', 'eq', 'is', 'in', 'or', 'select']) q[method] = (...args: unknown[]) => { state.calls.push([method, ...args]); return q; };
    q.maybeSingle = async () => state.result;
    return q;
} }) }));
import { POST } from './route';
const context = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) };
function request(date = '2099-01-01T10:00:00+08:00') {
    return new Request('http://localhost/api/dashboard/leads/id/claim', { method: 'POST', body: JSON.stringify({ next_followup_at: date }) });
}
beforeEach(() => { state.denied = null; state.isManager = true; state.calls = []; state.result = { data: { id: 'lead' }, error: null }; });
describe('claim lead', () => {
    it('checks permission before touching data', async () => {
        state.denied = new Response(null, { status: 403 });
        expect((await POST(request(), context)).status).toBe(403);
        expect(state.calls).toEqual([]);
    });
    it('requires active roster and a future next step', async () => {
        state.isManager = false;
        expect((await POST(request(), context)).status).toBe(403);
        state.isManager = true;
        expect((await POST(request('2020-01-01T00:00:00Z'), context)).status).toBe(400);
        expect(state.calls).toEqual([]);
    });
    it('updates ownership and follow-up together with tenant and competing-claim guards', async () => {
        expect((await POST(request(), context)).status).toBe(200);
        expect(state.calls).toContainEqual(['eq', 'shop_id', 'shop-a']);
        expect(state.calls).toContainEqual(['is', 'deleted_at', null]);
        expect(state.calls).toContainEqual(['or', 'sales_manager_name.is.null,sales_manager_name.eq.""']);
        expect(state.calls.find(c => c[0] === 'update')?.[1]).toMatchObject({ sales_manager_name: 'Менежер', next_followup_at: '2099-01-01T10:00:00+08:00' });
    });
    it('reports competing ownership and DB failures instead of success', async () => {
        state.result.data = null;
        expect((await POST(request(), context)).status).toBe(409);
        state.result.error = { message: 'offline' };
        expect((await POST(request(), context)).status).toBe(500);
    });
});
