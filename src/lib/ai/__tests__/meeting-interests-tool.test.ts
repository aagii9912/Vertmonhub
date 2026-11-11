import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, type MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { getMeetingInterestsTool } from '../data-assistant/actions2';

const interest = (block: string, model: string, payment_condition: string) => ({ block, model, area_sqm: 58, floor: 3, payment_condition });
const viewing = (id: string, scheduled_at: string, manager: string, interests: unknown[], extra: Record<string, unknown> = {}) => ({
    id, shop_id: 'shop', scheduled_at, status: 'completed', meeting_type: 'new_customer', sales_manager_name: manager, deleted_at: null, interests,
    leads: { project_id: 'project', sales_manager_name: manager }, ...extra,
});

beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-11T04:00:00Z'), toFake: ['Date'] });
    state.db = createMemoryDb({
        property_viewings: [
            viewing('first', '2026-09-20T03:00:00Z', 'Хонгорзул.Мөнхгэрэл', []),
            // УБ 10-р сарын 1, 00:30 — UTC-ээр 9-р сарын 30.
            viewing('oct-1', '2026-09-30T16:30:00Z', 'Хонгорзул.Мөнхгэрэл', [interest('Б2', 'A', '30%')]),
            viewing('oct-2', '2026-10-15T05:00:00Z', 'Чанцалдулам.Раднаа', [interest('Б2', 'A', '10-30%')]),
            viewing('oct-3', '2026-10-31T15:00:00Z', 'Чанцалдулам.Раднаа', [interest('Б1', 'E7', '30%')]),
            viewing('deleted', '2026-10-16T05:00:00Z', 'Чанцалдулам.Раднаа', [interest('Б1', 'E7', '50%')], { deleted_at: '2026-10-17T00:00:00Z' }),
            viewing('cancelled', '2026-10-17T05:00:00Z', 'Чанцалдулам.Раднаа', [interest('Б1', 'E7', '50%')], { status: 'cancelled' }),
            // УБ 11-р сарын 1.
            viewing('nov', '2026-10-31T16:30:00Z', 'Чанцалдулам.Раднаа', [interest('Б1', 'E7', '50%')]),
            viewing('other-shop', '2026-10-15T05:00:00Z', 'Хонгорзул.Мөнхгэрэл', [interest('Б1', 'E7', '50%')], { shop_id: 'other' }),
        ],
        property_units: [{ shop_id: 'shop', category: 'residential', block: 'Б2', model: 'A', rooms: 2 }],
    });
});

describe('get_meeting_interests AI tool', () => {
    it('summarises a month by Ulaanbaatar days for the whole project', async () => {
        const result = await getMeetingInterestsTool('shop', { from: '2026-10-01', to: '2026-10-31' }) as Record<string, any>;
        expect(result).toMatchObject({ meetings: 3, withInterest: 3, coverage: 'full', status: 'completed', personal: false });
        expect(result.byPaymentCondition).toEqual([{ label: '30%', meetings: 2, sharePct: 66.7 }, { label: '10-30%', meetings: 1, sharePct: 33.3 }]);
        expect(result.byModel.map((row: { label: string; meetings: number }) => [row.label, row.meetings])).toEqual([['Б2 A · 58 м² · 2 өрөө', 2], ['Б1 E7 · 58 м²', 1]]);
    });

    it('keeps a restricted manager to their own meetings', async () => {
        const scope = { projectIds: ['project'], managerName: 'Хонгорзул.Мөнхгэрэл' };
        const result = await getMeetingInterestsTool('shop', { from: '2026-10-01', to: '2026-10-31' }, scope) as Record<string, any>;
        expect(result).toMatchObject({ meetings: 1, personal: true });
        expect(result.byPaymentCondition).toEqual([{ label: '30%', meetings: 1, sharePct: 100 }]);
        expect(await getMeetingInterestsTool('shop', {}, { projectIds: [], managerName: 'X' })).toHaveProperty('error');
    });

    it('defaults to this month, filters by status and manager, and validates dates', async () => {
        const month = await getMeetingInterestsTool('shop', {}) as Record<string, any>;
        expect(month.range).toEqual({ from: '2026-11-01', to: '2026-11-11' });
        expect(month.meetings).toBe(1);
        expect((await getMeetingInterestsTool('shop', { from: '2026-10-01', to: '2026-10-31', status: 'cancelled' }) as Record<string, any>).meetings).toBe(1);
        expect((await getMeetingInterestsTool('shop', { from: '2026-10-01', to: '2026-10-31', manager: 'чанцалдулам' }) as Record<string, any>).meetings).toBe(2);
        expect(await getMeetingInterestsTool('shop', { from: '2026-10-31', to: '2026-10-01' })).toHaveProperty('error');
        expect(await getMeetingInterestsTool('shop', { from: '10/01/2026' })).toHaveProperty('error');
        expect(await getMeetingInterestsTool('shop', { from: '2025-01-01', to: '2026-10-31' })).toHaveProperty('error');
    });
});
