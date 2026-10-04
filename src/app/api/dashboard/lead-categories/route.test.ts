// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

type Role = 'admin' | 'sales_manager' | 'marketing' | 'viewer' | 'settings_editor';
const state = vi.hoisted(() => ({
    role: 'admin' as string,
    scope: { projectIds: null as string[] | null, managerName: null as string | null },
    db: null as unknown as MemoryDb,
}));
const PERMS: Record<Role, { modules: string[]; canWrite: boolean; canDelete: boolean }> = {
    admin: { modules: ['leads', 'reports-leads', 'settings'], canWrite: true, canDelete: true },
    sales_manager: { modules: ['leads', 'reports-leads'], canWrite: true, canDelete: false },
    marketing: { modules: ['leads', 'reports-leads'], canWrite: true, canDelete: false },
    viewer: { modules: ['dashboard', 'reports'], canWrite: false, canDelete: false },
    settings_editor: { modules: ['settings'], canWrite: true, canDelete: false },
};
const deny = (message = 'Энэ хэсэгт хандах эрх танд алга') => NextResponse.json({ error: message }, { status: 403 });
vi.mock('@/lib/auth/require-permission', () => {
    const perms = () => PERMS[state.role as Role];
    return {
        requireModule: async (module: string) => perms().modules.includes(module) ? null : deny(),
        requireAnyModule: async (modules: string[]) => modules.some((m) => perms().modules.includes(m)) ? null : deny(),
        requireModuleWrite: async (module: string) => perms().modules.includes(module) && perms().canWrite ? null : deny(),
        requireModuleDelete: async (module: string) => perms().modules.includes(module) && perms().canDelete ? null : deny(),
        resolvePermissions: async () => ({ role: state.role, permissions: perms() }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));
vi.mock('@/lib/sales/project-scope', async (original) => ({
    ...(await original<typeof import('@/lib/sales/project-scope')>()),
    resolveSalesProjectScope: async () => state.scope,
}));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: async () => {} }));

import { createMemoryDb } from '@/test/memory-db';
import { categoryNameKey, DEFAULT_LEAD_CATEGORIES } from '@/lib/leads/labels';
import { GET, PATCH as REORDER, POST } from './route';
import { DELETE, PATCH } from './[id]/route';

