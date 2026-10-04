// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    roleExists: true,
    shops: [{ id: 'shop-one' }] as Array<{ id: string; name?: string; user_id?: string }>,
    ownedShop: false,
    upserts: 0,
    deletes: 0,
    creates: 0,
    passwords: [] as string[],
    createdEmails: [] as string[],
    upserted: [] as Array<{ table: string; payload: unknown }>,
    authenticated: true,
    superAdmin: true,
    readErrorTable: '',
    audits: [] as Array<{ action: string; targetId: string; meta?: unknown }>,
    profiles: [] as Array<{ id: string; full_name: string; phone?: string | null }>,
    userRoles: [] as Array<{ user_id: string; role: string }>,
    members: [] as Array<{ user_id: string; shop_id: string }>,
    managers: [] as Array<{ user_id: string; shop_id: string; name: string; is_active: boolean }>,
}));
const actorId = '10000000-0000-4000-8000-000000000001';
const targetId = '10000000-0000-4000-8000-000000000002';

vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => state.authenticated ? actorId : null, supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.superAdmin ? ({ id: actorId, role: 'super_admin', email: 'admin@example.com' }) : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: async (entry: typeof state.audits[number]) => { state.audits.push(entry); } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
    signInWithPassword: async (input: { password: string }) => {
        state.passwords.push(input.password);
        return { data: { user: { id: targetId } }, error: null };
    },
} }) }));

const db = {
    auth: { admin: {
        listUsers: async () => ({ data: { users: [
            { id: actorId, email: 'admin@example.invalid', created_at: '2026-09-01T00:00:00Z', email_confirmed_at: '2026-09-01T00:00:00Z', last_sign_in_at: '2026-10-01T00:00:00Z' },
            { id: targetId, email: 'target@example.invalid', created_at: '2026-10-01T00:00:00Z' },
        ] }, error: null }),
        getUserById: async () => ({ data: { user: { id: 'target' } }, error: null }),
        deleteUser: async () => { state.deletes++; return { error: null }; },
        createUser: async (input: { email: string; password: string }) => {
            state.creates++; state.passwords.push(input.password); state.createdEmails.push(input.email);
            return { data: { user: { id: targetId } }, error: null };
        },
        updateUserById: async (_id: string, input: { password: string }) => {
            state.passwords.push(input.password);
            return { data: { user: { id: targetId, email: 'target@example.invalid' } }, error: null };
        },
    } },
    from(table: string) {
        let batch = false;
        let selectedShopId: unknown;
        const query = {
            select: () => query,
            eq: (field: string, value: unknown) => {
                if (table === 'shops' && field === 'id') selectedShopId = value;
                return query;
            },
            limit: () => query,
            maybeSingle: async () => ({
                data: table === 'roles' && state.roleExists ? { id: 'role-1' }
                    : table === 'shops' ? state.shops.find(shop => shop.id === selectedShopId) ?? null : null,
                error: null,
            }),
            upsert: async (payload: unknown) => { state.upserts++; state.upserted.push({ table, payload }); return { error: null }; },
            insert: async () => ({ error: null }),
            range: () => { batch = true; return query; },
            then: (resolve: (result: { data: unknown[]; error: { message: string } | null }) => unknown) => {
                const lists: Record<string, unknown[]> = { user_roles: state.userRoles, user_profiles: state.profiles, shops: state.shops, shop_members: state.members, sales_managers: state.managers };
                return Promise.resolve({
                    data: batch ? lists[table] || [] : table === 'shops' ? (state.ownedShop ? [{ id: 'owned' }] : state.shops) : [],
                    error: state.readErrorTable === table ? { message: 'Synthetic database failure' } : null,
                }).then(resolve);
            },
        };
        return query;
    },
};

import { GET, PATCH, POST, PUT, DELETE } from '../users/route';

function jsonRequest(method: string, body: object) {
    return new NextRequest('http://localhost/api/admin/users', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    state.roleExists = true;
    state.shops = [{ id: 'shop-one' }];
    state.ownedShop = false;
    state.upserts = 0;
    state.deletes = 0;
    state.creates = 0;
    state.passwords = []; state.createdEmails = []; state.upserted = [];
    state.authenticated = true; state.superAdmin = true; state.readErrorTable = '';
    state.audits = []; state.profiles = []; state.userRoles = []; state.members = []; state.managers = [];
});

