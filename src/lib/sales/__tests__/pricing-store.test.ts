import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { quoteViewingSelection, savePricingConfig } from '../pricing-store';
import { EMPTY_PRICING_DRAFT, type PricingSelection } from '../pricing';

const unit = { id: '00000000-0000-0000-0000-000000000001', project_id: 'project', block: 'Б1', model: 'E6', floor: '02', sale_area: 51.72, updated_sale_area: 0, contracted_area: null };
const selection: PricingSelection = { block: 'B1', model: 'E6', floor: 2, area_sqm: 51.72 };
function database(units = [unit], config: unknown = null) {
    const calls: Array<{ table: string; filters: unknown[][] }> = [];
    const db = { from(table: string) {
        const filters: unknown[][] = []; calls.push({ table, filters });
        const chain = { select: () => chain, order: () => chain, limit: () => chain,
            eq: (...args: unknown[]) => { filters.push(args); return chain; },
            in: (...args: unknown[]) => { filters.push(args); return chain; },
            range: async () => ({ data: units, error: null }),
            maybeSingle: async () => ({ data: config, error: null }),
        }; return chain;
    } } as unknown as SupabaseClient;
    return { db, calls };
}
it('validates inventory and scoped project before accepting a valid interest with no price', async () => {
    const { db, calls } = database();
    expect(await quoteViewingSelection(db, 'shop', selection, { projectIds: ['project'], managerName: 'Бат' }, '2026-10-08')).toMatchObject({ available: false, quote: null });
    expect(calls[0]).toMatchObject({ table: 'property_units' });
    expect(calls[0].filters).toContainEqual(['shop_id', 'shop']);
    expect(calls[0].filters).toContainEqual(['project_id', ['project']]);
    expect(calls.every(call => ['property_units', 'project_pricing_configs'].includes(call.table))).toBe(true);
});
it('rejects foreign units, tampered area/model/floor, and projectless managers before config lookup', async () => {
    for (const candidate of [{ ...selection, area_sqm: 1 }, { ...selection, model: 'E3' }, { ...selection, floor: 3 }]) {
        const { db, calls } = database();
        await expect(quoteViewingSelection(db, 'shop', candidate, { projectIds: null, managerName: null })).rejects.toMatchObject({ status: 404 });
        expect(calls).toHaveLength(1);
    }
    await expect(quoteViewingSelection(database([]).db, 'shop', selection, { projectIds: null, managerName: null })).rejects.toMatchObject({ status: 404 });
    const empty = database();
    await expect(quoteViewingSelection(empty.db, 'shop', selection, { projectIds: [], managerName: null })).rejects.toMatchObject({ status: 404 });
    expect(empty.calls).toEqual([]);
});
it('sends validated version to the atomic save RPC and reports stale conflicts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '40001' } });
    await expect(savePricingConfig({ rpc } as unknown as SupabaseClient, 'shop', 'actor', { expected_version: 4, status: 'draft', config: EMPTY_PRICING_DRAFT })).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledWith('save_project_pricing', expect.objectContaining({ p_shop_id: 'shop', p_actor: 'actor', p_expected_version: 4 }));
});
