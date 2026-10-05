// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
    role: 'admin',
    modules: ['reports'] as string[],
    shop: { id: 'shop-1', name: 'Mandala Garden' } as { id: string; name: string } | null,
    gates: [] as string[],
    reads: [] as string[],
    failing: null as string | null,
    rows: {} as Record<string, Row[]>,
    sheets: [] as Array<{ name: string; rows: Row[] }>,
}));
vi.mock('@/lib/auth/require-permission', () => {
    const gate = async (module: string) => {
        state.gates.push(module);
        return state.modules.includes(module) ? null : NextResponse.json({ error: 'Эрх хүрэлцэхгүй' }, { status: 403 });
    };
    return {
        requireModule: gate, requireModuleWrite: gate, requireModuleDelete: gate,
        requireAnyModule: async (modules: string[]) => modules.some(module => state.modules.includes(module)) ? null : NextResponse.json({ error: 'Эрх хүрэлцэхгүй' }, { status: 403 }),
        resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => state.shop, getUserId: async () => 'user-1' }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/utils/xlsx', () => ({
    buildWorkbookBuffer: async (sheets: Array<{ name: string; rows: Row[] }>) => { state.sheets.push(...sheets); return Buffer.from('xlsx'); },
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    state.reads.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    let first = 0;
    let last = Infinity;
    const rows = () => (state.rows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(first, last + 1).slice(0, 1000);
    const result = () => table === state.failing ? { data: null, error: { message: 'connection reset by db-host-7' } } : { data: rows(), error: null };
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        gte: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return query; },
        lt: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) < Date.parse(value)); return query; },
        order: () => query,
        range: (from: number, to: number) => { first = from; last = to; return query; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
} }) }));

import { GET as summary } from '../dashboard/reports/leads-summary/route';
import { GET as exportExcel } from '../dashboard/export/excel/route';

const mandala = '00000000-0000-4000-8000-000000000001';
const elysium = '00000000-0000-4000-8000-000000000002';
const lead = (id: string, extra: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, created_at: '2026-09-15T04:00:00Z', status: 'new', source: 'facebook',
    project_id: mandala, sales_manager_name: 'Манда', customer_name: `Харилцагч ${id}`, customer_phone: '99112233', ...extra,
});
const get = (query: string) => summary(new NextRequest(`http://localhost/api/dashboard/reports/leads-summary${query}`));
const download = (query: string) => exportExcel(new NextRequest(`http://localhost/api/dashboard/export/excel${query}`));
const september = '?from=2026-09-01&to=2026-09-30';

beforeEach(() => {
    Object.assign(state, { role: 'admin', modules: ['reports'], shop: { id: 'shop-1', name: 'Mandala Garden' }, gates: [], reads: [], failing: null, sheets: [] });
    state.rows = {
        projects: [{ id: mandala, shop_id: 'shop-1', name: 'Mandala Garden' }, { id: elysium, shop_id: 'shop-1', name: 'Elysium Residence' }],
        user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
        sales_managers: [
            { shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true },
            { shop_id: 'shop-1', name: 'Хамтрагч', user_id: 'user-3', is_active: true },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: 'Манда', project_id: mandala },
            { shop_id: 'shop-1', manager_name: 'Хамтрагч', project_id: mandala },
        ],
        leads: [
            lead('own', { status: 'closed_won' }),
            lead('colleague', { sales_manager_name: 'Хамтрагч' }),
            lead('foreign', { project_id: elysium }),
            lead('unassigned', { sales_manager_name: null, source: 'phone' }),
            lead('legacy', { project_id: null }),
            lead('before', { created_at: '2026-08-31T15:59:59Z' }), // УБ 08-31 23:59
            lead('after', { created_at: '2026-09-30T16:00:00Z' }), // УБ 10-01 00:00
            lead('deleted', { deleted_at: '2026-09-20T00:00:00Z' }),
            lead('other-shop', { shop_id: 'shop-2' }),
        ],
    };
});

