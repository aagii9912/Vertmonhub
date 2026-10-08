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

beforeEach(() => {
    state.role = 'admin';
    state.userId = 'admin-user';
    state.db = createMemoryDb({
        user_profiles: [
            { id: 'admin-user', full_name: 'Захирал Бат' },
            { id: 'khon-user', full_name: 'Khongoroo' },
            { id: 'loose-user', full_name: 'Шинэ менежер' },
        ],
        sales_managers: [
            { shop_id: 'shop-1', name: CHAN, user_id: null, is_active: true },
            { shop_id: 'shop-1', name: KHON, user_id: 'khon-user', is_active: true },
            { shop_id: 'shop-1', name: 'Ажлаас гарсан', user_id: null, is_active: false },
            { shop_id: 'shop-2', name: 'Өөр төсөл', user_id: null, is_active: true },
        ],
        sales_manager_projects: [{ shop_id: 'shop-1', manager_name: KHON, project_id: 'project-1' }],
        property_viewings: [
            // 2026-09-30 УБ = [2026-09-29T16:00Z, 2026-09-30T16:00Z)
            viewing('v1', CHAN, '2026-09-29T16:00:00.000Z', { agent_notes: 'Б2-58м2 10-30%', customer_feedback: 'үлдэгдэл банк' }),
            viewing('v2', KHON, '2026-09-30T08:00:00.000Z', { meeting_type: 'repeat_customer' }),
            viewing('v3', KHON, '2026-09-30T16:00:00.000Z'),
            viewing('v4', KHON, '2026-09-30T09:00:00.000Z', { deleted_at: '2026-09-30T10:00:00.000Z' }),
            viewing('v5', KHON, '2026-09-30T09:00:00.000Z', { status: 'scheduled' }),
            viewing('v6', KHON, '2026-09-30T09:00:00.000Z', { status: 'no_show' }),
            { ...viewing('v7', CHAN, '2026-09-30T09:00:00.000Z'), shop_id: 'shop-2' },
        ],
        daily_report_counts: [
            { shop_id: 'shop-1', report_date: '2026-09-30', manager_name: CHAN, metric: 'call.l1.total', value: 7 },
            { shop_id: 'shop-1', report_date: '2026-09-30', manager_name: KHON, metric: 'chat.personal', value: 3 },
            { shop_id: 'shop-1', report_date: '2026-09-29', manager_name: KHON, metric: 'call.l1.total', value: 99 },
            { shop_id: 'shop-2', report_date: '2026-09-30', manager_name: KHON, metric: 'call.l1.total', value: 55 },
        ],
        daily_reports: [{ shop_id: 'shop-1', report_date: '2026-09-30', notes: { lines: { l1: 'Ерөнхий мэдээлэл' } }, completed_by_name: 'Р. Чанцалдулам', completed_at: '2026-09-30T11:00:00.000Z' }],
        daily_report_settings: [],
    });
});

