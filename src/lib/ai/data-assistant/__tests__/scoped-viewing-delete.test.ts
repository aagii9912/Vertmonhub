// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    calls: [] as Array<{ name: string; params: Record<string, unknown> }>,
    writes: [] as unknown[],
    error: null as null | { code: string; message: string },
}));
const shop = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const project = '30000000-0000-4000-8000-000000000001';
const viewing = '40000000-0000-4000-8000-000000000001';
const scope = { projectIds: [project], managerName: 'Канон Бат' };
const db = {
    from: () => {
        const query = {
            select: () => query, eq: () => query, is: () => query, in: () => query,
            update: (payload: unknown) => { state.writes.push(payload); return query; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{
                id: viewing, scheduled_at: '2026-10-02T00:00:00Z', status: 'scheduled', properties: { name: 'Байр' },
            }], error: null }).then(resolve),
        };
        return query;
    },
    rpc: async (name: string, params: Record<string, unknown>) => {
        state.calls.push({ name, params });
        return { data: state.error ? null : { id: viewing, status: 'cancelled' }, error: state.error };
    },
};
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/sales/project-scope', async () => ({
    ...await vi.importActual('@/lib/sales/project-scope'), resolveSalesProjectScope: async () => scope,
}));
vi.mock('../audit', () => ({ logAiAudit: async () => {} }));

import { deleteViewing } from '../functions';
import { executeDataTool } from '../index';

beforeEach(() => { state.calls = []; state.writes = []; state.error = null; });

it('previews without writes and passes the authenticated actor to atomic viewing deletion', async () => {
    expect(await deleteViewing(shop, { viewing_id: viewing }, false, scope, user)).toHaveProperty('requiresConfirmation', true);
    expect(state.calls).toEqual([]); expect(state.writes).toEqual([]);
    const result = await executeDataTool('delete_viewing', { viewing_id: viewing }, shop, {
        role: 'sales_manager', modules: ['viewings'], canWrite: true, canDelete: true,
    }, user, true, 'Хуурамч нэр');
    expect(result).toMatchObject({ success: true, viewingId: viewing });
    expect(state.calls).toMatchObject([{
        name: 'update_scoped_sales_viewing', params: {
            p_shop_id: shop, p_viewing_id: viewing, p_user_id: user,
            p_manager_name: 'Канон Бат', p_project_ids: [project],
            p_patch: { status: 'cancelled', deleted_at: expect.any(String) },
        },
    }]);
    expect(state.writes).toEqual([]);
});

it('does not report deletion or fall back to table writes after ownership changes', async () => {
    state.error = { code: 'P0002', message: 'Lead reassigned after lookup' };
    expect(await deleteViewing(shop, { viewing_id: viewing }, true, scope, user)).toHaveProperty('error');
    expect(state.writes).toEqual([]);
    expect(state.calls).toHaveLength(1);
});
