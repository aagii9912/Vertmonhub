/**
 * RBAC tests — статик зөвшөөрөл, динамик татах + fallback, туслах функцууд.
 *
 * Энэ файл нь аюулгүй байдлын хилийг түгжинэ: дүр бүрийн эрх, Supabase
 * холбогдохгүй үед статик руу шилжих fallback, тодорхойгүй дүрд хамгийн бага эрх.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ROLE_PERMISSIONS,
    ALL_MODULES,
    fetchRolePermissions,
    clearPermissionsCache,
    canAccessModule,
    canAccessModuleDynamic,
    canWrite,
    canDelete,
    canAccessAdmin,
    getRoleDisplayName,
    getAllowedModules,
    isValidRole,
    isSystemRole,
} from '@/lib/rbac';

/** `.from().select().eq().maybeSingle()` гинжийг дуурайсан Supabase mock. */
function mockSupabase(maybeSingleResult: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(maybeSingleResult);
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from }, from, select, eq, maybeSingle };
}

beforeEach(() => {
    clearPermissionsCache();
    vi.clearAllMocks();
});

describe('ROLE_PERMISSIONS статик map', () => {
    it('super_admin ба admin бүх модульд бүрэн эрхтэй', () => {
        for (const role of ['super_admin', 'admin'] as const) {
            const p = ROLE_PERMISSIONS[role];
            expect(p.canWrite).toBe(true);
            expect(p.canDelete).toBe(true);
            expect(p.canAccessAdmin).toBe(true);
            expect(p.modules).toEqual([...ALL_MODULES]);
        }
    });

    it('sales_manager бичих эрхтэй ч устгах/админ эрхгүй', () => {
        const p = ROLE_PERMISSIONS.sales_manager;
        expect(p.canWrite).toBe(true);
        expect(p.canDelete).toBe(false);
        expect(p.canAccessAdmin).toBe(false);
        expect(p.modules).not.toContain('finance');
        expect(p.modules).not.toContain('settings');
    });

    it('accountant нь бичнэ ч устгахгүй, finance_manager устгаж чадна', () => {
        expect(ROLE_PERMISSIONS.accountant.canWrite).toBe(true);
        expect(ROLE_PERMISSIONS.accountant.canDelete).toBe(false);
        expect(ROLE_PERMISSIONS.finance_manager.canDelete).toBe(true);
    });

    it('viewer зөвхөн уншина (бичих/устгах/админ бүгд false)', () => {
        const p = ROLE_PERMISSIONS.viewer;
        expect(p.canWrite).toBe(false);
        expect(p.canDelete).toBe(false);
        expect(p.canAccessAdmin).toBe(false);
        expect(p.modules).toEqual(['dashboard', 'reports']);
    });

    it('канWrite-тэй ямар ч дүр оршин буй модулиудтай (хоосон биш)', () => {
        for (const [role, p] of Object.entries(ROLE_PERMISSIONS)) {
            expect(p.modules.length, `${role} модультай байх ёстой`).toBeGreaterThan(0);
        }
    });
});

describe('статик туслах функцууд', () => {
    it('canAccessModule: super_admin бүх шалгалтыг алгасна', () => {
        expect(canAccessModule('super_admin', 'settings')).toBe(true);
        expect(canAccessModule('super_admin', 'finance')).toBe(true);
    });

    it('canAccessModule: модулийн гишүүнчлэлийг хүндэтгэнэ', () => {
        expect(canAccessModule('viewer', 'dashboard')).toBe(true);
        expect(canAccessModule('viewer', 'contracts')).toBe(false);
    });

    it('canAccessModule: тодорхойгүй дүр → false', () => {
        expect(canAccessModule('ghost_role', 'dashboard')).toBe(false);
    });

    it('canWrite / canDelete / canAccessAdmin тодорхойгүй дүрд false руу унана', () => {
        expect(canWrite('ghost_role')).toBe(false);
        expect(canDelete('ghost_role')).toBe(false);
        expect(canAccessAdmin('ghost_role')).toBe(false);
        expect(canWrite('sales_manager')).toBe(true);
        expect(canDelete('sales_manager')).toBe(false);
    });

    it('canAccessModuleDynamic нь дамжуулсан эрхийн модулиудыг шалгана', () => {
        const perms = { modules: ['dashboard', 'leads'], canWrite: true, canDelete: false, canAccessAdmin: false, displayName: 'x', displayNameMN: 'x' };
        expect(canAccessModuleDynamic(perms, 'leads')).toBe(true);
        expect(canAccessModuleDynamic(perms, 'finance')).toBe(false);
    });

    it('getRoleDisplayName локалийн дагуу нэр буцаана, тодорхойгүй дүрд дүрийн нэрийг буцаана', () => {
        expect(getRoleDisplayName('viewer', 'mn')).toBe('Зөвхөн харагч');
        expect(getRoleDisplayName('viewer', 'en')).toBe('Viewer');
        expect(getRoleDisplayName('ghost_role')).toBe('ghost_role');
    });

    it('getAllowedModules тодорхойгүй дүрд [dashboard] руу унана', () => {
        expect(getAllowedModules('ghost_role')).toEqual(['dashboard']);
        expect(getAllowedModules('viewer')).toEqual(['dashboard', 'reports']);
    });

    it('isValidRole / isSystemRole', () => {
        expect(isValidRole('super_admin')).toBe(true);
        expect(isValidRole('ghost_role')).toBe(false);
        // isSystemRole нь статик map дахь бүх дүрийг (finance_manager г.м) хүлээн зөвшөөрнө
        expect(isSystemRole('finance_manager')).toBe(true);
        expect(isSystemRole('ghost_role')).toBe(false);
    });
});

