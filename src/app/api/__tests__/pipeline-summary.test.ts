// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
    role: 'admin',
    modules: ['leads'] as string[],
    shop: { id: 'shop-1', name: 'Mandala Garden' } as { id: string; name: string } | null,
    gates: [] as string[],
    reads: [] as string[],
    pages: [] as number[],
    failing: null as string | null,
    rows: {} as Record<string, Row[]>,
}));
vi.mock('@/lib/auth/require-permission', () => {
    const gate = async (module: string) => {
        state.gates.push(module);
        return state.modules.includes(module) ? null : NextResponse.json({ error: 'Эрх хүрэлцэхгүй' }, { status: 403 });
    };
    return {
        requireModule: gate, requireModuleWrite: gate, requireModuleDelete: gate, requireAnyModule: gate,
        resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => state.shop, getUserId: async () => 'user-1' }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    state.reads.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    let first = 0;
    let last = Infinity;
    const rows = () => (state.rows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(first, last + 1).slice(0, 1000);
    const result = () => (table === state.failing ? { data: null, error: { message: 'connection reset by db-host-7' } } : { data: rows(), error: null });
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query,
        range: (from: number, to: number) => { first = from; last = to; if (table === 'leads') state.pages.push(from); return query; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
} }) }));

import { GET } from '../dashboard/leads/pipeline-summary/route';

const mandala = '00000000-0000-4000-8000-000000000001';
const elysium = '00000000-0000-4000-8000-000000000002';
const investor = '00000000-0000-4000-8000-0000000000a1';
const lead = (id: string, extra: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, status: 'new', budget_min: null, budget_max: null, next_followup_at: '2099-01-01T00:00:00Z',
    stage_changed_at: new Date().toISOString(), created_at: new Date().toISOString(),
    project_id: mandala, sales_manager_name: 'Манда', category_id: null, ...extra,
});
const get = (query = '') => GET(new NextRequest(`http://localhost/api/dashboard/leads/pipeline-summary${query}`));
const counts = (body: { stages: Array<{ status: string; count: number }> }) => Object.fromEntries(body.stages.map(s => [s.status, s.count]));

beforeEach(() => {
    Object.assign(state, { role: 'admin', modules: ['leads'], shop: { id: 'shop-1', name: 'Mandala Garden' }, gates: [], reads: [], pages: [], failing: null });
    state.rows = {
        user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
        sales_managers: [{ shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop-1', manager_name: 'Манда', project_id: mandala }],
        leads: [
            ...Array.from({ length: 1001 }, (_, i) => lead(`bulk-${i}`, { sales_manager_name: 'Хамтрагч', budget_min: 100 })),
            lead('won', { status: 'closed_won', budget_min: 400, budget_max: 600, category_id: investor }),
            lead('stalled', { status: 'negotiating', next_followup_at: null, stage_changed_at: '2026-01-01T00:00:00Z', budget_max: 1000 }),
            lead('elysium', { status: 'contacted', project_id: elysium }),
            lead('deleted', { deleted_at: '2026-09-01T00:00:00Z' }),
            lead('other-shop', { shop_id: 'shop-2' }),
        ],
    };
});

describe('GET /api/dashboard/leads/pipeline-summary', () => {
    it('requires the leads module and an accessible project before reading data', async () => {
        state.modules = ['reports'];
        expect((await get()).status).toBe(403);
        expect(state.gates).toEqual(['leads']);
        state.modules = ['leads'];
        state.shop = null;
        expect((await get()).status).toBe(403);
        expect(state.reads).toEqual([]);
    });

    it('counts every lead of the organization beyond the 1,000-row page cap', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(state.pages).toEqual([0, 1000]);
        expect(counts(body)).toEqual({ new: 1001, contacted: 1, viewing_scheduled: 0, offered: 0, negotiating: 1, closed_won: 1, closed_lost: 0 });
        expect(body.stages.find((s: { status: string }) => s.status === 'new')).toEqual({ status: 'new', count: 1001, value: 100_100, stalled: 0, noNextStep: 0 });
        expect(body.stages.find((s: { status: string }) => s.status === 'negotiating')).toEqual({ status: 'negotiating', count: 1, value: 1000, stalled: 1, noNextStep: 1 });
        expect(body.stages.find((s: { status: string }) => s.status === 'closed_won')).toMatchObject({ count: 1, value: 500 });
    });

    it('filters by a lead category or by uncategorized leads, like the board list', async () => {
        expect(counts(await (await get(`?category=${investor}`)).json())).toMatchObject({ new: 0, closed_won: 1, negotiating: 0 });
        expect(counts(await (await get('?category=none')).json())).toMatchObject({ new: 1001, closed_won: 0, negotiating: 1 });
        expect(counts(await (await get('?category=all')).json())).toMatchObject({ new: 1001, closed_won: 1 });

        state.reads = [];
        const invalid = await get('?category=investor');
        expect(invalid.status).toBe(400);
        expect((await invalid.json()).error).toBe('Буруу ангилал');
        expect(state.reads).not.toContain('leads');
    });

    it('limits a sales manager to own leads inside own projects', async () => {
        state.role = 'sales_manager';
        expect(counts(await (await get()).json())).toEqual({ new: 0, contacted: 0, viewing_scheduled: 0, offered: 0, negotiating: 1, closed_won: 1, closed_lost: 0 });
    });

    it('fails with a generic error instead of partial counts when leads cannot be read', async () => {
        state.failing = 'leads';
        const response = await get();
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain('Pipeline-ийн тоог гаргаж чадсангүй');
        expect(text).not.toContain('db-host-7');
    });
});
