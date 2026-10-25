import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
    activityTargetsPatch, emptyMonthlySales, hasMonthlySalesExtras, MONTHLY_SALES_EXTRAS_UNAVAILABLE, MONTHLY_SALES_FIELDS,
    MonthlySalesBlocksSchema, MonthlySalesMonthSchema, MonthlySalesWriteSchema, monthlySalesPatches, readActivityTargets,
} from '../monthly';
import { getTeamMonthlySales, saveTeamMonthlySales } from '../targets';

const shop = '20000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000001';
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => '10000000-0000-4000-8000-000000000001' }));

const write = (months: unknown[]) => MonthlySalesWriteSchema.safeParse({ shopId: shop, year: 2026, months });

describe('stretch and activity plan contract', () => {
    it('keeps the block fields unchanged and never accepts stretch or activity inside a block', () => {
        expect(MONTHLY_SALES_FIELDS).not.toContain('stretch_target_amount');
        expect(MonthlySalesBlocksSchema.safeParse({ b1: { stretch_target_amount: 1 } }).success).toBe(false);
        expect(MonthlySalesBlocksSchema.safeParse({ b1: { activity_targets: { hotline: 1 } } }).success).toBe(false);
    });

    it('accepts month-level stretch amounts and partial activity patches; rejects unknown keys, fractions and negatives', () => {
        expect(write([{ month: 10, expectedRevision: 2, stretch_target_amount: 7_152_996_000, stretch_cashflow_target_amount: null }]).success).toBe(true);
        expect(write([{ month: 10, expectedRevision: 2, activity_targets: { hotline: 380, chats: null } }]).success).toBe(true);
        expect(write([{ month: 10, expectedRevision: 2, activity_targets: null }]).success).toBe(true);
        for (const patch of [
            { activity_targets: {} }, { activity_targets: { calls: 1 } }, { activity_targets: { hotline: 1.5 } },
            { activity_targets: { hotline: -1 } }, { activity_targets: { chats: 1_000_001 } }, { activity_targets: { hotline: '3' } },
            { stretch_target_amount: -1 }, { stretch_target_amount: 1.001 }, { stretch_cashflow_target_amount: '10' },
        ]) expect(write([{ month: 10, expectedRevision: 2, ...patch }]).success).toBe(false);
        expect(hasMonthlySalesExtras({ month: 1, expectedRevision: 0, target_amount: 1 })).toBe(false);
        expect(hasMonthlySalesExtras({ month: 1, expectedRevision: 0, activity_targets: null })).toBe(true);
    });

    it('patches only changed extras next to block cells, sending removed activity keys as null', () => {
        const before = emptyMonthlySales();
        before[9] = { ...before[9], revision: 4, stretch_target_amount: 100, activity_targets: { hotline: 380, chats: 60 } };
        const after = before.map(row => ({ ...row }));
        after[9] = { ...after[9], stretch_target_amount: 100, stretch_cashflow_target_amount: 0,
            activity_targets: { chats: 60, meetings_new: 70 }, block_amounts: { b1: { target_amount: 5 } } };
        expect(monthlySalesPatches(before, after)).toEqual([{ month: 10, expectedRevision: 4, stretch_cashflow_target_amount: 0,
            activity_targets: { hotline: null, meetings_new: 70 }, block_amounts: { b1: { target_amount: 5 } } }]);
        // Хариу нь хуучин API (нэмэлт талбаргүй) байсан ч хоосон нүд өөрчлөлт болохгүй.
        const legacy = emptyMonthlySales().map(({ stretch_target_amount: _a, stretch_cashflow_target_amount: _b, activity_targets: _c, ...row }) => row);
        expect(monthlySalesPatches(legacy, emptyMonthlySales())).toEqual([]);
        expect(activityTargetsPatch(null, {})).toBeUndefined();
        expect(activityTargetsPatch({ hotline: 0 }, null)).toEqual({ hotline: null });
    });

    it('reads activity plans for reports as entered keys only, unknown when empty or malformed', () => {
        expect(readActivityTargets({ hotline: 380, chats: 0, meetings_new: null })).toEqual({ hotline: 380, chats: 0 });
        for (const raw of [null, undefined, {}, { meetings_new: null }, { calls: 3 }, { hotline: 1.5 }, [1], 'x']) expect(readActivityTargets(raw)).toBeNull();
        expect(MonthlySalesMonthSchema.parse({ ...emptyMonthlySales()[0] })).toMatchObject({ activity_targets: null, stretch_target_amount: null });
    });
});