describe('GET /api/dashboard/daily-report', () => {
    it('gives the team view the whole project’s day: counts, completed meetings, pending and notes', async () => {
        const response = await get('2026-09-30');
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.configSaved).toBe(false);
        expect(body.viewer).toEqual({ personal: false, onboarding: false, canEditTeam: true, editable: [KHON, CHAN] });
        expect(body.roster.map((entry: { name: string }) => entry.name)).toEqual([CHAN, KHON, 'Ажлаас гарсан']);
        const report = body.report;
        expect(report.title).toBe('Elysium Residence баг');
        expect(report.managers.map((manager: { short: string }) => manager.short)).toEqual(['Хон', 'Чан']);
        expect(report.lines[0].total).toBe(7);
        expect(report.chats.total).toBe(3);
        expect(report.meetings.total).toBe(2);
        expect(report.meetings.byManager).toEqual({ [KHON]: 1, [CHAN]: 1 });
        expect(report.meetings.groups[0].items).toEqual([{ id: 'v1', manager: 'Чан', text: 'Харилцагч v1 — Б2-58м2 10-30%; үлдэгдэл банк' }]);
        expect(report.meetings.pending).toBe(1);
        expect(report.lines[0].note).toBe('Ерөнхий мэдээлэл');
        expect(report.completed).toEqual({ by: 'Р. Чанцалдулам', at: '2026-09-30T11:00:00.000Z' });
        expect(report.missing).toEqual([]);
    });

    it('shows a project manager the full team report while allowing only their own cells to be edited', async () => {
        state.role = 'sales_manager';
        state.userId = 'khon-user';
        const body = await (await get('2026-09-30')).json();
        expect(body.viewer).toEqual({ personal: true, onboarding: false, canEditTeam: true, editable: [KHON] });
        expect(body.roster).toEqual([]);
        expect(body.report.managers.map((manager: { name: string }) => manager.name)).toEqual([KHON, CHAN]);
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

    it('asks an unlinked sales manager to be registered and refuses users without team reports', async () => {
        state.role = 'sales_manager';
        state.userId = 'loose-user';
        expect((await (await get('2026-09-30')).json()).viewer).toMatchObject({ personal: true, onboarding: true });
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
    });

    it.each(['inactive', 'unlinked', 'ambiguous', 'no-project', 'foreign-project'])('does not grant the team view to a manager with %s membership', async reason => {
        state.role = 'sales_manager';
        state.userId = 'khon-user';
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
    });
});

describe('PUT /api/dashboard/daily-report', () => {
    it('lets a sales manager save only their own cells', async () => {
        state.role = 'sales_manager';
        state.userId = 'khon-user';
        const ok = await put({ date: '2026-09-30', cells: [{ manager: KHON, metric: 'call.l1.total', value: 4 }, { manager: KHON, metric: 'chat.personal', value: null }] });
        expect(ok.status).toBe(200);
        const rows = state.db.tables.daily_report_counts.filter(row => row.shop_id === 'shop-1' && row.report_date === '2026-09-30' && row.manager_name === KHON);
        expect(rows.map(row => [row.metric, row.value, row.updated_by])).toEqual([['call.l1.total', 4, 'khon-user']]);

        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] })).status).toBe(403);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: null }], complete: true })).status).toBe(403);
        expect(state.db.tables.daily_report_counts.find(row => row.shop_id === 'shop-1' && row.manager_name === CHAN)?.value).toBe(7);
    });

    it('lets the rotating manager save personal calls, team notes and completion without changing anyone else’s counts', async () => {
        state.role = 'sales_manager';
        state.userId = 'khon-user';
        const before = state.db.tables.daily_report_counts.filter(row => row.manager_name !== KHON || row.shop_id !== 'shop-1');
        const response = await put({ date: '2026-09-30', cells: [{ manager: KHON, metric: 'call.personal.total', value: 5 }], notes: { general: 'Багийн өдрийн нэгтгэл' }, complete: true });
        expect(response.status).toBe(200);
        const body = await (await get('2026-09-30')).json();
        expect(body.report.lines[0].total).toBe(7);
        expect(body.report.lines[1].rows[0].values[KHON]).toBe(5);
        expect(body.report.generalNote).toBe('Багийн өдрийн нэгтгэл');
        expect(body.report.completed.by).toBe('М. Хонгорзул');
        expect(state.db.tables.daily_report_counts.filter(row => row.manager_name !== KHON || row.shop_id !== 'shop-1')).toEqual(before);
        expect(state.db.tables.daily_reports[0].completed_by).toBe('khon-user');
        expect((await put({ date: '2026-09-30', complete: false })).status).toBe(200);
        expect((await (await get('2026-09-30')).json()).report.completed).toBeNull();
    });

    it('checks managers against the roster and metrics against the template', async () => {
        expect((await put({ date: '2026-09-30', cells: [{ manager: 'Өөр төсөл', metric: 'call.l1.total', value: 1 }] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l2.new', value: 1 }] })).status).toBe(409);
        // Загвараас хасагдсан үзүүлэлтийг цэвэрлэж болно.
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l2.new', value: null }] })).status).toBe(200);
        expect((await put({ date: '2099-01-01', cells: [] })).status).toBe(400);
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1.5 }] })).status).toBe(400);
    });

    it('saves team notes, stamps the completer and clears it on reopen', async () => {
        state.db.tables.daily_reports = [];
        const saved = await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 8 }], notes: { lines: { l1: 'Төслийн мэдээлэл' } }, complete: true });
        expect(saved.status).toBe(200);
        expect(state.db.tables.daily_reports[0]).toMatchObject({
            shop_id: 'shop-1', report_date: '2026-09-30', notes: { lines: { l1: 'Төслийн мэдээлэл' } },
            completed_by: 'admin-user', completed_by_name: 'Захирал Бат',
        });
        expect(state.db.tables.daily_report_counts.find(row => row.manager_name === CHAN && row.report_date === '2026-09-30')?.value).toBe(8);

        await put({ date: '2026-09-30', complete: false });
        expect(state.db.tables.daily_reports[0]).toMatchObject({ completed_by: null, completed_by_name: null, completed_at: null, notes: { lines: { l1: 'Төслийн мэдээлэл' } } });
    });

    it('needs dashboard write access and the team view to edit others', async () => {
        state.role = 'director';
        expect((await put({ date: '2026-09-30', cells: [] })).status).toBe(403);
        state.role = 'staff';
        expect((await put({ date: '2026-09-30', cells: [{ manager: CHAN, metric: 'call.l1.total', value: 1 }] })).status).toBe(403);
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
