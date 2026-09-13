import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GET } from '../dashboard/my-stats/route';
import { getMonthlyActualsByManager, getTeamTargets } from '@/lib/sales/targets';

const state = vi.hoisted(() => ({ failed: new Set<string>() }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop' }), getUserId: async () => 'user' }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => ({ role: 'sales_manager', permissions: { modules: ['dashboard'] } }) }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkRateLimit: async () => ({ allowed: true }), createRateLimitResponse: vi.fn(), getClientIdentifier: () => 'test' }));
vi.mock('@/lib/sales/manager-identity', () => ({ resolveManagerIdentity: async () => ({ managerName: 'Болд', isManager: true, rosterEmpty: false, roster: [{ name: 'Болд', user_id: 'user', is_active: true }], rosterEntry: { name: 'Болд', user_id: 'user' } }) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => fakeDb() }));

function fakeDb() {
    return { from(table: string) {
        const chain: Record<string, any> = {};
        for (const method of ['select', 'eq', 'is', 'not', 'lt', 'gte', 'order', 'limit']) chain[method] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.failed.has(table) ? null : [], error: state.failed.has(table) ? { message: 'unavailable' } : null }).then(resolve);
        return chain;
    } } as unknown as SupabaseClient;
}

beforeEach(() => { state.failed.clear(); });

describe('personal dashboard unavailable data', () => {
    it('reports failed sales and targets separately from legitimate empty results', async () => {
        state.failed.add('team_sales_targets'); state.failed.add('manager_monthly_sales');
        const response = await GET(new NextRequest('http://localhost/api/dashboard/my-stats'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.missing).toEqual(expect.arrayContaining(['targets', 'sales']));
        expect(body.missing).not.toContain('leads');
    });

    it('does not mark a successful empty query as unavailable', async () => {
        const body = await (await GET(new NextRequest('http://localhost/api/dashboard/my-stats'))).json();
        expect(body.missing).toEqual([]);
        expect(body.tasks).toEqual([]);
        expect(body.kpis.salesThisMonth).toBe(0);
    });

    it('keeps the existing helper return types for callers without error reporting', async () => {
        state.failed.add('team_sales_targets'); state.failed.add('manager_monthly_sales');
        expect(await getTeamTargets(fakeDb(), 'shop', 2026)).toEqual(Array(12).fill(0));
        expect(await getMonthlyActualsByManager(fakeDb(), 'shop', 2026)).toEqual(new Map());
    });
});
