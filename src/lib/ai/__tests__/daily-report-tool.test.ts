import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ isManager: false, rosterName: null as string | null, loads: [] as Array<Record<string, unknown>>, unavailable: false }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Elysium Residence' }, error: null }) }) }) }) }),
}));
vi.mock('@/lib/sales/manager-identity', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/sales/manager-identity')>();
    return { ...actual, resolveReportViewer: async (_db: unknown, _shop: string, input: { userId: string; role: string; modules: string[] }) => ({
        ...actual.reportViewerRule({ role: input.role, modules: input.modules, isManager: state.isManager }), userId: input.userId, managerName: state.rosterName,
        identity: { rosterEntry: state.rosterName ? { name: state.rosterName, user_id: input.userId, is_active: true } : null } }) };
});
vi.mock('@/lib/dashboard/daily-report-load', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/dashboard/daily-report-load')>();
    const { buildDailyReport, DEFAULT_DAILY_REPORT_CONFIG } = await import('@/lib/dashboard/daily-report');
    return {
        ...actual,
        loadDailyReport: async (_db: unknown, options: { shopName: string; date: string; only: string | null }) => {
            if (state.unavailable) throw new actual.DailyReportUnavailableError();
            state.loads.push(options);
            const report = buildDailyReport({
                date: options.date, title: `${options.shopName} баг`, config: DEFAULT_DAILY_REPORT_CONFIG,
                roster: [{ name: 'Хонгорзул.Мөнхгэрэл', is_active: true }, { name: 'Чанцалдулам.Раднаа', is_active: true }],
                counts: [{ manager_name: 'Хонгорзул.Мөнхгэрэл', metric: 'call.l1.total', value: 4 }],
                meetings: [{ id: 'm1', manager: 'Хонгорзул.Мөнхгэрэл', type: 'repeat_customer', customer: 'Загдсүрэн', property: null, notes: '10-50 хувь', feedback: null, scheduled_at: '2026-10-07T02:00:00Z' }],
                pendingMeetings: 1, notes: {}, completed: null, only: options.only,
            });
            return { report };
        },
    };
});

import { getDailyReportTool } from '../data-assistant/actions2';

const admin = { canWrite: true, canDelete: false, role: 'admin', modules: ['dashboard', 'reports'] };
const manager = { canWrite: true, canDelete: false, role: 'sales_manager', modules: ['dashboard', 'leads'] };

beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-07T04:00:00Z'), toFake: ['Date'] }); // УБ Лхагва 12:00
    Object.assign(state, { isManager: false, rosterName: null, loads: [], unavailable: false });
});

describe('get_daily_report AI tool', () => {
    it('gives the team today’s report with copy-ready text, missing managers and pending meetings', async () => {
        const result = await getDailyReportTool('shop', {}, 'u-admin', admin) as Record<string, any>;
        expect(state.loads[0]).toMatchObject({ date: '2026-10-07', only: null, shopName: 'Elysium Residence' });
        expect(result.calls).toEqual([{ line: 'Төслийн утас', total: 4, byManager: { 'М. Хонгорзул': 4 } }]);
        expect(result.meetings).toEqual({ total: 1, byType: [{ type: 'Шинэ', count: 0 }, { type: 'Давтан', count: 1 }, { type: 'Захиалагч', count: 0 }] });
        expect(result.missingManagers).toEqual(['Чанцалдулам.Раднаа']);
        expect(result.pendingMeetings).toBe(1);
        expect(result.plainText).toContain('ELYSIUM RESIDENCE БАГ — 2026.10.07');
        expect(result.plainText).toContain('1. Загдсүрэн — 10-50 хувь');
        expect(result.url).toBe('/dashboard/daily-report');
    });

    it('limits a linked sales manager to their own column and refuses users without the team view', async () => {
        Object.assign(state, { isManager: true, rosterName: 'Хонгорзул.Мөнхгэрэл' });
        const own = await getDailyReportTool('shop', { date: '2026-10-06' }, 'u-khon', manager) as Record<string, any>;
        expect(state.loads[0]).toMatchObject({ date: '2026-10-06', only: 'Хонгорзул.Мөнхгэрэл' });
        expect(own.personal).toBe(true);

        Object.assign(state, { isManager: false, rosterName: null });
        expect(await getDailyReportTool('shop', {}, 'u-x', { ...admin, role: 'viewer', modules: ['dashboard'] })).toEqual({ error: 'Багийн өдрийн тайланг харах эрхгүй' });
        expect(await getDailyReportTool('shop', {}, 'u-x', manager)).toMatchObject({ error: expect.stringContaining('холбогдоогүй') });
    });

    it('rejects bad or future dates and explains a missing migration', async () => {
        expect(await getDailyReportTool('shop', { date: '07/10/2026' }, 'u-admin', admin)).toEqual({ error: 'Огноог YYYY-MM-DD хэлбэрээр өгнө үү' });
        expect(await getDailyReportTool('shop', { date: '2026-10-08' }, 'u-admin', admin)).toEqual({ error: 'Ирээдүйн өдрийн тайлан гаргахгүй' });
        state.unavailable = true;
        expect(await getDailyReportTool('shop', {}, 'u-admin', admin)).toMatchObject({ error: expect.stringContaining('идэвхжээгүй') });
    });
});
