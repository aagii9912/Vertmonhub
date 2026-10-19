// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({
    userId: 'admin-user' as string | null,
    superAdmin: true,
    shop: { id: 'shop-1', name: 'Mandala Garden' } as { id: string; name: string } | null,
    db: null as unknown as MemoryDb,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.userId,
    // x-shop-id-г гишүүнчлэлээр шалгасан төсөл (эсвэл null).
    getUserShop: async () => state.shop,
}));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => (state.superAdmin ? { id: state.userId, role: 'super_admin' } : null) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET } from './route';

const MANAGER = 'Б.Ариунаа';
const get = (query = '') => GET(new NextRequest(`http://localhost/api/admin/history${query}`));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T04:00:00Z'));
    state.userId = 'admin-user';
    state.superAdmin = true;
    state.shop = { id: 'shop-1', name: 'Mandala Garden' };
    state.db = createMemoryDb({
        shops: [{ id: 'shop-1', user_id: 'admin-user' }],
        shop_members: [{ shop_id: 'shop-1', user_id: 'ariuna-user' }],
        user_profiles: [
            { id: 'admin-user', full_name: 'Захирал Бат', email: 'bat@vertmon.mn' },
            { id: 'ariuna-user', full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' },
        ],
        user_roles: [{ user_id: 'admin-user', role: 'super_admin' }, { user_id: 'ariuna-user', role: 'sales_manager' }],
        sales_managers: [{ shop_id: 'shop-1', name: MANAGER, user_id: 'ariuna-user', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop-1', manager_name: MANAGER, project_id: 'p1' }],
        daily_report_changes: [
            {
                id: 1, shop_id: 'shop-1', report_date: '2026-10-18', kind: 'count', manager_name: MANAGER, metric: 'call.l1.total', note_key: null,
                old_value: null, new_value: 5, old_text: null, new_text: null, viewing_id: null, restored_from: null, meta: {},
                changed_by: 'ariuna-user', changed_by_name: 'Б. Ариунаа', changed_at: '2026-10-18T09:00:00.000Z',
            },
            {
                id: 2, shop_id: 'shop-2', report_date: '2026-10-18', kind: 'count', manager_name: 'Өөр', metric: 'call.l1.total', note_key: null,
                old_value: null, new_value: 9, old_text: null, new_text: null, viewing_id: null, restored_from: null, meta: {},
                changed_by: 'ariuna-user', changed_by_name: 'Өөр', changed_at: '2026-10-18T09:00:00.000Z',
            },
        ],
        data_audit_log: [
            { id: 'a1', shop_id: 'shop-1', actor_id: 'admin-user', entity: 'lead', entity_id: 'lead-1', action: 'update', changes: { status: 'won' }, created_at: '2026-10-18T10:00:00.000Z' },
            // 31 хоногийн өмнө — анхдагч 30 өдрөөс гадна.
            { id: 'a0', shop_id: 'shop-1', actor_id: 'admin-user', entity: 'lead', entity_id: 'lead-1', action: 'update', changes: {}, created_at: '2026-09-18T10:00:00.000Z' },
        ],
        lead_activities: [
            { id: 'x1', shop_id: 'shop-1', lead_id: 'lead-1', type: 'call', content: 'Залгав', created_by: 'ariuna-user', created_by_name: MANAGER, created_at: '2026-10-18T08:00:00.000Z' },
        ],
        leads: [{ id: 'lead-1', shop_id: 'shop-1', customer_name: 'Болд', sales_manager_name: 'Ариунаа Батболд', deleted_at: null }],
        property_viewings: [], property_contracts: [], daily_report_counts: [], service_logs: [],
    });
});

afterEach(() => { vi.useRealTimers(); });

describe('GET /api/admin/history', () => {
    it('нэвтрээгүй 401, super admin биш 403, хандах төсөлгүй 403 — DB-д хүрэхгүй', async () => {
        state.userId = null;
        expect((await get()).status).toBe(401);
        state.userId = 'ariuna-user';
        state.superAdmin = false;
        expect((await get()).status).toBe(403);
        state.superAdmin = true;
        state.shop = null;
        const response = await get();
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Энэ төсөлд хандах эрхгүй' });
        expect(state.db.writes).toEqual([]);
    });

    it('идэвхтэй төслийн сүүлийн 30 өдрийн түүх, шинэ нь эхэнд, кэшлэхгүй', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body).toMatchObject({ from: '2026-09-20', to: '2026-10-19', user: null, truncated: false, unavailable: [] });
        expect(body.items.map((item: { id: string }) => item.id)).toEqual(['audit:a1', 'daily_report:1', 'lead:x1']);
        expect(body.items[1]).toMatchObject({ summary: 'Төслийн утас · Б. Ариунаа: — → 5', by: 'Б. Ариунаа', href: '/dashboard/daily-report?date=2026-10-18' });
        expect(body.users.map((user: { id: string; managers: unknown[] }) => [user.id, user.managers])).toEqual([
            ['ariuna-user', [{ name: MANAGER, active: true }]],
            ['admin-user', []],
        ]);
        expect(state.db.writes).toEqual([]);
    });

    it('хэрэглэгч, огноогоор шүүнэ', async () => {
        const body = await (await get('?user=ariuna-user&from=2026-10-18&to=2026-10-18')).json();
        expect(body.error).toBe('Хэрэглэгч эсвэл огноо буруу байна');
        const uid = '10000000-0000-4000-8000-000000000002';
        state.db.tables.lead_activities[0].created_by = uid;
        const filtered = await (await get(`?user=${uid}&from=2026-10-18&to=2026-10-18`)).json();
        expect(filtered.items.map((item: { id: string }) => item.id)).toEqual(['lead:x1']);
        expect(filtered.user).toBe(uid);
        const all = await (await get('?user=&from=2026-09-18&to=2026-10-18')).json();
        expect(all.items.map((item: { id: string }) => item.id)).toEqual(['audit:a1', 'daily_report:1', 'lead:x1', 'audit:a0']);
    });

    it('буруу огноо, урт хугацаа 400', async () => {
        expect((await get('?from=2026-13-01')).status).toBe(400);
        const long = await get('?from=2026-07-01&to=2026-10-18');
        expect(long.status).toBe(400);
        expect(await long.json()).toEqual({ error: 'Хугацаа 92 хоногоос ихгүй байна' });
        expect((await get('?from=2026-10-18&to=2026-10-17')).status).toBe(400);
    });

    it('өдрийн тайлангийн түүх хүснэгтгүй бол бусад нь харагдана; DB алдаа 503', async () => {
        state.db.failNext.daily_report_changes = { code: '42P01', message: 'missing' };
        const body = await (await get()).json();
        expect(body.unavailable).toEqual(['daily_report']);
        expect(body.items.map((item: { id: string }) => item.id)).toEqual(['audit:a1', 'lead:x1']);
        state.db.failNext.lead_activities = { code: '57014', message: 'timeout' };
        const failed = await get();
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'Өөрчлөлтийн түүхийг уншиж чадсангүй' });
    });
});
