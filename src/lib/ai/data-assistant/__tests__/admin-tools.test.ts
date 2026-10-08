import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMonthlySales } from '@/lib/sales/monthly';

const mocks = vi.hoisted(() => ({ updateProjects: vi.fn(), upsertTargets: vi.fn(), targets: vi.fn() }));
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function query(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
    const q = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
        ilike: (key: string, pattern: string) => {
            const needle = pattern.replace(/^%|%$/g, '').toLowerCase();
            filters.push((row) => pattern.startsWith('%') ? String(row[key] ?? '').toLowerCase().includes(needle) : String(row[key] ?? '').toLowerCase() === needle);
            return q;
        },
        limit: (value: number) => { limit = value; return q; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return q;
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: query }) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn() }));
vi.mock('@/lib/admin/user-projects', () => ({ updateUserProjects: mocks.updateProjects }));
vi.mock('@/lib/sales/targets', () => ({ getTeamMonthlySales: mocks.targets, saveTeamMonthlySales: mocks.upsertTargets }));

import { executeDataTool, type AssistantPerms } from '../index';

const owner: AssistantPerms = { role: 'super_admin', canWrite: true, canDelete: true, modules: [] };
const run = (tool: string, args: Record<string, unknown>, confirm = false, perms = owner) => executeDataTool(tool, args, 'shop-mandala', perms, 'owner-1', confirm);

beforeEach(() => {
    tables = {
        user_profiles: [
            { id: 'u-saraa', full_name: 'Сараа Бат', email: 'saraa@vertmon.mn' },
            { id: 'u-sarnai', full_name: 'Сарнай', email: 'sarnai@vertmon.mn' },
        ],
        shops: [{ id: 'shop-mandala', name: 'Mandala Garden' }, { id: 'shop-elysium', name: 'Elysium Residence' }, { id: 'shop-tower', name: 'Mandala 360&365 Tower' }],
        shop_members: [{ shop_id: 'shop-mandala', user_id: 'u-saraa' }, { shop_id: 'shop-tower', user_id: 'u-saraa' }],
    };
    mocks.updateProjects.mockReset().mockResolvedValue({ ok: true, added: ['shop-elysium'], removed: ['shop-tower'] });
    mocks.upsertTargets.mockReset().mockResolvedValue({ error: null });
    mocks.targets.mockReset().mockResolvedValue(emptyMonthlySales().map(row => row.month === 10 ? { ...row, target_amount: 4_000_000_000, revision: 3 } : row));
});

describe('set_user_projects', () => {
    it('previews adding and removing projects for one clearly identified user', async () => {
        expect(await run('set_user_projects', { user: 'saraa@vertmon.mn', add_projects: ['Elysium Residence'], remove_projects: ['Mandala 360&365 Tower'] })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'set_user_projects', args: { user_id: 'u-saraa', add_projects: ['Elysium Residence'], remove_projects: ['Mandala 360&365 Tower'] } },
            preview: { Хэрэглэгч: 'Сараа Бат (saraa@vertmon.mn)', Нэмэх: 'Elysium Residence', Хасах: 'Mandala 360&365 Tower' },
        });
        expect(mocks.updateProjects).not.toHaveBeenCalled();
    });

    it('applies the shared membership rule with the resulting project set', async () => {
        expect(await run('set_user_projects', { user_id: 'u-saraa', add_projects: ['elysium residence'], remove_projects: ['Mandala 360&365 Tower'] }, true)).toMatchObject({ success: true });
        expect(mocks.updateProjects).toHaveBeenCalledWith(expect.anything(), { actorId: 'owner-1', userId: 'u-saraa', shopIds: ['shop-mandala', 'shop-elysium'] });
    });

    it('asks for clarification on ambiguous users or unknown projects', async () => {
        expect(await run('set_user_projects', { user: 'Сар', add_projects: ['Elysium Residence'] })).toMatchObject({ error: expect.stringContaining('Олон хэрэглэгч'), options: expect.any(Array) });
        expect(await run('set_user_projects', { user: 'saraa@vertmon.mn', add_projects: ['Zaisan Hill'] })).toMatchObject({ error: expect.stringContaining('Zaisan Hill'), options: expect.arrayContaining(['Elysium Residence']) });
        expect(mocks.updateProjects).not.toHaveBeenCalled();
    });
});

describe('set_sales_target', () => {
    it('previews the current and new monthly target and saves only that month on confirmation', async () => {
        expect(await run('set_sales_target', { year: 2026, month: 10, amount: 5_000_000_000 })).toMatchObject({
            requiresConfirmation: true, preview: { Төсөл: 'Mandala Garden', Одоогийн: expect.stringContaining('4,000,000,000'), Шинэ: expect.stringContaining('5,000,000,000') },
        });
        expect(mocks.upsertTargets).not.toHaveBeenCalled();
        expect(await run('set_sales_target', { year: 2026, month: 10, amount: 5_000_000_000, expectedRevision: 3 }, true)).toMatchObject({ success: true });
        expect(mocks.upsertTargets).toHaveBeenCalledWith(expect.anything(), 'shop-mandala', 2026, [{ month: 10, expectedRevision: 3, target_amount: 5_000_000_000 }], 'owner-1');
    });

    it('rejects invalid months and amounts', async () => {
        expect(await run('set_sales_target', { month: 13, amount: 1 })).toHaveProperty('error');
        expect(await run('set_sales_target', { month: 10, amount: -5 })).toHaveProperty('error');
        expect(mocks.targets).not.toHaveBeenCalled();
    });

    it('previews again for old cards and rejects stale confirmed monetary writes', async () => {
        expect(await run('set_sales_target', { year: 2026, month: 10, amount: 1 }, true)).toMatchObject({ requiresConfirmation: true, action: { args: { expectedRevision: 3 } } });
        expect(mocks.upsertTargets).not.toHaveBeenCalled();
        mocks.upsertTargets.mockResolvedValue({ error: { code: '40001' } });
        expect(await run('set_sales_target', { year: 2026, month: 10, amount: 1, expectedRevision: 2 }, true)).toHaveProperty('error', expect.stringContaining('өөрчлөгдсөн'));
    });

    it('keeps explicit zero and null distinct and patches manual actuals independently', async () => {
        const preview = await run('set_sales_target', { year: 2026, month: 10, metric: 'cashflow_actual', amount: 0 });
        expect(preview).toMatchObject({ preview: { Одоогийн: 'Оруулаагүй', Шинэ: expect.stringContaining('0') } });
        expect(await run('set_sales_target', { year: 2026, month: 10, metric: 'cashflow_actual', amount: null, expectedRevision: 3 }, true)).toMatchObject({ success: true });
        expect(mocks.upsertTargets).toHaveBeenCalledWith(expect.anything(), 'shop-mandala', 2026, [{ month: 10, expectedRevision: 3, manual_cashflow_actual_amount: null }], 'owner-1');
    });
});

it('keeps admin tools for super_admin only', async () => {
    const admin: AssistantPerms = { role: 'admin', canWrite: true, canDelete: true, modules: ['settings'] };
    expect(await run('set_user_projects', { user: 'saraa@vertmon.mn', add_projects: ['Elysium Residence'] }, false, admin)).toHaveProperty('error', expect.stringContaining('super_admin'));
    expect(await run('set_sales_target', { month: 10, amount: 1 }, false, admin)).toHaveProperty('error', expect.stringContaining('super_admin'));
});
