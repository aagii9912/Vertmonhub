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
}));
const actor = '10000000-0000-4000-8000-000000000001';
const target = '10000000-0000-4000-8000-000000000002';

vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => state.authenticated ? actor : null, supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin ? { id: actor, role: 'super_admin', email: 'admin@example.invalid' } : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: async (entry: typeof state.audits[number]) => { state.audits.push(entry); } }));

const db = {
    from(table: string) {
        const rows = state.rows[table] ||= [];
        const filters: Array<(row: Row) => boolean> = [];
        let patch: Row | null = null;
        let limit = Infinity;
        const run = () => {
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

    it('renames a manager without an active roster link and audits the change', async () => {
        state.rows.sales_managers = [{ shop_id: 'shop-1', name: 'Бат', user_id: target, is_active: false }];
        const response = await patch({ userId: target, full_name: ' Батбаяр Дорж ' });
        expect(response.status).toBe(200);
        expect(state.rows.user_profiles[0].full_name).toBe('Батбаяр Дорж');
        expect(state.audits[0].meta).toEqual({ fields: ['full_name'], full_name: { from: 'Бат', to: 'Батбаяр Дорж' } });
    });

    it('refuses to rename an account linked to an active roster manager (canonical name)', async () => {
        state.rows.sales_managers = [{ shop_id: 'shop-1', name: 'Бат', user_id: target, is_active: true }];
        const response = await patch({ userId: target, full_name: 'Өөр нэр', phone: '99112233' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('Борлуулалтын төлөвлөгөө');
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

    it('returns 404 for an unknown profile and fails closed on read errors', async () => {
        expect((await patch({ userId: '10000000-0000-4000-8000-000000000009', phone: '99112233' })).status).toBe(404);
        state.failRead = 'sales_managers';
        expect((await patch({ userId: target, full_name: 'Өөр нэр' })).status).toBe(500);
        expect(state.updates).toEqual([]);
    });
});
