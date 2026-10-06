import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/sales/manager-identity', () => ({
    resolveManagerIdentity: async () => ({ isManager: true, managerName: 'Батаа' }),
    resolveActiveManagerName: async (_db: unknown, _shop: string, name: string) => name === 'Сараа'
        ? { ok: true, managerName: 'Сараа' } : { ok: false, status: 400, error: 'Идэвхтэй менежер олдсонгүй' },
}));
vi.mock('@/lib/sales/project-scope', async (original) => ({
    ...(await original<typeof import('@/lib/sales/project-scope')>()),
    assertProjectManager: async () => undefined,
}));

import { parseStaffLeadPatch, updateStaffLead } from '../LeadService';
import { UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
const db = { from } as unknown as SupabaseClient;
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const lead = { id: 'lead-1', project_id: P1, status: 'contacted', sales_manager_name: 'Батаа', lost_reason: null };
const restricted: SalesProjectScope = { projectIds: [P1], managerName: 'Батаа' };

/** Нэг DB дуудлагад нэг хариу; илүү бичилт тестийг унагаана. */
function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}

beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('staff lead edit rules shared by PATCH /leads/[id] and the AI', () => {
    it.each([
        [{ preferred_rooms: 0 }, 'өрөө'], [{ preferred_rooms: 2.5 }, 'өрөө'], [{ preferred_rooms: 21 }, 'өрөө'],
        [{ preferred_type: 'villa' }, 'төрөл'], [{ budget_max: -1 }, 'төсөв'], [{ project_id: 'abc' }, 'төсөл'],
        [{ status: 'won' }, 'төлөв'], [{ next_followup_at: 'маргааш' }, 'огноо'],
    ])('rejects %j before any read', async (body, word) => {
        const result = await updateStaffLead(db, 'shop-1', 'lead-1', body, { userId: 'user-1', scope: UNRESTRICTED_SALES_SCOPE });
        expect(result).toMatchObject({ ok: false, status: 400, error: expect.stringContaining(word) });
        expect(from).not.toHaveBeenCalled();
    });

    it('normalizes interest fields and clears empty values', () => {
        expect(parseStaffLeadPatch({ preferred_rooms: '3', preferred_type: 'apartment', budget_max: '300000000' }))
            .toMatchObject({ ok: true, updates: { preferred_rooms: 3, preferred_type: 'apartment', budget_max: 300000000 } });
        expect(parseStaffLeadPatch({ preferred_rooms: null, budget_max: null }))
            .toMatchObject({ ok: true, updates: { preferred_rooms: null, budget_max: null } });
    });

    it('updates interest fields inside the manager scope with the project guard and no history entry', async () => {
        const read = query('leads', lead);
        const write = query('leads', { id: lead.id });
        const result = await updateStaffLead(db, 'shop-1', lead.id, { preferred_rooms: 3, budget_max: 300000000 }, { userId: 'user-1', scope: restricted });
        expect(result).toEqual({ ok: true });
        for (const request of [read, write]) {
            expect(request.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
            expect(request.in).toHaveBeenCalledWith('project_id', [P1]);
            expect(request.eq).toHaveBeenCalledWith('sales_manager_name', 'Батаа');
        }
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ preferred_rooms: 3, budget_max: 300000000 }));
        expect(write.eq).toHaveBeenCalledWith('project_id', P1);
        expect(from).toHaveBeenCalledTimes(2);
    });

    it('keeps restricted managers inside their projects and assignments', async () => {
        expect(await updateStaffLead(db, 'shop-1', lead.id, { project_id: P2 }, { userId: 'user-1', scope: restricted }))
            .toMatchObject({ ok: false, status: 403 });
        query('leads', lead);
        expect(await updateStaffLead(db, 'shop-1', lead.id, { sales_manager_name: 'Сараа' }, { userId: 'user-1', scope: restricted }))
            .toMatchObject({ ok: false, status: 403, error: expect.stringContaining('менежерт') });
    });

    it('reports a hidden lead as not found and a moved lead as a conflict', async () => {
        query('leads', null, { code: 'PGRST116', message: 'no rows' });
        expect(await updateStaffLead(db, 'shop-1', 'other', { preferred_rooms: 2 }, { userId: 'user-1', scope: restricted }))
            .toMatchObject({ ok: false, status: 404 });
        query('leads', lead);
        query('leads', null);
        expect(await updateStaffLead(db, 'shop-1', lead.id, { preferred_rooms: 2 }, { userId: 'user-1', scope: UNRESTRICTED_SALES_SCOPE }))
            .toMatchObject({ ok: false, status: 409 });
    });

    it('requires a real contract for closed_won and a reason for closed_lost', async () => {
        query('leads', lead);
        query('property_contracts', [{ contract_number: null, total_price: 0, contract_status: 'active' }]);
        expect(await updateStaffLead(db, 'shop-1', lead.id, { status: 'closed_won' }, { userId: 'user-1', scope: UNRESTRICTED_SALES_SCOPE }))
            .toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Гэрээгүй') });
        query('leads', lead);
        expect(await updateStaffLead(db, 'shop-1', lead.id, { status: 'closed_lost' }, { userId: 'user-1', scope: UNRESTRICTED_SALES_SCOPE }))
            .toMatchObject({ ok: false, status: 400, error: expect.stringContaining('шалтгаан') });
    });

    it('records status changes in the lead history with the acting manager', async () => {
        query('leads', lead);
        const write = query('leads', { id: lead.id });
        const history = query('lead_activities', { id: 'activity-1' });
        const result = await updateStaffLead(db, 'shop-1', lead.id, { status: 'offered' }, { userId: 'user-1', scope: UNRESTRICTED_SALES_SCOPE });
        expect(result).toEqual({ ok: true });
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'offered', lost_reason: null }));
        expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({
            shop_id: 'shop-1', lead_id: lead.id, type: 'status', created_by: 'user-1', created_by_name: 'Батаа',
            meta: { from: 'contacted', to: 'offered', lost_reason: null },
        }));
    });
});
