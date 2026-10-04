import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => { throw new Error('unexpected query'); } }) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn() }));
vi.mock('@/lib/dashboard/weekly-sales-load', () => ({ loadWeeklySales: mocks.load }));
vi.mock('@/lib/dashboard/weekly-updates', () => ({ listWeeklyUpdates: mocks.list, saveWeeklyUpdate: mocks.save }));

import { executeDataTool, type AssistantPerms } from '../index';
import { buildWeeklySales } from '@/lib/dashboard/weekly-sales';
import { nextMeetingDate } from '@/lib/dashboard/weekly-review';

const manager: AssistantPerms = { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['reports', 'dashboard'] };
const line = (key: string, date: string) => ({
    key, contractNumber: key, date, kind: 'residential' as const, kindLabel: 'Орон сууц', block: 'Б1', unit: 'Б1-2', customer: 'Нэр',
    area: 64, pricePerSqm: null, advanceCondition: null, total: 300_000_000, advance: null, paid: null, manager: 'Батаа', channel: null, status: 'active',
});
const report = buildWeeklySales({
    range: { from: '2026-09-30', to: '2026-10-06' }, sales: null, previousSales: null,
    crmContracts: Array.from({ length: 45 }, (_, i) => line(`c${i}`, '2026-10-01')),
    inventory: { info: { date: '2026-10-01', source: 'Elysium ERP', kind: 'erp' }, rows: [
        { key: 'a', code: 'Б1-2', block: 'Б1', floor: 2, model: 'E2', kind: 'residential', rooms: 2, area: 64, price: null, status: 'available', statusLabel: 'Худалдаанд', barter: false, manager: null },
    ] },
    monthTarget: null,
});
const run = (tool: string, args: Record<string, unknown>, confirm = false, perms = manager) => executeDataTool(tool, args, 'shop-1', perms, 'user-1', confirm);

beforeEach(() => {
    mocks.load.mockReset().mockResolvedValue(report);
    mocks.list.mockReset();
    mocks.save.mockReset();
});

describe('get_weekly_sales_report', () => {
    it('defaults to the next meeting, masks customers without contracts access and trims bulky sections', async () => {
        const result = await run('get_weekly_sales_report', {});
        expect(mocks.load).toHaveBeenCalledWith(expect.anything(), { shopId: 'shop-1', meetingDate: nextMeetingDate(), canSeeCustomers: false });
        expect(result.week.lines).toHaveLength(40);
        expect(result.week.count).toBe(45);
        expect(result.inventory).toEqual({ source: expect.objectContaining({ source: 'Elysium ERP' }), blocks: expect.any(Array), floorTotals: [{ block: 'Б1', sold: 0, available: 1, other: 0, barter: 0 }] });
        expect(result.plainText).toContain('Энэ долоо хоног: 45 гэрээ');
    });

    it('accepts only a Wednesday and requires the reports module', async () => {
        expect(await run('get_weekly_sales_report', { meeting_date: '2026-10-05' })).toHaveProperty('error', expect.stringContaining('Лхагва'));
        expect(await run('get_weekly_sales_report', {}, false, { ...manager, modules: ['dashboard'] })).toHaveProperty('error', expect.stringContaining('reports'));
        expect(mocks.load).not.toHaveBeenCalled();
        await run('get_weekly_sales_report', { meeting_date: '2026-10-07' }, false, { ...manager, modules: ['reports', 'contracts'] });
        expect(mocks.load).toHaveBeenCalledWith(expect.anything(), { shopId: 'shop-1', meetingDate: '2026-10-07', canSeeCustomers: true });
    });
});

describe('weekly updates', () => {
    it('reads the team only with reports access', async () => {
        mocks.list.mockResolvedValue({ updates: [] });
        await run('get_weekly_updates', { meeting_date: '2026-10-07' }, false, { ...manager, modules: ['dashboard'] });
        expect(mocks.list).toHaveBeenLastCalledWith(expect.anything(), 'shop-1', '2026-10-07', { userId: 'user-1', canViewTeam: false });
        await run('get_weekly_updates', { meeting_date: '2026-10-07' });
        expect(mocks.list).toHaveBeenLastCalledWith(expect.anything(), 'shop-1', '2026-10-07', { userId: 'user-1', canViewTeam: true });
    });

    it('appends to the existing update by default and saves only after confirmation', async () => {
        mocks.list.mockResolvedValue({ updates: [{ user_id: 'user-1', achievements: '3 уулзалт', blockers: '', next_steps: 'Залгах' }] });
        const preview = await run('save_weekly_update', { meeting_date: '2026-10-07', achievements: '2 гэрээ' });
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'save_weekly_update', args: { meeting_date: '2026-10-07', mode: 'append', achievements: '2 гэрээ' } },
            preview: { 'Хийсэн ажил': '3 уулзалт\n2 гэрээ', 'Дараагийн алхам': 'Залгах' },
        });
        expect(mocks.save).not.toHaveBeenCalled();

        mocks.save.mockResolvedValue({ update: {} });
        expect(await run('save_weekly_update', { meeting_date: '2026-10-07', achievements: '2 гэрээ', mode: 'replace' }, true)).toMatchObject({ success: true });
        expect(mocks.save).toHaveBeenCalledWith(expect.anything(), 'shop-1', 'user-1', { meetingDate: '2026-10-07', achievements: '2 гэрээ', blockers: '', nextSteps: 'Залгах' });
    });

    it('needs at least one section', async () => {
        expect(await run('save_weekly_update', { meeting_date: '2026-10-07' })).toHaveProperty('error');
        expect(mocks.list).not.toHaveBeenCalled();
    });
});
