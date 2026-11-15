// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ role: 'admin', modules: ['reports'] as string[], calls: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async (module: string) => state.role === 'super_admin' || state.modules.includes(module)
        ? null : new Response(JSON.stringify({ error: 'denied' }), { status: 403 }),
    requireModuleWrite: async () => null, requireModuleDelete: async () => null, requireAnyModule: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules, canWrite: true } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/dashboard/weekly-manual-load', () => ({
    loadWeeklyManual: async (_db: unknown, options: Record<string, unknown>) => { state.calls.push(options); return { month: '2026-11' }; },
}));

import { GET } from '../dashboard/reports/weekly-manual/route';

const get = (query = '?meetingDate=2026-11-11') => GET(new NextRequest(`http://test/api/dashboard/reports/weekly-manual${query}`));

beforeEach(() => { Object.assign(state, { role: 'admin', modules: ['reports'], calls: [] }); });

describe('GET /api/dashboard/reports/weekly-manual', () => {
    it('requires the reports module and never caches the answer', async () => {
        state.modules = ['contracts', 'finance'];
        expect((await get()).status).toBe(403);
        expect(state.calls).toHaveLength(0);
        state.modules = ['reports'];
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ month: '2026-11' });
    });

    it('rejects a meeting day that is not a Wednesday', async () => {
        expect((await get('?meetingDate=2026-11-10')).status).toBe(400);
        expect((await get('')).status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it('reads the period chosen on the meeting page and rejects one that ends after the meeting', async () => {
        expect((await get('?meetingDate=2026-11-11&from=2026-10-28&to=2026-11-10')).status).toBe(200);
        expect(state.calls[0]).toMatchObject({ meetingDate: '2026-11-11', range: { from: '2026-10-28', to: '2026-11-10' } });
        const late = await get('?meetingDate=2026-11-11&from=2026-11-05&to=2026-11-12');
        expect(late.status).toBe(400);
        expect((await late.json()).error).toBe('Тайлант хугацаа хурлын өдрөөс хойш дуусах боломжгүй.');
        expect(state.calls).toHaveLength(1);
    });

    it('shows customer names only with contracts and the cash rows only with finance', async () => {
        await get();
        expect(state.calls[0]).toEqual({ shopId: 'shop-1', meetingDate: '2026-11-11', range: { from: '2026-11-04', to: '2026-11-10' }, canSeeCustomers: false, canSeeCash: false });
        state.modules = ['reports', 'contracts', 'finance'];
        await get();
        expect(state.calls[1]).toMatchObject({ canSeeCustomers: true, canSeeCash: true });
        Object.assign(state, { role: 'super_admin', modules: [] });
        await get();
        expect(state.calls[2]).toMatchObject({ canSeeCustomers: true, canSeeCash: true });
    });
});
