import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ permissions: vi.fn(), shop: vi.fn(), load: vi.fn(), db: { from: vi.fn() }, rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: mocks.permissions }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: async () => 'user' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => mocks.db }));
vi.mock('@/lib/dashboard/operations-report-load', () => ({ loadOperationsReport: mocks.load }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { GET } from '@/app/api/dashboard/reports/operations/route';
import { executeDataTool, type AssistantPerms } from '@/lib/ai/data-assistant';
import { buildOperationsReport } from '../operations-report';
import { AGENTS } from '@/lib/ai/orchestrator/agents';
import { TOOL_MODULE, readTools } from '@/lib/ai/data-assistant/tools';

const request = () => new NextRequest('http://localhost/api/dashboard/reports/operations?from=2026-09-01&to=2026-09-30');
const perms = (modules?: string[]): AssistantPerms => ({ role: 'marketing', canWrite: true, canDelete: false, modules });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = { user_profiles: [{ id: 'user', full_name: 'Тест хэрэглэгч' }], sales_managers: [], sales_manager_projects: [] };
    mocks.db.from.mockImplementation((table: string) => {
        const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
        let bounds: [number, number] | null = null;
        const rows = () => {
            const matches = (mocks.rows[table] ?? []).filter(row => predicates.every(predicate => predicate(row)));
            return bounds ? matches.slice(bounds[0], bounds[1] + 1) : matches;
        };
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
            order: () => query,
            range: (from: number, to: number) => { bounds = [from, to]; return query; },
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
        };
        return query;
    });
    mocks.shop.mockResolvedValue({ id: 'allowed-shop', name: 'Төсөл' });
    mocks.permissions.mockResolvedValue({ role: 'marketing', permissions: { modules: ['reports'] } });
    mocks.load.mockResolvedValue({ ...buildOperationsReport({ range: { from: '2026-09-01', to: '2026-09-30' },
        now: '2026-09-13T00:00:00Z', contracts: [], leads: [], targets: [], transactions: null }), shopName: 'Төсөл' });
});

describe('operations report authorization in API and AI', () => {
    it('rejects unauthenticated and unauthorized API callers before reading data', async () => {
        mocks.permissions.mockResolvedValueOnce(null);
        expect((await GET(request())).status).toBe(401);
        mocks.permissions.mockResolvedValueOnce({ role: 'marketing', permissions: { modules: ['leads'] } });
        expect((await GET(request())).status).toBe(403);
        expect(mocks.load).not.toHaveBeenCalled();
        expect(mocks.db.from).not.toHaveBeenCalled();
    });
    it('uses only the verified shop and limits the financial section for reports-only callers', async () => {
        expect((await GET(request())).status).toBe(200);
        expect(mocks.load).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ shopId: 'allowed-shop', canReadFinance: false, scope: { projectIds: null, managerName: null } }));
        mocks.permissions.mockResolvedValueOnce({ role: 'accountant', permissions: { modules: ['reports', 'finance'] } });
        expect((await GET(request())).status).toBe(200);
        expect(mocks.load).toHaveBeenLastCalledWith(mocks.db, expect.objectContaining({ canReadFinance: true }));
    });
    it('fails the API when a source cannot be read', async () => {
        mocks.load.mockRejectedValueOnce(new Error('private database detail'));
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('private database detail');
        expect(mocks.load).toHaveBeenCalledOnce();
    });
    it('does not accept client or legacy permission overrides through the AI tool', async () => {
        expect(await executeDataTool('get_operations_report', {}, 'allowed-shop', perms(), 'user')).toHaveProperty('error');
        expect(mocks.load).not.toHaveBeenCalled();
        const report = await executeDataTool('get_operations_report', { canReadFinance: true, shopId: 'other-shop' }, 'allowed-shop', perms(['reports']), 'user');
        expect(report).toHaveProperty('plainText');
        expect(mocks.load).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ shopId: 'allowed-shop', canReadFinance: false }));
    });
    it('enables the financial section for the authorized AI caller and reports read failures honestly', async () => {
        await executeDataTool('get_operations_report', {}, 'allowed-shop', perms(['reports', 'finance']), 'user');
        expect(mocks.load).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ canReadFinance: true }));
        mocks.load.mockRejectedValueOnce(new Error('source unavailable'));
        const result = await executeDataTool('get_operations_report', {}, 'allowed-shop', perms(['reports', 'finance']), 'user');
        expect(result).toHaveProperty('error');
        expect(result).not.toHaveProperty('cash');
    });
    it('derives the same project scope for a roster-linked report caller in API and AI despite client overrides', async () => {
        mocks.rows.sales_managers = [{ shop_id: 'allowed-shop', name: 'Болд', user_id: 'user', is_active: true }];
        mocks.rows.sales_manager_projects = [{ shop_id: 'allowed-shop', manager_name: 'Болд', project_id: 'elysium' }, { shop_id: 'other-shop', manager_name: 'Болд', project_id: 'foreign' }];
        expect((await GET(request())).status).toBe(200);
        const expected = expect.objectContaining({ shopId: 'allowed-shop', canReadFinance: false, scope: { projectIds: ['elysium'], managerName: 'Болд' } });
        expect(mocks.load).toHaveBeenLastCalledWith(mocks.db, expected);
        const report = await executeDataTool('get_operations_report', { shopId: 'other-shop', canReadFinance: true, scope: { projectIds: null, managerName: null } }, 'allowed-shop', perms(['reports']), 'user');
        expect(report).toHaveProperty('plainText');
        expect(mocks.load).toHaveBeenLastCalledWith(mocks.db, expected);
    });
    it('makes the report available to the agents answering reporting and cashflow questions', () => {
        expect(readTools.some(tool => tool.name === 'get_operations_report')).toBe(true);
        expect(TOOL_MODULE.get_operations_report).toBe('reports');
        expect(AGENTS['data-analyst'].readToolNames).toContain('get_operations_report');
        expect(AGENTS['finance-analyst'].readToolNames).toContain('get_operations_report');
    });
});
