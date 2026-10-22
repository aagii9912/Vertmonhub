import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';

const state = vi.hoisted(() => ({ plan: null as unknown, planError: false, byManager: new Map<string, { actuals: number[]; counts: number[] }>() }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop' }), getUserId: async () => 'user' }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => ({ role: 'admin', permissions: { modules: ['dashboard', 'reports'] } }) }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkRateLimit: async () => ({ allowed: true }), createRateLimitResponse: vi.fn(), getClientIdentifier: () => 'test' }));
vi.mock('@/lib/sales/project-scope', () => ({
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
    applyLeadScope: (query: unknown) => query,
    ProjectScopeError: class extends Error {},
}));
vi.mock('@/lib/sales/manager-identity', () => ({
    resolveManagerIdentity: async () => ({ managerName: 'Болд', isManager: false, rosterEntry: { name: 'Болд', user_id: 'user', is_active: true },
        fullName: 'Болд', roster: [{ name: 'Болд', user_id: 'user', is_active: true }], rosterEmpty: false }),
}));
vi.mock('@/lib/sales/plan-performance-load', () => ({
    loadPlanPerformance: async () => { if (state.planError) throw new Error('plan unavailable'); return state.plan; },
}));
vi.mock('@/lib/sales/targets', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/targets')>(),
    getMonthlyActualsByManager: async () => state.byManager,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => emptyDb() }));

function emptyDb() {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'not', 'lt', 'gte', 'order', 'limit']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return { from: () => chain };
}

import { GET } from '../dashboard/my-stats/route';

/** Энэ сар (UB) ба 1,000-ийн төлөвлөгөөтэй төслийн гэрээнүүд — менежерийн нэр хамаарахгүй. */
function planOf(contracts: Array<Partial<PlanContract>>, now = new Date()) {
    const months = emptyMonthlySales().map(row => ({ ...row, target_amount: 1_000 }));
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit' }).formatToParts(now);
    const year = Number(parts.find(part => part.type === 'year')!.value);
    const month = parts.find(part => part.type === 'month')!.value;
    return buildPlanPerformance({ year, now, months, planYears: [year], receipts: null, latestImportDate: null,
        contracts: contracts.map((row, index) => ({ id: `c${index}`, contract_date: `${year}-${month}-01`, contract_status: 'active', product_type: 'residential',
            block_name: 'Б1', total_price: 100, ...row })) });
}
const stats = async () => (await GET(new NextRequest('http://localhost/api/dashboard/my-stats'))).json();

beforeEach(() => { state.plan = null; state.planError = false; state.byManager = new Map(); });

describe('Today team target', () => {
    it('compares the shop-level in-plan actual with the plan even when roster names match no contract', async () => {
        // Менежерийн нэрээр view хоосон (HUB гэрээ менежергүй) — багийн гүйцэтгэл төслөөс.
        state.plan = planOf([{ total_price: 300 }, { total_price: 130 }, { product_type: 'industry', total_price: 999 }]);
        const body = await stats();
        expect(body.missing).toEqual([]);
        expect(body.target.periods.month).toEqual({ target: 1_000, actual: 430, lowerBound: false, pct: 43 });
        expect(body.target.periods.year).toMatchObject({ target: 12_000, actual: 430, lowerBound: false });
        expect(body.target.mine).toEqual({ month: 0, quarter: 0, year: 0 });
    });

    it('never turns an unknown month into 0% and marks undated contracts as a lower bound', async () => {
        state.plan = planOf([{ contract_date: null }]);
        expect((await stats()).target.periods.month).toEqual({ target: 1_000, actual: null, lowerBound: true, pct: null });
        state.plan = planOf([{ total_price: 200 }, { contract_date: null }]);
        expect((await stats()).target.periods.month).toEqual({ target: 1_000, actual: 200, lowerBound: true, pct: 20 });
    });

    it('reports the target section as missing when the plan cannot be read', async () => {
        state.planError = true;
        const body = await stats();
        expect(body.target).toBeNull();
        expect(body.missing).toContain('targets');
    });
});
