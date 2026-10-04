// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    userId: '10000000-0000-4000-8000-000000000001',
    shopId: '20000000-0000-4000-8000-000000000001',
    rows: {} as Record<string, Row[]>,
    sequence: 0,
}));
const adminId = '10000000-0000-4000-8000-000000000001';
const managerId = '10000000-0000-4000-8000-000000000002';
const shopId = '20000000-0000-4000-8000-000000000001';
const otherShopId = '20000000-0000-4000-8000-000000000002';
const projectId = '40000000-0000-4000-8000-000000000001';

// Route integration only: session/permission boundaries and database transport are
// explicit fakes. Provisioning, roster identity, lead writes and claims remain real.
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.userId,
    getUserShop: async () => ({ id: state.shopId }),
    supabaseAdmin: () => db,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({
    getAdminUser: async () => currentRole() === 'super_admin'
        ? { id: state.userId, role: 'super_admin', email: 'admin@example.invalid' } : null,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    resolvePermissions: async () => ({ role: currentRole(), permissions: ROLE_PERMISSIONS[currentRole()] }),
    requireModule: async () => null,
    requireModuleWrite: async (module: string) => {
        const permissions = ROLE_PERMISSIONS[currentRole()];
        return permissions?.canWrite && permissions.modules.includes(module)
            ? null : NextResponse.json({ error: 'Fixture permission denied' }, { status: 403 });
    },
}));

import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { provisionUserAccess } from '@/lib/admin/user-provisioning';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { POST as createLead } from '../dashboard/leads/route';
import { POST as claimLead } from '../dashboard/leads/[id]/claim/route';
import { POST as createProject } from '../admin/projects/route';
import { PUT as saveRoster } from '../admin/sales-targets/route';

function currentRole(): string {
    return String(state.rows.user_roles.find(row => row.user_id === state.userId)?.role || 'viewer');
}

const db = {
    async rpc(name: string, input: { p_shop_id: string; p_managers: Row[]; p_fields?: Row; p_member_ids?: string[]; p_actor?: string }) {
        if (name === 'create_project_shop') {
            // Fixture of the RPC: a project is its own shop with the actor and chosen staff as members.
            const shop = { id: `60000000-0000-4000-8000-${String(++state.sequence).padStart(12, '0')}`, name: input.p_fields!.name };
            (state.rows.shops ||= []).push(shop);
            const project = { id: `40000000-0000-4000-8000-${String(++state.sequence).padStart(12, '0')}`, shop_id: shop.id, ...input.p_fields };
            state.rows.projects.push(project);
            for (const user_id of new Set([...(input.p_member_ids || []), input.p_actor])) (state.rows.shop_members ||= []).push({ shop_id: shop.id, user_id });
            return { data: { ...project, shops: { name: shop.name } }, error: null };
        }
        if (name !== 'save_sales_manager_roster') throw new Error(`Unsupported fixture RPC: ${name}`);
        for (const { project_ids: _projectIds, ...manager } of input.p_managers) {
            await db.from('sales_managers').upsert({ ...manager, shop_id: input.p_shop_id }, { onConflict: 'shop_id,name' });
        }
        return { data: null, error: null };
    },
    from(table: string) {
        const rows = state.rows[table] ||= [];
        const filters: Array<(row: Row) => boolean> = [];
        let limit = Infinity;
        let mutation: (() => Row[]) | undefined;
        const matches = () => rows.filter(row => filters.every(filter => filter(row)));
        const add = (value: Row) => {
            const row = { id: `30000000-0000-4000-8000-${String(++state.sequence).padStart(12, '0')}`, deleted_at: null, ...value };
            rows.push(row);
            return row;
        };
        const run = () => ({ data: (mutation ? mutation() : matches()).slice(0, limit), error: null });
        const one = () => {
            const result = run();
            return { ...result, data: result.data[0] || null };
        };
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            or: (expression: string) => {
                if (expression !== 'sales_manager_name.is.null,sales_manager_name.eq.""') throw new Error(`Unsupported fixture filter: ${expression}`);
                filters.push(row => row.sales_manager_name == null || row.sales_manager_name === '');
                return query;
            },
            limit: (count: number) => { limit = count; return query; },
            order: () => query,
            range: () => query,
            insert: (value: Row) => { mutation = () => [add(value)]; return query; },
            upsert: (value: Row | Row[], options: { onConflict: string }) => {
                mutation = () => (Array.isArray(value) ? value : [value]).map(input => {
                    const existing = rows.find(row => options.onConflict.split(',').every(key => row[key] === input[key]));
                    return existing ? Object.assign(existing, input) : add(input);
                });
                return query;
            },
            update: (value: Row) => { mutation = () => matches().map(row => Object.assign(row, value)); return query; },
            maybeSingle: async () => one(),
            single: async () => one(),
            then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
        };
        return query;
    },
};

