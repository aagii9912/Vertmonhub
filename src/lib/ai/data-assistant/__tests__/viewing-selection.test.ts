import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ options: vi.fn(), conditions: vi.fn(), quote: vi.fn(), prepare: vi.fn(), update: vi.fn() }));
const selection = { block: 'Б1', model: 'E6', area_sqm: 51.72, floor: 5, payment_condition: '30%' };
const id = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const scope = { projectIds: [projectId], managerName: 'Номин' };
const q = { select: () => q, eq: () => q, is: () => q, in: () => q,
    maybeSingle: async () => ({ data: { id, interests: [], agent_notes: null, leads: { project_id: projectId } }, error: null }) };
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => q }) }));
vi.mock('@/lib/viewings/options', () => ({ loadViewingOptions: mocks.options }));
vi.mock('@/lib/sales/pricing-store', () => ({ quoteViewingSelection: mocks.quote, loadViewingPricingConditions: mocks.conditions }));
vi.mock('@/lib/viewings/prepare', () => ({ prepareViewingInterests: mocks.prepare }));
vi.mock('@/lib/services/ViewingService', () => ({ updateViewing: mocks.update }));
import { getViewingOptionsTool, calculateViewingQuoteTool, updateViewingSelectionTool } from '../actions-viewing-selection';
import { canRememberTool, TOOL_CATALOG } from '@/lib/ai/tool-catalog';
import { elysiumViewingConditions } from '@/lib/sales/viewing-conditions';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.options.mockResolvedValue([{ id, project_id: projectId, block: 'Б1', model: 'E6', area_sqm: 51.72, floor: 5, code: 'E6-0501', unit_number: '0501', status: 'available' }]);
    mocks.conditions.mockResolvedValue({ conditions: [], reason: 'Одоогийн баталсан үнэ, нөхцөл байхгүй' });
    mocks.quote.mockResolvedValue({ available: false, reason: 'Баталсан үнийн тохиргоо байхгүй', quote: null });
    mocks.prepare.mockResolvedValue([{ ...selection, quote: null, quote_unavailable_reason: 'Баталсан үнийн тохиргоо байхгүй' }]);
    mocks.update.mockResolvedValue({ ok: true, data: { id } });
});

describe('AI viewing selections', () => {
    it('returns groups without buyer data and narrows exact unit results only on model/floor selection', async () => {
        expect(await getViewingOptionsTool('shop', {}, scope)).toMatchObject({ units: [], groups: [{ model: 'E6', area_sqm: 51.72, count: 1, floors: [5] }] });
        expect(await getViewingOptionsTool('shop', { block: 'B1', model: 'E6', floor: 5 }, scope)).toMatchObject({ units: [{ id }] });
        expect(mocks.options).toHaveBeenCalledWith(expect.anything(), 'shop', scope, undefined);
    });

    it('returns selectable conditions without a price using the same scoped inventory', async () => {
        const inventory = await mocks.options();
        const conditions = elysiumViewingConditions('Elysium Residence', inventory);
        mocks.conditions.mockResolvedValue({ conditions, reason: 'Үнэ батлагдаагүй' });
        expect(await getViewingOptionsTool('shop', { project_id: projectId }, scope)).toMatchObject({
            pricing: { conditions, reason: 'Үнэ батлагдаагүй' },
        });
        expect(mocks.conditions).toHaveBeenCalledWith(expect.anything(), 'shop', scope, undefined, { projectId, units: inventory });
        expect(mocks.quote).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('keeps quote calculation read-only and preserves missing-price reasons', async () => {
        expect(await calculateViewingQuoteTool('shop', selection, scope)).toMatchObject({ available: false, quote: null });
        expect(mocks.quote).toHaveBeenCalledWith(expect.anything(), 'shop', selection, scope);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(TOOL_CATALOG.calculate_viewing_quote.kind).toBe('read');
    });

    it('previews missing-price interests and saves through the same scoped service only after confirmation', async () => {
        const args = { viewing_id: id, interests: [selection], agent_notes: 'Ойролцоо амьдардаг' };
        expect(await updateViewingSelectionTool('shop', args, false, 'actor', 'Номин', scope)).toMatchObject({ requiresConfirmation: true,
            preview: { 'Өмнөх байр': 'Сонгоогүй', 'Шинэ сэжим': 'Ойролцоо амьдардаг', Тооцоолол: ['Баталсан үнийн тохиргоо байхгүй'] } });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(await updateViewingSelectionTool('shop', args, true, 'actor', 'Номин', scope)).toMatchObject({ success: true });
        expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'shop', id, { interests: [selection], agent_notes: 'Ойролцоо амьдардаг' }, { userId: 'actor', managerName: 'Номин', scope });
        expect(canRememberTool('update_viewing')).toBe(false);
    });

    it('rejects malformed selections and injected snapshot amounts before any write', async () => {
        await expect(calculateViewingQuoteTool('shop', { ...selection, total_amount: 1 }, scope)).rejects.toThrow();
        await expect(updateViewingSelectionTool('shop', { viewing_id: id, interests: [{ ...selection, quote: { total_amount: 1 } }] }, true, 'actor', 'Номин', scope)).rejects.toThrow();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
