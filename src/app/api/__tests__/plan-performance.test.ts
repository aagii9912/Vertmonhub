// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    role: 'admin', modules: ['reports'] as string[], projectIds: null as string[] | null,
    loads: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async (module: string) => state.role === 'super_admin' || state.modules.includes(module)
        ? null : new Response(JSON.stringify({ error: 'denied' }), { status: 403 }),
    requireModuleWrite: async () => null, requireModuleDelete: async () => null, requireAnyModule: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules, canWrite: true } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/sales/project-scope')>()),
    resolveSalesProjectScope: async () => ({ projectIds: state.projectIds, managerName: state.projectIds ? 'Номин' : null }),
}));
vi.mock('@/lib/sales/plan-performance-load', () => ({
    loadPlanPerformance: async (_db: unknown, options: Record<string, unknown>) => {
        state.loads.push(options);
        return { year: options.year, months: [], cash: options.canReadFinance ? { availability: 'none', unknownPaid: 1, liveContracts: 1 } : null };
    },
}));

import { GET } from '../dashboard/reports/plan-performance/route';

const get = (query = '') => GET(new NextRequest(`http://test/api/dashboard/reports/plan-performance${query}`));

beforeEach(() => {
    Object.assign(state, { role: 'admin', modules: ['reports'], projectIds: null, loads: [] });
});

describe('plan performance API', () => {
    it('requires the reports module (super_admin passes) before reading anything', async () => {
        state.modules = ['contracts'];
        expect((await get('?year=2026')).status).toBe(403);
        expect(state.loads).toHaveLength(0);
        Object.assign(state, { role: 'super_admin', modules: [] });
        expect((await get('?year=2026')).status).toBe(200);
        expect(state.loads[0]).toMatchObject({ shopId: 'shop-1', year: 2026, canReadFinance: true });
    });

    it('refuses the team plan to a project-restricted sales manager', async () => {
        Object.assign(state, { role: 'sales_manager', modules: ['reports', 'contracts'], projectIds: ['p1'] });
        const response = await get('?year=2026');
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Багийн төлөвлөгөө удирдлагад харагдана' });
        expect(state.loads).toHaveLength(0);
    });

    it('omits cash without finance and includes it with finance', async () => {
        const hidden = await (await get('?year=2026')).json();
        expect(hidden).toMatchObject({ cashHidden: true, cash: null, shopName: 'Elysium Residence' });
        expect(state.loads[0]).toMatchObject({ canReadFinance: false });
        state.modules = ['reports', 'finance'];
        const shown = await (await get('?year=2026')).json();
        expect(shown.cashHidden).toBeUndefined();
        expect(shown.cash).toMatchObject({ availability: 'none' });
    });

    it('validates the year and defaults to the current Ulaanbaatar year', async () => {
        expect((await get('?year=abc')).status).toBe(400);
        expect((await get('?year=1999')).status).toBe(400);
        expect((await get()).status).toBe(200);
        expect(state.loads.at(-1)!.year).toBeGreaterThanOrEqual(2026);
    });

    it('passes a valid report date (through), defaults the year to its year and answers impossible dates with 400', async () => {
        expect((await get('?through=2026-10-20')).status).toBe(200);
        expect(state.loads.at(-1)).toMatchObject({ year: 2026, through: '2026-10-20' });
        expect((await get('?year=2025&through=2026-10-20')).status).toBe(200);
        expect(state.loads.at(-1)).toMatchObject({ year: 2025, through: '2026-10-20' });
        for (const bad of ['2026-13-01', '2026-00-10', '2026-02-30', '2026-1x-01', 'abc']) expect((await get(`?through=${bad}`)).status, bad).toBe(400);
        expect(state.loads.every(load => !('through' in load) || load.through === '2026-10-20')).toBe(true);
    });
});
