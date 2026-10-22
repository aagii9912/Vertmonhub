import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb } from '@/test/memory-db';
import type { ManagerIdentity } from '@/lib/sales/manager-identity';
import { computeKpiReport, liveContractCount } from '../kpi-report-build';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';

const targets = vi.hoisted(() => ({ byManager: new Map<string, { actuals: number[]; counts: number[] }>(), plan: null as unknown, planError: false }));
vi.mock('@/lib/sales/targets', () => ({
    getMonthlyActualsByManager: async () => targets.byManager,
}));
vi.mock('@/lib/sales/plan-performance-load', () => ({
    loadPlanPerformance: async () => { if (targets.planError) throw new Error('plan unavailable'); return targets.plan; },
}));

/** 10-р сарын төлөвлөгөө 1,000 — төслийн гэрээнүүдээр (менежерийн нэрээс үл хамааран). */
function planOf(contracts: Array<Partial<PlanContract>>) {
    const months = emptyMonthlySales();
    months[9] = { ...months[9], target_amount: 1_000 };
    return buildPlanPerformance({ year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], receipts: null, latestImportDate: null,
        contracts: contracts.map((row, index) => ({ id: `p${index}`, contract_date: '2026-10-05', contract_status: 'active', product_type: 'residential',
            block_name: 'Б1', total_price: 100, ...row })) });
}

const identity: ManagerIdentity = { managerName: 'Туршилт Менежер', isManager: true, rosterEntry: null, fullName: null, roster: [], rosterEmpty: true };
const contract = (id: string, values: Record<string, unknown>) => ({
    id, shop_id: 'shop-1', sales_manager: 'Туршилт Менежер', deleted_at: null, contract_number: id, customer_name: 'Туршилт', total_price: 100, ...values,
});

let db: ReturnType<typeof createMemoryDb>;
beforeEach(() => {
    targets.byManager = new Map();
    targets.plan = null;
    targets.planError = false;
    db = createMemoryDb({
        leads: [], property_viewings: [], user_tasks: [],
        property_contracts: [
            contract('active', { contract_status: 'active', contract_date: '2026-10-03' }),
            contract('closed', { contract_status: 'closed', contract_date: '2026-10-31' }),
            contract('cancelled', { contract_status: 'cancelled', contract_date: '2026-10-04' }),
            contract('deleted', { contract_status: 'active', contract_date: '2026-10-05', deleted_at: '2026-10-06T00:00:00Z' }),
            contract('september', { contract_status: 'active', contract_date: '2026-09-30' }),
        ],
    });
});

const run = () => computeKpiReport(db as unknown as SupabaseClient, {
    shopId: 'shop-1', shopName: 'Туршилт төсөл', identity, targetName: 'Туршилт Менежер', uid: 'user-1', year: 2026, month: 10,
});

describe('computeKpiReport contract count fallback', () => {
    it('manager_monthly_sales-д тоо алга бол цуцалсан гэрээг тоолохгүй', async () => {
        const report = await run();
        expect(report.summary.contracts).toBe(2);
        // Жагсаалтад цуцалсан гэрээ төлөвтэйгөө харагдана (тоонд ороогүй).
        expect(report.contracts.map(c => c.id).sort()).toEqual(['active', 'cancelled', 'closed']);
    });

    it('view-ийн тоо байвал түүнийг хэрэглэнэ', async () => {
        targets.byManager = new Map([['Туршилт Менежер', { actuals: Array(12).fill(0).map((_, i) => (i === 9 ? 500 : 0)), counts: Array(12).fill(0).map((_, i) => (i === 9 ? 5 : 0)) }]]);
        const report = await run();
        expect(report.summary).toMatchObject({ contracts: 5, revenue: 500 });
    });
});

describe('computeKpiReport team target (shop-level plan)', () => {
    it('takes the team actual from the whole project even when roster names do not match the contracts', async () => {
        // Контрактууд менежергүй (HUB импорт); view-д зөвхөн өөр нэр.
        targets.plan = planOf([{ total_price: 300 }, { total_price: 130 }]);
        targets.byManager = new Map([['Туршилт Менежер', { actuals: Array(12).fill(0).map((_, i) => (i === 9 ? 100 : 0)), counts: Array(12).fill(0) }],
            ['Өөр Менежер', { actuals: Array(12).fill(0).map((_, i) => (i === 9 ? 300 : 0)), counts: Array(12).fill(0) }]]);
        const report = await run();
        expect(report.target).toEqual({ teamTarget: 1_000, teamActual: 430, lowerBound: false, pct: 43, myShare: 25 });
    });

    it('keeps an unknown team actual null (never 0%) and marks undated contracts as a lower bound', async () => {
        targets.plan = planOf([{ contract_date: null }]);
        expect((await run()).target).toMatchObject({ teamTarget: 1_000, teamActual: null, pct: null, lowerBound: true, myShare: null });
        targets.plan = planOf([{ total_price: 200 }, { contract_date: null }]);
        expect((await run()).target).toMatchObject({ teamActual: 200, pct: 20, lowerBound: true });
    });

    it('hides the team target when the plan cannot be read or is not set', async () => {
        targets.planError = true;
        expect((await run()).target).toBeNull();
        targets.planError = false;
        targets.plan = buildPlanPerformance({ year: 2026, now: new Date('2026-10-22T04:00:00Z'), months: emptyMonthlySales(), planYears: [], receipts: null, latestImportDate: null, contracts: [] });
        expect((await run()).target).toBeNull();
    });
});

describe('liveContractCount', () => {
    it('NULL болон бусад төлөвийг тоолж, зөвхөн цуцалсныг хасна', () => {
        expect(liveContractCount([
            { id: 'a', contract_status: 'active' }, { id: 'b', contract_status: null }, { id: 'c', contract_status: 'cancelled' }, { id: 'd', contract_status: 'transferred' },
        ])).toBe(3);
    });
});
