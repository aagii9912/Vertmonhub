// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { GET, PUT } from './route';
import { PUT as PUT_SETTINGS } from './settings/route';

const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const get = (date?: string) => GET(new NextRequest(`http://localhost/api/dashboard/daily-report${date ? `?date=${date}` : ''}`));
const put = (body: unknown) => PUT(new NextRequest('http://localhost/api/dashboard/daily-report', { method: 'PUT', body: JSON.stringify(body) }));
const putSettings = (body: unknown) => PUT_SETTINGS(new NextRequest('http://localhost/api/dashboard/daily-report/settings', { method: 'PUT', body: JSON.stringify(body) }));
const viewing = (id: string, manager: string | null, scheduledAt: string, extra: Record<string, unknown> = {}) => ({
    id, shop_id: 'shop-1', sales_manager_name: manager, scheduled_at: scheduledAt, status: 'completed', meeting_type: 'new_customer',
    agent_notes: null, customer_feedback: null, deleted_at: null, leads: { customer_name: `Харилцагч ${id}` }, properties: null, ...extra,
});
const asKhon = () => { state.role = 'sales_manager'; state.userId = 'khon-user'; };
const countsOf = (date = '2026-09-30') => state.db.tables.daily_report_counts.filter(row => row.shop_id === 'shop-1' && row.report_date === date);
const changes = () => state.db.tables.daily_report_changes ?? [];

beforeEach(() => {
    state.role = 'admin';
    state.userId = 'admin-user';
    state.db = createMemoryDb({
        user_profiles: [
            { id: 'admin-user', full_name: 'Захирал Бат' },
            { id: 'khon-user', full_name: 'Khongoroo', phone: '99112233' },
            { id: 'loose-user', full_name: CHAN, phone: '99114455' },
            { id: 'other-project-user', full_name: 'Өөр төсөл', phone: '99116677' },
        ],
        sales_managers: [
            { shop_id: 'shop-1', name: CHAN, user_id: null, is_active: true },
            { shop_id: 'shop-1', name: KHON, user_id: 'khon-user', is_active: true },
            { shop_id: 'shop-1', name: 'Ажлаас гарсан', user_id: null, is_active: false },
            { shop_id: 'shop-2', name: 'Өөр төсөл', user_id: 'other-project-user', is_active: true },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: KHON, project_id: 'project-1' },
            { shop_id: 'shop-1', manager_name: CHAN, project_id: 'project-1' },
            // Идэвхгүй боловч төсөлд бүртгэлтэй — хамт олон биш.
            { shop_id: 'shop-1', manager_name: 'Ажлаас гарсан', project_id: 'project-1' },
            { shop_id: 'shop-2', manager_name: 'Өөр төсөл', project_id: 'project-2' },
        ],
        property_viewings: [
            // 2026-09-30 УБ = [2026-09-29T16:00Z, 2026-09-30T16:00Z)
            viewing('v1', CHAN, '2026-09-29T16:00:00.000Z', { agent_notes: 'Б2-58м2 10-30%', customer_feedback: 'үлдэгдэл банк' }),
            viewing('v2', KHON, '2026-09-30T08:00:00.000Z', { meeting_type: 'repeat_customer' }),
            viewing('v3', KHON, '2026-09-30T16:00:00.000Z'),
            viewing('v4', KHON, '2026-09-30T09:00:00.000Z', { deleted_at: '2026-09-30T10:00:00.000Z' }),
            viewing('v5', KHON, '2026-09-30T09:00:00.000Z', { status: 'scheduled' }),
            viewing('v6', KHON, '2026-09-30T09:00:00.000Z', { status: 'no_show' }),
            { ...viewing('v7', CHAN, '2026-09-30T09:00:00.000Z'), shop_id: 'shop-2' },
            viewing('v8', null, '2026-09-30T02:00:00.000Z', { status: 'scheduled', meeting_type: null, leads: { customer_name: null } }),
            viewing('v9', CHAN, '2026-09-30T03:00:00.000Z', { status: 'scheduled', deleted_at: '2026-09-30T04:00:00.000Z' }),
        ],
        daily_report_counts: [
            { shop_id: 'shop-1', report_date: '2026-09-30', manager_name: CHAN, metric: 'call.l1.total', value: 7, updated_by: 'admin-user', updated_at: '2026-09-30T05:00:00.000Z' },
            { shop_id: 'shop-1', report_date: '2026-09-30', manager_name: KHON, metric: 'chat.personal', value: 3, updated_by: 'khon-user', updated_by_name: 'М. Хонгорзул', updated_at: '2026-09-30T06:00:00.000Z' },
            { shop_id: 'shop-1', report_date: '2026-09-29', manager_name: KHON, metric: 'call.l1.total', value: 99 },
            { shop_id: 'shop-2', report_date: '2026-09-30', manager_name: KHON, metric: 'call.l1.total', value: 55 },
        ],
        daily_reports: [{ shop_id: 'shop-1', report_date: '2026-09-30', notes: { lines: { l1: 'Ерөнхий мэдээлэл' } }, completed_by_name: 'Р. Чанцалдулам', completed_at: '2026-09-30T11:00:00.000Z' }],
        daily_report_settings: [],
        daily_report_changes: [],
    });
    state.db.rpcs.save_daily_report = saveDailyReportRpc;
});

