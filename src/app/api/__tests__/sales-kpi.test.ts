// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    role: 'admin', managerName: null as string | null, isManager: false, canWrite: true,
    loads: [] as Array<Record<string, unknown>>, upserts: [] as Row[], roster: [{ shop_id: 'shop-1', name: 'Номин' }] as Row[], current: null as Row | null,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null,
    requireModuleWrite: async () => state.canWrite ? null : new Response(JSON.stringify({ error: 'denied' }), { status: 403 }),
    requireModuleDelete: async () => null, requireAnyModule: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: ['reports'], canWrite: state.canWrite } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/manager-identity', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/sales/manager-identity')>();
    return { ...actual, resolveReportViewer: async (_db: unknown, _shop: string, input: { userId: string | null; role: string; modules: string[] }) => ({
        ...actual.reportViewerRule({ role: input.role, modules: input.modules, isManager: state.isManager }), userId: input.userId, managerName: state.managerName, identity: null }) };
});
vi.mock('@/lib/sales/kpi-load', () => ({ loadSalesKpi: async (_db: unknown, options: Record<string, unknown>) => { state.loads.push(options); return { year: options.year, month: options.month, sources: null, managers: [] }; } }));
const audit = vi.hoisted(() => vi.fn(async (_entry: Record<string, unknown>) => undefined));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: audit }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        maybeSingle: async () => ({ data: table === 'sales_managers' ? state.roster.find(row => filters.every(filter => filter(row))) ?? null : state.current, error: null }),
        upsert: async (row: Row) => { state.upserts.push(row); return { error: null }; },
    };
    return query;
} }) }));

import { GET, PUT } from '../dashboard/reports/sales-kpi/route';

const get = (query = '') => GET(new NextRequest(`http://test/api/dashboard/reports/sales-kpi${query}`));
const put = (body: unknown) => PUT(new NextRequest('http://test/api/dashboard/reports/sales-kpi', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
    Object.assign(state, { role: 'admin', managerName: null, isManager: false, canWrite: true, loads: [], upserts: [], current: null });
});

describe('sales KPI API', () => {
    it('shows every manager to admins and only the own card to a sales manager', async () => {
        const admin = await get('?year=2026&month=10');
        expect(admin.status).toBe(200);
        expect(await admin.json()).toMatchObject({ canEdit: true });
        expect(state.loads[0]).toMatchObject({ shopId: 'shop-1', year: 2026, month: 10, only: null });

        Object.assign(state, { role: 'sales_manager', isManager: true, managerName: 'Номин' });
        expect(await (await get('?year=2026&month=10')).json()).toMatchObject({ canEdit: false });
        expect(state.loads[1]).toMatchObject({ only: 'Номин' });

        Object.assign(state, { managerName: null });
        expect(await (await get('?year=2026&month=10')).json()).toEqual({ year: 2026, month: 10, sources: null, managers: [], canEdit: false });
        expect(state.loads).toHaveLength(2);
        expect((await get('?year=1999&month=1')).status).toBe(400);
    });

    it('lets only admins save plans, merging with what is stored', async () => {
        state.current = { plans: { cash_collected: 5 }, manual: {}, review: { note: 'хуучин' } };
        const response = await put({ year: 2026, month: 10, manager: 'Номин', plans: { contract_amount: 900 }, review: { management: 4 } });
        expect(response.status).toBe(200);
        expect(state.upserts[0]).toMatchObject({ shop_id: 'shop-1', year: 2026, month: 10, manager_name: 'Номин',
            plans: { cash_collected: 5, contract_amount: 900 }, review: { note: 'хуучин', management: 4 }, updated_by: 'user-1' });

        expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'kpi.update', targetId: 'Номин', meta: expect.objectContaining({ fields: ['plans', 'review'] }) }));
        expect((await put({ year: 2026, month: 10, manager: 'Бүртгэлгүй', plans: { contract_amount: 1 } })).status).toBe(404);
        expect((await put({ year: 2026, month: 10, manager: 'Номин', plans: { unknown: 1 } })).status).toBe(400);
        Object.assign(state, { role: 'sales_manager', isManager: true, managerName: 'Номин' });
        expect((await put({ year: 2026, month: 10, manager: 'Номин', plans: { contract_amount: 1 } })).status).toBe(403);
        expect(state.upserts).toHaveLength(1);
    });

    it('merges daily targets and lets a cleared manual call count fall back to CRM', async () => {
        state.current = { plans: {}, manual: { calls_chats: 40 }, daily: { calls: 15, meetings: 2 }, review: {} };
        const response = await put({ year: 2026, month: 10, manager: 'Номин', manual: { calls_chats: null }, daily: { calls: 20, meetings: null } });
        expect(response.status).toBe(200);
        expect(state.upserts[0]).toMatchObject({ manual: {}, daily: { calls: 20 } });
        expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ meta: expect.objectContaining({ fields: ['manual', 'daily'] }) }));
        expect((await put({ year: 2026, month: 10, manager: 'Номин', daily: { calls: 0 } })).status).toBe(400);
        expect((await put({ year: 2026, month: 10, manager: 'Номин', daily: { calls: 5, visits: 1 } })).status).toBe(400);
    });
});
