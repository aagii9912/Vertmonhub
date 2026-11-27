import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPricingOverview, quoteViewingSelection, retirePriceList, savePricingConfig } from '../pricing-store';
import { EMPTY_PRICING_DRAFT, type PricingSelection } from '../pricing';

const unit = { id: '00000000-0000-0000-0000-000000000001', project_id: 'project', block: 'Б1', model: 'E6', floor: '02', sale_area: 51.72, updated_sale_area: 0, contracted_area: null };
const selection: PricingSelection = { block: 'B1', model: 'E6', floor: 2, area_sqm: 51.72 };
function database(units = [unit], configs: unknown[] = []) {
    const calls: Array<{ table: string; filters: unknown[][] }> = [];
    const db = { from(table: string) {
        const filters: unknown[][] = []; calls.push({ table, filters });
        const chain = { select: () => chain, order: () => chain, limit: () => chain,
            eq: (...args: unknown[]) => { filters.push(args); return chain; },
            in: (...args: unknown[]) => { filters.push(args); return chain; },
            range: async () => ({ data: units, error: null }),
            // The active price lists are read as a list (one row per list).
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: configs, error: null }).then(resolve),
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
    expect(rpc).toHaveBeenCalledWith('save_project_price_list', expect.objectContaining({ p_shop_id: 'shop', p_actor: 'actor', p_list_key: 'main', p_list_name: 'Үндсэн үнэ', p_expected_version: 4 }));
});
const row = (list_key: string, list_name: string, version: number, status: string, block: string, valid_from = '2026-10-01', valid_until = '2026-10-31') => ({
    id: `${list_key}-${version}`, shop_id: 'shop', list_key, list_name, version, status,
    config: { source: 'Баталсан үнэ', valid_from, valid_until, inventory_area_confirmed: true,
        rules: [{ block, model: 'E6', floor_min: 2, floor_max: 9, payment_condition: '50%', price_per_sqm: 4_000_000, advance_percent: 50 }] },
});
it('quotes a unit from the list that covers it and names the other list when an activation would price a unit twice', async () => {
    const lists = [row('main', 'Үндсэн үнэ', 3, 'active', 'Б1'), row('forest', 'Forest Garden тусгай үнэ', 1, 'active', '503')];
    const priced = await quoteViewingSelection(database([unit], lists).db, 'shop', { ...selection, payment_condition: '50%' }, { projectIds: null, managerName: null }, '2026-10-08');
    expect(priced).toMatchObject({ available: true, quote: { config_id: 'main-3', total_amount: 206_880_000 } });

    const rpc = vi.fn().mockResolvedValue({ data: row('forest', 'Forest Garden тусгай үнэ', 2, 'active', 'Б1'), error: null });
    const save = (valid_from: string, valid_until: string) => savePricingConfig({ ...database([unit], lists).db, rpc } as unknown as SupabaseClient, 'shop', 'actor', {
        list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', expected_version: 1, status: 'active', config: row('forest', '', 2, 'active', 'Б1', valid_from, valid_until).config,
    });
    await expect(save('2026-10-20', '2026-11-30')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('«Үндсэн үнэ» жагсаалтын идэвхтэй үнэтэй давхцаж байна') });
    expect(rpc).not.toHaveBeenCalled();
    // After the default list's window the same block may get the special price; its own earlier version is not a conflict.
    await expect(save('2026-11-01', '2026-11-30')).resolves.toMatchObject({ list_key: 'forest', version: 2 });
    expect(rpc).toHaveBeenCalledWith('save_project_price_list', expect.objectContaining({ p_list_key: 'forest', p_list_name: 'Forest Garden тусгай үнэ', p_expected_version: 1, p_status: 'active' }));
});
it('maps the RPC refusals of a list save and a withdrawal to messages the admin can act on', async () => {
    const draft = { expected_version: 0, status: 'draft' as const, config: EMPTY_PRICING_DRAFT };
    for (const [code, status, text] of [['23505', 400, 'Ийм нэртэй'], ['23P01', 400, 'давхцаж'], ['42501', 403, 'эрх'], ['22023', 400, 'буруу'], ['XX000', 503, 'хадгалагдсангүй']] as const) {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
        await expect(savePricingConfig({ rpc } as unknown as SupabaseClient, 'shop', 'actor', draft)).rejects.toMatchObject({ status, message: expect.stringContaining(text) });
    }
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0002' } });
    await expect(retirePriceList({ rpc } as unknown as SupabaseClient, 'shop', 'actor', { list_key: 'forest', expected_version: 2 })).rejects.toMatchObject({ status: 404 });
    expect(rpc).toHaveBeenCalledWith('retire_project_price_list', { p_shop_id: 'shop', p_actor: 'actor', p_list_key: 'forest', p_expected_version: 2 });
    rpc.mockResolvedValue({ data: { ...row('forest', 'Forest Garden тусгай үнэ', 2, 'archived', '503') }, error: null });
    await expect(retirePriceList({ rpc } as unknown as SupabaseClient, 'shop', 'actor', { list_key: 'forest', expected_version: 2 })).resolves.toMatchObject({ status: 'archived', list_key: 'forest' });
});
it('lists every price list for the editor with its latest and active version, the default list first even when empty', async () => {
    const rows = [row('forest', 'Forest Garden тусгай үнэ', 2, 'draft', '503'), row('forest', 'Тусгай үнэ', 1, 'active', '503')];
    const db = { from: () => {
        let ids: string[] | null = null;
        const chain = { select: () => chain, eq: () => chain, order: () => chain,
            in: (_column: string, values: string[]) => { ids = values; return chain; },
            range: async () => ({ data: rows.map(({ config: _config, ...light }) => light), error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.filter(item => ids?.includes(item.id)), error: null }).then(resolve),
        }; return chain;
    } } as unknown as SupabaseClient;
    const { lists } = await loadPricingOverview(db, 'shop');
    expect(lists.map(list => [list.key, list.name, list.latest?.version ?? null, list.active?.version ?? null])).toEqual([
        ['main', 'Үндсэн үнэ', null, null], ['forest', 'Forest Garden тусгай үнэ', 2, 1],
    ]);
});
