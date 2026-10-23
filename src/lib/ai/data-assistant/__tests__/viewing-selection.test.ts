import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ options: vi.fn(), conditions: vi.fn(), quote: vi.fn(), prepare: vi.fn(), update: vi.fn(), selects: [] as string[],
    referrals: [] as Array<{ id: string; name: string; sort_order: number; archived_at: string | null }>, viewingReferral: null as string | null }));
const selection = { block: 'Б1', model: 'E6', area_sqm: 51.72, floor: 5, payment_condition: '30%' };
const id = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const scope = { projectIds: [projectId], managerName: 'Номин' };
const q = { select: (columns: string) => { mocks.selects.push(columns); return q; }, eq: () => q, is: () => q, in: () => q,
    maybeSingle: async () => ({ data: { id, interests: [], agent_notes: null, referral_source_id: mocks.viewingReferral, leads: { project_id: projectId } }, error: null }) };
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => q }) }));
vi.mock('@/lib/sales/referral-sources-store', async (original) => {
    const actual = await original<typeof import('@/lib/sales/referral-sources-store')>();
    const sources = (options: { includeArchived?: boolean } = {}) => mocks.referrals.filter(item => options.includeArchived || !item.archived_at);
    const db = { from: () => {
        const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mocks.referrals, error: null }).then(resolve) };
        return chain;
    } };
    return {
        ...actual,
        listReferralSources: async (_db: unknown, _shop: string, options?: { includeArchived?: boolean }) => sources(options),
        resolveReferralSource: (_db: unknown, shopId: string, input: Parameters<typeof actual.resolveReferralSource>[2], options: Parameters<typeof actual.resolveReferralSource>[3]) =>
            actual.resolveReferralSource(db as never, shopId, input, options),
    };
});
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
    mocks.selects = [];
    mocks.referrals = [];
    mocks.viewingReferral = null;
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
            preview: { 'Өмнөх байр': 'Сонгоогүй', 'Шинэ тэмдэглэл': 'Ойролцоо амьдардаг', Тооцоолол: ['Баталсан үнийн тохиргоо байхгүй'] } });
        // «Сэжим» засахгүй бол migration-ий өмнө байхгүй баганыг уншихгүй.
        expect(mocks.selects.every(columns => !columns.includes('referral_source_id'))).toBe(true);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(await updateViewingSelectionTool('shop', args, true, 'actor', 'Номин', scope)).toMatchObject({ success: true });
        expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'shop', id, { interests: [selection], agent_notes: 'Ойролцоо амьдардаг' }, { userId: 'actor', managerName: 'Номин', scope });
        expect(canRememberTool('update_viewing')).toBe(false);
    });

    it('lists active referral names with the options and resolves a referral name to its id only after confirmation', async () => {
        const facebook = '40000000-0000-4000-8000-000000000001', neighbour = '40000000-0000-4000-8000-000000000002', barmash = '40000000-0000-4000-8000-000000000003';
        mocks.referrals = [
            { id: facebook, name: 'Facebook', sort_order: 10, archived_at: null },
            { id: neighbour, name: 'Ойрхон амьдардаг', sort_order: 20, archived_at: null },
            { id: barmash, name: 'Бармаш түрээслэгч', sort_order: 30, archived_at: '2026-10-20T00:00:00Z' },
        ];
        expect(await getViewingOptionsTool('shop', {}, scope)).toMatchObject({ referral_sources: ['Facebook', 'Ойрхон амьдардаг'] });

        mocks.viewingReferral = facebook;
        const args = { viewing_id: id, referral_source: 'ойрхон  амьдардаг' };
        expect(await updateViewingSelectionTool('shop', args, false, 'actor', 'Номин', scope)).toMatchObject({ requiresConfirmation: true,
            action: { tool: 'update_viewing', args }, preview: { 'Өмнөх Сэжим (хаанаас ирсэн)': 'Facebook', 'Шинэ Сэжим (хаанаас ирсэн)': 'Ойрхон амьдардаг' } });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(await updateViewingSelectionTool('shop', args, true, 'actor', 'Номин', scope)).toMatchObject({ success: true });
        expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'shop', id, { referral_source_id: neighbour }, { userId: 'actor', managerName: 'Номин', scope });

        // Архивласан эсвэл зохиосон нэр — боломжтой нэрсийг жагсааж татгалзана; null = цэвэрлэх.
        mocks.update.mockClear();
        expect(await updateViewingSelectionTool('shop', { viewing_id: id, referral_source: 'Бармаш түрээслэгч' }, true, 'actor', 'Номин', scope))
            .toMatchObject({ error: expect.stringContaining('Боломжтой: Facebook, Ойрхон амьдардаг') });
        expect(await updateViewingSelectionTool('shop', { viewing_id: id, referral_source: 'Сошиал' }, true, 'actor', 'Номин', scope))
            .toMatchObject({ error: expect.stringContaining('олдсонгүй') });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(await updateViewingSelectionTool('shop', { viewing_id: id, referral_source: null }, true, 'actor', 'Номин', scope)).toMatchObject({ success: true });
        expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'shop', id, { referral_source_id: null }, expect.anything());
    });

    it('rejects malformed selections and injected snapshot amounts before any write', async () => {
        await expect(calculateViewingQuoteTool('shop', { ...selection, total_amount: 1 }, scope)).rejects.toThrow();
        await expect(updateViewingSelectionTool('shop', { viewing_id: id, interests: [{ ...selection, quote: { total_amount: 1 } }] }, true, 'actor', 'Номин', scope)).rejects.toThrow();
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