/** team_sales_targets уншилт: `extrasMissing` бол нэмэлт багана сонгосон уншилт 42703 буцаана (migration ороогүй). */
function fixture(options: { extrasMissing?: boolean; probeError?: { code: string; message: string } } = {}) {
    const rows = [{ month: 10, revision: 3, target_amount: '5352996000.00', cashflow_target_amount: null, manual_contract_actual_amount: null,
        manual_cashflow_actual_amount: null, contract_count_target: null, manual_contract_count_actual: null, block_amounts: {},
        stretch_target_amount: '7152996000.00', stretch_cashflow_target_amount: '2145898800.00', activity_targets: { hotline: 380, chats: 60 } }];
    const selects: string[] = [];
    const rpc = vi.fn().mockResolvedValue({ data: { months: rows }, error: null });
    return { rpc, selects, from: () => {
        let columns = '';
        const query = {
            select: (value: string) => { columns = value; selects.push(value); return query; },
            eq: () => query, limit: () => query,
            then: (resolve: (value: unknown) => unknown) => {
                const extras = columns.includes('activity_targets');
                if (extras && options.probeError && !columns.includes('revision')) return Promise.resolve({ data: null, error: options.probeError }).then(resolve);
                if (extras && options.extrasMissing) return Promise.resolve({ data: null, error: { code: '42703', message: 'column team_sales_targets.stretch_target_amount does not exist' } }).then(resolve);
                const data = rows.map(row => extras ? row : Object.fromEntries(Object.entries(row).filter(([key]) => !/stretch|activity/.test(key))));
                return Promise.resolve({ data, error: null }).then(resolve);
            },
        };
        return query;
    } };
}

describe('monthly sales loader and writer with extras', () => {
    it('returns stretch and activity plans, and null extras with a signal when the columns are missing', async () => {
        const months = await getTeamMonthlySales(fixture() as unknown as SupabaseClient, shop, 2026);
        expect(months[9]).toMatchObject({ target_amount: 5_352_996_000, stretch_target_amount: 7_152_996_000, stretch_cashflow_target_amount: 2_145_898_800,
            activity_targets: { hotline: 380, chats: 60 } });
        expect(months[0]).toMatchObject({ stretch_target_amount: null, activity_targets: null });

        const missing = fixture({ extrasMissing: true });
        const onExtrasUnavailable = vi.fn();
        const legacy = await getTeamMonthlySales(missing as unknown as SupabaseClient, shop, 2026, { onExtrasUnavailable });
        expect(onExtrasUnavailable).toHaveBeenCalledOnce();
        expect(legacy[9]).toMatchObject({ target_amount: 5_352_996_000, stretch_target_amount: null, stretch_cashflow_target_amount: null, activity_targets: null });
        expect(missing.selects).toHaveLength(2);
    });

    it('checks the columns before sending extras and refuses with a clear code when the migration is missing', async () => {
        const db = fixture({ probeError: { code: '42703', message: 'column does not exist' } });
        const result = await saveTeamMonthlySales(db as unknown as SupabaseClient, shop, 2026, [{ month: 10, expectedRevision: 3, stretch_target_amount: 1 }], actor);
        expect(result).toEqual({ data: null, error: expect.objectContaining({ code: MONTHLY_SALES_EXTRAS_UNAVAILABLE }) });
        expect(db.rpc).not.toHaveBeenCalled();
        // Нэмэлт талбаргүй хуучин patch шалгалтгүйгээр шууд RPC руу.
        await saveTeamMonthlySales(db as unknown as SupabaseClient, shop, 2026, [{ month: 10, expectedRevision: 3, target_amount: 1 }], actor);
        expect(db.rpc).toHaveBeenCalledOnce();
        expect(db.selects).toHaveLength(1);
    });

    it('sends extras to the audited RPC once the columns exist and parses them back', async () => {
        const db = fixture();
        const patch = [{ month: 10, expectedRevision: 3, activity_targets: { hotline: 380, chats: null } }];
        const { data, error } = await saveTeamMonthlySales(db as unknown as SupabaseClient, shop, 2026, patch, actor);
        expect(error).toBeNull();
        expect(db.rpc).toHaveBeenCalledWith('save_team_monthly_sales', { p_shop_id: shop, p_year: 2026, p_months: patch, p_actor: actor });
        expect(data?.[0]).toMatchObject({ stretch_target_amount: 7_152_996_000, activity_targets: { hotline: 380, chats: 60 } });
    });
});
