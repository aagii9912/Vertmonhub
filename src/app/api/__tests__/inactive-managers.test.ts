// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
    rows: {} as Record<string, Record<string, unknown>[]>,
    rosterError: false,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireAnyModule: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }) }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const filters: Array<(row: Record<string, unknown>) => boolean> = [];
            const run = () => ({
                data: (state.rows[table] || []).filter((row) => filters.every((filter) => filter(row))),
                error: table === 'sales_managers' && state.rosterError ? { message: 'roster unavailable' } : null,
            });
            const query = {
                select: () => query,
                eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
                not: (key: string, _op: string, value: unknown) => { filters.push((row) => row[key] !== value); return query; },
                order: () => query,
                limit: () => query,
                then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
            };
            return query;
        },
    }),
}));

import { supabaseAdmin } from '@/lib/supabase';
import { GET as getManagers } from '../dashboard/managers/route';
import { getManagerPerformance } from '@/lib/reports/manager-performance';

beforeEach(() => {
    state.rosterError = false;
    state.rows = {
        sales_managers: [
            { shop_id: 'shop-1', name: 'Идэвхтэй', user_id: null, is_active: true },
            { shop_id: 'shop-1', name: 'Шинэ менежер', user_id: null, is_active: true },
            { shop_id: 'shop-1', name: 'Ажлаас гарсан', user_id: null, is_active: false },
        ],
        manager_performance: [
            { shop_id: 'shop-1', sales_manager: 'Идэвхтэй', contract_count: 2, total_sales: 200 },
            { shop_id: 'shop-1', sales_manager: 'Ажлаас гарсан', contract_count: 1, total_sales: 100 },
            { shop_id: 'shop-1', sales_manager: 'Бүртгэлгүй түүхэн нэр', contract_count: 1, total_sales: 50 },
        ],
        leads: [
            { shop_id: 'shop-1', sales_manager_name: 'Ажлаас гарсан' },
            { shop_id: 'shop-1', sales_manager_name: 'Бүртгэлгүй түүхэн нэр' },
        ],
        team_sales_targets: [],
        manager_monthly_sales: [],
    };
});

describe('inactive sales managers', () => {
    it('hides departed managers from selectors and current performance totals', async () => {
        const response = await getManagers();
        expect(response.status).toBe(200);
        expect((await response.json()).managers.map((manager: { name: string }) => manager.name)).toEqual(['Идэвхтэй', 'Шинэ менежер']);

        const report = await getManagerPerformance(supabaseAdmin() as SupabaseClient, 'shop-1');
        expect(report.managers.map((manager) => manager.sales_manager)).toEqual(['Идэвхтэй', 'Шинэ менежер']);
        expect(report.managers[1]).toMatchObject({ contract_count: 0, total_sales: 0 });
        expect(report.totals).toMatchObject({ managers: 2, contracts: 2, sales: 200 });
    });

    it('does not expose names when roster status cannot be checked', async () => {
        state.rosterError = true;
        expect((await getManagers()).status).toBe(500);
        await expect(getManagerPerformance(supabaseAdmin() as SupabaseClient, 'shop-1')).rejects.toMatchObject({ message: 'roster unavailable' });
    });
});
