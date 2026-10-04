// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
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

it('sends a quote with its amount and unit through the scoped RPC and fills a default history text', async () => {
    const { db, rpc, from } = database({ data: { ...activity, type: 'quote' }, error: null });
    expect(await recordLeadContact(db, { ...input, type: 'quote', content: '  ', quote: { amount: 450_000_000, unitLabel: ' A-1203 ' } })).toMatchObject({ ok: true });
    expect(rpc.mock.calls[0][1].p_input).toEqual({ type: 'quote', content: 'Үнийн санал: 450,000,000₮ · A-1203', quote: { amount: 450_000_000, unit_label: 'A-1203' } });
    await recordLeadContact(db, { ...input, type: 'quote', content: 'Хөнгөлөлттэй үнэ', quote: { amount: 1, unitLabel: '' } });
    expect(rpc.mock.calls[1][1].p_input).toEqual({ type: 'quote', content: 'Хөнгөлөлттэй үнэ', quote: { amount: 1 } });
    expect(from).not.toHaveBeenCalled();
});

it.each([
    ['missing quote', undefined],
    ['zero amount', { amount: 0 }],
    ['fractional amount', { amount: 12.5 }],
    ['amount over the database limit', { amount: 1e14 }],
    ['long unit', { amount: 10, unitLabel: 'x'.repeat(61) }],
])('rejects a quote with %s before any database call', async (_name, quote) => {
    const { db, rpc, from } = database();
    expect(await recordLeadContact(db, { ...input, type: 'quote', content: '', quote })).toMatchObject({ ok: false, status: 400 });
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
});

describe('unrestricted quotes', () => {
    const calls: Array<[string, string, unknown]> = [];
    const chain = (table: string, data: unknown, error: { message: string } | null = null) => {
        const c: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'is', 'in']) c[method] = vi.fn(() => c);
        c.update = vi.fn((value: unknown) => { calls.push([table, 'update', value]); return c; });
        c.insert = vi.fn((value: unknown) => { calls.push([table, 'insert', value]); return c; });
        c.maybeSingle = vi.fn(async () => ({ data, error }));
        c.single = vi.fn(async () => ({ data, error }));
        return c;
    };
    const quoteInput = {
        shopId: 'shop', leadId: 'lead', type: 'quote' as const, content: '', quote: { amount: 430_000_000 }, userId: 'admin', managerName: 'Админ',
        nextFollowupAt: '2026-10-06T02:00:00.000Z',
    };

    it('writes the quote history first, then marks the lead as contacted', async () => {
        calls.length = 0;
        const tables = [chain('leads', { id: 'lead' }), chain('lead_activities', { ...activity, type: 'quote' }), chain('leads', { id: 'lead' })];
        const db = { from: vi.fn(() => tables.shift()) } as unknown as SupabaseClient;
        expect(await recordLeadContact(db, quoteInput)).toMatchObject({ ok: true });
        expect(calls[0]).toEqual(['lead_activities', 'insert', expect.objectContaining({
            type: 'quote', content: 'Үнийн санал: 430,000,000₮', created_by: 'admin', created_by_name: 'Админ',
            meta: { next_followup_at: '2026-10-06T02:00:00.000Z', amount: 430_000_000 },
        })]);
        expect(calls[1]).toEqual(['leads', 'update', expect.objectContaining({ last_contact_at: expect.any(String), next_followup_at: '2026-10-06T02:00:00.000Z' })]);
    });

    it('changes nothing on the lead when the history row is rejected (migration not applied)', async () => {
        calls.length = 0;
        const tables = [chain('leads', { id: 'lead' }), chain('lead_activities', null, { message: 'violates check constraint "lead_activities_type_check"' })];
        const db = { from: vi.fn(() => tables.shift()) } as unknown as SupabaseClient;
        expect(await recordLeadContact(db, quoteInput)).toEqual({ ok: false, status: 500, error: 'Үнийн санал хадгалагдсангүй. Дахин оролдоно уу.' });
        expect(calls.map(([table, method]) => `${table}.${method}`)).toEqual(['lead_activities.insert']);
    });

    it('reports a saved quote whose lead update failed as a partial save', async () => {
        const tables = [chain('leads', { id: 'lead' }), chain('lead_activities', { ...activity, type: 'quote' }), chain('leads', null, { message: 'timeout' })];
        const db = { from: vi.fn(() => tables.shift()) } as unknown as SupabaseClient;
        expect(await recordLeadContact(db, quoteInput)).toMatchObject({ ok: false, status: 500, partialSuccess: true });
    });
});