describe('GET /api/dashboard/daily-report', () => {
    it('gives the team view the whole project’s day: counts, completed meetings, pending and notes', async () => {
        const response = await get('2026-09-30');
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.configSaved).toBe(false);
        expect(body.viewer).toEqual({ personal: false, onboarding: false, canEditTeam: true, editable: [KHON, CHAN], own: null });
        expect(body.roster).toEqual([
            { name: CHAN, is_active: true, phone: null },
            { name: KHON, is_active: true, phone: '99112233' },
            { name: 'Ажлаас гарсан', is_active: false, phone: null },
        ]);
        const report = body.report;
        expect(report.title).toBe('Elysium Residence баг');
        expect(report.managers.map((manager: { short: string }) => manager.short)).toEqual(['Хон', 'Чан']);
        expect(report.lines[0].total).toBe(7);
        expect(report.chats.total).toBe(3);
        expect(report.meetings.total).toBe(2);
        expect(report.meetings.byManager).toEqual({ [KHON]: 1, [CHAN]: 1 });
        expect(report.meetings.groups[0].items).toEqual([{ id: 'v1', manager: 'Чан', managerName: CHAN, text: 'Харилцагч v1 — Б2-58м2 10-30%; үлдэгдэл банк' }]);
        expect(report.meetings.pending).toBe(2);
        expect(report.meetings.pendingItems).toEqual([
            { id: 'v8', manager: '', short: '—', customer: 'Нэргүй харилцагч', time: '2026-09-30T02:00:00.000Z', type: 'unclassified' },
            { id: 'v5', manager: KHON, short: 'Хон', customer: 'Харилцагч v5', time: '2026-09-30T09:00:00.000Z', type: 'new_customer' },
        ]);
        expect(report.lines[0].note).toBe('Ерөнхий мэдээлэл');
        expect(report.completed).toEqual({ by: 'Р. Чанцалдулам', at: '2026-09-30T11:00:00.000Z' });
        expect(report.missing).toEqual([]);
    });

    it('shows who entered each cell (legacy rows by profile name) without leaking account ids', async () => {
        const body = await (await get('2026-09-30')).json();
        expect(body.report.lines[0].rows[0].authors).toEqual({ [CHAN]: { by: 'Захирал Бат', at: '2026-09-30T05:00:00.000Z', other: true } });
        expect(body.report.chats.rows.find((row: { key: string }) => row.key === 'chat.personal').authors)
            .toEqual({ [KHON]: { by: 'М. Хонгорзул', at: '2026-09-30T06:00:00.000Z', other: false } });
        const text = JSON.stringify(body);
        for (const id of ['admin-user', 'khon-user', 'loose-user', 'other-project-user']) expect(text).not.toContain(id);
    });

    it('shows a project manager the full team report and lets them edit every active registered colleague', async () => {
        asKhon();
        const body = await (await get('2026-09-30')).json();
        expect(body.viewer).toEqual({ personal: true, onboarding: false, canEditTeam: true, editable: [KHON, CHAN], own: KHON });
        expect(body.roster).toEqual([]);
        expect(body.report.managers.map((manager: { name: string }) => manager.name)).toEqual([KHON, CHAN]);
        expect(body.report.managers.map((manager: { phone: string | null }) => manager.phone)).toEqual(['99112233', null]);
        // Ижил нэртэй холбогдоогүй профайл болон өөр төслийн дугаарыг тайланд авахгүй.
        expect(JSON.stringify(body)).not.toContain('99114455');
        expect(JSON.stringify(body)).not.toContain('99116677');
        expect(JSON.stringify(body)).not.toContain('khon-user');
        expect(body.report.lines[0]).toMatchObject({ label: 'Төслийн утас · 77862222', total: 7 });
        expect(body.report.lines[1]).toMatchObject({ label: 'Менежерийн дуудлага', total: 0 });
        expect(body.report.lines[1].rows[0].values[KHON]).toBeNull();
        expect(body.report.chats.total).toBe(3);
        expect(body.report.meetings.total).toBe(2);
        expect(body.report.meetings.groups[0].items[0].text).toContain('Харилцагч v1');
        expect(body.report.lines[0].note).toBe('Ерөнхий мэдээлэл');
        expect(body.report.completed.by).toBe('Р. Чанцалдулам');
        expect(JSON.stringify(body.report)).not.toContain('Өөр төсөл');
    });

    it('keeps inactive, unregistered and data-only names out of a manager’s editable columns', async () => {
        state.db.tables.sales_managers.push({ shop_id: 'shop-1', name: 'Бүртгэлгүй.Менежер', user_id: null, is_active: true });
        state.db.tables.daily_report_counts.push({ shop_id: 'shop-1', report_date: '2026-09-30', manager_name: 'Ажлаас гарсан', metric: 'chat.page', value: 1 });
        asKhon();
        const body = await (await get('2026-09-30')).json();
        expect(body.report.managers.map((manager: { name: string }) => manager.name)).toEqual(['Бүртгэлгүй.Менежер', KHON, CHAN, 'Ажлаас гарсан']);
        expect(body.viewer.editable).toEqual([KHON, CHAN]);
        state.role = 'admin';
        state.userId = 'admin-user';
        expect((await (await get('2026-09-30')).json()).viewer.editable).toEqual(['Бүртгэлгүй.Менежер', KHON, CHAN, 'Ажлаас гарсан']);
        state.role = 'director';
        expect((await (await get('2026-09-30')).json()).viewer).toMatchObject({ canEditTeam: false, editable: [] });
    });

    it('asks an unlinked sales manager to be registered and refuses users without team reports', async () => {
        state.role = 'sales_manager';
        state.userId = 'loose-user';
        expect((await (await get('2026-09-30')).json()).viewer).toEqual({ personal: true, onboarding: true, canEditTeam: false, editable: [], own: null });
        state.role = 'staff';
        state.userId = 'admin-user';
        expect((await get('2026-09-30')).status).toBe(403);
    });

    it('rejects future and malformed dates and reports a missing migration as 503', async () => {
        expect((await get('2099-01-01')).status).toBe(400);
        expect((await get('2026-13-01')).status).toBe(400);
        state.db.failNext.daily_report_settings = { code: '42P01', message: 'relation does not exist' };
        const response = await get('2026-09-30');
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('идэвхжээгүй');
        // updated_by_name багана алга (migration хэрэглэгдээгүй).
        state.db.failNext.daily_report_counts = { code: '42703', message: 'column daily_report_counts.updated_by_name does not exist' };
        expect((await get('2026-09-30')).status).toBe(503);
    });

    it.each(['inactive', 'unlinked', 'ambiguous', 'no-project', 'foreign-project'])('does not grant the team view to a manager with %s membership', async reason => {
        asKhon();
        const manager = state.db.tables.sales_managers.find(row => row.user_id === state.userId)!;
        if (reason === 'inactive') manager.is_active = false;
        if (reason === 'unlinked') {
            manager.user_id = null;
            state.db.tables.user_profiles.find(row => row.id === state.userId)!.full_name = KHON;
        }
        if (reason === 'ambiguous') state.db.tables.sales_managers.push({ ...manager, name: 'Давхар бүртгэл' });
        if (reason === 'no-project') state.db.tables.sales_manager_projects = [];
        if (reason === 'foreign-project') state.db.tables.sales_manager_projects[0].shop_id = 'shop-2';
        const body = await (await get('2026-09-30')).json();
        expect(body.report).toBeNull();
        expect(body.viewer).toMatchObject({ onboarding: true, canEditTeam: false, editable: [] });
        expect((await put({ date: '2026-09-30', notes: { general: 'x' }, complete: true })).status).toBe(403);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] })).status).toBe(403);
        expect(state.db.rpcCalls).toEqual([]);
    });
});

