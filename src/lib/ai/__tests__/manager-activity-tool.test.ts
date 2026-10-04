import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ isManager: false, rosterName: null as string | null, loads: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/sales/manager-identity', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/sales/manager-identity')>();
    return { ...actual, resolveReportViewer: async (_db: unknown, _shop: string, input: { userId: string; role: string; modules: string[] }) => ({
        ...actual.reportViewerRule({ role: input.role, modules: input.modules, isManager: state.isManager }), userId: input.userId, managerName: state.rosterName,
        identity: { rosterEntry: state.rosterName ? { name: state.rosterName, user_id: input.userId, is_active: true } : null } }) };
});
vi.mock('@/lib/sales/activity-load', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/sales/activity-load')>();
    const { buildManagerActivity } = await import('@/lib/sales/activity');
    const roster = [{ name: 'Номин-Эрдэнэ', user_id: 'u1', is_active: true }, { name: 'Сараа', user_id: null, is_active: true }];
    // findActivityManager-ийн жинхэнэ дүрэм, бүртгэлийг хуурамч db-ээс.
    const rosterDb = { from: () => ({ select: () => ({ eq: async () => ({ data: roster, error: null }) }) }) } as never;
    return {
        findActivityManager: (_db: unknown, shopId: string, name: string) => actual.findActivityManager(rosterDb, shopId, name),
        loadManagerActivity: async (_db: unknown, options: { from: string; to: string; group: 'day' | 'week' | 'month'; only: string | null }) => {
            state.loads.push(options);
            return buildManagerActivity({ ...options, now: new Date('2026-10-07T04:00:00Z'), roster,
                calls: [{ created_by: 'u1', created_by_name: 'Номин-Эрдэнэ', created_at: '2026-10-07T01:00:00Z' }], meetings: [], requests: [], targets: [] });
        },
    };
});

import { getManagerActivityTool } from '../data-assistant/actions2';

const admin = { canWrite: true, canDelete: false, role: 'admin', modules: ['dashboard', 'reports'] };

beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-07T04:00:00Z'), toFake: ['Date'] }); // УБ Лхагва 12:00
    Object.assign(state, { isManager: false, rosterName: null, loads: [] });
});

describe('get_manager_activity AI tool', () => {
    it('defaults to the current period up to today and returns compact totals with guidance', async () => {
        const result = await getManagerActivityTool('shop', { group: 'month' }, 'u-admin', admin) as Record<string, any>;
        expect(state.loads[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-07', group: 'month', only: null });
        expect(result.managers.find((row: { manager: string }) => row.manager === 'Номин-Эрдэнэ')).toMatchObject({ inRoster: true, total: { calls: 1, callTarget: null, callPct: null } });
        expect(result.guidance).toContain('0% гэж бүү');
        await getManagerActivityTool('shop', { group: 'week' }, 'u-admin', admin);
        expect(state.loads[1]).toMatchObject({ from: '2026-10-07', to: '2026-10-07', group: 'week' });
        const daily = await getManagerActivityTool('shop', { from: '2026-10-05', to: '2026-10-07', manager: 'Номин-Эрдэнэ' }, 'u-admin', admin) as Record<string, any>;
        expect(state.loads[2]).toMatchObject({ only: 'Номин-Эрдэнэ' });
        expect(daily.managers[0].periods).toHaveLength(3);
        // Зөвхөн `from` («…-аас хойш»): өнөөдрийг хүртэл, нэг өдөр биш.
        await getManagerActivityTool('shop', { from: '2026-09-15' }, 'u-admin', admin);
        expect(state.loads[3]).toMatchObject({ from: '2026-09-15', to: '2026-10-07' });
    });

    it('does not invent a zero row for an unknown or misspelled manager name', async () => {
        const result = await getManagerActivityTool('shop', { manager: 'Номин' }, 'u-admin', admin);
        expect(result).toEqual({ error: 'Ийм менежер бүртгэлд алга — доорх нэрсээс тодруулна уу (ask_user)', options: ['Номин-Эрдэнэ'] });
        expect(state.loads).toHaveLength(0);
    });

    it('keeps a manager to the own row and refuses the team view without reports', async () => {
        Object.assign(state, { isManager: true, rosterName: 'Номин-Эрдэнэ' });
        await getManagerActivityTool('shop', { manager: 'Сараа' }, 'u1', { ...admin, role: 'sales_manager' });
        expect(state.loads[0]).toMatchObject({ only: 'Номин-Эрдэнэ' });
        Object.assign(state, { rosterName: null });
        expect(await getManagerActivityTool('shop', {}, 'u1', { ...admin, role: 'sales_manager' })).toHaveProperty('error');
        Object.assign(state, { isManager: false });
        expect(await getManagerActivityTool('shop', {}, 'u2', { ...admin, role: 'marketing', modules: ['dashboard'] })).toEqual({ error: 'Багийн идэвхийг харах эрхгүй' });
        expect(await getManagerActivityTool('shop', { from: '2026-13-01' }, 'u-admin', admin)).toHaveProperty('error');
        expect(await getManagerActivityTool('shop', { from: '2026-01-01', to: '2026-10-01' }, 'u-admin', admin)).toEqual({ error: 'Хугацаа 92 хоногоос ихгүй байна' });
        expect(state.loads).toHaveLength(1);
    });
});
