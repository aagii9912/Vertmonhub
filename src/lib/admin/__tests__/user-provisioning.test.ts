// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    profileId: 'target' as string | null,
    fullName: 'Бат' as string | null,
    roster: [] as Array<{ shop_id: string; name: string; user_id: string | null; is_active: boolean }>,
    rosterRace: false,
    roleExists: true,
    membership: false,
    actorAccess: true,
    shopId: '10000000-0000-4000-8000-000000000001',
    linkMode: 'invite' as 'invite' | 'magiclink',
    linkUserId: 'target',
    apiTargetExists: true,
    createdUserId: 'created-target',
    missingTokenHash: false,
    wrongVerificationType: false,
    tokenHash: 'synthetic-token-hash',
    linkTypes: [] as string[],
    linkInputs: [] as Array<{ type: string; options?: { data?: unknown } }>,
    authCreates: [] as Array<Record<string, unknown>>,
    errors: {} as Record<string, { message: string; code?: string }>,
    writes: [] as Array<{ operation: string; table: string; payload: unknown; filters?: Record<string, unknown> }>,
    passwords: [] as string[],
    authDeletes: [] as string[],
    authUpdates: 0,
    emails: 0,
    emailLinks: [] as string[],
    projects: [] as Array<{ id: string }>,
}));
const shopId = '10000000-0000-4000-8000-000000000001';
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/auth/supabase-auth', () => ({ supabaseAdmin: () => db, getUserId: async () => 'actor' }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'actor', email: 'actor@example.com', role: 'super_admin' }) }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: async () => {} }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: async () => {} }));
vi.mock('@/lib/email/email', () => ({ sendInviteEmail: async (input: { actionLink: string }) => {
    state.emails++;
    state.emailLinks.push(input.actionLink);
    return true;
} }));

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
                : { data: { user: { id: state.linkUserId }, properties: {
                    action_link: 'https://example.invalid/link',
                    hashed_token: state.missingTokenHash ? undefined : state.tokenHash,
                    verification_type: state.wrongVerificationType ? 'recovery' : input.type,
                } }, error: null };
        },
    } },
    from(table: string) {
        const filters: Record<string, unknown> = {};
        let limit = Infinity;
        let operation = 'read';
        let payload: unknown;
        const result = (single = false) => {
            if (operation !== 'read') state.writes.push({ operation, table, payload, filters: { ...filters } });
            const error = state.errors[`${operation}:${table}`] || null;
            // Шинэ профайлын upsert-ийн дараах уншилт тэр профайлыг харна (бодит DB-тэй адил).
            if (operation === 'upsert' && table === 'user_profiles' && !error) {
                const profile = payload as { id: string; full_name: string };
                state.profileId = profile.id; state.fullName = profile.full_name;
            }
            let data: unknown = null;
            if (table === 'roles' && state.roleExists) data = { id: 'role-id', name: 'analyst' };
            if (table === 'shops') data = (filters.id && filters.id !== state.shopId) || (filters.user_id && !state.actorAccess)
                ? null : { id: state.shopId };
            if (table === 'shop_members' && state.membership && filters.user_id !== 'actor') data = { id: 'existing-membership' };
            if (table === 'user_profiles' && state.profileId) data = { id: state.profileId, email: 'target@example.com', full_name: state.fullName };
            if (table === 'projects') data = state.projects.slice(0, limit);
            if (table === 'sales_managers') {
                const matched = state.roster.filter(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value));
                if (!error && (operation === 'read' || !state.rosterRace)) {
                    if (operation === 'insert') {
                        state.roster.push(payload as typeof state.roster[number]);
                        data = single ? payload : [payload];
                    } else {
                        if (operation === 'update') matched.forEach(row => Object.assign(row, payload));
                        if (operation === 'delete') state.roster = state.roster.filter(row => !matched.includes(row));
                        const copies = matched.slice(0, limit).map(row => ({ ...row }));
                        data = single ? copies[0] || null : copies;
                    }
                }
            }
            return { data, error };
        };
        const query = {
            select: () => query,
            eq: (field: string, value: unknown) => { filters[field] = value; return query; },
            limit: (value: number) => { limit = value; return query; },
            order: () => query,
            is: (field: string, value: unknown) => { filters[field] = value; return query; },
            insert: (value: unknown) => { operation = 'insert'; payload = value; return query; },
            update: (value: unknown) => { operation = 'update'; payload = value; return query; },
            upsert: (value: unknown) => { operation = 'upsert'; payload = value; return query; },
            delete: () => { operation = 'delete'; return query; },
            maybeSingle: async () => result(true),
            single: async () => result(true),
            then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    },
};

