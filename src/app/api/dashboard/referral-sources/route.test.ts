// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

type Role = 'admin' | 'sales_manager' | 'contracts_reader' | 'reports_reader' | 'marketing' | 'settings_reader';
const state = vi.hoisted(() => ({ role: 'admin' as string, db: null as unknown as MemoryDb }));
const PERMS: Record<Role, { modules: string[]; canWrite: boolean; canDelete: boolean }> = {
    admin: { modules: ['viewings', 'contracts', 'reports', 'settings'], canWrite: true, canDelete: true },
    sales_manager: { modules: ['leads', 'viewings'], canWrite: true, canDelete: false },
    contracts_reader: { modules: ['contracts'], canWrite: false, canDelete: false },
    reports_reader: { modules: ['reports'], canWrite: false, canDelete: false },
    marketing: { modules: ['marketing-roi'], canWrite: true, canDelete: false },
    settings_reader: { modules: ['settings'], canWrite: false, canDelete: false },
};
const deny = () => NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
vi.mock('@/lib/auth/require-permission', () => {
    const perms = () => PERMS[state.role as Role];
    return {
        requireModule: async (module: string) => perms().modules.includes(module) ? null : deny(),
        requireAnyModule: async (modules: string[]) => modules.some((m) => perms().modules.includes(m)) ? null : deny(),
        requireModuleWrite: async (module: string) => perms().modules.includes(module) && perms().canWrite ? null : deny(),
        requireModuleDelete: async (module: string) => perms().modules.includes(module) && perms().canDelete ? null : deny(),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: async () => {} }));

import { createMemoryDb } from '@/test/memory-db';
import { GET, PATCH as REORDER, POST } from './route';
import { PATCH } from './[id]/route';

const facebook = '20000000-0000-4000-8000-000000000001';
const archived = '20000000-0000-4000-8000-000000000002';
const foreign = '20000000-0000-4000-8000-000000000003';
const request = (path = '', method = 'GET', body?: unknown) =>
    new NextRequest(`http://localhost/api/dashboard/referral-sources${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    state.role = 'admin';
    state.db = createMemoryDb({
        sales_referral_sources: [
            { id: facebook, shop_id: 'shop-1', name: 'Facebook', sort_order: 10, archived_at: null },
            { id: archived, shop_id: 'shop-1', name: 'Бармаш түрээслэгч', sort_order: 20, archived_at: '2026-10-20T00:00:00Z' },
            { id: foreign, shop_id: 'shop-2', name: 'Монкон', sort_order: 10, archived_at: null },
        ],
    });
});

describe('GET /api/dashboard/referral-sources', () => {
    it('lets meeting, contract, report and settings readers read the project list only', async () => {
        for (const role of ['sales_manager', 'contracts_reader', 'reports_reader', 'settings_reader']) {
            state.role = role;
            const response = await GET(request());
            expect(response.status).toBe(200);
            expect(response.headers.get('Cache-Control')).toBe('private, no-store');
            expect(await response.json()).toMatchObject({ available: true, sources: [{ id: facebook }] });
        }
        expect((await (await GET(request('?include=archived'))).json()).sources.map((s: { id: string }) => s.id)).toEqual([facebook, archived]);
        state.role = 'marketing';
        expect((await GET(request())).status).toBe(403);
    });

    it('answers an empty, unavailable list when the migration is missing (never a 500)', async () => {
        state.db.failNext.sales_referral_sources = { code: 'PGRST205', message: "Could not find the table 'public.sales_referral_sources'" };
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ sources: [], available: false });
    });
});

describe('settings writes', () => {
    it('needs settings write access for every write', async () => {
        for (const role of ['sales_manager', 'settings_reader', 'contracts_reader']) {
            state.role = role;
            expect((await POST(request('', 'POST', { name: 'Билбоард' }))).status).toBe(403);
            expect((await POST(request('', 'POST', { preset: 'defaults' }))).status).toBe(403);
            expect((await REORDER(request('', 'PATCH', { order: [facebook, archived] }))).status).toBe(403);
            expect((await PATCH(request(`/${facebook}`, 'PATCH', { archived: true }), context(facebook))).status).toBe(403);
        }
        expect(state.db.writes).toEqual([]);
    });

    it('creates, adds the defaults, renames, archives and reorders with strict bodies', async () => {
        const created = await POST(request('', 'POST', { name: '  Билбоард ' }));
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({ source: { name: 'Билбоард', sort_order: 30 } });
        expect((await POST(request('', 'POST', { name: 'Шинэ', shop_id: 'shop-2' }))).status).toBe(400);
        expect(await (await POST(request('', 'POST', { name: 'facebook' }))).json()).toMatchObject({ error: expect.stringContaining('Facebook') });
        expect((await POST(request('', 'POST', { preset: 'all' }))).status).toBe(400);
        const preset = await (await POST(request('', 'POST', { preset: 'defaults' }))).json();
        expect(preset.created.map((s: { name: string }) => s.name)).toEqual(['Инстаграм', 'Ойрхон амьдардаг', 'Монкон', 'Мандала Гарден ОС', 'Ажилтан', 'Танил', 'Бусад']);

        expect(await (await PATCH(request(`/${facebook}`, 'PATCH', { name: 'Facebook пэйж' }), context(facebook))).json()).toMatchObject({ source: { name: 'Facebook пэйж' } });
        expect((await PATCH(request(`/${facebook}`, 'PATCH', { archived_at: null }), context(facebook))).status).toBe(400);
        expect((await PATCH(request(`/${foreign}`, 'PATCH', { archived: true }), context(foreign))).status).toBe(404);
        expect(await (await PATCH(request(`/${archived}`, 'PATCH', { archived: false }), context(archived))).json()).toMatchObject({ source: { archived_at: null } });

        const ids = (state.db.tables.sales_referral_sources as Array<{ id: string; shop_id: string }>).filter(row => row.shop_id === 'shop-1').map(row => row.id);
        const reordered = await REORDER(request('', 'PATCH', { order: [...ids].reverse() }));
        expect(reordered.status).toBe(200);
        expect((await reordered.json()).sources[0].id).toBe(ids.at(-1));
        expect((await REORDER(request('', 'PATCH', { order: [facebook, facebook] }))).status).toBe(400);
        expect((await REORDER(request('', 'PATCH', { order: [facebook] }))).status).toBe(409);
    });
});
