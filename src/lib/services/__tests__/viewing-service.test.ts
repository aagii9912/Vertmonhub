import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createViewing, resolveViewingInput, updateViewing } from '../ViewingService';
import { logLeadActivity } from '@/lib/leads/activities';

vi.mock('@/lib/leads/activities', () => ({ logLeadActivity: vi.fn() }));
const leadId = '00000000-0000-4000-8000-000000000001';
const propertyId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const scheduledAt = '2026-09-20T10:00:00+08:00';
const actor = { userId: 'user', managerName: 'Менежер' };
type Result = { data: unknown; error: null | { message: string; code?: string } };

function fakeDb(responses: Record<string, Result[]>, rpcResponse: Result = { data: null, error: null }) {
    const queries: { table: string; filters: unknown[][]; updates?: Record<string, unknown>; insert?: Record<string, unknown> }[] = [];
    const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const db = { rpc: async (name: string, params: Record<string, unknown>) => { rpcCalls.push({ name, params }); return rpcResponse; }, from(table: string) {
        const query: typeof queries[number] = { table, filters: [] };
        queries.push(query);
        const result = () => responses[table]?.shift() ?? { data: null, error: null };
        const chain: Record<string, any> = {
            select: () => chain, limit: () => chain,
            in: (...args: unknown[]) => { query.filters.push(args); return chain; },
            eq: (...args: unknown[]) => { query.filters.push(args); return chain; },
            is: (...args: unknown[]) => { query.filters.push(args); return chain; },
            ilike: (...args: unknown[]) => { query.filters.push(args); return chain; },
            insert: (data: Record<string, unknown>) => { query.insert = data; return chain; },
            update: (data: Record<string, unknown>) => { query.updates = data; return chain; },
            single: async () => result(), maybeSingle: async () => result(),
            then: (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return chain;
    } } as unknown as SupabaseClient;
    return { db, queries, rpcCalls };
}
const ok = (data: unknown): Result => ({ data, error: null });

beforeEach(() => { vi.mocked(logLeadActivity).mockReset().mockResolvedValue({ id: 'activity' } as never); });

describe('shared viewing creation', () => {
    it('preflight has no writes and requires a valid zoned schedule', async () => {
        const { db, queries } = fakeDb({});
        expect((await resolveViewingInput(db, 'shop', { scheduled_at: 'bad' })).ok).toBe(false);
        expect((await resolveViewingInput(db, 'shop', {})).ok).toBe(false);
        expect((await resolveViewingInput(db, 'shop', { scheduled_at: scheduledAt })).ok).toBe(false);
        expect(queries).toEqual([]);
    });

    it('validates property belongs to shop before any write', async () => {
        const { db, queries } = fakeDb({ properties: [ok(null)] });
        expect(await createViewing(db, 'shop', { project_id: projectId, customer_name: 'Бат', property_id: propertyId, scheduled_at: scheduledAt }, actor)).toMatchObject({ ok: false, status: 404 });
        expect(queries[0].filters).toContainEqual(['shop_id', 'shop']);
        expect(queries.some(q => q.insert)).toBe(false);
    });

    it('does not silently choose the first namesake', async () => {
        const { db, queries } = fakeDb({ leads: [ok([{ id: leadId }, { id: 'other' }])] });
        expect(await createViewing(db, 'shop', { project_id: projectId, customer_name: 'Бат', scheduled_at: scheduledAt }, actor)).toMatchObject({ ok: false, status: 409 });
        expect(queries[0].filters).toContainEqual(['project_id', projectId]);
        expect(queries.some(q => q.insert)).toBe(false);
    });

    it('resolves a phone-only request by exact normalized number', async () => {
        const { db, queries } = fakeDb({ projects: [ok({ id: projectId })], leads: [ok([{ id: leadId, project_id: projectId, status: 'new', customer_phone: '+976 9911 2233' }])] });
        expect(await resolveViewingInput(db, 'shop', { project_id: projectId, customer_phone: '99112233', scheduled_at: scheduledAt })).toMatchObject({ ok: true, data: { lead: { id: leadId } } });
        expect(queries.find(query => query.table === 'projects')?.filters).toContainEqual(['shop_id', 'shop']);
    });

    it('does not attach a digit-subsequence match to another person', async () => {
        const { db, queries } = fakeDb({ projects: [ok({ id: projectId })], leads: [ok([{ id: leadId, project_id: projectId, status: 'new', customer_phone: '+976 9911 2233' }])] });
        expect(await createViewing(db, 'shop', { project_id: projectId, customer_phone: '76911223', scheduled_at: scheduledAt }, actor)).toMatchObject({ ok: false, status: 400 });
        expect(queries[0].table).toBe('leads');
        expect(queries.some(q => q.insert)).toBe(false);
    });

    it('supports no property, and synchronizes lead status, scheduled time and timeline', async () => {
        const { db, queries } = fakeDb({ leads: [ok({ id: leadId, status: 'new' }), ok({ id: leadId })],
            property_viewings: [ok({ id: 'viewing', status: 'scheduled', scheduled_at: scheduledAt })] });
        const result = await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, actor);
        expect(result).toMatchObject({ ok: true, data: { lead_id: leadId }, warning: undefined });
        expect(queries.find(q => q.table === 'property_viewings')?.insert).toMatchObject({ property_id: null, lead_id: leadId, sales_manager_name: actor.managerName });
        expect(queries.find(q => q.updates)?.updates).toMatchObject({ status: 'viewing_scheduled', viewing_scheduled_at: scheduledAt });
        expect(queries.find(q => q.updates)?.filters).toContainEqual(['status', 'new']);
        expect(logLeadActivity).toHaveBeenCalledWith(db, expect.objectContaining({ shopId: 'shop', leadId, createdBy: 'user', type: 'meeting' }));
    });

    it('does not reopen a closed lead', async () => {
        const { db, queries } = fakeDb({ leads: [ok({ id: leadId, status: 'closed_won' }), ok({ id: leadId })],
            property_viewings: [ok({ id: 'viewing', status: 'scheduled', scheduled_at: scheduledAt })] });
        await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, actor);
        expect(queries.find(q => q.updates)?.updates).not.toHaveProperty('status');
    });

    it('walk-in marks a new lead contacted and records completion', async () => {
        const { db, queries } = fakeDb({ leads: [ok({ id: leadId, status: 'new' }), ok({ id: leadId })],
            property_viewings: [ok({ id: 'viewing', status: 'completed', scheduled_at: scheduledAt })] });
        await createViewing(db, 'shop', { lead_id: leadId, walk_in: true, feedback: 'Сонирхож байна' }, actor);
        expect(queries.find(q => q.updates)?.updates).toMatchObject({ status: 'contacted', last_contact_at: expect.any(String) });
        expect(queries.find(q => q.insert)?.insert).toMatchObject({ status: 'completed', completed_at: expect.any(String), customer_feedback: 'Сонирхож байна' });
    });

    it('retains persisted viewing ID and warns when lead synchronization fails', async () => {
        const { db } = fakeDb({ leads: [ok({ id: leadId, status: 'new' }), { data: null, error: { message: 'write failed' } }],
            property_viewings: [ok({ id: 'viewing', status: 'scheduled', scheduled_at: scheduledAt })] });
        expect(await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, actor)).toMatchObject({ ok: true, data: { viewing: { id: 'viewing' } }, warning: expect.any(String) });
    });

    it('does not overwrite a concurrent lead status change', async () => {
        const { db, queries } = fakeDb({ leads: [ok({ id: leadId, status: 'new' }), ok(null)],
            property_viewings: [ok({ id: 'viewing', status: 'scheduled', scheduled_at: scheduledAt })] });
        expect(await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, actor)).toMatchObject({ ok: true, warning: expect.any(String) });
        expect(queries.find(q => q.updates)?.filters).toContainEqual(['status', 'new']);
    });

    it('creates a restricted existing-lead viewing through the atomic RPC with canonical actor scope', async () => {
        const scope = { projectIds: [projectId], managerName: 'Канон' };
        const viewing = { id: 'viewing', status: 'scheduled', scheduled_at: scheduledAt };
        const { db, queries, rpcCalls } = fakeDb({
            leads: [ok({ id: leadId, project_id: projectId, status: 'new', sales_manager_name: 'Канон' })],
            projects: [ok({ id: projectId })],
        }, ok(viewing));
        expect(await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, { ...actor, scope }))
            .toMatchObject({ ok: true, data: { viewing, lead_id: leadId } });
        expect(rpcCalls).toMatchObject([{
            name: 'create_scoped_sales_viewing', params: {
                p_shop_id: 'shop', p_lead_id: leadId, p_user_id: 'user', p_manager_name: 'Канон', p_project_ids: [projectId],
            },
        }]);
        expect(queries.some(query => query.insert || query.updates)).toBe(false);
        expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('does not fall back to viewing table inserts when the creation RPC is missing', async () => {
        const scope = { projectIds: [projectId], managerName: 'Менежер' };
        const { db, queries } = fakeDb({
            leads: [ok({ id: leadId, project_id: projectId, status: 'new', sales_manager_name: 'Менежер' })],
            projects: [ok({ id: projectId })],
        }, { data: null, error: { code: 'PGRST202', message: 'RPC missing' } });
        expect(await createViewing(db, 'shop', { lead_id: leadId, scheduled_at: scheduledAt }, { ...actor, scope }))
            .toMatchObject({ ok: false, status: 503, partialSuccess: false });
        expect(queries.some(query => query.insert || query.updates)).toBe(false);
        expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('reports the saved new lead when current ownership prevents its subsequent viewing creation', async () => {
        const scope = { projectIds: [projectId], managerName: 'Канон' };
        const { db, queries } = fakeDb({
            leads: [ok([]), ok({ id: leadId, project_id: projectId, status: 'new', sales_manager_name: 'Канон' })],
            projects: [ok({ id: projectId })],
            sales_managers: [ok({ name: 'Канон' })], sales_manager_projects: [ok({ project_id: projectId })],
        }, { data: null, error: { code: 'P0002', message: 'Current actor revoked' } });
        expect(await createViewing(db, 'shop', { project_id: projectId, customer_name: 'Бат', scheduled_at: scheduledAt }, { ...actor, scope }))
            .toMatchObject({ ok: false, status: 404, partialSuccess: true, leadId });
        expect(queries.find(query => query.table === 'leads' && query.insert)?.insert).toMatchObject({ sales_manager_name: 'Канон' });
        expect(queries.some(query => query.table === 'property_viewings')).toBe(false);
        expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('rejects an empty manager scope or missing actor before new-lead lookup or insertion', async () => {
        const { db, queries, rpcCalls } = fakeDb({});
        const input = { project_id: projectId, customer_name: 'Бат', scheduled_at: scheduledAt };
        expect(await createViewing(db, 'shop', input, { ...actor, scope: { projectIds: [], managerName: null } })).toMatchObject({ ok: false, status: 403 });
        expect(await createViewing(db, 'shop', input, { userId: null, managerName: 'Менежер', scope: { projectIds: [projectId], managerName: 'Менежер' } })).toMatchObject({ ok: false, status: 401 });
        expect(queries).toEqual([]); expect(rpcCalls).toEqual([]);
    });
});


describe('viewing update integrity', () => {
    const viewing = { id: 'viewing', status: 'completed', scheduled_at: scheduledAt, lead_id: leadId, property_id: null };

    it('scopes all related lead reads and writes and preserves a closed lead', async () => {
        const { db, queries } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok({ status: 'closed_won' }), ok({ id: leadId })] });
        const result = await updateViewing(db, 'shop', 'viewing', { status: 'cancelled' }, actor);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.warning).toBeUndefined();
        for (const query of queries.filter(q => q.table === 'leads')) {
            expect(query.filters).toContainEqual(['shop_id', 'shop']);
            expect(query.filters).toContainEqual(['deleted_at', null]);
            if (query.updates) expect(query.updates).not.toHaveProperty('status');
        }
    });

    it('guards the previous status so concurrent closing cannot be overwritten', async () => {
        const { db, queries } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok({ status: 'viewing_scheduled' }), ok(null)] });
        expect(await updateViewing(db, 'shop', 'viewing', { status: 'cancelled' }, actor)).toMatchObject({ ok: true, warning: expect.any(String) });
        const transition = queries.find(q => q.table === 'leads' && q.updates);
        expect(transition?.updates).toMatchObject({ status: 'contacted' });
        expect(transition?.filters).toContainEqual(['status', 'viewing_scheduled']);
    });

    it('keeps the saved viewing and warns when linked lead changes fail', async () => {
        const { db } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok({ status: 'viewing_scheduled' }), { data: null, error: { message: 'failed' } }] });
        expect(await updateViewing(db, 'shop', 'viewing', { status: 'completed' }, actor)).toMatchObject({ ok: true, data: { id: 'viewing' }, warning: expect.any(String) });
    });

    it('keeps the saved viewing and warns when its activity cannot be logged', async () => {
        vi.mocked(logLeadActivity).mockResolvedValue(null);
        const { db } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok({ status: 'viewing_scheduled' }), ok({ id: leadId })] });
        expect(await updateViewing(db, 'shop', 'viewing', { status: 'completed' }, actor)).toMatchObject({ ok: true, warning: expect.any(String) });
    });

    it('does not write or log an inaccessible/deleted linked lead', async () => {
        const { db, queries } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok(null)] });
        expect(await updateViewing(db, 'shop', 'viewing', { status: 'completed' }, actor)).toMatchObject({ ok: true, warning: expect.any(String) });
        expect(queries.filter(q => q.table === 'leads' && q.updates)).toEqual([]);
        expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('does not claim success when a follow-up-only update saves nothing', async () => {
        const { db, queries } = fakeDb({ property_viewings: [ok(viewing)], leads: [ok({ status: 'viewing_scheduled' }), ok(null)] });
        expect(await updateViewing(db, 'shop', 'viewing', { next_followup_at: scheduledAt }, actor)).toMatchObject({ ok: false, status: 500 });
        expect(queries[0].filters).toContainEqual(['deleted_at', null]);
        expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('uses the atomic RPC for restricted actors and never falls back to an unguarded table mutation', async () => {
        const rpc = vi.fn(async () => ({ data: viewing, error: null }));
        const from = vi.fn();
        const db = { rpc, from } as unknown as SupabaseClient;
        const scope = { projectIds: [projectId], managerName: 'Канон менежер' };
        expect(await updateViewing(db, 'shop', 'viewing', { status: 'completed' }, { ...actor, scope })).toMatchObject({ ok: true, data: viewing });
        expect(rpc).toHaveBeenCalledWith('update_scoped_sales_viewing', {
            p_shop_id: 'shop', p_viewing_id: 'viewing', p_user_id: 'user',
            p_manager_name: 'Канон менежер', p_project_ids: [projectId], p_patch: { status: 'completed' },
        });
        expect(from).not.toHaveBeenCalled(); expect(logLeadActivity).not.toHaveBeenCalled();
    });

    it('returns no mutation success or history after the lead changes owner or the RPC is unavailable', async () => {
        const rpc = vi.fn(async () => ({ data: null, error: { code: 'P0002', message: 'Owner changed' } }));
        const from = vi.fn();
        const db = { rpc, from } as unknown as SupabaseClient;
        const scope = { projectIds: [projectId], managerName: 'Менежер' };
        const patch = { deleted_at: '2026-10-01T00:00:00Z', status: 'cancelled' as const };
        expect(await updateViewing(db, 'shop', 'viewing', patch, { ...actor, scope })).toMatchObject({ ok: false, status: 404 });
        rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'RPC missing' } });
        expect(await updateViewing(db, 'shop', 'viewing', patch, { ...actor, scope })).toMatchObject({ ok: false, status: 503 });
        expect(from).not.toHaveBeenCalled(); expect(logLeadActivity).not.toHaveBeenCalled();
    });
});