import { adminUserInput, isAssignableRole, provisionUserAccess, resolveTargetShop } from '../user-provisioning';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { assignRole, createRole, inviteUser } from '@/lib/ai/data-assistant/admin-functions';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { TOOL_DEFINITIONS } from '@/lib/ai/data-assistant/tools';
import { POST as inviteApi } from '@/app/api/admin/users/invite/route';
import { POST as createApi, PATCH as roleApi } from '@/app/api/admin/users/route';

const invite = { email: 'target@example.com', role: 'viewer', shop_id: shopId };
const newRole = { name: 'analyst', display_name_mn: 'Аналист', modules: ['reports'] };
const provisioning = { actorId: 'actor', userId: 'target', email: invite.email, role: 'viewer', shopId, isNew: false };
const failure = { message: 'synthetic database failure' };
const writesTo = (table: string) => state.writes.filter(write => write.table === table);

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.profileId = 'target'; state.roleExists = true; state.membership = false; state.actorAccess = true;
    state.shopId = shopId;
    state.fullName = 'Бат'; state.roster = []; state.rosterRace = false;
    state.linkMode = 'invite'; state.linkUserId = 'target'; state.errors = {}; state.writes = [];
    state.apiTargetExists = true; state.createdUserId = 'created-target'; state.missingTokenHash = false;
    state.wrongVerificationType = false; state.tokenHash = 'synthetic-token-hash';
    state.linkTypes = []; state.linkInputs = []; state.authCreates = [];
    state.passwords = []; state.authDeletes = []; state.authUpdates = 0; state.emails = 0; state.emailLinks = [];
    state.projects = [];
});

afterEach(() => vi.unstubAllEnvs());

describe('existing shop GUID validation', () => {
    const legacyShopId = '00000000-0000-0000-0000-000000000001';

    it('accepts a PostgreSQL UUID without RFC version bits and still requires the shop to exist', async () => {
        state.shopId = legacyShopId;
        expect(adminUserInput.safeParse({ ...invite, shop_id: legacyShopId }).success).toBe(true);
        expect(await resolveTargetShop(db as never, legacyShopId)).toEqual({ id: legacyShopId });
        expect(await resolveTargetShop(db as never, '00000000-0000-0000-0000-000000000002'))
            .toHaveProperty('error', 'Сонгосон төсөл олдсонгүй');
        expect(state.writes).toEqual([]);
    });

    it.each(['not-a-guid', '00000000-0000-0000-0000-00000000000g'])('rejects malformed shop IDs: %s', async invalidId => {
        expect(adminUserInput.safeParse({ ...invite, shop_id: invalidId }).success).toBe(false);
        expect(await resolveTargetShop(db as never, invalidId)).toHaveProperty('error', 'Төслийн ID буруу байна');
        expect(state.writes).toEqual([]);
    });

    it.each(['create', 'invite'] as const)('provisions the selected legacy shop through the %s API', async mode => {
        state.shopId = legacyShopId;
        // Password verification cannot call an external Auth server in this regression.
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
        try {
            const response = await (mode === 'create' ? createApi : inviteApi)(new NextRequest(`http://localhost/api/admin/users${mode === 'invite' ? '/invite' : ''}`, {
                method: 'POST', body: JSON.stringify({ ...invite, shop_id: legacyShopId, ...(mode === 'create' ? { password: 'synthetic-password' } : {}) }),
            }));
            expect(response.status).toBe(mode === 'create' ? 201 : 200);
            expect(await response.json()).toHaveProperty('success', true);
            expect(writesTo('shop_members')[0].payload).toMatchObject({ shop_id: legacyShopId });
            expect(writesTo('user_roles')).toHaveLength(1);
            expect(state.authDeletes).toEqual([]);
        } finally { vi.unstubAllEnvs(); }
    });
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

    it.each(['invite', 'magiclink'] as const)('sends and returns an SSR callback link for %s without a recipient PKCE verifier', async (mode) => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hub.example.invalid');
        state.linkMode = mode;
        state.tokenHash = 'synthetic+hash/token?&';
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(200);
        const result = await response.json();
        const callback = new URL(result.action_link);
        expect(callback.origin).toBe('https://hub.example.invalid');
        expect(callback.pathname).toBe('/auth/callback');
        expect(callback.hash).toBe('');
        expect([...callback.searchParams]).toEqual([['token_hash', state.tokenHash], ['type', mode]]);
        expect(state.emailLinks).toEqual([result.action_link]);
    });

    it.each([true, false])('missing callback token preserves existing accounts and rolls back owned accounts (existing: %s)', async (existing) => {
        state.apiTargetExists = existing; state.missingTokenHash = true;
        state.linkUserId = existing ? 'target' : state.createdUserId;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authDeletes).toEqual(existing ? [] : ['created-target']);
        expect(state.writes).toEqual([]);
        expect(state.emails).toBe(0);
    });

    it('rejects mismatched verification types before provisioning or emailing', async () => {
        state.apiTargetExists = false; state.linkUserId = state.createdUserId; state.wrongVerificationType = true;
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify(invite),
        }));
        expect(response.status).toBe(500);
        expect(state.authDeletes).toEqual(['created-target']);
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
        state.apiTargetExists = false; state.missingTokenHash = true; state.errors.authDelete = failure;
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

