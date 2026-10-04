// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    role: 'admin', modules: ['dashboard', 'reports'] as string[], isManager: false, rosterName: null as string | null,
    loads: [] as Array<Record<string, unknown>>, gates: [] as unknown[],
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireAnyModule: async (modules: string[]) => { state.gates.push(modules); return modules.some(module => state.modules.includes(module)) ? null : new Response('{}', { status: 403 }); },
    requireModule: async () => null, requireModuleWrite: async () => null, requireModuleDelete: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/sales/manager-identity', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/sales/manager-identity')>();
    return { ...actual, resolveReportViewer: async (_db: unknown, _shop: string, input: { userId: string | null; role: string; modules: string[] }) => ({
        ...actual.reportViewerRule({ role: input.role, modules: input.modules, isManager: state.isManager }), userId: input.userId,
        managerName: state.rosterName ?? 'Профайлын нэр',
        identity: { rosterEntry: state.rosterName ? { name: state.rosterName, user_id: 'user-1', is_active: true } : null } }) };
});
vi.mock('@/lib/sales/activity-load', () => ({ loadManagerActivity: async (_db: unknown, options: Record<string, unknown>) => {
    state.loads.push(options);
    return { from: options.from, to: options.to, group: options.group, today: '2026-10-05', targetDays: 1, periods: [], managers: [], unattributed: null };
} }));

import { GET } from '../dashboard/reports/manager-activity/route';

const get = (query = '') => GET(new NextRequest(`http://test/api/dashboard/reports/manager-activity${query}`));

beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-04T16:30:00Z'), toFake: ['Date'] }); // УБ 2026-10-05 00:30
    Object.assign(state, { role: 'admin', modules: ['dashboard', 'reports'], isManager: false, rosterName: null, loads: [], gates: [] });
});

describe('manager activity API', () => {
    it('shows the whole team (or one picked manager) to admins and defaults to today in Ulaanbaatar', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ personal: false, canEdit: true, onboarding: false });
        expect(state.gates[0]).toEqual(['reports', 'dashboard']);
        expect(state.loads[0]).toMatchObject({ shopId: 'shop-1', from: '2026-10-05', to: '2026-10-05', group: 'day', only: null });
        await get('?from=2026-10-01&to=2026-10-31&group=week&manager=Сараа');
        expect(state.loads[1]).toMatchObject({ from: '2026-10-01', to: '2026-10-31', group: 'week', only: 'Сараа' });
        Object.assign(state, { role: 'viewer' });
        expect(await (await get()).json()).toMatchObject({ canEdit: false, personal: false });
    });

    it('limits a sales manager to the own roster row whatever manager is asked for', async () => {
        Object.assign(state, { role: 'sales_manager', modules: ['dashboard'], isManager: true, rosterName: 'Номин' });
        expect(await (await get('?manager=Сараа')).json()).toMatchObject({ personal: true, canEdit: false });
        expect(state.loads[0]).toMatchObject({ only: 'Номин' });
        // Бүртгэлгүй менежер: хоосон, onboarding (өгөгдөл уншихгүй).
        Object.assign(state, { rosterName: null });
        expect(await (await get()).json()).toMatchObject({ personal: true, onboarding: true, managers: [] });
        expect(state.loads).toHaveLength(1);
    });

    it('refuses the team view to dashboard-only users and validates the range', async () => {
        Object.assign(state, { role: 'marketing', modules: ['dashboard'] });
        const denied = await get();
        expect(denied.status).toBe(403);
        expect(await denied.json()).toEqual({ error: 'Багийн идэвхийг харах эрхгүй' });
        Object.assign(state, { modules: ['marketing-roi'] });
        expect((await get()).status).toBe(403);
        Object.assign(state, { role: 'admin', modules: ['reports'] });
        expect((await get('?from=2026-10-05&to=2026-10-01')).status).toBe(400);
        expect((await get('?from=2026-01-01&to=2026-04-03')).status).toBe(400);
        expect((await get('?from=2026-02-30')).status).toBe(400);
        expect((await get('?group=year')).status).toBe(400);
        expect(state.loads).toHaveLength(0);
    });
});
