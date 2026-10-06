import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerCardAccess } from '@/lib/leads/customer-card-load';

const state = vi.hoisted(() => ({
    denied: null as Response | null,
    perms: { role: 'sales_manager', permissions: { modules: ['leads', 'inbox', 'contracts'] } } as { role: string; permissions: { modules: string[] } } | null,
    lead: { id: 'lead-1', customer_id: null, customer_phone: '99112233' } as Record<string, unknown> | null,
    scoped: [] as unknown[],
    access: null as CustomerCardAccess | null,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.denied,
    resolvePermissions: async () => state.perms,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-a' }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/sales/project-scope', () => ({
    ProjectScopeError: class extends Error {},
    resolveSalesProjectScope: async () => ({ projectIds: ['project-a'], managerName: 'Номин' }),
    applyLeadScope: (query: unknown, scope: unknown) => { state.scoped.push(scope); return query; },
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is']) query[method] = () => query;
    query.maybeSingle = async () => ({ data: state.lead, error: null });
    return query;
} }) }));
vi.mock('@/lib/leads/customer-card-load', () => ({
    loadLeadCustomerCard: async (_db: unknown, _shop: string, _lead: unknown, access: CustomerCardAccess) => {
        state.access = access;
        return { access, customer: null, messages: null, contracts: [], serviceLogs: [], partial: [] };
    },
}));

import { GET } from './route';

const context = { params: Promise.resolve({ id: 'lead-1' }) };
const call = () => GET(new Request('http://localhost/api/dashboard/leads/lead-1/customer'), context);

beforeEach(() => {
    state.denied = null;
    state.perms = { role: 'sales_manager', permissions: { modules: ['leads', 'inbox', 'contracts'] } };
    state.lead = { id: 'lead-1', customer_id: null, customer_phone: '99112233' };
    state.scoped = [];
    state.access = null;
});

describe('GET /api/dashboard/leads/[id]/customer', () => {
    it('needs the leads module before reading anything', async () => {
        state.denied = new Response(null, { status: 403 });
        expect((await call()).status).toBe(403);
        expect(state.access).toBeNull();
    });

    it('reads the lead through the sales project scope and answers 404 outside it', async () => {
        state.lead = null;
        expect((await call()).status).toBe(404);
        expect(state.scoped).toEqual([{ projectIds: ['project-a'], managerName: 'Номин' }]);
        expect(state.access).toBeNull();
    });

    it('opens only the sections the role may read', async () => {
        const response = await call();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(state.access).toEqual({ customers: false, inbox: true, contracts: true, serviceLogs: false });

        state.perms = { role: 'super_admin', permissions: { modules: [] } };
        await call();
        expect(state.access).toEqual({ customers: true, inbox: true, contracts: true, serviceLogs: true });
    });
});