const active = '20000000-0000-4000-8000-000000000001';
const archived = '20000000-0000-4000-8000-000000000002';
const foreign = '20000000-0000-4000-8000-000000000003';
const request = (path = '', method = 'GET', body?: unknown) =>
    new NextRequest(`http://localhost/api/dashboard/lead-categories${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    state.role = 'admin';
    state.scope = { projectIds: null, managerName: null };
    state.db = createMemoryDb({
        lead_categories: [
            { id: active, shop_id: 'shop-1', name: 'Хөрөнгө оруулагч', description: null, tone: 'success', sort_order: 10, is_active: true },
            { id: archived, shop_id: 'shop-1', name: 'Бартер', description: null, tone: 'neutral', sort_order: 20, is_active: false },
            { id: foreign, shop_id: 'shop-2', name: 'Түрээслэгч', description: null, tone: 'neutral', sort_order: 10, is_active: true },
        ],
        leads: [
            { id: 'l1', shop_id: 'shop-1', category_id: active, deleted_at: null },
            { id: 'l2', shop_id: 'shop-1', category_id: null, deleted_at: null },
            { id: 'l3', shop_id: 'shop-1', category_id: archived, deleted_at: '2026-09-01' },
        ],
    }, {
        insert: (table, row, rows) => table === 'lead_categories'
            && rows.some((other) => other.shop_id === row.shop_id && categoryNameKey(other.name) === categoryNameKey(row.name))
            ? { code: '23505', message: 'duplicate key' } : null,
    });
});

describe('GET /api/dashboard/lead-categories', () => {
    it('lets lead, lead-report and settings readers read the project categories only', async () => {
        for (const role of ['sales_manager', 'marketing', 'settings_editor']) {
            state.role = role;
            const response = await GET(request());
            expect(response.status).toBe(200);
            expect(response.headers.get('Cache-Control')).toBe('private, no-store');
            expect((await response.json()).categories.map((c: { id: string }) => c.id)).toEqual([active]);
        }
        expect((await (await GET(request('?include=archived'))).json()).categories.map((c: { id: string }) => c.id)).toEqual([active, archived]);
        state.role = 'viewer';
        expect((await GET(request())).status).toBe(403);
    });

    it('returns lead counts only to unrestricted settings users', async () => {
        const response = await GET(request('?include=archived&counts=1'));
        // Бартер устгасан лидэд л ашиглагдсан: тоо 0 ч `referenced` — устгах товч идэвхгүй.
        expect(await response.json()).toMatchObject({ counts: { byCategory: { [active]: 1, [archived]: 0 }, uncategorized: 1, referenced: [active, archived] } });
        state.role = 'sales_manager';
        expect((await GET(request('?counts=1'))).status).toBe(403);
        state.role = 'settings_editor';
        state.scope = { projectIds: ['p1'], managerName: 'Манда' };
        expect((await GET(request('?counts=1'))).status).toBe(403);
    });
});

describe('category settings writes', () => {
    it('denies writes without settings write access and writes nothing', async () => {
        for (const role of ['sales_manager', 'marketing', 'viewer']) {
            state.role = role;
            expect((await POST(request('', 'POST', { name: 'Шинэ' }))).status).toBe(403);
            expect((await PATCH(request(`/${active}`, 'PATCH', { is_active: false }), context(active))).status).toBe(403);
            expect((await DELETE(request(`/${active}`, 'DELETE'), context(active))).status).toBe(403);
        }
        state.role = 'settings_editor'; // бичих эрхтэй ч устгах эрхгүй
        expect((await DELETE(request(`/${active}`, 'DELETE'), context(active))).status).toBe(403);
        expect(state.db.writes).toEqual([]);
    });

    it('creates with a strict allow-list and refuses duplicates', async () => {
        const created = await POST(request('', 'POST', { name: ' Дилер / Агент ', tone: 'info', description: 'Зуучлагч' }));
        expect(created.status).toBe(201);
        expect((await created.json()).category).toMatchObject({ name: 'Дилер / Агент', tone: 'info', description: 'Зуучлагч' });
        expect(state.db.writes.at(-1)?.data).toMatchObject({ shop_id: 'shop-1', created_by: 'user-1' });

        const unknown = await POST(request('', 'POST', { name: 'Хакер', shop_id: 'shop-2' }));
        expect(unknown.status).toBe(400);
        expect((await unknown.json()).error).toBe('Зөвшөөрөгдөөгүй талбар: shop_id');
        expect((await POST(request('', 'POST', { name: 'хөрөнгө оруулагч' }))).status).toBe(409);
        expect((await POST(request('', 'POST', { name: 'Аюул', tone: 'danger' }))).status).toBe(400);
        expect((await POST(request('', 'POST', { preset: 'all' }))).status).toBe(400);
    });

    it('adds the suggested preset once', async () => {
        const first = await (await POST(request('', 'POST', { preset: 'defaults' }))).json();
        expect(first.created.map((c: { name: string }) => c.name)).toEqual(DEFAULT_LEAD_CATEGORIES.filter((p) => !['Бартер', 'Хөрөнгө оруулагч'].includes(p.name)).map((p) => p.name));
        expect((await (await POST(request('', 'POST', { preset: 'defaults' }))).json()).created).toEqual([]);
    });

    it('archives, renames and deletes only within the shop', async () => {
        const archivedNow = await PATCH(request(`/${active}`, 'PATCH', { is_active: false }), context(active));
        expect((await archivedNow.json()).category).toMatchObject({ id: active, is_active: false });
        const strict = await PATCH(request(`/${active}`, 'PATCH', { shop_id: 'shop-2' }), context(active));
        expect(strict.status).toBe(400);
        expect((await PATCH(request(`/${active}`, 'PATCH', {}), context(active))).status).toBe(400);
        expect((await PATCH(request(`/${foreign}`, 'PATCH', { name: 'Миний' }), context(foreign))).status).toBe(404);
        expect((await PATCH(request(`/${active}`, 'PATCH', { name: 'БАРТЕР' }), context(active))).status).toBe(409);

        // Устгасан лидэд ашиглагдсан ч устгахгүй (FK) — архивлана; мессежид лидийн тоо гарахгүй.
        const used = await DELETE(request(`/${archived}`, 'DELETE'), context(archived));
        expect(used.status).toBe(409);
        expect((await used.json()).error).not.toMatch(/\d/);
        expect((await DELETE(request(`/${foreign}`, 'DELETE'), context(foreign))).status).toBe(404);
        state.db.tables.leads = [];
        expect((await DELETE(request(`/${archived}`, 'DELETE'), context(archived))).status).toBe(200);
        expect(state.db.tables.lead_categories.map((c) => c.id)).toEqual([active, foreign]);
    });

    it('reorders the whole list in one request with settings write access only', async () => {
        for (const role of ['sales_manager', 'marketing', 'viewer']) {
            state.role = role;
            expect((await REORDER(request('', 'PATCH', { order: [archived, active] }))).status).toBe(403);
        }
        expect(state.db.writes).toEqual([]);
        state.role = 'settings_editor';
        expect((await REORDER(request('', 'PATCH', { order: [archived] }))).status).toBe(409);
        expect((await REORDER(request('', 'PATCH', { order: [archived, foreign] }))).status).toBe(409);
        expect((await REORDER(request('', 'PATCH', { order: [archived, active], shop_id: 'shop-2' }))).status).toBe(400);
        expect((await REORDER(request('', 'PATCH', { order: 'x' }))).status).toBe(400);
        expect(state.db.writes).toEqual([]);

        const response = await REORDER(request('', 'PATCH', { order: [archived, active] }));
        expect(response.status).toBe(200);
        expect((await response.json()).categories.map((c: { id: string; sort_order: number }) => [c.id, c.sort_order])).toEqual([[archived, 10], [active, 20]]);
        expect(state.db.writes.map((w) => [w.data.id, w.data.sort_order])).toEqual([[archived, 10], [active, 20]]);
        expect(state.db.tables.lead_categories.find((c) => c.id === foreign)?.sort_order).toBe(10);
    });
});
