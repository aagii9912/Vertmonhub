import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseUnitUpdate, updateInventoryUnit } from '../unit-update';

function db(data: unknown, error: unknown = null) {
    const chain = {
        update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    };
    return { client: { from: vi.fn(() => chain) } as unknown as SupabaseClient, chain };
}

describe('unit edit rules shared by PATCH /units and the AI', () => {
    it('keeps only editable fields, trims text and turns blanks into null', () => {
        expect(parseUnitUpdate({ id: 'u1', code: '201-440', shop_id: 'other', rooms: 3, sale_area: 62.5, model: ' A2 ', window_view: '' }))
            .toEqual({ ok: true, changes: { rooms: 3, sale_area: 62.5, model: 'A2', window_view: null } });
    });

    it.each([{ rooms: 2.5 }, { rooms: '3' }, { sale_area: -1 }, { status: 'gone' }, { category: 'villa' }, { unit_type: 'x'.repeat(31) }, {}])
    ('rejects %j', (body) => {
        expect(parseUnitUpdate(body)).toMatchObject({ ok: false });
    });

    it('updates a unit only inside its shop and reports a missing unit', async () => {
        const found = db({ id: 'u1', rooms: 3 });
        expect(await updateInventoryUnit(found.client, 'shop-1', 'u1', { rooms: 3 })).toEqual({ unit: { id: 'u1', rooms: 3 } });
        expect(found.chain.update).toHaveBeenCalledWith({ rooms: 3, updated_at: expect.any(String) });
        expect(found.chain.eq).toHaveBeenCalledWith('id', 'u1');
        expect(found.chain.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(await updateInventoryUnit(db(null).client, 'shop-1', 'u1', { rooms: 3 })).toMatchObject({ status: 404 });
        expect(await updateInventoryUnit(db(null, { message: 'denied' }).client, 'shop-1', 'u1', { rooms: 3 })).toMatchObject({ status: 500 });
    });
});
