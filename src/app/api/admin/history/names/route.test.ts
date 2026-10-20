// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({
    userId: 'admin-user' as string | null,
    superAdmin: true,
    shop: { id: 'shop-1', name: 'Mandala Garden' } as { id: string; name: string } | null,
    db: null as unknown as MemoryDb,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => state.userId, getUserShop: async () => state.shop }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => (state.superAdmin ? { id: state.userId, role: 'super_admin' } : null) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET as GET_NAMES } from './route';

const MANAGER = 'Б.Ариунаа';

beforeEach(() => {
    state.userId = 'admin-user';
    state.superAdmin = true;
    state.shop = { id: 'shop-1', name: 'Mandala Garden' };
    state.db = createMemoryDb({
        user_profiles: [{ id: 'ariuna-user', full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' }],
        sales_managers: [
            { shop_id: 'shop-1', name: MANAGER, user_id: 'ariuna-user', is_active: true },
            { shop_id: 'shop-2', name: 'Өөр төслийн', user_id: null, is_active: true },
        ],
        sales_manager_projects: [{ shop_id: 'shop-1', manager_name: MANAGER, project_id: 'p1' }],
        leads: [
            { id: 'lead-1', shop_id: 'shop-1', sales_manager_name: 'Ариунаа Батболд', deleted_at: null },
            { id: 'lead-2', shop_id: 'shop-2', sales_manager_name: 'Өөр төслийн хүн', deleted_at: null },
        ],
        property_viewings: [], property_contracts: [], daily_report_counts: [], service_logs: [],
    });
});

describe('GET /api/admin/history/names', () => {
    it('super admin-д төслийн бүртгэл ба бүртгэлд байхгүй нэр', async () => {
        const response = await GET_NAMES();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.unknown).toEqual([{ name: 'Ариунаа Батболд', counts: { leads: 1 }, total: 1, similar: [MANAGER] }]);
        expect(body.roster).toEqual([expect.objectContaining({ name: MANAGER, linked: true, profileName: 'Ариунаа Батболд', projects: 1 })]);
        expect(body.unavailable).toEqual([]);
    });

    it('эрхгүй 401/403, DB алдаа 503', async () => {
        state.superAdmin = false;
        expect((await GET_NAMES()).status).toBe(403);
        state.superAdmin = true;
        state.shop = null;
        expect((await GET_NAMES()).status).toBe(403);
        state.userId = null;
        expect((await GET_NAMES()).status).toBe(401);
        state.userId = 'admin-user';
        state.shop = { id: 'shop-1', name: 'Mandala Garden' };
        state.db.failNext.property_viewings = { code: '57014', message: 'timeout' };
        const failed = await GET_NAMES();
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'Менежерийн нэрийн зөрүүг уншиж чадсангүй' });
    });
});
