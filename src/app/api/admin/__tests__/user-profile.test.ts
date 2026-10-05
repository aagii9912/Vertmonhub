// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    admin: true,
    authenticated: true,
    rows: {} as Record<string, Row[]>,
    updates: [] as Array<{ table: string; payload: Row }>,
    audits: [] as Array<{ action: string; targetId?: string; meta?: Record<string, unknown> }>,
    failRead: '',
    authUsers: {} as Record<string, { id: string; email?: string }>,
    authError: null as { message: string; status?: number } | null,
    insertError: null as { message: string; code?: string } | null,
}));
const actor = '10000000-0000-4000-8000-000000000001';
const target = '10000000-0000-4000-8000-000000000002';

vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => state.authenticated ? actor : null, supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin ? { id: actor, role: 'super_admin', email: 'admin@example.invalid' } : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: async (entry: typeof state.audits[number]) => { state.audits.push(entry); } }));

const db = {
    auth: { admin: {
        getUserById: async (id: string) => ({ data: { user: state.authUsers[id] ?? null }, error: state.authError }),
    } },
    from(table: string) {
        const rows = state.rows[table] ||= [];
        const filters: Array<(row: Row) => boolean> = [];
        let patch: Row | null = null;
        let inserted: Row | null = null;
        let limit = Infinity;
        const run = () => {
            if (inserted) {
                state.updates.push({ table, payload: { insert: inserted } });
                if (state.insertError) return { data: null, error: state.insertError };
                rows.push({ ...inserted });
                return { data: [{ ...inserted }], error: null };
            }
            if (!patch && state.failRead === table) return { data: null, error: { message: 'Synthetic read failure' } };
            const hit = rows.filter(row => filters.every(filter => filter(row))).slice(0, limit);
            if (patch) {
                state.updates.push({ table, payload: patch });
                hit.forEach(row => Object.assign(row, patch));
            }
            return { data: hit.map(row => ({ ...row })), error: null };
        };
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            limit: (value: number) => { limit = value; return query; },
            update: (value: Row) => { patch = value; return query; },
            insert: (value: Row) => { inserted = value; return query; },
            maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
        };
        return query;
    },
};

import { PATCH } from '../users/profile/route';

const patch = (body: unknown) => PATCH(new NextRequest('http://test/api/admin/users/profile', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
}));

beforeEach(() => {
    state.admin = true; state.authenticated = true; state.updates = []; state.audits = []; state.failRead = '';
    state.authUsers = {}; state.authError = null; state.insertError = null;
    state.rows = {
        user_profiles: [{ id: target, email: 'manager@example.invalid', full_name: 'Бат', phone: null }],
        user_roles: [{ user_id: target, role: 'sales_manager' }],
        sales_managers: [],
    };
});