describe('admin user safety', () => {
    it('rejects unknown roles before writing user_roles', async () => {
        state.roleExists = false;
        const response = await PATCH(jsonRequest('PATCH', { userId: targetId, role: 'invented' }));
        expect(response.status).toBe(400);
        expect(state.upserts).toBe(0);
    });

    it('prevents a super admin from removing their own access', async () => {
        const response = await PATCH(jsonRequest('PATCH', { userId: actorId, role: 'viewer' }));
        expect(response.status).toBe(409);
        expect(state.upserts).toBe(0);
    });

    it('requires a shop selection before creating a user in a multi-shop installation', async () => {
        state.shops = [{ id: 'shop-one' }, { id: 'shop-two' }];
        const response = await POST(jsonRequest('POST', { email: 'new@example.com', password: 'strong-pass-123', role: 'viewer' }));
        expect(response.status).toBe(400);
        expect(state.creates).toBe(0);
    });

    it('creates a user in an explicitly selected legacy shop GUID', async () => {
        const shopId = '00000000-0000-0000-0000-000000000001';
        state.shops = [{ id: shopId }];
        const response = await POST(jsonRequest('POST', {
            email: 'new@example.com', password: 'strong-pass-123', role: 'viewer', shop_id: shopId,
        }));
        expect(response.status).toBe(201);
        expect(state.creates).toBe(1);
    });

    it.each(['not-a-guid', '00000000-0000-0000-0000-00000000000g'])('rejects malformed shop IDs before Auth mutation: %s', async shopId => {
        const response = await POST(jsonRequest('POST', {
            email: 'new@example.com', password: 'strong-pass-123', role: 'viewer', shop_id: shopId,
        }));
        expect(response.status).toBe(400);
        expect(state.creates).toBe(0);
        expect(state.upserts).toBe(0);
    });

    it('accepts a legacy shop GUID when changing another user role', async () => {
        const response = await PATCH(jsonRequest('PATCH', {
            userId: targetId, role: 'viewer', shop_id: '00000000-0000-0000-0000-000000000001',
        }));
        expect(response.status).toBe(200);
        expect(state.upserts).toBe(1);
    });

    it('refuses to delete a shop owner, preserving the shop cascade', async () => {
        state.ownedShop = true;
        const response = await DELETE(new NextRequest(`http://localhost/api/admin/users?userId=${targetId}`, { method: 'DELETE' }));
        expect(response.status).toBe(409);
        expect(state.deletes).toBe(0);
    });

    it('grants Super Admin to another account even when its roles row is absent', async () => {
        state.roleExists = false;
        const response = await PATCH(jsonRequest('PATCH', { userId: targetId, role: 'super_admin' }));
        expect(response.status).toBe(200);
        expect(state.upserts).toBe(1);
        expect(state.audits).toContainEqual(expect.objectContaining({ action: 'user.super_admin_grant', targetId, meta: { role: 'super_admin' } }));
    });

    it('requires explicit shop selection before assigning a sales manager in multiple shops', async () => {
        state.shops = [{ id: 'shop-one' }, { id: 'shop-two' }];
        const response = await PATCH(jsonRequest('PATCH', { userId: targetId, role: 'sales_manager' }));
        expect(response.status).toBe(400);
        expect(state.upserts).toBe(0);
    });

    it('requires a real manager name before creating an Auth account', async () => {
        const response = await POST(jsonRequest('POST', { email: 'new@example.com', password: 'strong-pass-123', role: 'sales_manager' }));
        expect(response.status).toBe(400);
        expect(state.creates).toBe(0);
    });

    it('stores a normalized staff phone and lowercases a mixed-case email on create', async () => {
        const response = await POST(jsonRequest('POST', {
            email: '  New.Manager@Example.com ', password: 'strong-pass-123', role: 'viewer', full_name: 'Тест Ажилтан', phone: '+976 9911-2233',
        }));
        expect(response.status).toBe(201);
        expect(state.createdEmails).toEqual(['new.manager@example.com']);
        expect(state.upserted.find(entry => entry.table === 'user_profiles')?.payload).toEqual({
            id: targetId, email: 'new.manager@example.com', full_name: 'Тест Ажилтан', phone: '99112233',
        });
        expect((await response.json()).user).toMatchObject({ email: 'new.manager@example.com', phone: '99112233' });
        // Утас (хувийн мэдээлэл) audit-д бичигдэхгүй.
        expect(JSON.stringify(state.audits)).not.toContain('99112233');
    });

    it.each(['9911223', '991122330', 'утас', 12345678])('rejects a malformed staff phone (%s) before Auth', async phone => {
        const response = await POST(jsonRequest('POST', { email: 'new@example.com', password: 'strong-pass-123', role: 'viewer', phone }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Утасны дугаар 8 оронтой байх ёстой' });
        expect(state.creates).toBe(0);
    });

    it('treats a blank phone as no phone', async () => {
        const response = await POST(jsonRequest('POST', { email: 'new@example.com', password: 'strong-pass-123', role: 'viewer', phone: ' ' }));
        expect(response.status).toBe(201);
        expect(state.upserted.find(entry => entry.table === 'user_profiles')?.payload).not.toHaveProperty('phone');
    });

    it('requires a manager name different from the email regardless of case', async () => {
        const response = await POST(jsonRequest('POST', {
            email: 'new@example.com', password: 'strong-pass-123', role: 'sales_manager', full_name: 'NEW@example.com',
        }));
        expect(response.status).toBe(400);
        expect(state.creates).toBe(0);
    });

    it('rejects malformed account IDs before hitting Auth or role mutation', async () => {
        const response = await PATCH(jsonRequest('PATCH', { userId: 'invalid-id', role: 'super_admin' }));
        expect(response.status).toBe(400);
        expect(state.upserts).toBe(0);
    });

    it('preserves the exact newly created password including leading and trailing spaces', async () => {
        const password = ' valid-password ';
        const response = await POST(jsonRequest('POST', { email: 'new@example.com', password, role: 'viewer' }));
        expect(response.status).toBe(201);
        expect(state.passwords).toEqual([password, password]);
    });

    it('preserves the exact reset password using the same semantics as login', async () => {
        const password = ' valid-password ';
        const response = await PUT(jsonRequest('PUT', { userId: targetId, password }));
        expect(response.status).toBe(200);
        expect(state.passwords).toEqual([password, password]);
    });

    it.each([false, 12345678, {}, 'short'])('rejects invalid reset passwords (%s) before Auth mutation', async password => {
        const response = await PUT(jsonRequest('PUT', { userId: targetId, password }));
        expect(response.status).toBe(400);
        expect(state.passwords).toEqual([]);
    });

    it('returns the acting user plus owner/member, login and active manager status', async () => {
        const shopId = '20000000-0000-4000-8000-000000000001';
        state.shops = [{ id: shopId, name: 'Байгууллага', user_id: targetId }];
        state.profiles = [{ id: targetId, full_name: 'Бат', phone: '99112233' }];
        state.userRoles = [{ user_id: targetId, role: 'sales_manager' }];
        state.members = [{ user_id: actorId, shop_id: shopId }];
        state.managers = [{ user_id: targetId, shop_id: shopId, name: 'Бат', is_active: true }];
        const response = await GET();
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.actor_id).toBe(actorId);
        expect(result.users[0]).toMatchObject({ id: targetId, full_name: 'Бат', phone: '99112233', email_confirmed: false,
            shops: [{ id: shopId, name: 'Байгууллага', is_owner: true }], manager_shops: [{ shop_id: shopId, name: 'Бат' }], manager_linked: true });
        expect(result.users[1]).toMatchObject({ id: actorId, phone: null, email_confirmed: true, last_sign_in_at: '2026-10-01T00:00:00Z', shops: [{ is_owner: false }], manager_linked: false });
    });

    it('flags an inactive roster link (name locked) without counting it as an active manager project', async () => {
        const shopId = '20000000-0000-4000-8000-000000000001';
        state.managers = [{ user_id: targetId, shop_id: shopId, name: 'Бат', is_active: false }];
        const result = await (await GET()).json();
        expect(result.users[0]).toMatchObject({ id: targetId, manager_shops: [], manager_linked: true });
    });

    it('does not return partial or misleading user status after a membership read failure', async () => {
        state.readErrorTable = 'shop_members';
        const response = await GET();
        expect(response.status).toBe(500);
        expect(await response.json()).not.toHaveProperty('users');
    });

    it('denies non-admins direct access to user listing and Super Admin grants', async () => {
        state.superAdmin = false;
        expect((await GET()).status).toBe(403);
        expect((await PATCH(jsonRequest('PATCH', { userId: targetId, role: 'super_admin' }))).status).toBe(403);
        expect(state.upserts).toBe(0);
    });
});
