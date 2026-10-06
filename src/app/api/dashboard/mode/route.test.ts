import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    perms: null as { role: string; permissions: { modules: string[] } } | null,
    isManager: false,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-a' }), getUserId: async () => 'user-a' }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: async () => state.perms }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/sales/manager-identity', () => ({ resolveManagerIdentity: async () => ({ isManager: state.isManager, managerName: state.isManager ? 'Номин' : null }) }));

import { GET } from './route';

const perms = (role: string, modules: string[]) => ({ role, permissions: { modules } });

beforeEach(() => { state.isManager = false; });

describe('GET /api/dashboard/mode', () => {
    it('gives a marketing employee the marketing face of the org dashboard', async () => {
        state.perms = perms('marketing', ['dashboard', 'marketing-roi', 'reports', 'leads']);
        expect(await (await GET()).json()).toMatchObject({ mode: 'org', face: 'marketing', canViewTeam: true });
    });

    it('keeps the director face for admins and for a marketing role without the marketing report', async () => {
        state.perms = perms('admin', ['dashboard', 'reports', 'marketing-roi']);
        expect(await (await GET()).json()).toMatchObject({ mode: 'org', face: 'director' });
        state.perms = perms('marketing', ['dashboard', 'reports']);
        expect(await (await GET()).json()).toMatchObject({ mode: 'org', face: 'director' });
    });

    it('sends a registered sales manager to the personal Today', async () => {
        state.perms = perms('marketing', ['dashboard', 'marketing-roi']);
        state.isManager = true;
        expect(await (await GET()).json()).toMatchObject({ mode: 'personal', managerName: 'Номин', face: 'director' });
    });
});
