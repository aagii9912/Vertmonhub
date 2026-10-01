import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GET } from '../dashboard/my-stats/route';
import { getMonthlyActualsByManager, getTeamTargets } from '@/lib/sales/targets';

const state = vi.hoisted(() => ({ failed: new Set<string>(), queries: [] as Array<{ table: string; filters: unknown[][] }> }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop' }), getUserId: async () => 'user' }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => ({ role: 'sales_manager', permissions: { modules: ['dashboard'] } }) }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkRateLimit: async () => ({ allowed: true }), createRateLimitResponse: vi.fn(), getClientIdentifier: () => 'test' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => fakeDb() }));

function fakeDb() {
    type Row = Record<string, unknown>;
    const tables: Record<string, Row[]> = {
        user_profiles: [{ id: 'user', full_name: 'Болд' }],
        sales_managers: [{ shop_id: 'shop', name: 'Болд', user_id: 'user', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop', manager_name: 'Болд', project_id: 'elysium' }],
    };
    return { from(table: string) {
        const query = { table, filters: [] as unknown[][] };
        state.queries.push(query);
        const predicates: Array<(row: Row) => boolean> = [];
        let bounds: [number, number] | null = null;
        const result = (single = false) => {
            const rows = (tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row)));
            const data = bounds ? rows.slice(bounds[0], bounds[1] + 1) : rows;
            return { data: state.failed.has(table) ? null : single ? data[0] ?? null : data, error: state.failed.has(table) ? { message: 'unavailable' } : null };
        };
        const chain: Record<string, any> = {};
        for (const method of ['select', 'not', 'lt', 'gte', 'order', 'limit']) chain[method] = () => chain;
        chain.eq = chain.is = (key: string, value: unknown) => { query.filters.push([key, value]); predicates.push(row => row[key] === value); return chain; };
        chain.in = (key: string, values: unknown[]) => { query.filters.push([key, values]); predicates.push(row => values.includes(row[key])); return chain; };
        chain.range = (from: number, to: number) => { bounds = [from, to]; return chain; };
        chain.maybeSingle = async () => result(true);
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
        return chain;
    } } as unknown as SupabaseClient;
}

beforeEach(() => { state.failed.clear(); state.queries.length = 0; });

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
        expect(state.queries.find(query => query.table === 'leads')?.filters).toContainEqual(['project_id', ['elysium']]);
        expect(state.queries.find(query => query.table === 'leads')?.filters).toContainEqual(['sales_manager_name', 'Болд']);
    });

    it('keeps the existing helper return types for callers without error reporting', async () => {
        state.failed.add('team_sales_targets'); state.failed.add('manager_monthly_sales');
        expect(await getTeamTargets(fakeDb(), 'shop', 2026)).toEqual(Array(12).fill(0));
        expect(await getMonthlyActualsByManager(fakeDb(), 'shop', 2026)).toEqual(new Map());
    });
});
