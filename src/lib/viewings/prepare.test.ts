import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareViewingInterests } from './prepare';
import { quoteViewingSelection, PricingSelectionError } from '@/lib/sales/pricing-store';

vi.mock('@/lib/sales/pricing-store', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/sales/pricing-store')>(), quoteViewingSelection: vi.fn() }));
const input = { block: 'Б1', model: 'E3', area_sqm: 85.19, floor: 13, payment_condition: '30%' };
const db = {} as SupabaseClient;
beforeEach(() => { vi.mocked(quoteViewingSelection).mockReset(); });
it('keeps valid interests without prices and constrains unrestricted actors to the viewing project', async () => {
    vi.mocked(quoteViewingSelection).mockResolvedValue({ available: false, quote: null, reason: 'Хугацаа дууссан' });
    expect(await prepareViewingInterests(db, 's', 'p', [input], { projectIds: null, managerName: null })).toEqual([{ ...input, quote: null, quote_unavailable_reason: 'Хугацаа дууссан' }]);
    expect(quoteViewingSelection).toHaveBeenCalledWith(db, 's', input, { projectIds: ['p'], managerName: null });
});
it('preserves each existing server snapshot when another alternative is added after a price change', async () => {
    const old = { ...input, quote: { ...input, config_id: 'old', version: 1, source: 'Өмнөх санал', as_of: '2026-10-07', unit_id: null,
        price_per_sqm: 7_200_000, total_amount: 613_368_000, advance_amount: 184_010_400, balance_amount: 429_357_600, advance_reason: null }, quote_unavailable_reason: null };
    vi.mocked(quoteViewingSelection).mockResolvedValue({ available: false, quote: null, reason: 'Шинэ үнэ алга' });
    const next = { ...input, floor: 14 };
    const result = await prepareViewingInterests(db, 's', 'p', [input, next], { projectIds: ['p'], managerName: 'Бат' }, [old]);
    expect(result[0]).toEqual(old);
    expect(result[1]).toMatchObject({ floor: 14, quote: null, quote_unavailable_reason: 'Шинэ үнэ алга' });
    expect(quoteViewingSelection).toHaveBeenCalledTimes(1);
});
it('derives an exact unit label from scoped inventory, never from caller text', async () => {
    const unitId = '12345678-1234-1234-1234-123456789012';
    const filters: unknown[][] = [];
    const chain = { select: () => chain, eq: (...args: unknown[]) => { filters.push(args); return chain; }, maybeSingle: async () => ({ data: { unit_number: '1301', code: 'Б1-1301' }, error: null }) };
    vi.mocked(quoteViewingSelection).mockResolvedValue({ available: false, quote: null, reason: 'Үнэ алга' });
    const result = await prepareViewingInterests({ from: () => chain } as unknown as SupabaseClient, 's', 'p', [{ ...input, unit_id: unitId }], { projectIds: null, managerName: null });
    expect(result[0].unit_label).toBe('1301');
    expect(filters).toEqual([['id', unitId], ['shop_id', 's'], ['project_id', 'p']]);
});
it('rejects forged quote totals, cross-project actors and invalid inventory rather than saving a fake snapshot', async () => {
    await expect(prepareViewingInterests(db, 's', 'p', [{ ...input, quote: { total_amount: 1 } }], { projectIds: null, managerName: null })).rejects.toMatchObject({ status: 400 });
    await expect(prepareViewingInterests(db, 's', 'p', [input], { projectIds: ['other'], managerName: 'Бат' })).rejects.toMatchObject({ status: 404 });
    expect(quoteViewingSelection).not.toHaveBeenCalled();
    vi.mocked(quoteViewingSelection).mockImplementation(async () => { throw new PricingSelectionError('Тоот олдсонгүй', 404); });
    const failure = await prepareViewingInterests(db, 's', 'p', [input], { projectIds: ['p'], managerName: 'Бат' }).catch(error => error);
    expect(failure.status).toBe(404);
});
