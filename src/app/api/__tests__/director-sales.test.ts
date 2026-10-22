// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';

const state = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, plan: null as unknown, loads: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => ({ role: 'admin', permissions: { modules: ['reports'] } }) }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/sales/project-scope')>()),
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
}));
vi.mock('@/lib/sales/plan-performance-load', () => ({
    loadPlanPerformance: async (_db: unknown, options: Record<string, unknown>) => {
        state.loads.push(options);
        if (!state.plan) throw new Error('read failed');
        return state.plan;
    },
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const result = { data: state.rows[table] ?? [], error: null };
            const query: Record<string, unknown> = new Proxy({}, {
                get: (_target, key) => key === 'then'
                    ? (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
                    : () => query,
            });
            return query;
        },
    }),
}));

import { GET } from '../dashboard/director/route';

const contract = (id: string, over: Partial<PlanContract> = {}): PlanContract => ({
    id, contract_date: '2026-09-05', contract_status: 'active', product_type: 'residential', block_name: 'Б2', total_price: 300, ...over,
});
function plan(contracts: PlanContract[]) {
    const months = emptyMonthlySales();
    months[8] = { ...months[8], target_amount: 1_000, block_amounts: { b2: { target_amount: 1_000 } } };
    months[7] = { ...months[7], target_amount: 1_000, block_amounts: { b2: { target_amount: 1_000 } } };
    return buildPlanPerformance({ year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], contracts, receipts: null, latestImportDate: null });
}
const get = () => GET(new NextRequest('http://test/api/dashboard/director?year=2026&month=9'));

beforeEach(() => {
    state.loads = [];
    // Ростерт зөвхөн нэг менежер; гэрээ ERP-ийн нэртэй эсвэл менежергүй — багийн дүнд бүгд орно.
    state.rows = { sales_managers: [{ name: 'Номин', is_active: true }],
        property_contracts: [{ id: 'k1', sales_manager: null, total_price: 300, contract_status: 'active', unit_type: '2 өрөө', lead_id: null, customer_name: null, contract_number: null }] };
});

describe('director sales vs plan', () => {
    it('takes the team actual from the shop-level plan loader regardless of the roster', async () => {
        state.plan = plan([contract('a', { sales_manager: 'Ариунбилэг.Нямхүү' } as Partial<PlanContract>), contract('b'), contract('c', { product_type: 'industry' }),
            contract('d', { contract_date: '2026-08-02', total_price: 200 })]);
        const response = await get();
        expect(response.status).toBe(200);
        const { sales, missing, leaderboard } = await response.json();
        expect(state.loads[0]).toMatchObject({ shopId: 'shop-1', year: 2026, canReadFinance: false });
        expect(missing).toEqual([]);
        expect(sales).toMatchObject({ actual: 600, target: 1_000, attainmentPct: 60, lowerBound: false, momDeltaPct: 200, units: 1, undated: 0, yearActual: 800, yearTarget: null });
        expect(sales.trendActual.slice(7, 12)).toEqual([200, 600, 0, null, null]);
        expect(sales.trendTarget[8]).toBe(1_000);
        expect(sales.trendTarget[0]).toBeNull();
        expect(leaderboard.map((row: { name: string }) => row.name)).toEqual(['Номин']);
    });

    it('marks a lower bound and never prints 0% for an unknown month', async () => {
        state.plan = plan([contract('a'), contract('u', { contract_date: null })]);
        let { sales } = await (await get()).json();
        expect(sales).toMatchObject({ actual: 300, attainmentPct: 30, lowerBound: true, undated: 1, momDeltaPct: null });
        expect(sales.trendActual[7]).toBeNull();

        state.plan = plan([contract('u', { contract_date: null })]);
        ({ sales } = await (await get()).json());
        expect(sales).toMatchObject({ actual: null, target: 1_000, attainmentPct: null });
    });

    it('reports the sales section as missing instead of zero when the loader fails', async () => {
        state.plan = null;
        const { sales, missing } = await (await get()).json();
        expect(missing).toContain('sales');
        expect(sales).toMatchObject({ actual: null, target: null, attainmentPct: null, yearActual: null });
        expect(sales.trendActual).toEqual(Array(12).fill(null));
    });
});
