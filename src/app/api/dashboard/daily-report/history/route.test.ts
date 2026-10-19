// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

type Role = 'admin' | 'sales_manager' | 'staff' | 'director';
const state = vi.hoisted(() => ({ role: 'admin' as string, userId: 'admin-user', db: null as unknown as MemoryDb }));
const PERMS: Record<Role, { role: string; modules: string[]; canWrite: boolean }> = {
    admin: { role: 'admin', modules: ['dashboard', 'reports', 'settings'], canWrite: true },
    sales_manager: { role: 'sales_manager', modules: ['dashboard', 'leads', 'viewings'], canWrite: true },
    staff: { role: 'viewer', modules: ['dashboard'], canWrite: true },
    director: { role: 'director', modules: ['dashboard', 'reports'], canWrite: false },
};
const deny = () => NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
vi.mock('@/lib/auth/require-permission', () => {
    const perms = () => PERMS[state.role as Role];
    return {
        requireModule: async (module: string) => perms().modules.includes(module) ? null : deny(),
        requireAnyModule: async (modules: string[]) => modules.some(module => perms().modules.includes(module)) ? null : deny(),
        requireModuleWrite: async (module: string) => perms().modules.includes(module) && perms().canWrite ? null : deny(),
        requireModuleDelete: async () => deny(),
        resolvePermissions: async () => ({ role: perms().role, permissions: { modules: perms().modules, canWrite: perms().canWrite, canDelete: false } }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }),
    getUserId: async () => state.userId,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { saveDailyReportRpc } from '@/test/daily-report-rpc';
import { PUT } from '../route';
import { GET, POST } from './route';

const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const DATE = '2026-09-30';
const history = async (date = DATE) => GET(new NextRequest(`http://localhost/api/dashboard/daily-report/history?date=${date}`));
const restore = (body: unknown) => POST(new NextRequest('http://localhost/api/dashboard/daily-report/history', { method: 'POST', body: JSON.stringify(body) }));
const put = (body: unknown) => PUT(new NextRequest('http://localhost/api/dashboard/daily-report', { method: 'PUT', body: JSON.stringify(body) }));
const as = (role: Role, userId: string) => { state.role = role; state.userId = userId; };
const valueOf = (manager: string, metric: string) => state.db.tables.daily_report_counts
    .find(row => row.shop_id === 'shop-1' && row.report_date === DATE && row.manager_name === manager && row.metric === metric)?.value ?? null;

let tick = 0;
beforeEach(() => {
    as('admin', 'admin-user');
    // Түүхийн мөр бүр өөр цагтай (шинэ нь эхэнд эрэмбэлэгдэнэ).
    tick = 0;
    vi.useFakeTimers({ now: new Date('2026-10-01T02:00:00Z'), toFake: ['Date'] });
    state.db = createMemoryDb({
        user_profiles: [{ id: 'admin-user', full_name: 'Захирал Бат' }, { id: 'khon-user', full_name: 'Khongoroo' }, { id: 'loose-user', full_name: 'Сул' }],
        sales_managers: [
            { shop_id: 'shop-1', name: CHAN, user_id: null, is_active: true },
            { shop_id: 'shop-1', name: KHON, user_id: 'khon-user', is_active: true },
            { shop_id: 'shop-1', name: 'Ажлаас гарсан', user_id: null, is_active: false },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: KHON, project_id: 'project-1' },
            { shop_id: 'shop-1', manager_name: CHAN, project_id: 'project-1' },
        ],
        property_viewings: [],
        daily_report_counts: [
            { shop_id: 'shop-1', report_date: DATE, manager_name: CHAN, metric: 'call.l1.total', value: 7 },
            { shop_id: 'shop-1', report_date: DATE, manager_name: 'Ажлаас гарсан', metric: 'chat.page', value: 2 },
        ],
        daily_reports: [{ shop_id: 'shop-1', report_date: DATE, notes: { lines: { l1: 'Ерөнхий мэдээлэл' } }, completed_by_name: null, completed_at: null }],
        daily_report_settings: [],
        daily_report_changes: [
            // Өөр shop-ийн түүх харагдахгүй, сэргээгдэхгүй.
            { id: 900, shop_id: 'shop-2', report_date: DATE, kind: 'count', manager_name: CHAN, metric: 'call.l1.total', old_value: 1, new_value: 7,
                note_key: null, old_text: null, new_text: null, restored_from: null, meta: {}, changed_by: 'x', changed_by_name: 'Гадны', changed_at: '2026-09-30T01:00:00.000Z' },
        ],
    });
    state.db.rpcs.save_daily_report = (args, db) => {
        tick += 1;
        vi.setSystemTime(new Date(Date.parse('2026-10-01T02:00:00Z') + tick * 60_000));
        return saveDailyReportRpc(args, db);
    };
});

afterEach(() => { vi.useRealTimers(); });

async function seed() {
    as('sales_manager', 'khon-user');
    expect((await put({ date: DATE, cells: [{ manager: CHAN, metric: 'call.l1.total', value: 4, expected: 7 }] })).status).toBe(200);
    expect((await put({ date: DATE, cells: [{ manager: KHON, metric: 'chat.page', value: 3 }], notes: { lines: { l1: 'Шинэ тайлбар' } } })).status).toBe(200);
    as('admin', 'admin-user');
    expect((await put({ date: DATE, cells: [{ manager: 'Ажлаас гарсан', metric: 'chat.page', value: null }], complete: true })).status).toBe(200);
    // Хамгийн сүүлийн өөрчлөлт: Чан-ы нүдийг дахин засна.
    expect((await put({ date: DATE, cells: [{ manager: CHAN, metric: 'call.l1.total', value: 5 }] })).status).toBe(200);
    state.db.tables.daily_report_changes.push({
        id: 950, shop_id: 'shop-1', report_date: DATE, kind: 'meeting', manager_name: KHON, metric: null, note_key: null, old_value: null, new_value: null,
        old_text: CHAN, new_text: KHON, viewing_id: 'v1', restored_from: null, meta: { action: 'reassign' }, changed_by: 'admin-user', changed_by_name: 'Захирал Бат',
        changed_at: '2026-10-01T02:04:30.000Z',
    });
}
const idOf = (predicate: (row: Record<string, any>) => boolean) => state.db.tables.daily_report_changes.find(predicate)!.id as number;

describe('GET /api/dashboard/daily-report/history', () => {
    it('lists the day’s changes newest first with labels, authors and what the viewer may restore', async () => {
        await seed();
        as('sales_manager', 'khon-user');
        const response = await history();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.date).toBe(DATE);
        expect(body.changes.map((change: Record<string, unknown>) => [change.kind, change.label, change.manager, change.old ?? change.oldText, change.new ?? change.newText, change.by, change.restorable])).toEqual([
            ['meeting', 'Уулзалт', KHON, CHAN, KHON, 'Захирал Бат', false],
            ['count', 'Төслийн утас · 77862222', CHAN, 4, 5, 'Захирал Бат', true],
            // Нэг хадгалалтын мөрүүд ижил цагтай — id-ээр (сүүлд бичсэн нь эхэнд).
            ['complete', 'Баталгаажуулалт', null, null, 'Захирал Бат', 'Захирал Бат', false],
            ['count', 'Чат · Пэйж FB', 'Ажлаас гарсан', 2, null, 'Захирал Бат', false], // идэвхгүй менежер — менежер сэргээхгүй
            ['note', 'Тэмдэглэл · Төслийн утас · 77862222', null, 'Ерөнхий мэдээлэл', 'Шинэ тайлбар', 'М. Хонгорзул', true],
            ['count', 'Чат · Пэйж FB', KHON, null, 3, 'М. Хонгорзул', true],
            ['count', 'Төслийн утас · 77862222', CHAN, 7, 4, 'М. Хонгорзул', false], // дараа нь дахин өөрчлөгдсөн
        ]);
        expect(body.changes[0]).toMatchObject({ action: 'reassign', managerTitle: 'М. Хонгорзул' });
        expect(body.changes[1]).toMatchObject({ managerTitle: 'Р. Чанцалдулам', metric: 'call.l1.total', action: null, restoredFrom: null });
        expect(JSON.stringify(body)).not.toContain('khon-user');
        expect(JSON.stringify(body)).not.toContain('admin-user');
        expect(JSON.stringify(body)).not.toContain('Гадны');

        // Админ идэвхгүй менежерийн нүдийг ч сэргээнэ; засах эрхгүй захирал юуг ч сэргээхгүй.
        as('admin', 'admin-user');
        expect((await (await history()).json()).changes.filter((change: { restorable: boolean }) => change.restorable)).toHaveLength(4);
        as('director', 'admin-user');
        expect((await (await history()).json()).changes.filter((change: { restorable: boolean }) => change.restorable)).toHaveLength(0);
    });

    it('applies the report’s viewer gate, rejects bad dates and reports a missing table as 503', async () => {
        as('sales_manager', 'loose-user');
        expect((await history()).status).toBe(403);
        as('staff', 'admin-user');
        expect((await history()).status).toBe(403);
        as('admin', 'admin-user');
        expect((await history('2099-01-01')).status).toBe(400);
        expect((await history('2026-02-30')).status).toBe(400);
        state.db.failNext.daily_report_changes = { code: '42P01', message: 'relation does not exist' };
        const response = await history();
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('идэвхжээгүй');
    });
});

