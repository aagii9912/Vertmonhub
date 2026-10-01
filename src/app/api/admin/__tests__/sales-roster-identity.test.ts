// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const shopId = '20000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const state = vi.hoisted(() => ({
    roster: [] as Array<{ name: string; user_id: string | null }>,
    rosterError: false,
    writes: [] as unknown[],
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => 'admin',
    supabaseAdmin: () => ({
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
import { PUT } from '../sales-targets/route';

const request = (managers: Array<{ name: string; user_id: string | null; is_active: boolean }>) => new NextRequest('http://localhost/api/admin/sales-targets', {
    method: 'PUT', body: JSON.stringify({ shopId, managers }), headers: { 'content-type': 'application/json' },
});
beforeEach(() => {
    state.roster = []; state.rosterError = false; state.writes = [];

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
