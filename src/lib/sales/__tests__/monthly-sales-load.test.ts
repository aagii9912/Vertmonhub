import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getTeamMonthlySales, getTeamTargets, saveTeamMonthlySales, upsertTeamTargets } from '../targets';

const actor = '10000000-0000-4000-8000-000000000001';
const shop = '20000000-0000-4000-8000-000000000001';
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => '10000000-0000-4000-8000-000000000001' }));

function fixture(error: { message: string; code: string } | null = null) {
    const rows = [
        { shop_id: shop, year: 2026, month: 1, revision: 5, target_amount: '500.00', cashflow_target_amount: '100.00',
            manual_contract_actual_amount: null, manual_cashflow_actual_amount: '0.00',
            block_amounts: { b1: { cashflow_target_amount: 75 }, parking: { cashflow_target_amount: 25, manual_cashflow_actual_amount: 0 } } },
        { shop_id: shop, year: 2026, month: 2, revision: 1, target_amount: null, cashflow_target_amount: '50.00',
            manual_contract_actual_amount: null, manual_cashflow_actual_amount: null },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: { months: [{ ...rows[0], revision: 6 }] }, error });
    return { rpc, from: () => {
        const filters: Array<(row: typeof rows[number]) => boolean> = [];
        const query = { select: () => query,
            eq: (key: 'shop_id' | 'year', value: unknown) => { filters.push(row => row[key] === value); return query; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.filter(row => filters.every(test => test(row))), error }).then(resolve),
        };
        return query;
    } };
}

describe('monthly sales shared loader/writer', () => {
    it('keeps the legacy target total stable while newer fields preserve unknown and zero', async () => {
        const db = fixture() as unknown as SupabaseClient;
        expect(await getTeamTargets(db, shop, 2026)).toEqual([500, ...Array(11).fill(0)]);
        const months = await getTeamMonthlySales(db, shop, 2026);
        expect(months[0]).toMatchObject({ target_amount: 500, manual_cashflow_actual_amount: 0, revision: 5 });
        expect(months[0].block_amounts).toEqual({ b1: { cashflow_target_amount: 75 }, parking: { cashflow_target_amount: 25, manual_cashflow_actual_amount: 0 } });
        expect(months[1]).toMatchObject({ target_amount: null, cashflow_target_amount: 50 });
        expect(months[2].manual_contract_actual_amount).toBeNull();
        await expect(getTeamMonthlySales(fixture({ code: '42703', message: 'missing revision column' }) as unknown as SupabaseClient, shop, 2026))
            .rejects.toMatchObject({ code: '42703' });
    });

    it('uses the guarded audited RPC and validates before transport', async () => {
        const fake = fixture(); const db = fake as unknown as SupabaseClient;
        const patch = [{ month: 1, expectedRevision: 5, manual_cashflow_actual_amount: null }];
        expect((await saveTeamMonthlySales(db, shop, 2026, patch, actor)).data?.[0].revision).toBe(6);
        expect(fake.rpc).toHaveBeenCalledWith('save_team_monthly_sales', { p_shop_id: shop, p_year: 2026, p_months: patch, p_actor: actor });
        fake.rpc.mockClear();
        await expect(saveTeamMonthlySales(db, shop, 2026, [{ month: 1, expectedRevision: 5, target_amount: -10 }], actor)).rejects.toThrow();
        expect(fake.rpc).not.toHaveBeenCalled();
    });

    it('the old amount wrapper patches contract plan only, using the current revision and actor', async () => {
        const fake = fixture();
        await upsertTeamTargets(fake as unknown as SupabaseClient, shop, 2026, [{ month: 1, amount: 600 }]);
        expect(fake.rpc).toHaveBeenCalledWith('save_team_monthly_sales', {
            p_shop_id: shop, p_year: 2026, p_actor: actor,
            p_months: [{ month: 1, expectedRevision: 5, target_amount: 600 }],
        });
    });
});