describe('GET /api/dashboard/reports/leads-summary', () => {
    it('requires the reports module and an accessible project before reading data', async () => {
        state.modules = ['leads'];
        expect((await get(september)).status).toBe(403);
        expect(state.gates).toEqual(['reports']);
        state.modules = ['reports'];
        state.shop = null;
        expect((await get(september)).status).toBe(403);
        expect(state.reads).toEqual([]);
    });

    it('counts every lead of the organization in the UB range, beyond the 1,000-row page cap', async () => {
        state.rows.leads.push(...Array.from({ length: 1001 }, (_, index) => lead(`bulk-${index}`, { sales_manager_name: 'Хамтрагч' })));
        const response = await get(september);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.range).toEqual({ period: null, from: '2026-09-01', to: '2026-09-30' });
        expect(body.total).toBe(1006);
        expect(body.conversion).toMatchObject({ won: 1, open: 1005 });
        expect(body.byProject).toEqual([
            { projectId: mandala, name: 'Mandala Garden', count: 1004, won: 1 },
            { projectId: elysium, name: 'Elysium Residence', count: 1, won: 0 },
            { projectId: null, name: null, count: 1, won: 0 },
        ]);
        expect(body.byManager).toEqual([
            { manager: 'Хамтрагч', count: 1002, won: 0 }, { manager: 'Манда', count: 3, won: 1 }, { manager: null, count: 1, won: 0 },
        ]);
        expect(body.bySource).toEqual([{ source: 'facebook', count: 1005, won: 1 }, { source: 'phone', count: 1, won: 0 }]);
    });

    it('limits a sales manager to own leads inside own projects', async () => {
        state.role = 'sales_manager';
        const body = await (await get(september)).json();
        expect(body.total).toBe(1);
        expect(body.byManager).toEqual([{ manager: 'Манда', count: 1, won: 1 }]);
        expect(body.byProject).toEqual([{ projectId: mandala, name: 'Mandala Garden', count: 1, won: 1 }]);

        state.rows.sales_manager_projects = [];
        expect((await (await get(september)).json()).total).toBe(0);
    });

    it('defaults to the last 30 UB days and rejects invalid periods or ranges', async () => {
        const body = await (await get('')).json();
        expect(body.range.period).toBe('month');
        expect(body.range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const query of ['?period=decade', '?from=2026-09-30&to=2026-09-01', '?from=2025-01-01&to=2026-09-30', '?from=2026-09-01']) {
            const response = await get(query);
            expect(response.status).toBe(400);
            expect((await response.json()).error).toBeTruthy();
        }
    });

    it('fails with a generic error instead of a partial report when leads cannot be read', async () => {
        state.failing = 'leads';
        const response = await get(september);
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain('Лидийн тайланг гаргаж чадсангүй');
        expect(text).not.toContain('db-host-7');
    });
});

describe('leads Excel export with the report period', () => {
    beforeEach(() => { state.modules = ['leads']; });

    it('exports only the selected UB days, within the caller scope', async () => {
        const response = await download(`?type=leads&from=2026-09-01&to=2026-09-30`);
        expect(response.status).toBe(200);
        expect(decodeURIComponent(response.headers.get('Content-Disposition') ?? '')).toContain('лийдүүд_2026-09-01_2026-09-30.xlsx');
        expect(state.sheets[0].rows.map(row => row['Нэр'])).toEqual(['own', 'colleague', 'foreign', 'unassigned', 'legacy'].map(id => `Харилцагч ${id}`));
        expect(state.sheets[0].rows[0]['Огноо']).toBe('2026-09-15');

        state.role = 'sales_manager';
        await download(`?type=leads&from=2026-09-01&to=2026-09-30`);
        expect(state.sheets[1].rows.map(row => row['Нэр'])).toEqual(['Харилцагч own']);
    });

    it('keeps the unfiltered export for the leads page and rejects an invalid range', async () => {
        await download('?type=leads');
        expect(state.sheets[0].rows).toHaveLength(7);
        expect((await download('?type=leads&from=2026-09-01')).status).toBe(400);
        expect(state.sheets).toHaveLength(1);
        state.modules = ['reports'];
        expect((await download(`?type=leads&from=2026-09-01&to=2026-09-30`)).status).toBe(403);
    });
});