describe('sales manager access provisioning', () => {
    const managerInput = { ...provisioning, role: 'sales_manager' };
    const row = (overrides: Partial<typeof state.roster[number]> = {}) => ({ shop_id: shopId, name: 'Бат', user_id: null, is_active: false, ...overrides });

    it('API role assignment grants selected-shop membership and active manager identity together', async () => {
        const targetId = '20000000-0000-4000-8000-000000000001';
        state.profileId = targetId;
        const response = await roleApi(new NextRequest('http://localhost/api/admin/users', {
            method: 'PATCH', body: JSON.stringify({ userId: targetId, role: 'sales_manager', shop_id: shopId }),
        }));
        expect(response.status).toBe(200);
        expect(state.roster).toEqual([row({ user_id: targetId, is_active: true })]);
        expect(state.writes.map(write => write.table)).toEqual(['shop_members', 'sales_managers', 'user_roles']);
        expect(writesTo('user_profiles')).toEqual([]);
    });

    it('API invitation links the existing manager profile name (not the typed one) before returning its callback link', async () => {
        const response = await inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
            method: 'POST', body: JSON.stringify({ ...invite, role: 'sales_manager', full_name: 'Өөр нэр', phone: '99112233' }),
        }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true, action_link: 'http://localhost/auth/callback?token_hash=synthetic-token-hash&type=invite',
        });
        expect(state.roster).toEqual([row({ user_id: 'target', is_active: true })]);
        expect(state.authUpdates).toBe(0);
        expect(writesTo('user_profiles')).toEqual([]);
        expect(state.emails).toBe(1);
    });

    it('creates an active roster linked to the existing profile name and selected shop', async () => {
        expect(await provisionUserAccess(db as never, { ...managerInput, fullName: 'Өөр нэр' })).toBeNull();
        expect(state.roster).toEqual([row({ user_id: 'target', is_active: true })]);
        expect(writesTo('user_profiles')).toEqual([]);
        expect(state.writes.map(write => write.table)).toEqual(['shop_members', 'sales_managers', 'user_roles']);
    });

    it('links the manager to the single project of the shop (shop = project) in the same provisioning', async () => {
        state.projects = [{ id: 'project-1' }];
        expect(await provisionUserAccess(db as never, managerInput)).toBeNull();
        expect(state.writes.map(write => write.table)).toEqual(['shop_members', 'sales_managers', 'sales_manager_projects', 'user_roles']);
        expect(writesTo('sales_manager_projects')[0]).toMatchObject({ operation: 'insert', payload: { shop_id: shopId, manager_name: 'Бат', project_id: 'project-1' } });
    });

    it('rolls the project link back with the roster when the role write fails', async () => {
        state.projects = [{ id: 'project-1' }];
        state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, managerInput)).toMatchObject({ status: 500 });
        expect(writesTo('sales_manager_projects').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('claims and activates one unlinked matching roster without creating another identity', async () => {
        state.roster = [row()];
        expect(await provisionUserAccess(db as never, managerInput)).toBeNull();
        expect(state.roster).toEqual([row({ user_id: 'target', is_active: true })]);
        expect(writesTo('sales_managers')[0]).toMatchObject({ operation: 'update', filters: { shop_id: shopId, name: 'Бат', user_id: null, is_active: false } });
    });

    it('reactivates an existing account link and preserves its canonical historical name', async () => {
        state.roster = [row({ name: 'Канон Бат', user_id: 'target' })];
        expect(await provisionUserAccess(db as never, managerInput)).toBeNull();
        expect(state.roster).toEqual([row({ name: 'Канон Бат', user_id: 'target', is_active: true })]);
    });

    it('retains an already active linked roster without rewriting it', async () => {
        state.roster = [row({ user_id: 'target', is_active: true })];
        expect(await provisionUserAccess(db as never, managerInput)).toBeNull();
        expect(writesTo('sales_managers')).toEqual([]);
    });

    it.each([null, '', 'target@example.com'])('requires a real profile name (%s)', async name => {
        state.fullName = name;
        expect(await provisionUserAccess(db as never, managerInput)).toMatchObject({ status: 400 });
        expect(state.writes).toEqual([]);
    });

    it('never borrows another linked account with the same name', async () => {
        state.roster = [row({ user_id: 'someone-else', is_active: true })];
        expect(await provisionUserAccess(db as never, managerInput)).toMatchObject({ status: 409 });
        expect(state.writes).toEqual([]);
        expect(state.roster[0].user_id).toBe('someone-else');
    });

    it('refuses ambiguous multiple account links before changing memberships or roles', async () => {
        state.roster = [row({ user_id: 'target' }), row({ name: 'Өөр нэр', user_id: 'target' })];
        expect(await provisionUserAccess(db as never, managerInput)).toMatchObject({ status: 409 });
        expect(state.writes).toEqual([]);
    });

    it('rolls back membership when a conditional roster claim loses a concurrent edit', async () => {
        state.roster = [row()]; state.rosterRace = true;
        expect(await provisionUserAccess(db as never, managerInput)).toMatchObject({ status: 409 });
        expect(state.roster).toEqual([row()]);
        expect(writesTo('user_roles')).toEqual([]);
        expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('does not link a same-name roster from another shop', async () => {
        state.roster = [row({ shop_id: 'another-shop', user_id: 'someone-else' })];
        expect(await provisionUserAccess(db as never, managerInput)).toBeNull();
        expect(state.roster).toHaveLength(2);
        expect(state.roster[0].user_id).toBe('someone-else');
        expect(state.roster[1]).toEqual(row({ user_id: 'target', is_active: true }));
    });

    it.each(['read:user_profiles', 'read:sales_managers', 'insert:sales_managers'])('fails closed and rolls back membership on %s', async operation => {
        state.errors[operation] = failure;
        expect(await provisionUserAccess(db as never, managerInput)).toHaveProperty('error');
        expect(writesTo('user_roles')).toEqual([]);
        expect(state.roster).toEqual([]);
        if (operation === 'insert:sales_managers') expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('preserves the previous inactive/unlinked roster when role assignment fails', async () => {
        state.roster = [row()]; state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, managerInput)).toHaveProperty('error');
        expect(state.roster).toEqual([row()]);
        expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('removes its new roster on role failure without touching another shop', async () => {
        state.roster = [row({ shop_id: 'another-shop' })]; state.errors['upsert:user_roles'] = failure;
        expect(await provisionUserAccess(db as never, managerInput)).toHaveProperty('error');
        expect(state.roster).toEqual([row({ shop_id: 'another-shop' })]);
    });

    it('surfaces a roster cleanup failure while still removing its added membership', async () => {
        state.errors['upsert:user_roles'] = failure; state.errors['delete:sales_managers'] = failure;
        expect(await provisionUserAccess(db as never, managerInput)).toHaveProperty('partial_failure', true);
        expect(writesTo('shop_members').map(write => write.operation)).toEqual(['insert', 'delete']);
    });

    it('AI assign_role provisions the manager identity through the same helper', async () => {
        expect(await assignRole(shopId, { ...invite, role: 'sales_manager' }, true, 'actor')).toHaveProperty('success', true);
        expect(state.roster).toEqual([row({ user_id: 'target', is_active: true })]);
    });
});

describe('staff name and phone (user setup)', () => {
    const managerInvite = { ...invite, role: 'sales_manager' };
    const inviteRequest = (body: object) => inviteApi(new NextRequest('http://localhost/api/admin/users/invite', {
        method: 'POST', body: JSON.stringify(body),
    }));

    it.each([{}, { full_name: '   ' }, { full_name: 'TARGET@example.com' }])('API invite refuses a nameless sales manager before Auth or links (%j)', async extra => {
        const response = await inviteRequest({ ...managerInvite, ...extra });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Борлуулалтын менежерийн бодит нэрийг оруулна уу' });
        expect(state.authCreates).toEqual([]);
        expect(state.linkTypes).toEqual([]);
        expect(state.writes).toEqual([]);
        expect(state.emails).toBe(0);
    });

    it('API invite refuses a malformed phone with a phone-specific message before Auth', async () => {
        const response = await inviteRequest({ ...managerInvite, full_name: 'Шинэ Менежер', phone: '9911223' });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Утасны дугаар 8 оронтой байх ёстой' });
        expect(state.authCreates).toEqual([]);
    });

    it('API invite stores the normalized phone and real name on a new manager profile', async () => {
        state.apiTargetExists = false; state.linkUserId = state.createdUserId; state.profileId = null;
        const response = await inviteRequest({ ...managerInvite, email: ' New.Manager@Example.com ', full_name: 'Шинэ Менежер', phone: '+976 9911-2233' });
        expect(response.status).toBe(200);
        expect(state.authCreates[0]).toMatchObject({ email: 'new.manager@example.com', user_metadata: { full_name: 'Шинэ Менежер' } });
        expect(writesTo('user_profiles')[0].payload).toEqual({
            id: state.createdUserId, email: 'new.manager@example.com', full_name: 'Шинэ Менежер', phone: '99112233',
        });
        expect(state.roster).toEqual([{ shop_id: shopId, name: 'Шинэ Менежер', user_id: state.createdUserId, is_active: true }]);
    });

    it('a new profile without a phone does not write the phone column', async () => {
        expect(await provisionUserAccess(db as never, { ...provisioning, isNew: true, phone: null })).toBeNull();
        expect(writesTo('user_profiles')[0].payload).toEqual({ id: 'target', email: invite.email, full_name: invite.email });
    });

    it('AI invite_user refuses a nameless new sales manager before the confirmation preview', async () => {
        state.profileId = null;
        const result = await inviteUser(shopId, managerInvite, false, 'actor');
        expect(result).toEqual({ error: 'Борлуулалтын менежерийн бодит нэрийг оруулна уу' });
        expect(state.writes).toEqual([]);
    });

    it('AI invite_user previews and creates a sales manager with full name and phone', async () => {
        state.profileId = null;
        const args = { ...managerInvite, full_name: 'Шинэ Менежер', phone: '9911 2233' };
        const preview = await inviteUser(shopId, args, false, 'actor') as { action: { args: Record<string, unknown> }; preview: Record<string, unknown> };
        expect(preview.action.args).toEqual({ email: invite.email, role: 'sales_manager', full_name: 'Шинэ Менежер', phone: '99112233', shop_id: shopId });
        expect(preview.preview).toMatchObject({ Нэр: 'Шинэ Менежер', Утас: '9911 2233', Төсөл: shopId });
        expect(state.writes).toEqual([]);

        const result = await executeDataTool('invite_user', preview.action.args, shopId,
            { role: 'super_admin', canWrite: true, canDelete: true }, 'actor', true);
        expect(result).toHaveProperty('success', true);
        expect(writesTo('user_profiles')[0].payload).toMatchObject({ full_name: 'Шинэ Менежер', phone: '99112233' });
        expect(state.roster).toEqual([{ shop_id: shopId, name: 'Шинэ Менежер', user_id: 'new-user', is_active: true }]);
        expect(result.message).not.toContain('Тохиргоо');
    });

    it('AI invite_user keeps an existing profile and says so in the preview', async () => {
        const preview = await inviteUser(shopId, { ...invite, phone: '99112233' }, false, 'actor');
        expect(preview).toMatchObject({ preview: { Профайл: 'Бүртгэлтэй — нэр, утас өөрчлөгдөхгүй' } });
        expect(await inviteUser(shopId, { ...invite, phone: '99112233' }, true, 'actor')).toHaveProperty('success', true);
        expect(writesTo('user_profiles')).toEqual([]);
    });

    it('AI assign_role carries the explicit manager project from preview to execution', async () => {
        const preview = await assignRole(shopId, { ...invite, role: 'sales_manager', shop_id: shopId }, false, 'actor') as { action: { args: Record<string, unknown> } };
        expect(preview.action.args).toEqual({ email: invite.email, role: 'sales_manager', shop_id: shopId });
        expect(state.writes).toEqual([]);
        // Баталгаажуулалт өөр (одоогийн) төсөл дээр ирсэн ч сонгосон төсөлд холбоно.
        expect(await assignRole('another-current-shop', preview.action.args, true, 'actor')).toHaveProperty('success', true);
        expect(writesTo('shop_members')[0].payload).toMatchObject({ shop_id: shopId, user_id: 'target' });
    });

    it('AI tool schemas expose full name, phone and the manager project', () => {
        const props = (name: string) => Object.keys(
            (TOOL_DEFINITIONS.find(tool => tool.name === name)?.parameters?.properties as Record<string, unknown> | undefined) || {});
        expect(props('invite_user')).toEqual(expect.arrayContaining(['email', 'full_name', 'phone', 'role', 'shop_id']));
        expect(props('assign_role')).toEqual(expect.arrayContaining(['email', 'role', 'shop_id']));
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