describe('POST /api/dashboard/daily-report/history', () => {
    it('restores a count to its previous value and records the restore in history', async () => {
        await seed();
        as('sales_manager', 'khon-user');
        const id = idOf(row => row.shop_id === 'shop-1' && row.manager_name === CHAN && row.old_value === 4);
        const response = await restore({ changeId: id });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(valueOf(CHAN, 'call.l1.total')).toBe(4);
        expect(state.db.rpcCalls.at(-1)!.args).toMatchObject({
            p_cells: [{ manager: CHAN, metric: 'call.l1.total', value: 4, expected: 5 }], p_notes: null, p_complete: null, p_restored_from: id, p_user_name: 'М. Хонгорзул',
        });
        const latest = state.db.tables.daily_report_changes.at(-1)!;
        expect(latest).toMatchObject({ kind: 'count', manager_name: CHAN, old_value: 5, new_value: 4, restored_from: id, changed_by: 'khon-user', changed_by_name: 'М. Хонгорзул' });
        const body = await (await history()).json();
        expect(body.changes[0]).toMatchObject({ id: latest.id, restoredFrom: id, restorable: true });
        expect(body.changes.find((change: { id: number }) => change.id === id).restorable).toBe(false);
    });

    it('restores a note and refuses an outdated change with 409 without writing', async () => {
        await seed();
        const note = idOf(row => row.kind === 'note');
        expect((await restore({ changeId: note })).status).toBe(200);
        expect(state.db.tables.daily_reports[0].notes).toEqual({ lines: { l1: 'Ерөнхий мэдээлэл' } });
        expect(state.db.rpcCalls.at(-1)!.args.p_notes).toEqual([{ key: 'line.l1', value: 'Ерөнхий мэдээлэл', expected: 'Шинэ тайлбар' }]);

        const before = state.db.tables.daily_report_changes.length;
        const outdated = idOf(row => row.shop_id === 'shop-1' && row.manager_name === CHAN && row.old_value === 7);
        const response = await restore({ changeId: outdated });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('Энэ нүд дараа нь дахин өөрчлөгдсөн байна. Түүхийг шинэчлээд дахин оролдоно уу.');
        expect(valueOf(CHAN, 'call.l1.total')).toBe(5);
        expect(state.db.tables.daily_report_changes).toHaveLength(before);
    });

    it('follows the PUT rules: colleagues only for managers, write access, own shop, counts and notes only', async () => {
        await seed();
        const inactive = idOf(row => row.manager_name === 'Ажлаас гарсан');
        as('sales_manager', 'khon-user');
        const denied = await restore({ changeId: inactive });
        expect(denied.status).toBe(403);
        expect((await denied.json()).error).toBe('Зөвхөн энэ төслийн идэвхтэй менежерийн тоог оруулна');
        expect(valueOf('Ажлаас гарсан', 'chat.page')).toBeNull();
        expect((await restore({ changeId: 900 })).status).toBe(404);
        expect((await restore({ changeId: 950 })).status).toBe(400);
        expect((await restore({ changeId: idOf(row => row.kind === 'complete') })).status).toBe(400);
        expect((await restore({ changeId: 'x' })).status).toBe(400);
        expect((await restore({ changeId: inactive, extra: 1 })).status).toBe(400);
        as('sales_manager', 'loose-user');
        expect((await restore({ changeId: idOf(row => row.kind === 'note') })).status).toBe(403);
        as('director', 'admin-user');
        expect((await restore({ changeId: inactive })).status).toBe(403);

        // Админ идэвхгүй менежерийн цэвэрлэсэн тоог сэргээнэ.
        as('admin', 'admin-user');
        expect((await restore({ changeId: inactive })).status).toBe(200);
        expect(valueOf('Ажлаас гарсан', 'chat.page')).toBe(2);
    });

    it('refuses to restore a value into a metric the template no longer has', async () => {
        state.db.tables.daily_report_changes.push({
            id: 1, shop_id: 'shop-1', report_date: DATE, kind: 'count', manager_name: CHAN, metric: 'call.l9.total', old_value: 3, new_value: null,
            note_key: null, old_text: null, new_text: null, restored_from: null, meta: {}, changed_by: 'admin-user', changed_by_name: 'Захирал Бат', changed_at: '2026-09-30T05:00:00.000Z',
        });
        const response = await restore({ changeId: 1 });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('загвар');
        expect(state.db.rpcCalls).toEqual([]);
    });
});
