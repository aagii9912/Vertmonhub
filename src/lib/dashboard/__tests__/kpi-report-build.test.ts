import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb } from '@/test/memory-db';
import type { ManagerIdentity } from '@/lib/sales/manager-identity';
import { computeKpiReport, liveContractCount } from '../kpi-report-build';

const targets = vi.hoisted(() => ({ byManager: new Map<string, { actuals: number[]; counts: number[] }>() }));
vi.mock('@/lib/sales/targets', () => ({
    getTeamTargets: async () => Array(12).fill(0),
    getMonthlyActualsByManager: async () => targets.byManager,
}));

const identity: ManagerIdentity = { managerName: 'Туршилт Менежер', isManager: true, rosterEntry: null, fullName: null, roster: [], rosterEmpty: true };
const contract = (id: string, values: Record<string, unknown>) => ({
    id, shop_id: 'shop-1', sales_manager: 'Туршилт Менежер', deleted_at: null, contract_number: id, customer_name: 'Туршилт', total_price: 100, ...values,
});

let db: ReturnType<typeof createMemoryDb>;
beforeEach(() => {
    targets.byManager = new Map();
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

describe('liveContractCount', () => {
    it('NULL болон бусад төлөвийг тоолж, зөвхөн цуцалсныг хасна', () => {
        expect(liveContractCount([
            { id: 'a', contract_status: 'active' }, { id: 'b', contract_status: null }, { id: 'c', contract_status: 'cancelled' }, { id: 'd', contract_status: 'transferred' },
        ])).toBe(3);
    });
});
