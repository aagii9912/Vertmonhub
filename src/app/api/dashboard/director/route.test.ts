import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    failing: new Set<string>(),
    rows: {} as Record<string, unknown[]>,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-a' }) }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => ({ role: 'admin', permissions: { modules: ['dashboard', 'reports'] } }) }));
vi.mock('@/lib/sales/project-scope', () => ({
    ProjectScopeError: class extends Error {},
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
    applyLeadScope: (query: unknown) => query,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const result = state.failing.has(table) ? { data: null, error: { message: 'boom' } } : { data: state.rows[table] ?? [], error: null };
    const query: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of ['select', 'eq', 'gte', 'lt', 'neq', 'in', 'is', 'order', 'limit']) query[method] = () => query;
    return query;
} }) }));

import { GET } from './route';

const get = async () => (await GET(new NextRequest('http://localhost/api/dashboard/director?year=2026&month=10'))).json();

beforeEach(() => {
    state.failing = new Set();
    state.rows = {
        sales_managers: [{ name: 'Номин', is_active: true }],
        property_viewings: [{ id: 'v1', status: 'completed', sales_manager_name: 'Номин', lead_id: null }, { id: 'v2', status: 'scheduled', sales_manager_name: 'Номин', lead_id: null }],
    };
});

describe('GET /api/dashboard/director', () => {
    it('names unread sales and targets instead of answering with zeros', async () => {
        state.failing = new Set(['manager_monthly_sales', 'team_sales_targets']);
        const body = await get();
        expect(body.missing).toEqual(expect.arrayContaining(['sales', 'targets']));
    });

    it('counts the month\'s scheduled and held meetings', async () => {
        const body = await get();
        expect(body.missing).toEqual([]);
        expect(body.meetings).toEqual({ scheduled: 2, held: 1 });
    });
});