describe('PUT /api/dashboard/daily-report', () => {
    it('lets the duty manager enter a colleague’s counts under their own name and keeps the change in history', async () => {
        asKhon();
        const ok = await put({ date: '2026-09-30', cells: [
            { manager: CHAN, metric: 'call.l1.total', value: 4, expected: 7 },
            { manager: KHON, metric: 'chat.personal', value: null },
        ] });
        expect(ok.status).toBe(200);
        expect(state.db.rpcCalls).toEqual([{ name: 'save_daily_report', args: {
            p_shop_id: 'shop-1', p_date: '2026-09-30', p_user_id: 'khon-user', p_user_name: 'М. Хонгорзул',
            p_cells: [{ manager: CHAN, metric: 'call.l1.total', value: 4, expected: 7 }, { manager: KHON, metric: 'chat.personal', value: null }],
            p_notes: null, p_complete: null, p_restored_from: null,
        } }]);
        expect(countsOf().map(row => [row.manager_name, row.metric, row.value, row.updated_by, row.updated_by_name])).toEqual([[CHAN, 'call.l1.total', 4, 'khon-user', 'М. Хонгорзул']]);
        expect(changes().map(row => [row.kind, row.manager_name, row.metric, row.old_value, row.new_value, row.changed_by, row.changed_by_name])).toEqual([
            ['count', CHAN, 'call.l1.total', 7, 4, 'khon-user', 'М. Хонгорзул'],
            ['count', KHON, 'chat.personal', 3, null, 'khon-user', 'М. Хонгорзул'],
        ]);
        const body = await (await get('2026-09-30')).json();
        expect(body.report.lines[0].rows[0].authors[CHAN]).toMatchObject({ by: 'М. Хонгорзул', other: true });
    });

    it.each([
        ['an inactive', 'Ажлаас гарсан'],
        ['an unregistered', 'Бүртгэлгүй.Менежер'],
        ['another project’s', 'Өөр төсөл'],
    ])('refuses a manager entering %s manager’s counts', async (_label, name) => {
        state.db.tables.sales_managers.push({ shop_id: 'shop-1', name: 'Бүртгэлгүй.Менежер', user_id: null, is_active: true });
        asKhon();
        const response = await put({ date: '2026-09-30', cells: [{ manager: KHON, metric: 'call.l1.total', value: 1 }, { manager: name, metric: 'call.l1.total', value: 1 }] });
        expect(response.status).toBe(403);
        expect((await response.json()).error).toBe('Зөвхөн энэ төслийн идэвхтэй менежерийн тоог оруулна');
        expect(state.db.rpcCalls).toEqual([]);
        expect(countsOf().find(row => row.manager_name === KHON && row.metric === 'call.l1.total')).toBeUndefined();
    });

    it('answers 409 with the conflicts and writes nothing when someone changed a cell meanwhile', async () => {
        asKhon();
        const response = await put({ date: '2026-09-30', cells: [
            { manager: KHON, metric: 'call.l1.total', value: 2, expected: null },
            { manager: CHAN, metric: 'call.l1.total', value: 8, expected: 6 },
        ], notes: { general: 'Тайлбар' }, complete: true });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: 'Энэ хооронд өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.',
            conflicts: [{ kind: 'count', manager: CHAN, metric: 'call.l1.total', current: 7 }],
        });
        expect(countsOf().map(row => [row.manager_name, row.metric, row.value])).toEqual([[CHAN, 'call.l1.total', 7], [KHON, 'chat.personal', 3]]);
        expect(changes()).toEqual([]);
        expect(state.db.tables.daily_reports[0].notes).toEqual({ lines: { l1: 'Ерөнхий мэдээлэл' } });

        const note = await put({ date: '2026-09-30', notes: { lines: { l1: 'Шинэ' } }, notesExpected: { lines: { l1: 'Өөр текст' } } });
        expect(note.status).toBe(409);
        expect((await note.json()).conflicts).toEqual([{ kind: 'note', key: 'line.l1', current: 'Ерөнхий мэдээлэл' }]);
        expect(changes()).toEqual([]);
    });

    it('writes no history for unchanged cells and merges notes per key', async () => {
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 7, expected: 7 }] })).status).toBe(200);
        expect(changes()).toEqual([]);
        expect(countsOf().find(row => row.manager_name === CHAN)?.updated_by_name).toBeUndefined();

        // Зөвхөн илгээсэн түлхүүр өөрчлөгдөнө.
        expect((await put({ date: '2026-09-30', notes: { general: 'Багийн нэгтгэл', chats: '' } })).status).toBe(200);
        expect(state.db.tables.daily_reports[0].notes).toEqual({ lines: { l1: 'Ерөнхий мэдээлэл' }, general: 'Багийн нэгтгэл' });
        expect((await put({ date: '2026-09-30', notes: { lines: { l1: '' } }, notesExpected: { lines: { l1: 'Ерөнхий мэдээлэл' } } })).status).toBe(200);
        expect(state.db.tables.daily_reports[0].notes).toEqual({ general: 'Багийн нэгтгэл' });
        expect(changes().map(row => [row.kind, row.note_key, row.old_text, row.new_text, row.changed_by_name])).toEqual([
            ['note', 'general', null, 'Багийн нэгтгэл', 'Захирал Бат'],
            ['note', 'line.l1', 'Ерөнхий мэдээлэл', null, 'Захирал Бат'],
        ]);
        expect(state.db.rpcCalls[2].args.p_notes).toEqual([{ key: 'line.l1', value: '', expected: 'Ерөнхий мэдээлэл' }]);
    });

    it('lets the rotating manager save personal calls, team notes and completion without changing anyone else’s counts', async () => {
        asKhon();
        const before = state.db.tables.daily_report_counts.filter(row => row.manager_name !== KHON || row.shop_id !== 'shop-1');
        const response = await put({ date: '2026-09-30', cells: [{ manager: KHON, metric: 'call.personal.total', value: 5 }], notes: { general: 'Багийн өдрийн нэгтгэл' }, complete: true });
        expect(response.status).toBe(200);
        const body = await (await get('2026-09-30')).json();
        expect(body.report.lines[0].total).toBe(7);
        expect(body.report.lines[1].rows[0].values[KHON]).toBe(5);
        expect(body.report.lines[1].rows[0].authors[KHON]).toMatchObject({ by: 'М. Хонгорзул', other: false });
        expect(body.report.generalNote).toBe('Багийн өдрийн нэгтгэл');
        expect(body.report.completed.by).toBe('М. Хонгорзул');
        expect(state.db.tables.daily_report_counts.filter(row => row.manager_name !== KHON || row.shop_id !== 'shop-1')).toEqual(before);
        expect(state.db.tables.daily_reports[0].completed_by).toBe('khon-user');
        expect((await put({ date: '2026-09-30', complete: false })).status).toBe(200);
        expect((await (await get('2026-09-30')).json()).report.completed).toBeNull();
        expect(changes().filter(row => row.kind === 'complete').map(row => [row.old_text, row.new_text])).toEqual([
            ['Р. Чанцалдулам', 'М. Хонгорзул'],
            ['М. Хонгорзул', null],
        ]);
        // Баталгаажаагүй тайланг цуцлахад түүх нэмэгдэхгүй.
        expect((await put({ date: '2026-09-30', complete: false })).status).toBe(200);
        expect(changes().filter(row => row.kind === 'complete')).toHaveLength(2);
    });

    it('checks managers against the roster and metrics against the template', async () => {
        expect((await put({ date: '2026-09-30', cells: [{ manager: 'Өөр төсөл', metric: 'call.l1.total', value: 1 }] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l2.new', value: 1 }] })).status).toBe(409);
        // Загвараас хасагдсан үзүүлэлтийг цэвэрлэж болно.
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l2.new', value: null }] })).status).toBe(200);
        expect((await put({ date: '2099-01-01', cells: [] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1.5 }] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1, expected: -1 }] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [], extra: true })).status).toBe(400);
    });

    it('saves team notes, stamps the completer and clears it on reopen', async () => {
        state.db.tables.daily_reports = [];
        const saved = await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 8 }], notes: { lines: { l1: 'Төслийн мэдээлэл' } }, complete: true });
        expect(saved.status).toBe(200);
        expect(state.db.tables.daily_reports[0]).toMatchObject({
            shop_id: 'shop-1', report_date: '2026-09-30', notes: { lines: { l1: 'Төслийн мэдээлэл' } },
            completed_by: 'admin-user', completed_by_name: 'Захирал Бат',
        });
        expect(state.db.tables.daily_report_counts.find(row => row.manager_name === CHAN && row.report_date === '2026-09-30')).toMatchObject({ value: 8, updated_by_name: 'Захирал Бат' });

        await put({ date: '2026-09-30', complete: false });
        expect(state.db.tables.daily_reports[0]).toMatchObject({ completed_by: null, completed_by_name: null, completed_at: null, notes: { lines: { l1: 'Төслийн мэдээлэл' } } });
    });

    it('needs dashboard write access and the team view to edit others', async () => {
        state.role = 'director';
        expect((await put({ date: '2026-09-30', cells: [] })).status).toBe(403);
        state.role = 'staff';
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] })).status).toBe(403);
        expect(state.db.rpcCalls).toEqual([]);
    });

    it('reports a missing save RPC as 503', async () => {
        delete state.db.rpcs.save_daily_report;
        const response = await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] });
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('идэвхжээгүй');
        state.db.rpcs.save_daily_report = saveDailyReportRpc;
        state.db.failNext['rpc:save_daily_report'] = { code: 'XX000', message: 'boom' };
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] })).status).toBe(500);
    });
});

