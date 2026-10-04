// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    actor: '10000000-0000-4000-8000-000000000001',
    admin: true,
    rows: {} as Record<string, Row[]>,
    provisioned: [] as Array<Record<string, unknown>>,
    provisionFailure: null as null | { error: string; status: number },
}));
const actor = '10000000-0000-4000-8000-000000000001';
const seller = '10000000-0000-4000-8000-000000000002';
const marketer = '10000000-0000-4000-8000-000000000003';
const garden = '20000000-0000-4000-8000-000000000001';
const elysium = '20000000-0000-4000-8000-000000000002';
const tower = '20000000-0000-4000-8000-000000000003';

vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => state.actor, supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin ? { id: state.actor, role: 'super_admin' } : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/user-provisioning', () => ({
    provisionUserAccess: async (_db: unknown, input: Record<string, unknown>) => {
        if (state.provisionFailure) return state.provisionFailure;
        state.provisioned.push(input);
        state.rows.shop_members.push({ shop_id: input.shopId, user_id: input.userId });
        return null;
    },
}));

const db = {
    from(table: string) {
        const rows = state.rows[table] ||= [];
        const filters: Array<(row: Row) => boolean> = [];
        let mutation: (() => Row[]) | null = null;
        const matches = () => rows.filter(row => filters.every(filter => filter(row)));
        const run = () => ({ data: mutation ? mutation() : matches(), error: null });
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            insert: (value: Row) => { mutation = () => { rows.push(value); return [value]; }; return query; },
            update: (value: Row) => { mutation = () => { const hit = matches(); hit.forEach(row => Object.assign(row, value)); return hit; }; return query; },
            delete: () => { mutation = () => { const hit = matches(); state.rows[table] = rows.filter(row => !hit.includes(row)); return hit; }; return query; },
            maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
        };
        return query;
    },
};

import { PUT } from '../users/projects/route';

const put = (body: unknown) => PUT(new NextRequest('http://test/api/admin/users/projects', {
    method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
}));

beforeEach(() => {
    state.actor = actor;
    state.admin = true;
    state.provisioned = [];
    state.provisionFailure = null;
    state.rows = {
        user_roles: [{ user_id: actor, role: 'super_admin' }, { user_id: seller, role: 'sales_manager' }, { user_id: marketer, role: 'marketing' }],
        user_profiles: [{ id: seller, email: 'seller@example.mn' }, { id: marketer, email: 'm@example.mn' }],
        shops: [{ id: garden, name: 'Mandala Garden', user_id: null }, { id: elysium, name: 'Elysium Residence', user_id: null }, { id: tower, name: 'Tower', user_id: actor }],
        shop_members: [{ shop_id: garden, user_id: seller }, { shop_id: garden, user_id: marketer }],
        sales_managers: [{ shop_id: garden, name: 'Номин', user_id: seller, is_active: true }],
    };
});

describe('PUT /api/admin/users/projects (shop = project)', () => {
    it('adds a sales manager to Elysium through roster provisioning in that project', async () => {
        const response = await put({ userId: seller, shopIds: [garden, elysium] });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, added: [elysium], removed: [] });
        expect(state.provisioned).toEqual([expect.objectContaining({ userId: seller, shopId: elysium, role: 'sales_manager', isNew: false, email: 'seller@example.mn' })]);
    });

    it('adds plain membership for non-sales staff and removes a project with its manager link', async () => {
        expect((await put({ userId: marketer, shopIds: [garden, elysium] })).status).toBe(200);
        expect(state.rows.shop_members).toContainEqual({ shop_id: elysium, user_id: marketer, role: 'member' });
        expect(state.provisioned).toEqual([]);

        expect((await put({ userId: seller, shopIds: [] })).status).toBe(200);
        expect(state.rows.shop_members.filter(row => row.user_id === seller)).toEqual([]);
        // Хассан төсөлд эрх үлдэхгүй: менежерийн холбоос салж идэвхгүй болно.
        expect(state.rows.sales_managers).toEqual([{ shop_id: garden, name: 'Номин', user_id: null, is_active: false }]);
    });

    it('refuses unknown projects, an owner removal and removing yourself', async () => {
        expect((await put({ userId: seller, shopIds: ['20000000-0000-4000-8000-000000000099'] })).status).toBe(400);
        state.rows.shop_members.push({ shop_id: tower, user_id: actor });
        expect((await put({ userId: actor, shopIds: [garden] })).status).toBe(409);
        expect(state.rows.shop_members).toContainEqual({ shop_id: tower, user_id: actor });
    });

    it('stops on a provisioning failure and reports what was already added', async () => {
        state.provisionFailure = { error: 'Борлуулалтын менежерийн профайлд бодит нэр оруулна уу.', status: 400 };
        const response = await put({ userId: seller, shopIds: [garden, elysium] });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: 'Борлуулалтын менежерийн профайлд бодит нэр оруулна уу.', added: [] });
    });

    it('requires super admin and a known user', async () => {
        expect((await put({ userId: '10000000-0000-4000-8000-000000000009', shopIds: [] })).status).toBe(404);
        state.admin = false;
        expect((await put({ userId: seller, shopIds: [elysium] })).status).toBe(403);
    });
});