describe('PATCH /api/admin/users/profile', () => {
    it('is super_admin only and requires a session', async () => {
        state.admin = false;
        expect((await patch({ userId: target, phone: '99112233' })).status).toBe(403);
        state.admin = true; state.authenticated = false;
        expect((await patch({ userId: target, phone: '99112233' })).status).toBe(401);
        expect(state.updates).toEqual([]);
    });

    it.each([
        [{ userId: target }],
        [{ userId: 'not-a-uuid', phone: '99112233' }],
        [{ userId: target, phone: '99112233', role: 'super_admin' }],
        [{ userId: target, full_name: '   ' }],
        [{ userId: target, email: 'other@example.invalid' }],
    ])('rejects a body outside the strict allow-list (%j)', async body => {
        expect((await patch(body)).status).toBe(400);
        expect(state.updates).toEqual([]);
    });

    it('rejects a malformed phone with the phone message', async () => {
        const response = await patch({ userId: target, phone: '9911-223' });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Утасны дугаар 8 оронтой байх ёстой' });
    });

    it('stores a normalized phone and keeps it out of the audit entry', async () => {
        const response = await patch({ userId: target, phone: '+976 9911-2233' });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, user: { id: target, full_name: 'Бат', phone: '99112233' } });
        expect(state.updates).toEqual([{ table: 'user_profiles', payload: { phone: '99112233', updated_at: expect.any(String) } }]);
        expect(state.audits).toEqual([{ actorId: actor, action: 'user.profile_update', targetId: target, meta: { fields: ['phone'] } }]);
        expect(JSON.stringify(state.audits)).not.toContain('99112233');
    });

    it('clears a phone with an empty value', async () => {
        state.rows.user_profiles[0].phone = '99112233';
        expect((await patch({ userId: target, phone: '' })).status).toBe(200);
        expect(state.rows.user_profiles[0].phone).toBeNull();
    });

    it('renames a manager whose roster rows are not linked to the account and audits the change', async () => {
        // Нэр ижил ч акаунтад холбоогүй (user_id null) мөр нэр солихыг хаахгүй.
        state.rows.sales_managers = [{ shop_id: 'shop-1', name: 'Бат', user_id: null, is_active: true }];
        const response = await patch({ userId: target, full_name: ' Батбаяр Дорж ' });
        expect(response.status).toBe(200);
        expect(state.rows.user_profiles[0].full_name).toBe('Батбаяр Дорж');
        expect(state.audits[0].meta).toEqual({ fields: ['full_name'], full_name: { from: 'Бат', to: 'Батбаяр Дорж' } });
    });

    it.each([true, false])('refuses to rename an account linked to a roster manager (is_active=%s, canonical name)', async isActive => {
        // Идэвхгүй холбоос ч дахин идэвхжихдээ хуучин нэрээрээ сэргэдэг тул нэр салбарлана.
        state.rows.sales_managers = [{ shop_id: 'shop-1', name: 'Бат', user_id: target, is_active: isActive }];
        const response = await patch({ userId: target, full_name: 'Өөр нэр', phone: '99112233' });
        expect(response.status).toBe(409);
        const { error } = await response.json();
        expect(error).toContain('Борлуулалтын төлөвлөгөө');
        expect(error).toContain('Акаунтын холбоос салгах');
        expect(state.updates).toEqual([]);
        // Нэр өөрчлөгдөхгүй бол утсыг шинэчилж болно.
        expect((await patch({ userId: target, full_name: 'Бат', phone: '99112233' })).status).toBe(200);
        expect(state.updates).toEqual([{ table: 'user_profiles', payload: { phone: '99112233', updated_at: expect.any(String) } }]);
    });

    it('requires a sales manager name different from the email', async () => {
        const response = await patch({ userId: target, full_name: 'MANAGER@example.invalid' });
        expect(response.status).toBe(400);
        expect(state.updates).toEqual([]);
    });

    it('allows an email-like name for non-manager roles and reports unchanged values without writing', async () => {
        state.rows.user_roles = [{ user_id: target, role: 'viewer' }];
        expect((await patch({ userId: target, full_name: 'manager@example.invalid' })).status).toBe(200);
        state.updates = []; state.audits = [];
        const response = await patch({ userId: target, full_name: 'manager@example.invalid', phone: null });
        expect(await response.json()).toMatchObject({ success: true, unchanged: true });
        expect(state.updates).toEqual([]);
        expect(state.audits).toEqual([]);
    });

    it('returns 404 for an unknown account and fails closed on read errors', async () => {
        expect((await patch({ userId: '10000000-0000-4000-8000-000000000009', phone: '99112233' })).status).toBe(404);
        state.failRead = 'sales_managers';
        expect((await patch({ userId: target, full_name: 'Өөр нэр' })).status).toBe(500);
        expect(state.updates).toEqual([]);
    });

    describe('an Auth account without a profile row (OAuth sign-up)', () => {
        const orphan = '10000000-0000-4000-8000-000000000003';
        beforeEach(() => {
            state.authUsers = { [orphan]: { id: orphan, email: 'OAuth.User@Example.invalid' } };
            state.rows.user_roles.push({ user_id: orphan, role: 'viewer' });
        });

        it('creates the profile from the verified Auth account with a phone only', async () => {
            const response = await patch({ userId: orphan, phone: '9911 2233' });
            expect(response.status).toBe(200);
            expect(state.updates).toEqual([{ table: 'user_profiles', payload: { insert: {
                id: orphan, email: 'oauth.user@example.invalid', phone: '99112233', updated_at: expect.any(String),
            } } }]);
            expect(state.audits).toEqual([{ actorId: actor, action: 'user.profile_update', targetId: orphan, meta: { fields: ['phone'], created: true } }]);
        });

        it('creates the profile with a real name so the account can become a sales manager', async () => {
            state.rows.user_roles = [{ user_id: orphan, role: 'sales_manager' }];
            expect((await patch({ userId: orphan, full_name: 'oauth.user@example.invalid' })).status).toBe(400);
            const response = await patch({ userId: orphan, full_name: 'Шинэ Ажилтан' });
            expect(response.status).toBe(200);
            expect(state.rows.user_profiles.find(row => row.id === orphan)).toMatchObject({ full_name: 'Шинэ Ажилтан', email: 'oauth.user@example.invalid' });
            expect(state.audits[0].meta).toEqual({ fields: ['full_name'], created: true, full_name: { from: null, to: 'Шинэ Ажилтан' } });
        });

        it('keeps the roster-link guard for a profile-less account', async () => {
            state.rows.sales_managers = [{ shop_id: 'shop-1', name: 'Бат', user_id: orphan, is_active: false }];
            expect((await patch({ userId: orphan, full_name: 'Өөр нэр' })).status).toBe(409);
            expect(state.updates).toEqual([]);
        });

        it('reports a concurrent or duplicate-email profile as a conflict, an Auth outage as a failure', async () => {
            state.insertError = { message: 'duplicate key value', code: '23505' };
            expect((await patch({ userId: orphan, phone: '99112233' })).status).toBe(409);
            state.authError = { message: 'Synthetic Auth outage', status: 500 };
            expect((await patch({ userId: orphan, phone: '99112233' })).status).toBe(500);
        });

        it('refuses to create a profile for an account without an email', async () => {
            state.authUsers[orphan] = { id: orphan };
            expect((await patch({ userId: orphan, phone: '99112233' })).status).toBe(409);
            expect(state.updates).toEqual([]);
        });
    });
});
