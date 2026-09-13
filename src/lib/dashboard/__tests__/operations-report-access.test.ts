import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ permissions: vi.fn(), shop: vi.fn(), load: vi.fn(), db: {} }));
vi.mock('@/lib/auth/require-permission', () => ({ resolvePermissions: mocks.permissions }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop }));
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
    });
    it('uses only the verified shop and limits the financial section for reports-only callers', async () => {
        expect((await GET(request())).status).toBe(200);
        expect(mocks.load).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ shopId: 'allowed-shop', canReadFinance: false }));
        mocks.permissions.mockResolvedValueOnce({ role: 'accountant', permissions: { modules: ['reports', 'finance'] } });
        expect((await GET(request())).status).toBe(200);
        expect(mocks.load).toHaveBeenLastCalledWith(mocks.db, expect.objectContaining({ canReadFinance: true }));
    });
    it('fails the API when a source cannot be read', async () => {
        mocks.load.mockRejectedValueOnce(new Error('private database detail'));
        const response = await GET(request());
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('private database detail');
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
    it('makes the report available to the agents answering reporting and cashflow questions', () => {
        expect(readTools.some(tool => tool.name === 'get_operations_report')).toBe(true);
        expect(TOOL_MODULE.get_operations_report).toBe('reports');
        expect(AGENTS['data-analyst'].readToolNames).toContain('get_operations_report');
        expect(AGENTS['finance-analyst'].readToolNames).toContain('get_operations_report');
    });
});
