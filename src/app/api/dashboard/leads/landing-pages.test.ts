// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ role: 'sales_manager', db: null as unknown as MemoryDb }));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null,
    requireModuleWrite: async () => null,
    requireAnyModule: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: ['leads'], canWrite: true, canDelete: false } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET as list } from './route';
import { GET as landingPages } from './landing-pages/route';

const elysium = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const request = (path: string) => new NextRequest(`http://localhost/api/dashboard/leads${path}`);
const lead = (id: string, extra: Record<string, unknown>) => ({
    id, shop_id: 'shop-1', project_id: elysium, status: 'new', deleted_at: null, customer_name: id, created_at: '2026-10-10T00:00:00Z', ...extra,
});
const social = { landing_page: 'event/social', landing_page_name: 'Social Media uulzalt towloh', landing_page_url: 'https://elysium.mn/social', landing_page_purpose: 'social_ad' };

beforeEach(() => {
    state.role = 'sales_manager';
    state.db = createMemoryDb({
        user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
        projects: [{ id: elysium, shop_id: 'shop-1', name: 'Elysium' }, { id: other, shop_id: 'shop-1', name: 'Mandala' }],
        sales_managers: [{ shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop-1', manager_name: 'Манда', project_id: elysium }],
        leads: [
            lead('own-social', { ...social, sales_manager_name: 'Манда', created_at: '2026-10-11T00:00:00Z' }),
            lead('own-social-old', { ...social, landing_page_name: 'Хуучин нэр', landing_page_url: null, sales_manager_name: 'Манда' }),
            lead('own-site', { landing_page: 'site', landing_page_name: 'Үндсэн сайт', sales_manager_name: 'Манда' }),
            lead('own-staff', { sales_manager_name: 'Манда' }),
            lead('colleague-yarmag', { landing_page: 'event/yarmag', landing_page_name: 'Ярмаг', landing_page_purpose: 'event', sales_manager_name: 'Хамтрагч' }),
            lead('deleted-social', { ...social, sales_manager_name: 'Манда', deleted_at: '2026-10-12T00:00:00Z' }),
            lead('other-project', { landing_page: 'event/mandala', landing_page_name: 'Mandala', project_id: other, sales_manager_name: 'Манда' }),
        ],
    });
});

describe('lead landing page filter', () => {
    it('lists only landing pages of leads the caller may see, with the newest name and the main site last', async () => {
        const res = await landingPages(request('/landing-pages'));
        expect(res.status).toBe(200);
        expect((await res.json()).landingPages).toEqual([
            { key: 'event/social', name: 'Social Media uulzalt towloh', url: 'https://elysium.mn/social', purpose: 'social_ad', leads: 2 },
            { key: 'site', name: 'Үндсэн сайт', url: null, purpose: null, leads: 1 },
        ]);
    });

    it('lets an admin see every page and narrows by project', async () => {
        state.role = 'admin';
        const all = (await (await landingPages(request('/landing-pages'))).json()).landingPages.map((page: { key: string }) => page.key);
        // Ижил тоотой хуудас монгол цагаан толгойгоор (кирилл латинаас өмнө), үндсэн сайт сүүлд.
        expect(all).toEqual(['event/social', 'event/yarmag', 'event/mandala', 'site']);
        const mandala = await (await landingPages(request(`/landing-pages?project=${other}`))).json();
        expect(mandala.landingPages.map((page: { key: string }) => page.key)).toEqual(['event/mandala']);
        expect((await landingPages(request('/landing-pages?project=bad'))).status).toBe(400);
    });

    it('rejects a project outside a manager scope', async () => {
        expect((await landingPages(request(`/landing-pages?project=${other}`))).status).toBe(403);
    });

    it('filters the lead list by landing page inside the caller scope', async () => {
        const ids = async (path: string) => (await (await list(request(path))).json()).leads.map((row: { id: string }) => row.id).sort();
        expect(await ids('?landing=event/social')).toEqual(['own-social', 'own-social-old']);
        expect(await ids('?landing=event/yarmag')).toEqual([]);
        expect((await list(request(`?landing=${'x'.repeat(101)}`))).status).toBe(400);
    });
});