function request(path: string, body: object, method = 'POST') {
    return new NextRequest(`http://localhost${path}`, {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
}

async function provisionManager(configureProject = true) {
    expect(await provisionUserAccess(db as never, {
        actorId: adminId, userId: managerId, email: 'manager@example.invalid', fullName: 'Бат',
        role: 'sales_manager', shopId, isNew: true,
    })).toBeNull();
    state.userId = managerId;
    expect(state.rows.shop_members).toContainEqual(expect.objectContaining({ user_id: managerId, shop_id: shopId }));
    // Project access is explicitly configured by an admin after account/roster provisioning.
    if (configureProject) state.rows.sales_manager_projects.push({ shop_id: shopId, manager_name: 'Бат', project_id: projectId });
}

function claim(id: string) {
    return claimLead(request(`/api/dashboard/leads/${id}/claim`, { next_followup_at: '2099-01-01T00:00:00Z' }), {
        params: Promise.resolve({ id }),
    });
}

beforeEach(() => {
    state.userId = adminId;
    state.shopId = shopId;
    state.sequence = 0;
    state.rows = {
        roles: [{ id: 'sales-role', name: 'sales_manager' }],
        user_roles: [{ user_id: adminId, role: 'super_admin' }],
        shops: [{ id: shopId, name: 'Шинэ байгууллага' }],
        user_profiles: [], shop_members: [], sales_managers: [], sales_manager_projects: [], leads: [],
        projects: [{ id: projectId, shop_id: shopId, name: 'Менежерийн төсөл' }], lead_activities: [],
    };
});

describe('current manager onboarding route integration', () => {
    it('requires explicit project access even after the manager account becomes active', async () => {
        await provisionManager(false);
        expect(await resolveManagerIdentity(db as never, shopId, managerId)).toMatchObject({ isManager: true });
        const response = await createLead(request('/api/dashboard/leads', { project_id: projectId, customer_name: 'Харилцагч' }));
        expect(response.status).toBe(403);
        expect(state.rows.leads).toEqual([]);
    });

    it('cannot claim another project or a lead already assigned to another manager', async () => {
        await provisionManager();
        const outsideId = '50000000-0000-4000-8000-000000000001';
        const assignedId = '50000000-0000-4000-8000-000000000002';
        const ownId = '50000000-0000-4000-8000-000000000003';
        state.rows.leads.push(
            // Already this manager's lead, but in a project they are not registered for: only the project boundary hides it.
            { id: outsideId, shop_id: shopId, project_id: '40000000-0000-4000-8000-000000000002', status: 'new', deleted_at: null, sales_manager_name: 'Бат' },
            { id: assignedId, shop_id: shopId, project_id: projectId, status: 'new', deleted_at: null, sales_manager_name: 'Өөр менежер' },
            // Control: the same owner inside the manager's project is visible, so it fails as already owned (409), not hidden (404).
            { id: ownId, shop_id: shopId, project_id: projectId, status: 'new', deleted_at: null, sales_manager_name: 'Бат' },
        );
        expect((await claim(ownId)).status).toBe(409);
        expect((await claim(outsideId)).status).toBe(404);
        expect((await claim(assignedId)).status).toBe(404);
        expect(state.rows.leads.map(lead => lead.sales_manager_name)).toEqual(['Бат', 'Өөр менежер', 'Бат']);
        expect(state.rows.lead_activities).toEqual([]);
    });
    it('provisioning activates the manager and explicit project setup enables attribution while unassigned claims remain denied', async () => {
        await provisionManager();
        expect(state.rows.sales_managers).toContainEqual(expect.objectContaining({ user_id: managerId, name: 'Бат', is_active: true, shop_id: shopId }));
        const identity = await resolveManagerIdentity(db as never, shopId, managerId);
        expect(identity).toMatchObject({ managerName: 'Бат', isManager: true, rosterEmpty: false });

        const response = await createLead(request('/api/dashboard/leads', { project_id: projectId, customer_name: 'Шинэ харилцагч', customer_phone: '99001122' }));
        expect(response.status).toBe(200);
        const { lead } = await response.json();
        expect(lead).toMatchObject({ shop_id: shopId, sales_manager_name: 'Бат' });
        state.rows.leads[0].sales_manager_name = null;
        expect((await claim(lead.id)).status).toBe(404);
        expect(state.rows.leads[0].sales_manager_name).toBeNull();
        expect(state.rows.lead_activities).toEqual([]);
    });

    it('provisioning links and activates the unlinked canonical roster without creating a duplicate identity', async () => {
        state.rows.sales_managers.push({ shop_id: shopId, name: 'Бат', user_id: null, is_active: false });
        await provisionManager();
        const pending = await createLead(request('/api/dashboard/leads', { project_id: projectId, customer_name: 'Хүлээж буй харилцагч' }));
        const { lead: unassigned } = await pending.json();
        expect(unassigned.sales_manager_name).toBe('Бат');
        state.rows.leads.find(row => row.id === unassigned.id)!.sales_manager_name = null;

        state.userId = adminId;
        const rosterResponse = await saveRoster(request('/api/admin/sales-targets', {
            shopId, managers: [{ name: 'Бат', user_id: managerId, is_active: true }],
        }, 'PUT'));
        expect(rosterResponse.status).toBe(200);
        state.userId = managerId;
        expect(await resolveManagerIdentity(db as never, shopId, managerId)).toMatchObject({ managerName: 'Бат', isManager: true });
        expect(state.rows.sales_managers).toHaveLength(1);

        const response = await createLead(request('/api/dashboard/leads', { project_id: projectId, customer_name: 'Хариуцсан харилцагч' }));
        expect(response.status).toBe(200);
        expect((await response.json()).lead.sales_manager_name).toBe('Бат');
        const claimed = await claim(unassigned.id);
        expect(claimed.status).toBe(404);
        expect(state.rows.leads.find(row => row.id === unassigned.id)).toMatchObject({
            sales_manager_name: null,
        });
        expect(state.rows.lead_activities).toEqual([]);
    });

    it('an ordinary provisioned manager cannot create a project', async () => {
        await provisionManager();
        expect((await createProject(request('/api/admin/projects', { name: 'Шинэ төсөл', shop_id: shopId }))).status).toBe(403);
        expect(state.rows.projects).toEqual([{ id: projectId, shop_id: shopId, name: 'Менежерийн төсөл' }]);
    });

    it('a super admin creates a project as its own shop and can never add a sub-project to an existing shop', async () => {
        state.rows.shops.push({ id: otherShopId, name: 'Өөр байгууллага' });
        expect((await createProject(request('/api/admin/projects', { name: 'Шинэ төсөл', shop_id: otherShopId }))).status).toBe(400);
        expect(state.rows.projects).toEqual([{ id: projectId, shop_id: shopId, name: 'Менежерийн төсөл' }]);

        const response = await createProject(request('/api/admin/projects', { name: 'Шинэ төсөл' }));
        expect(response.status).toBe(201);
        const { project } = await response.json();
        expect(project).toMatchObject({ name: 'Шинэ төсөл', shops: { name: 'Шинэ төсөл' } });
        expect([shopId, otherShopId]).not.toContain(project.shop_id);
        expect(state.rows.shop_members.filter(row => row.shop_id === project.shop_id)).toEqual([{ shop_id: project.shop_id, user_id: adminId }]);
        expect(state.rows.projects).toHaveLength(2);
    });
});
