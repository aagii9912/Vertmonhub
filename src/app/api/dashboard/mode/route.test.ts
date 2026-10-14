// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_PERMISSIONS } from '@/lib/rbac';

const state = vi.hoisted(() => ({ role: 'marketing', modules: [] as string[], isManager: false, signedIn: true }));

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserShop: async () => state.signedIn ? { id: 'shop-1' } : null,
    getUserId: async () => state.signedIn ? 'user-1' : null,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
}));
vi.mock('@/lib/sales/manager-identity', () => ({
    resolveManagerIdentity: async () => ({ isManager: state.isManager, managerName: state.isManager ? 'Номин' : null }),
}));

const { GET } = await import('./route');
const mode = async () => (await GET()).json();
const as = (role: keyof typeof ROLE_PERMISSIONS, isManager = false) => {
    state.role = role;
    state.modules = [...ROLE_PERMISSIONS[role].modules];
    state.isManager = isManager;
};

describe('GET /api/dashboard/mode', () => {
    beforeEach(() => { state.signedIn = true; });

    it('opens the marketing dashboard for the marketing role without changing the report mode', async () => {
        as('marketing');
        expect(await mode()).toMatchObject({ mode: 'org', marketingHome: true, canViewMarketing: true, canViewTeam: true });
    });

    it('lets directors switch to the marketing dashboard but keeps their sales home', async () => {
        as('admin');
        expect(await mode()).toMatchObject({ mode: 'org', marketingHome: false, canViewMarketing: true });
        as('super_admin');
        expect(await mode()).toMatchObject({ mode: 'org', marketingHome: false, canViewMarketing: true });
    });

    it('keeps sales managers on their personal Today dashboard', async () => {
        as('sales_manager', true);
        expect(await mode()).toMatchObject({ mode: 'personal', marketingHome: false, canViewMarketing: false });
        // Маркетинг дүртэй боловч менежерийн бүртгэлд холбогдсон бол хувийн «Өнөөдөр» хэвээр.
        as('marketing', true);
        expect(await mode()).toMatchObject({ mode: 'personal', marketingHome: false, canViewMarketing: false });
    });

    it('does not offer the marketing dashboard without the marketing module', async () => {
        as('viewer');
        state.modules = state.modules.filter(module => module !== 'marketing-roi');
        expect(await mode()).toMatchObject({ mode: 'org', marketingHome: false, canViewMarketing: false });
        state.role = 'marketing';
        expect(await mode()).toMatchObject({ marketingHome: false, canViewMarketing: false });
    });

    it('answers signed-out callers without marketing flags', async () => {
        state.signedIn = false;
        expect(await mode()).toMatchObject({ mode: 'org', marketingHome: false, canViewMarketing: false });
    });
});
