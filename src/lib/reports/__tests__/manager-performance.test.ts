// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';

const state = vi.hoisted(() => ({ plan: null as unknown, planError: false }));
vi.mock('@/lib/sales/plan-performance-load', () => ({
    loadPlanPerformance: async () => { if (state.planError) throw new Error('plan unavailable'); return state.plan; },
}));

import { getManagerPerformance } from '../manager-performance';

const ROWS: Record<string, Record<string, unknown>[]> = {
    manager_performance: [{ shop_id: 'shop-1', sales_manager: 'Номин', contract_count: 2, closed_count: 0, total_sales: 200, total_collected: 50 }],
    // Роостерын нэр гэрээнийхтэй таарахгүй (HUB импортын гэрээ менежергүй) ч багийн дүн төслөөс.
    sales_managers: [{ shop_id: 'shop-1', name: 'Номин', is_active: true }, { shop_id: 'shop-1', name: 'Шинэ', is_active: true }],
};
function db() {
    return { from: (table: string) => {
        const query = {
            select: () => query, eq: () => query, order: () => query,
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: ROWS[table] ?? [], error: null }).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}

/** 2026 он, 1–10 сарын төлөвлөгөө 1,000 (11, 12 сар 2,000), өнөөдөр 10-р сар. */
function planOf(contracts: Array<Partial<PlanContract>>) {
    const months = emptyMonthlySales().map(row => ({ ...row, target_amount: row.month > 10 ? 2_000 : 1_000 }));
    return buildPlanPerformance({ year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], receipts: null, latestImportDate: null,
        contracts: contracts.map((row, index) => ({ id: `c${index}`, contract_date: '2026-09-05', contract_status: 'active', product_type: 'residential',
            block_name: 'Б1', total_price: 100, ...row })) });
}

beforeEach(() => { state.plan = null; state.planError = false; });

describe('manager performance team totals', () => {
    it('takes the team plan figures from the shop-level plan report and keeps the leaderboard roster-based', async () => {
        state.plan = planOf([{ total_price: 4_000 }, { total_price: 1_000, contract_date: '2026-10-02' }, { product_type: 'industry', total_price: 9_999 }]);
        const report = await getManagerPerformance(db(), 'shop-1');
        expect(report.managers.map(row => row.sales_manager)).toEqual(['Номин', 'Шинэ']);
        expect(report.totals).toMatchObject({
            managers: 2, sales: 200,
            teamTarget: 10_000, teamActual: 5_000, teamLowerBound: false, teamAttainmentPct: 50, teamYearTarget: 14_000, teamYearPct: 35.7,
        });
    });

    it('returns null (never 0) for an unknown team actual and carries the lower bound', async () => {
        state.plan = planOf([{ contract_date: null }]);
        expect((await getManagerPerformance(db(), 'shop-1')).totals).toMatchObject({ teamTarget: 10_000, teamActual: null, teamAttainmentPct: null, teamYearPct: null });
        state.plan = planOf([{ total_price: 2_000 }, { contract_date: null }]);
        expect((await getManagerPerformance(db(), 'shop-1')).totals).toMatchObject({ teamActual: 2_000, teamLowerBound: true, teamAttainmentPct: 20 });
    });

    it('leaves the team figures unknown when the plan cannot be read, without failing the leaderboard', async () => {
        state.planError = true;
        const report = await getManagerPerformance(db(), 'shop-1');
        expect(report.managers).toHaveLength(2);
        expect(report.totals).toMatchObject({ teamTarget: null, teamActual: null, teamAttainmentPct: null, teamYearTarget: null, teamYearPct: null });
    });
});
