import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RBAC gate-үүдийн зан төлөв (Wave 3): user_roles → fetchRolePermissions → 401/403/null.
 * Supabase ба rbac-г mock хийж, бодит `require-permission.ts` логикийг шалгана.
 */
const getUserId = vi.fn<() => Promise<string | null>>();
const roleRow = vi.fn<() => { data: { role: string } | null }>();
const fetchRolePermissions = vi.fn();

vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: () => getUserId(),
    supabaseAdmin: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => roleRow(),
                }),
            }),
        }),
    }),
}));
vi.mock('@/lib/rbac', () => ({
    fetchRolePermissions: (role: string) => fetchRolePermissions(role),
}));

import {
    resolvePermissions, requireModule, requireAnyModule, requireModuleWrite, requireModuleDelete, requireWrite,
} from '../require-permission';

const perms = (over: Partial<{ modules: string[]; canWrite: boolean; canDelete: boolean }> = {}) => ({
    modules: ['dashboard', 'reports'], canWrite: false, canDelete: false, canAccessAdmin: false, ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    getUserId.mockResolvedValue('user-1');
    roleRow.mockReturnValue({ data: { role: 'viewer' } });
    fetchRolePermissions.mockImplementation(async (role: string) =>
        role === 'super_admin' ? perms({ modules: [], canWrite: true, canDelete: true })
        : role === 'sales_manager' ? perms({ modules: ['dashboard', 'leads', 'viewings', 'contracts'], canWrite: true })
        : perms());
});

describe('resolvePermissions', () => {
    it('нэвтрээгүй бол null', async () => {
        getUserId.mockResolvedValue(null);
        expect(await resolvePermissions()).toBeNull();
    });
    it('user_roles мөргүй бол viewer (admins fallback байхгүй)', async () => {
        roleRow.mockReturnValue({ data: null });
        const p = await resolvePermissions();
        expect(p?.role).toBe('viewer');
        expect(fetchRolePermissions).toHaveBeenCalledWith('viewer');
    });
});

describe('module gates', () => {
    it('нэвтрээгүй → 401', async () => {
        getUserId.mockResolvedValue(null);
        const res = await requireModule('leads');
        expect(res?.status).toBe(401);
    });
    it('viewer: leads модуль байхгүй → 403, reports → null', async () => {
        expect((await requireModule('leads'))?.status).toBe(403);
        expect(await requireModule('reports')).toBeNull();
    });
    it('requireAnyModule: аль нэг нь байвал null', async () => {
        expect(await requireAnyModule(['properties', 'reports'])).toBeNull();
        expect((await requireAnyModule(['properties', 'leads']))?.status).toBe(403);
    });
    it('super_admin бүх модульд орно', async () => {
        roleRow.mockReturnValue({ data: { role: 'super_admin' } });
        expect(await requireModule('anything')).toBeNull();
        expect(await requireModuleDelete('contracts')).toBeNull();
    });
    it('sales_manager: бичих эрхтэй ч устгах эрхгүй', async () => {
        roleRow.mockReturnValue({ data: { role: 'sales_manager' } });
        expect(await requireModuleWrite('leads')).toBeNull();
        expect(await requireWrite()).toBeNull();
        expect((await requireModuleDelete('leads'))?.status).toBe(403);
        expect((await requireModuleWrite('marketing-roi'))?.status).toBe(403);
    });
    it('viewer бичих эрхгүй → 403 (модуль байсан ч)', async () => {
        expect((await requireModuleWrite('reports'))?.status).toBe(403);
        expect((await requireWrite())?.status).toBe(403);
    });
});
