// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const shopId = '00000000-0000-0000-0000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const projectId = '30000000-0000-4000-8000-000000000001';
const otherProjectId = '30000000-0000-4000-8000-000000000002';
const state = vi.hoisted(() => ({
    roster: [] as Array<{ name: string; user_id: string | null }>,
    rosterError: false,
    projects: [] as Array<{ id: string; name: string }>,
    memberships: [] as Array<{ manager_name: string; project_id: string }>,
    projectsError: false,
    membershipsError: false,
    rpcError: null as null | { code: string; message: string },
    writes: [] as unknown[],
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => 'admin',
    supabaseAdmin: () => ({
        rpc: async (name: string, params: { p_shop_id: string; p_managers: unknown }) => {
            expect(name).toBe('save_sales_manager_roster');
            expect(params.p_shop_id).toBe(shopId);
            if (!state.rpcError) state.writes.push(params.p_managers);
            return { error: state.rpcError };
        },
        from: (table: string) => {
        const query = {
            select: () => query,
            eq: () => query,
            in: () => query,
            order: () => query,
            range: () => query,
            upsert: (rows: unknown) => { state.writes.push(rows); return Promise.resolve({ error: null }); },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === 'shop_members'
                ? { data: [{ user_id: '10000000-0000-4000-8000-000000000002' }], error: null }
                : table === 'user_profiles'
                    ? { data: [{ id: '10000000-0000-4000-8000-000000000002', full_name: 'Бат' }], error: null }
                    : table === 'projects'
                        ? { data: state.projects, error: state.projectsError ? new Error('Projects unavailable') : null }
                        : table === 'sales_manager_projects'
                            ? { data: state.memberships, error: state.membershipsError ? new Error('Memberships unavailable') : null }
                            : { data: state.roster, error: state.rosterError ? new Error('Roster unavailable') : null }).then(resolve),
        };
        return query;
    } }),
}));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'admin', role: 'super_admin' }) }));
vi.mock('@/lib/sales/targets', () => ({
    getTeamTargets: async () => Array(12).fill(0),
    getMonthlyActualsByManager: async () => new Map(),
    sumYear: () => 0,
}));
import { GET, PUT } from '../sales-targets/route';

const request = (managers: Array<{ name: string; user_id: string | null; is_active: boolean; project_ids?: string[] }>) => new NextRequest('http://localhost/api/admin/sales-targets', {
    method: 'PUT', body: JSON.stringify({ shopId, managers }), headers: { 'content-type': 'application/json' },
});
beforeEach(() => {
    state.roster = []; state.rosterError = false; state.writes = [];
    state.projects = [{ id: projectId, name: 'Mandala Garden' }]; state.memberships = [];
    state.projectsError = false; state.membershipsError = false; state.rpcError = null;
});

it('rejects two submitted manager names linked to the same account', async () => {
    const response = await PUT(request([
        { name: 'Бат', user_id: userId, is_active: true },
        { name: 'Бат хоёр', user_id: userId, is_active: true },
    ]));
    expect(response.status).toBe(409);
    expect(state.writes).toEqual([]);
});

it('rejects automatic profile matching when a retained roster row already owns the account', async () => {
    state.roster = [{ name: 'Хуучин бүртгэл', user_id: userId }];
    expect((await PUT(request([{ name: 'Бат', user_id: null, is_active: true }]))).status).toBe(409);
    expect(state.writes).toEqual([]);
});

it('allows updating the same canonical manager link', async () => {
    state.roster = [{ name: 'Бат', user_id: userId }];
    expect((await PUT(request([{ name: 'Бат', user_id: userId, is_active: true }]))).status).toBe(200);
    expect(state.writes).toHaveLength(1);
});

it('does not write when existing roster links cannot be checked', async () => {
    state.rosterError = true;
    expect((await PUT(request([{ name: 'Бат', user_id: userId, is_active: true }]))).status).toBe(500);
    expect(state.writes).toEqual([]);
});

it('returns available projects and explicit manager membership IDs', async () => {
    state.roster = [{ name: 'Бат', user_id: userId }];
    state.memberships = [{ manager_name: 'Бат', project_id: projectId }];
    const response = await GET(new NextRequest(`http://localhost/api/admin/sales-targets?shopId=${shopId}&year=2026`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        projects: [{ id: projectId, name: 'Mandala Garden' }],
        managers: [{ name: 'Бат', project_ids: [projectId] }],
    });
});

it('fails closed when the project membership schema is unavailable', async () => {
    state.membershipsError = true;
    const response = await GET(new NextRequest(`http://localhost/api/admin/sales-targets?shopId=${shopId}&year=2026`));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('managers');
});

it('rejects another shop project and fails closed on project validation reads', async () => {
    const manager = { name: 'Бат', user_id: userId, is_active: true, project_ids: [otherProjectId] };
    expect((await PUT(request([manager]))).status).toBe(400);
    state.projectsError = true;
    expect((await PUT(request([{ ...manager, project_ids: [projectId] }]))).status).toBe(500);
    expect(state.writes).toEqual([]);
});

it('sends explicit empty memberships to clear while omitted memberships stay omitted', async () => {
    expect((await PUT(request([{ name: 'Бат', user_id: userId, is_active: true, project_ids: [] }]))).status).toBe(200);
    expect(state.writes[0]).toMatchObject([{ project_ids: [] }]);
    expect((await PUT(request([{ name: 'Бат', user_id: userId, is_active: true }]))).status).toBe(200);
    expect((state.writes[1] as object[])[0]).not.toHaveProperty('project_ids');
});

it('deduplicates selected projects and requires the atomic roster RPC to succeed', async () => {
    const manager = { name: 'Бат', user_id: userId, is_active: true, project_ids: [projectId, projectId] };
    expect((await PUT(request([manager]))).status).toBe(200);
    expect(state.writes).toMatchObject([[{ project_ids: [projectId] }]]);
    state.rpcError = { code: 'PGRST202', message: 'RPC not installed' };
    expect((await PUT(request([manager]))).status).toBe(503);
    expect(state.writes).toHaveLength(1);
});
