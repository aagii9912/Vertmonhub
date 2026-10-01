// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    profileId: 'target' as string | null,
    roleExists: true,
    membership: false,
    actorAccess: true,
    linkMode: 'invite' as 'invite' | 'magiclink',
    linkUserId: 'target',
    apiTargetExists: true,
    createdUserId: 'created-target',
    missingLink: false,
    linkTypes: [] as string[],
    linkInputs: [] as Array<{ type: string; options?: { data?: unknown } }>,
    authCreates: [] as Array<Record<string, unknown>>,
    errors: {} as Record<string, { message: string; code?: string }>,
    writes: [] as Array<{ operation: string; table: string; payload: unknown }>,
    passwords: [] as string[],
    authDeletes: [] as string[],
    authUpdates: 0,
    emails: 0,
}));
const shopId = '10000000-0000-4000-8000-000000000001';
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/auth/supabase-auth', () => ({ supabaseAdmin: () => db, getUserId: async () => 'actor' }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'actor', email: 'actor@example.com', role: 'super_admin' }) }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: async () => {} }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: async () => {} }));
vi.mock('@/lib/email/email', () => ({ sendInviteEmail: async () => { state.emails++; return true; } }));

const db = {
    auth: { admin: {
        getUserById: async (id: string) => ({ data: { user: { id } }, error: state.errors.authRead || null }),
        createUser: async (input: { password?: string }) => {
            state.authCreates.push(input);
            if (input.password) state.passwords.push(input.password);
            const error = state.errors.authCreate || (!input.password && state.apiTargetExists
                ? { message: 'User already registered', code: 'email_exists' } : null);
            return { data: { user: error ? null : { id: input.password ? 'new-user' : state.createdUserId } }, error };
        },
        updateUserById: async () => { state.authUpdates++; return { error: null }; },
        deleteUser: async (id: string) => { state.authDeletes.push(id); return { error: state.errors.authDelete || null }; },
        generateLink: async (input: { type: string; options?: { data?: unknown } }) => {
            state.linkTypes.push(input.type);
            state.linkInputs.push(input);
            if (state.errors.linkThrow) throw state.errors.linkThrow;
            if (state.errors.link) return { data: null, error: state.errors.link };
            return input.type === 'invite' && state.linkMode === 'magiclink'
                ? { data: null, error: { message: 'User already registered' } }
                : { data: { user: { id: state.linkUserId }, properties: { action_link: state.missingLink ? undefined : 'https://example.invalid/link' } }, error: null };
        },
    } },
    from(table: string) {
        const filters: Record<string, unknown> = {};
        let operation = 'read';
        let payload: unknown;
        const result = () => {
            if (operation !== 'read') state.writes.push({ operation, table, payload });
            const error = state.errors[`${operation}:${table}`] || null;
            let data: unknown = null;
            if (table === 'roles' && state.roleExists) data = { id: 'role-id', name: 'analyst' };
            if (table === 'shops') data = filters.user_id && !state.actorAccess ? null : { id: shopId };
            if (table === 'shop_members' && state.membership && filters.user_id !== 'actor') data = { id: 'existing-membership' };
            if (table === 'user_profiles' && state.profileId) data = { id: state.profileId, email: 'target@example.com' };
            return { data, error };
        };
        const query = {
            select: () => query,
            eq: (field: string, value: unknown) => { filters[field] = value; return query; },
            limit: () => query,
            insert: (value: unknown) => { operation = 'insert'; payload = value; return query; },
            upsert: (value: unknown) => { operation = 'upsert'; payload = value; return query; },
            delete: () => { operation = 'delete'; return query; },
            maybeSingle: async () => result(),
            single: async () => result(),
            then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    },
};

import { isAssignableRole, provisionUserAccess } from '../user-provisioning';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { assignRole, createRole, inviteUser } from '@/lib/ai/data-assistant/admin-functions';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { POST as inviteApi } from '@/app/api/admin/users/invite/route';

const invite = { email: 'target@example.com', role: 'viewer', shop_id: shopId };
const newRole = { name: 'analyst', display_name_mn: 'Аналист', modules: ['reports'] };
const provisioning = { actorId: 'actor', userId: 'target', email: invite.email, role: 'viewer', shopId, isNew: false };
const failure = { message: 'synthetic database failure' };
const writesTo = (table: string) => state.writes.filter(write => write.table === table);

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.profileId = 'target'; state.roleExists = true; state.membership = false; state.actorAccess = true;
    state.linkMode = 'invite'; state.linkUserId = 'target'; state.errors = {}; state.writes = [];
    state.apiTargetExists = true; state.createdUserId = 'created-target'; state.missingLink = false;
    state.linkTypes = []; state.linkInputs = []; state.authCreates = [];
    state.passwords = []; state.authDeletes = []; state.authUpdates = 0; state.emails = 0;
});

