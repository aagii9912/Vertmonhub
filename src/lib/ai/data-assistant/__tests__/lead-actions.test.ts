import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignLeadManager, findLead, logCall, setFollowup } from '../actions';
import { recordLeadContact } from '@/lib/leads/activities';
import { resolveActiveManagerName } from '@/lib/sales/manager-identity';
import type { SupabaseClient } from '@supabase/supabase-js';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));

const db = { from } as unknown as SupabaseClient;
const lead = { id: 'lead-1', customer_name: 'Болд', customer_phone: '99112233', status: 'new', sales_manager_name: null };
const activity = { id: 'activity-1', lead_id: lead.id, type: 'call', content: 'Ярьсан', meta: {}, created_by_name: 'Батаа', created_at: '2026-09-13T02:00:00Z' };

/** One response per DB query; unexpected extra writes fail instead of passing silently. */
function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => {
        expect(name).toBe(table);
        return chain;
    });
    return chain;
}

beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('lead contact persistence shared by AI and API', () => {
    it('records a call and follow-up only after the scoped lead update succeeds', async () => {
        query('leads', [lead]);
        const read = query('leads', { id: lead.id });
        const update = query('leads', { id: lead.id });
        const insert = query('lead_activities', activity);

        const result = await logCall('shop-1', { lead_id: lead.id, summary: 'Маргааш уулзана', next_followup_at: '2026-09-14T10:00:00+08:00' }, 'user-1', 'Батаа');

        expect(result).toMatchObject({ success: true, leadId: lead.id });
        expect(result).toHaveProperty('message', expect.stringContaining('2026-09-14 10:00'));
        for (const request of [read, update]) {
            expect(request.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
            expect(request.eq).toHaveBeenCalledWith('id', lead.id);
            expect(request.is).toHaveBeenCalledWith('deleted_at', null);
        }
        expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ next_followup_at: '2026-09-14T02:00:00.000Z', last_contact_at: expect.any(String) }));
        expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1', lead_id: lead.id, content: 'Маргааш уулзана', created_by: 'user-1', meta: { next_followup_at: '2026-09-14T02:00:00.000Z' } }));
    });

    it.each([
        ['database failure', { message: 'write rejected' }],
        ['lead removed between lookup and update', null],
    ])('does not report success or insert a call after %s', async (_label, error) => {
        query('leads', [lead]);
        query('leads', { id: lead.id });
        query('leads', null, error);
        const result = await logCall('shop-1', { lead_id: lead.id, summary: 'Ярьсан' }, 'user-1', 'Батаа');
        expect(result).toHaveProperty('error');
        expect(result).not.toHaveProperty('success');
        expect(from).toHaveBeenCalledTimes(3);
    });

    it('reports a partial save when the lead changed but the call history failed', async () => {
        query('leads', [lead]);
        query('leads', { id: lead.id });
        query('leads', { id: lead.id });
        query('lead_activities', null, { message: 'missing table' });
        const result = await logCall('shop-1', { lead_id: lead.id, summary: 'Ярьсан' }, 'user-1', 'Батаа');
        expect(result).toMatchObject({ partialSuccess: true, error: expect.stringContaining('түүх хадгалагдсангүй') });
        expect(result).not.toHaveProperty('success');
    });

    it('rejects another tenant or deleted lead before any contact mutation', async () => {
        const read = query('leads', null);
        const result = await recordLeadContact(db, { shopId: 'shop-1', leadId: 'foreign-lead', type: 'note', content: 'Тэмдэглэл' });
        expect(result).toMatchObject({ ok: false, status: 404 });
        expect(read.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(read.is).toHaveBeenCalledWith('deleted_at', null);
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('reports a failed note without claiming a partial save', async () => {
        query('leads', { id: lead.id });
        query('lead_activities', null, { message: 'permission denied' });
        const result = await recordLeadContact(db, { shopId: 'shop-1', leadId: lead.id, type: 'note', content: 'Тэмдэглэл' });
        expect(result).toMatchObject({ ok: false, status: 500, partialSuccess: false });
    });

    it.each(['tomorrow', '2026-09-14', '2026-09-14T10:00:00'])('rejects invalid or timezone-free follow-up %s without writing', async (next) => {
        expect(await logCall('shop-1', { lead_id: lead.id, summary: 'Ярьсан', next_followup_at: next }, 'user-1', '')).toHaveProperty('error');
        expect(await setFollowup('shop-1', { lead_id: lead.id, next_followup_at: next }, 'user-1', '')).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
    });
});

describe('follow-up actions', () => {
    it.each(['2026-09-14T10:00:00+08:00', null])('persists follow-up %s with a timeline even without a note', async (next) => {
        query('leads', [lead]);
        query('leads', { id: lead.id });
        const update = query('leads', { id: lead.id });
        const insert = query('lead_activities', { ...activity, type: 'note' });
        const result = await setFollowup('shop-1', { lead_id: lead.id, next_followup_at: next }, 'user-1', 'Батаа');
        expect(result).toMatchObject({ success: true });
        expect(update.update).toHaveBeenCalledWith({ updated_at: expect.any(String), next_followup_at: next === null ? null : '2026-09-14T02:00:00.000Z' });
        expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'note', content: expect.any(String) }));
    });

    it('does not claim the follow-up changed when its database write fails', async () => {
        query('leads', [lead]);
        query('leads', { id: lead.id });
        query('leads', null, { message: 'offline' });
        const result = await setFollowup('shop-1', { lead_id: lead.id, next_followup_at: null, note: 'Цуцлах' }, 'user-1', 'Батаа');
        expect(result).toHaveProperty('error');
        expect(result).not.toHaveProperty('success');
        expect(from).toHaveBeenCalledTimes(3);
    });
});

