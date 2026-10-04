import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    store: {} as object,
    role: 'admin' as string | null,
    roleReads: 0,
    fetchRolePermissions: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => state.store }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => 'user-1',
    supabaseAdmin: () => ({
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => { state.roleReads++; return { data: state.role ? { role: state.role } : null, error: null }; } }) }),
        }),
    }),
}));
vi.mock('@/lib/rbac', () => ({ fetchRolePermissions: (...args: unknown[]) => state.fetchRolePermissions(...args) }));

import { resolvePermissions } from '../require-permission';

beforeEach(() => {
    state.store = {};
    state.role = 'admin';
    state.roleReads = 0;
    state.fetchRolePermissions.mockReset().mockResolvedValue({ modules: ['leads'], canWrite: true, canDelete: false });
});

describe('resolvePermissions per-request memo', () => {
    it('reads the role and its grants once per request', async () => {
        const [a, b] = await Promise.all([resolvePermissions(), resolvePermissions()]);
        expect(await resolvePermissions()).toEqual(a);
        expect(b?.role).toBe('admin');
        expect(state.roleReads).toBe(1);
        expect(state.fetchRolePermissions).toHaveBeenCalledTimes(1);
    });

    it('re-reads grants for every new request (strict, no cross-request cache)', async () => {
        await resolvePermissions();
        state.store = {};
        await resolvePermissions();
        expect(state.roleReads).toBe(2);
        expect(state.fetchRolePermissions).toHaveBeenCalledTimes(2);
    });

    it('does not remember a denied lookup', async () => {
        state.fetchRolePermissions.mockRejectedValueOnce(new Error('db down'));
        expect(await resolvePermissions()).toBeNull();
        expect((await resolvePermissions())?.role).toBe('admin');
        expect(state.fetchRolePermissions).toHaveBeenCalledTimes(2);
    });
});