describe('admin provisioning across API and AI', () => {
    it('rejects an own-account API invite before generating or emailing a link', async () => {
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify({ ...invite, email: 'ACTOR@example.com' }),
        }));
        expect(response.status).toBe(409);
        expect(state.writes).toEqual([]);
        expect(state.emails).toBe(0);
        expect(state.authCreates).toEqual([]);
        expect(state.linkTypes).toEqual([]);
    });

    it('also blocks a magiclink target resolved to the acting user', async () => {
        state.linkMode = 'magiclink'; state.linkUserId = 'actor';
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(409);
        expect(state.writes).toEqual([]);
        expect(state.authDeletes).toEqual([]);
    });

    it('AI assign_role and invite_user cannot remove their own admin role', async () => {
        state.profileId = 'actor';
        expect(await assignRole(shopId, invite, true, 'actor')).toHaveProperty('error');
        expect(await inviteUser(shopId, invite, true, 'actor')).toHaveProperty('error');
        expect(state.writes).toEqual([]);
        expect(state.authUpdates).toBe(0);
    });

    it('the AI executor passes the authenticated actor to the shared assignment guard', async () => {
        state.profileId = 'actor';
        const result = await executeDataTool('assign_role', invite, shopId,
            { role: 'super_admin', canWrite: true, canDelete: true }, 'actor', true);
        expect(result.error).toBe('Өөрийн дүрийг өөрчлөх боломжгүй');
        expect(state.writes).toEqual([]);
    });

    it('requires an actor and a database-defined role before AI provisioning', async () => {
        expect(await assignRole(shopId, invite, true)).toHaveProperty('error');
        expect(await inviteUser(shopId, invite, true)).toHaveProperty('error');
        state.roleExists = false;
        const unknownRole = { ...invite, role: 'unknown_role' };
        expect(await assignRole(shopId, unknownRole, true, 'actor')).toHaveProperty('error');
        expect(await inviteUser(shopId, unknownRole, true, 'actor')).toHaveProperty('error');
        expect(state.writes).toEqual([]);
        expect(state.passwords).toEqual([]);
    });

    it('existing-account AI invite grants access while preserving its password and profile', async () => {
        const result = await inviteUser(shopId, invite, true, 'actor');
        expect(result).toHaveProperty('success', true);
        expect(state.authUpdates).toBe(0);
        expect(state.passwords).toEqual([]);
        expect(writesTo('user_profiles')).toEqual([]);
        expect(writesTo('user_roles')[0].payload).toEqual({ user_id: 'target', role: 'viewer' });
    });

    it('new-account AI invite generates a secure temporary password and all access records', async () => {
        state.profileId = null;
        expect(await inviteUser(shopId, invite, true, 'actor')).toHaveProperty('success', true);
        expect(state.passwords[0]).toMatch(/^Vh1[A-Za-z0-9_-]{24}!$/);
        expect(writesTo('user_profiles')).toHaveLength(1);
        expect(writesTo('shop_members')).toHaveLength(1);
        expect(writesTo('user_roles')).toHaveLength(1);
    });

    it('a confirmation preview never creates a user or changes access', async () => {
        state.profileId = null;
        expect(await inviteUser(shopId, invite, false, 'actor')).toHaveProperty('requiresConfirmation', true);
        expect(state.passwords).toEqual([]);
        expect(state.writes).toEqual([]);
    });

    it.each(['read:user_profiles', 'read:roles', 'read:shops', 'authRead'])('denies AI invite on %s errors', async (operation) => {
        state.errors[operation] = failure;
        expect(await inviteUser(shopId, invite, true, 'actor')).toHaveProperty('error');
        expect(state.writes).toEqual([]);
    });

    it('does not change an existing role when membership creation fails', async () => {
        state.errors['insert:shop_members'] = failure;
        expect(await provisionUserAccess(db as never, provisioning)).toHaveProperty('error');
        expect(writesTo('user_roles')).toEqual([]);
        expect(state.authDeletes).toEqual([]);
    });

    it('removes only a newly added membership if role assignment fails', async () => {
        state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, provisioning)).toHaveProperty('error');
        expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('preserves an existing membership when role assignment fails', async () => {
        state.membership = true; state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, provisioning)).toHaveProperty('error');
        expect(writesTo('shop_members')).toEqual([]);
    });

    it('does not delete a concurrent membership on role failure', async () => {
        state.errors['insert:shop_members'] = { message: 'concurrent membership', code: '23505' };
        state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, provisioning)).toHaveProperty('error');
        expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert']);
    });

    it('rolls back a newly created Auth account after a profile error', async () => {
        state.profileId = null; state.errors['upsert:user_profiles'] = failure;
        expect(await inviteUser(shopId, invite, true, 'actor')).toHaveProperty('error');
        expect(state.authDeletes).toEqual(['new-user']);
        expect(writesTo('user_roles')).toEqual([]);
    });

    it('API invite preserves an existing unconfirmed Auth account and profile after provisioning fails', async () => {
        state.errors['insert:shop_members'] = failure;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.linkTypes).toEqual(['invite']);
        expect(state.authDeletes).toEqual([]);
        expect(writesTo('user_profiles')).toEqual([]);
        expect(state.emails).toBe(0);
    });

    it('API invite grants access to an existing unconfirmed account without rewriting its profile', async () => {
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify({ ...invite, full_name: 'Changed name' }),
        }));
        expect(response.status).toBe(200);
        expect(state.linkTypes).toEqual(['invite']);
        expect(state.authUpdates).toBe(0);
        expect(state.linkInputs[0].options).not.toHaveProperty('data');
        expect(writesTo('user_profiles')).toEqual([]);
        expect(writesTo('user_roles')[0].payload).toEqual({ user_id: 'target', role: 'viewer' });
        expect(state.authDeletes).toEqual([]);
    });

    it('API invite rolls back only its explicitly created Auth account after provisioning fails', async () => {
        state.apiTargetExists = false; state.linkUserId = state.createdUserId;
        state.errors['insert:shop_members'] = failure;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authCreates).toEqual([{ email: invite.email, email_confirm: false, user_metadata: { full_name: invite.email } }]);
        expect(state.authDeletes).toEqual(['created-target']);
        expect(state.emails).toBe(0);
    });

    it('API invite completes new-account creation with an unconfirmed identity and invite link', async () => {
        state.apiTargetExists = false; state.linkUserId = state.createdUserId;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, mode: 'invite' });
        expect(state.linkInputs[0].options).toHaveProperty('data', { full_name: invite.email });
        expect(writesTo('user_profiles')[0].payload).toMatchObject({ id: state.createdUserId, email: invite.email });
        expect(writesTo('user_roles')[0].payload).toEqual({ user_id: state.createdUserId, role: 'viewer' });
        expect(state.authDeletes).toEqual([]);
        expect(state.emails).toBe(1);
    });

    it('API invite uses a magiclink for an existing confirmed account without resetting credentials', async () => {
        state.linkMode = 'magiclink';
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ success: true, mode: 'magiclink' });
        expect(state.linkTypes).toEqual(['invite', 'magiclink']);
        expect(state.passwords).toEqual([]);
        expect(state.authUpdates).toBe(0);
        expect(writesTo('user_profiles')).toEqual([]);
        expect(state.authDeletes).toEqual([]);
    });

    it.each([true, false])('missing invite link preserves existing accounts and rolls back owned accounts (existing: %s)', async (existing) => {
        state.apiTargetExists = existing; state.missingLink = true;
        state.linkUserId = existing ? 'target' : state.createdUserId;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authDeletes).toEqual(existing ? [] : ['created-target']);
        expect(state.writes).toEqual([]);
        expect(state.emails).toBe(0);
    });

    it('rejects mismatched link identity and rolls back only the known created account', async () => {
        state.apiTargetExists = false;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authDeletes).toEqual(['created-target']);
        expect(state.writes).toEqual([]);
        expect(state.emails).toBe(0);
    });

    it.each(['link', 'linkThrow'])('rolls back an owned account on %s generation failure', async (operation) => {
        state.apiTargetExists = false; state.errors[operation] = failure;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authDeletes).toEqual(['created-target']);
        expect(state.writes).toEqual([]);
    });

    it('reports an owned invite account cleanup failure explicitly', async () => {
        state.apiTargetExists = false; state.missingLink = true; state.errors.authDelete = failure;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(await response.json()).toHaveProperty('partial_failure', true);
        expect(state.authDeletes).toEqual(['created-target']);
    });

    it('reports a partial failure if new account cleanup fails', async () => {
        state.errors['upsert:user_profiles'] = failure; state.errors.authDelete = failure;
        expect(await provisionUserAccess(db as never, { ...provisioning, isNew: true })).toHaveProperty('partial_failure', true);
    });
});