describe('PUT /api/dashboard/daily-report/settings', () => {
    const config = {
        title: 'Элизиум баг',
        lines: [{ key: 'l1', label: '7786-2222', categories: ['new', 'other'] }],
        chats: [{ key: 'personal', label: 'Хувь чат' }],
        managers: [{ name: KHON, short: 'Хон' }, { name: CHAN, short: 'Чан' }],
    };

    it('saves a validated template that the report then uses', async () => {
        const response = await putSettings({ config });
        expect(response.status).toBe(200);
        expect(state.db.tables.daily_report_settings[0]).toMatchObject({ shop_id: 'shop-1', updated_by: 'admin-user', config: { ...config } });
        const body = await (await get('2026-09-30')).json();
        expect(body.report.title).toBe('Элизиум баг');
        expect(body.report.lines[0].rows.map((row: { label: string }) => row.label)).toEqual(['Шинэ', 'Бусад']);
        // Хуучин «call.l1.total» тоо шинэ загварт харагдахгүй.
        expect(body.report.lines[0].total).toBe(0);
        expect(body.report.managers.map((manager: { short: string }) => manager.short)).toEqual(['Хон', 'Чан']);
    });

    it('rejects inactive or foreign managers, malformed templates and users without settings write', async () => {
        expect((await putSettings({ config: { ...config, managers: [{ name: 'Ажлаас гарсан', short: 'Ажл' }] } })).status).toBe(400);
        expect((await putSettings({ config: { ...config, managers: [{ name: 'Өөр төсөл', short: 'Өөр' }] } })).status).toBe(400);
        expect((await putSettings({ config: { ...config, lines: [{ key: 'bad key', label: 'x' }] } })).status).toBe(400);
        expect((await putSettings({ config, extra: 1 })).status).toBe(400);
        state.role = 'sales_manager';
        expect((await putSettings({ config })).status).toBe(403);
        expect(state.db.tables.daily_report_settings).toEqual([]);
    });
});
