// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    role: 'admin', modules: ['reports'] as string[], projectIds: null as string[] | null,
    calls: [] as Array<{ loader: string; options: Record<string, unknown> }>,
    failure: null as Error | null,
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
    resolveSalesProjectScope: async () => ({ projectIds: state.projectIds, managerName: state.projectIds ? 'Khongoroo' : null }),
}));
const record = vi.hoisted(() => (loader: string) => async (_db: unknown, options: Record<string, unknown>) => {
    state.calls.push({ loader, options });
    if (state.failure) throw state.failure;
    return { loader };
});
vi.mock('@/lib/dashboard/sales-activity-load', () => ({ loadSalesActivity: record('activity') }));
vi.mock('@/lib/dashboard/meeting-details-load', () => ({ loadMeetingDetails: record('meetings') }));
vi.mock('@/lib/dashboard/negotiations-load', () => ({ loadNegotiations: record('negotiations') }));

import { GET as activity } from '../dashboard/reports/sales-activity/route';
import { GET as meetings } from '../dashboard/reports/meeting-details/route';
import { GET as negotiations } from '../dashboard/reports/negotiations/route';
import { DailyReportUnavailableError } from '@/lib/dashboard/daily-report-load';
import { nextMeetingDate } from '@/lib/dashboard/weekly-review';
import { ProjectScopeError } from '@/lib/sales/project-scope';

const routes = {
    'sales-activity': activity,
    'meeting-details': meetings,
    negotiations,
} as const;
const get = (name: keyof typeof routes, query = '') => routes[name](new NextRequest(`http://test/api/dashboard/reports/${name}${query}`));

beforeEach(() => {
    Object.assign(state, { role: 'admin', modules: ['reports'], projectIds: null, calls: [], failure: null });
});

describe('Wednesday deck report APIs', () => {
    it.each(Object.keys(routes) as Array<keyof typeof routes>)('%s requires the reports module (super_admin passes)', async (name) => {
        state.modules = ['contracts', 'leads'];
        expect((await get(name)).status).toBe(403);
        expect(state.calls).toHaveLength(0);
        Object.assign(state, { role: 'super_admin', modules: [] });
        const response = await get(name);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ projectName: 'Elysium Residence' });
    });

    it.each(Object.keys(routes) as Array<keyof typeof routes>)('%s refuses a project-restricted sales manager', async (name) => {
        Object.assign(state, { role: 'sales_manager', modules: ['reports'], projectIds: ['p1'] });
        const response = await get(name);
        expect(response.status).toBe(403);
        expect((await response.json()).error).toContain('удирдлагад харагдана');
        expect(state.calls).toHaveLength(0);
    });

    it('defaults to the next meeting and rejects a day that is not a Wednesday', async () => {
        for (const name of ['sales-activity', 'meeting-details'] as const) {
            expect((await get(name)).status).toBe(200);
            expect(state.calls.at(-1)!.options).toMatchObject({ shopId: 'shop-1', meetingDate: nextMeetingDate() });
            expect((await get(name, '?meeting=2026-10-21')).status).toBe(200);
            expect(state.calls.at(-1)!.options.meetingDate).toBe('2026-10-21');
            for (const bad of ['2026-10-20', '2026-02-30', 'abc']) expect((await get(name, `?meeting=${bad}`)).status, `${name} ${bad}`).toBe(400);
        }
        expect(state.calls.find(call => call.loader === 'activity')!.options.shopName).toBe('Elysium Residence');
    });

    it('answers a missing daily report schema with 503', async () => {
        state.failure = new DailyReportUnavailableError();
        const response = await get('sales-activity');
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('идэвхжээгүй');
    });

    it('reads negotiations with the resolved (unrestricted) lead scope and maps pricing read failures', async () => {
        expect((await get('negotiations')).status).toBe(200);
        expect(state.calls.at(-1)!.options).toEqual({ shopId: 'shop-1', scope: { projectIds: null, managerName: null } });
        state.failure = new ProjectScopeError(503, 'Үнийн тохиргоо уншиж чадсангүй. Дахин оролдоно уу');
        expect((await get('negotiations')).status).toBe(503);
        state.failure = new Error('boom');
        const failed = await get('negotiations');
        expect(failed.status).toBe(500);
        expect((await failed.json()).error).toBe('Ярилцаж буй гэрээг гаргаж чадсангүй. Дахин оролдоно уу.');
    });
});
