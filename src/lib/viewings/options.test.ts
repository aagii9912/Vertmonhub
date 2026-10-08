import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadViewingOptions } from './options';

it('returns minimal project inventory and uses sale area when updated area is zero', async () => {
    const rows = [{ id: 'u1', project_id: 'p', block: 'Б1', model: 'E3', sale_area: 85.19, updated_sale_area: 0, contracted_area: 0,
        floor: '13', unit_number: '1301', code: 'Б1-1301', status: 'available', buyer_name: 'SECRET', sales_manager: 'PRIVATE' }];
    const select = vi.fn(), eq = vi.fn(), within = vi.fn();
    const chain = { select: (...args: unknown[]) => { select(...args); return chain; }, eq: (...args: unknown[]) => { eq(...args); return chain; },
        in: (...args: unknown[]) => { within(...args); return chain; }, order: () => chain, range: async () => ({ data: rows, error: null }) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const result = await loadViewingOptions(db, 's', { projectIds: ['p'], managerName: 'Бат' }, 'p');
    expect(result).toEqual([{ id: 'u1', project_id: 'p', block: 'Б1', model: 'E3', area_sqm: 85.19, floor: 13, unit_number: '1301', code: 'Б1-1301', status: 'available' }]);
    expect(eq).toHaveBeenCalledWith('shop_id', 's'); expect(eq).toHaveBeenCalledWith('category', 'residential');
    expect(within).toHaveBeenCalledWith('project_id', ['p']);
    expect(select.mock.calls[0][0]).not.toMatch(/buyer|sales_manager|\*/);
});
