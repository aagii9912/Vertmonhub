import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRolePermissions } from '../rbac';

function roleClient(result: { data: Record<string, unknown> | null; error: Error | null }) {
    const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
    };
    return { from: () => query } as unknown as SupabaseClient;
}

describe('server role permissions', () => {
    it('uses current database grants for custom roles', async () => {
        const client = roleClient({
            data: {
                name: 'project_analyst',
                role_permissions: [{ module: 'reports' }],
                can_write: false,
                can_delete: false,
                can_access_admin: false,
            },
            error: null,
        });
        const permissions = await fetchRolePermissions('project_analyst', client, true);
        expect(permissions.modules).toEqual(['reports']);
        expect(permissions.canWrite).toBe(false);
    });

    it('fails closed if the role table cannot be read', async () => {
        const client = roleClient({ data: null, error: new Error('database unavailable') });
        await expect(fetchRolePermissions('admin', client, true)).rejects.toThrow('database unavailable');
    });

    it.each(['admin', 'project_analyst'])('does not restore static grants for a missing %s role', async role => {
        const client = roleClient({ data: null, error: null });
        await expect(fetchRolePermissions(role, client, true)).rejects.toThrow('Role not found');
    });

    it('retains super_admin access when its role definition is absent', async () => {
        const client = roleClient({ data: null, error: null });
        expect(await fetchRolePermissions('super_admin', client, true)).toMatchObject({ canWrite: true, canDelete: true, canAccessAdmin: true });
    });
});
