// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { recordLeadContact } from '../activities';

const scope = { projectIds: ['project'], managerName: 'Канон менежер' };
const input = { shopId: 'shop', leadId: 'lead', type: 'call' as const, content: 'Ярьсан', userId: 'user', managerName: 'Profile name', scope };
const activity = { id: 'activity', lead_id: 'lead', type: 'call', content: 'Ярьсан', meta: {}, created_by_name: scope.managerName, created_at: '2026-10-01T00:00:00Z' };

function database(result: { data: unknown; error: { code: string } | null } = { data: activity, error: null }) {
    const rpc = vi.fn(async (_name: string, _params: Record<string, unknown>) => result);
    const from = vi.fn();
    return { db: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

it('uses the current canonical actor scope and atomically records contact through the RPC', async () => {
    const { db, rpc, from } = database();
    expect(await recordLeadContact(db, { ...input, nextFollowupAt: '2026-10-02T00:00:00Z' })).toEqual({ ok: true, activity });
    expect(rpc).toHaveBeenCalledWith('record_scoped_sales_lead_contact', {
        p_shop_id: 'shop', p_lead_id: 'lead', p_user_id: 'user', p_manager_name: scope.managerName, p_project_ids: ['project'],
        p_input: { type: 'call', content: 'Ярьсан', next_followup_at: '2026-10-02T00:00:00Z' },
    });
    expect(from).not.toHaveBeenCalled();
});

it.each([
    ['lead reassigned', { code: 'P0002' }, 404],
    ['RPC missing', { code: 'PGRST202' }, 503],
    ['activity write failed', { code: '23514' }, 503],
] as const)('never falls back to contact or activity table writes after %s', async (_name, error, status) => {
    const { db, from } = database({ data: null, error });
    expect(await recordLeadContact(db, input)).toMatchObject({ ok: false, status });
    expect(from).not.toHaveBeenCalled();
});

it('does not claim success for an empty RPC response', async () => {
    const { db, from } = database({ data: null, error: null });
    expect(await recordLeadContact(db, input)).toMatchObject({ ok: false, status: 503 });
    expect(from).not.toHaveBeenCalled();
});

it('rejects missing canonical identity or empty project access before any database call', async () => {
    const { db, rpc, from } = database();
    for (const changes of [{ userId: null }, { scope: { projectIds: [], managerName: scope.managerName } }, { scope: { projectIds: ['project'], managerName: null } }]) {
        expect(await recordLeadContact(db, { ...input, ...changes })).toMatchObject({ ok: false, status: 404 });
    }
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
});

it('preserves the distinction between omitted and explicitly cleared follow-up dates', async () => {
    const { db, rpc } = database();
    await recordLeadContact(db, input);
    await recordLeadContact(db, { ...input, nextFollowupAt: null });
    expect(rpc.mock.calls[0][1].p_input).not.toHaveProperty('next_followup_at');
    expect(rpc.mock.calls[1][1].p_input).toHaveProperty('next_followup_at', null);
});