describe('fetchRolePermissions (динамик + fallback)', () => {
    it('env тохируулаагүй бол статик эрх рүү унана', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
        const perms = await fetchRolePermissions('viewer');
        expect(perms).toEqual(ROLE_PERMISSIONS.viewer);
        vi.unstubAllEnvs();
    });

    it('тодорхойгүй дүр + env байхгүй → хамгийн бага эрх (зөвхөн dashboard)', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
        const perms = await fetchRolePermissions('ghost_role');
        expect(perms.modules).toEqual(['dashboard']);
        expect(perms.canWrite).toBe(false);
        expect(perms.canDelete).toBe(false);
        expect(perms.canAccessAdmin).toBe(false);
        vi.unstubAllEnvs();
    });

    it('DB-ээс дүр олдвол талбаруудыг буулгаж буцаана', async () => {
        const { client, eq } = mockSupabase({
            data: {
                can_write: true,
                can_delete: false,
                can_access_admin: false,
                display_name: 'Junior Sales',
                display_name_mn: 'Бага менежер',
                role_permissions: [{ module: 'dashboard' }, { module: 'leads' }],
            },
            error: null,
        });

        const perms = await fetchRolePermissions('junior_sales', client);
        expect(perms).toEqual({
            modules: ['dashboard', 'leads'],
            canWrite: true,
            canDelete: false,
            canAccessAdmin: false,
            displayName: 'Junior Sales',
            displayNameMN: 'Бага менежер',
        });
        expect(eq).toHaveBeenCalledWith('name', 'junior_sales');
    });

    it('DB дүр олдохгүй (maybeSingle → null) бол статик fallback', async () => {
        const { client } = mockSupabase({ data: null, error: null });
        const perms = await fetchRolePermissions('viewer', client);
        expect(perms).toEqual(ROLE_PERMISSIONS.viewer);
    });

    it('DB алдаа гарвал статик fallback', async () => {
        const { client } = mockSupabase({ data: null, error: { message: 'boom' } });
        const perms = await fetchRolePermissions('sales_manager', client);
        expect(perms).toEqual(ROLE_PERMISSIONS.sales_manager);
    });

    it('Supabase client онхрвол (throw) статик fallback', async () => {
        const client = { from: vi.fn(() => { throw new Error('network'); }) };
        const perms = await fetchRolePermissions('admin', client);
        expect(perms).toEqual(ROLE_PERMISSIONS.admin);
    });

    it('үр дүнг кэшлэнэ — дахин дуудахад DB-д дахин хандахгүй', async () => {
        const { client, from } = mockSupabase({
            data: {
                can_write: false, can_delete: false, can_access_admin: false,
                display_name: 'Cached', display_name_mn: 'Кэш',
                role_permissions: [{ module: 'dashboard' }],
            },
            error: null,
        });

        await fetchRolePermissions('cached_role', client);
        await fetchRolePermissions('cached_role', client);
        expect(from).toHaveBeenCalledTimes(1);
    });

    it('clearPermissionsCache дараа дахин DB-д хандана', async () => {
        const { client, from } = mockSupabase({
            data: {
                can_write: false, can_delete: false, can_access_admin: false,
                display_name: 'x', display_name_mn: 'x',
                role_permissions: [{ module: 'dashboard' }],
            },
            error: null,
        });

        await fetchRolePermissions('role_x', client);
        clearPermissionsCache('role_x');
        await fetchRolePermissions('role_x', client);
        expect(from).toHaveBeenCalledTimes(2);
    });
});