describe('role assignment fallback', () => {
    it.each(Object.keys(ROLE_PERMISSIONS))('only retains the super_admin fallback when %s has no role row', async (role) => {
        state.roleExists = false;
        expect(await isAssignableRole(db as never, role)).toBe(role === 'super_admin');
    });

    it.each(['unknown_role', 'constructor', 'toString'])('rejects missing custom or inherited role names: %s', async (role) => {
        state.roleExists = false;
        expect(await isAssignableRole(db as never, role)).toBe(false);
    });

    it('denies built-in assignment when role reads fail', async () => {
        state.errors['read:roles'] = failure;
        await expect(isAssignableRole(db as never, 'super_admin')).rejects.toEqual(failure);
        expect(state.writes).toEqual([]);
    });
});

describe('AI role creation', () => {
    it.each([{ modules: ['unknown'] }, { modules: ['reports', 'reports'] }])('rejects invalid modules $modules before any write', async ({ modules }) => {
        expect(await createRole(shopId, { ...newRole, modules }, true)).toHaveProperty('error');
        expect(state.writes).toEqual([]);
    });
    it('creates a validated role and module grants', async () => {
        expect(await createRole(shopId, newRole, true)).toHaveProperty('success', true);
        expect(writesTo('role_permissions')[0].payload).toEqual([{ role_id: 'role-id', module: 'reports' }]);
    });
    it('rolls back a role if permission creation fails', async () => {
        state.errors['insert:role_permissions'] = failure;
        expect(await createRole(shopId, newRole, true)).toHaveProperty('error');
        expect(writesTo('roles').map(write => write.operation)).toEqual(['insert', 'delete']);
    });
    it('reports a partial failure if permission rollback also fails', async () => {
        state.errors['insert:role_permissions'] = failure; state.errors['delete:roles'] = failure;
        expect(await createRole(shopId, newRole, true)).toHaveProperty('partial_failure', true);
    });
});