describe('manager assignment', () => {
    it('previews the canonical active roster name without mutation', async () => {
        query('leads', [lead]);
        const roster = query('sales_managers', { name: 'Батаа' });
        const result = await assignLeadManager('shop-1', { lead_id: lead.id, manager_name: ' Батаа ' }, false, 'user-1', 'Сараа');
        expect(result).toMatchObject({ requiresConfirmation: true, action: { args: { manager_name: 'Батаа' } } });
        expect(roster.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(roster.eq).toHaveBeenCalledWith('is_active', true);
        expect(roster.eq).toHaveBeenCalledWith('name', 'Батаа');
        expect(from).toHaveBeenCalledTimes(2);
    });

    it.each([null, { message: 'roster unavailable' }])('fails closed when the active roster cannot be verified (%j)', async (error) => {
        query('leads', [lead]);
        query('sales_managers', null, error);
        const result = await assignLeadManager('shop-1', { lead_id: lead.id, manager_name: 'Батаа' }, true, 'user-1', 'Сараа');
        expect(result).toHaveProperty('error');
        expect(result).not.toHaveProperty('success');
        expect(from).toHaveBeenCalledTimes(2);
    });

    it('updates only the current tenant active lead, then records the change', async () => {
        query('leads', [lead]);
        query('sales_managers', { name: 'Батаа' });
        const update = query('leads', { id: lead.id });
        const insert = query('lead_activities', { ...activity, type: 'manager' });
        expect(await assignLeadManager('shop-1', { lead_id: lead.id, manager_name: 'Батаа' }, true, 'user-1', 'Сараа')).toMatchObject({ success: true });
        expect(update.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(update.is).toHaveBeenCalledWith('deleted_at', null);
        expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ sales_manager_name: 'Батаа' }));
        expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'manager', meta: { from: null, to: 'Батаа' } }));
    });

    it.each([null, { message: 'update failed' }])('does not log or claim assignment for a missing/failed update (%j)', async (error) => {
        query('leads', [lead]);
        query('sales_managers', { name: 'Батаа' });
        query('leads', null, error);
        const result = await assignLeadManager('shop-1', { lead_id: lead.id, manager_name: 'Батаа' }, true, 'user-1', 'Сараа');
        expect(result).toHaveProperty('error');
        expect(result).not.toHaveProperty('success');
        expect(from).toHaveBeenCalledTimes(3);
    });

    it('reports the assigned manager when only the timeline fails', async () => {
        query('leads', [lead]);
        query('sales_managers', { name: 'Батаа' });
        query('leads', { id: lead.id });
        query('lead_activities', null, { message: 'insert failed' });
        const result = await assignLeadManager('shop-1', { lead_id: lead.id, manager_name: 'Батаа' }, true, 'user-1', 'Сараа');
        expect(result).toMatchObject({ partialSuccess: true, error: expect.stringContaining('Батаа-д шилжсэн боловч') });
        expect(result).not.toHaveProperty('success');
    });

    it.each([null, '', '   ', 'x'.repeat(121)])('rejects invalid manager name before any roster query', async (name) => {
        expect(await resolveActiveManagerName(db, 'shop-1', name)).toMatchObject({ ok: false, status: 400 });
        expect(from).not.toHaveBeenCalled();
    });
});

describe('lead lookup for mutations', () => {
    it('distinguishes database failure from no matching lead', async () => {
        query('leads', null, { message: 'offline' });
        expect(await findLead('shop-1', { lead_id: lead.id })).toHaveProperty('error', expect.stringContaining('алдаа'));
    });

    it('does not turn malformed phone input into a match-all search', async () => {
        const read = query('leads', []);
        expect(await findLead('shop-1', { customer_phone: 'abc' })).toHaveProperty('error');
        expect(read.ilike).not.toHaveBeenCalled();
    });

    it('treats wildcard characters in names as literal text', async () => {
        const read = query('leads', []);
        await findLead('shop-1', { customer_name: '%' });
        expect(read.ilike).toHaveBeenCalledWith('customer_name', '%\\%%');
    });
});
