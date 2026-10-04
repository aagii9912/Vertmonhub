// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    contracts: [] as Row[],
    lookups: [] as Array<{ column: string; value: unknown }>,
    rpc: vi.fn(),
    scope: vi.fn(),
    audit: vi.fn(),
}));
const db = {
    from: () => {
        const query = {
            select: () => query, eq: (column: string, value: unknown) => { state.lookups.push({ column, value }); return query; },
            is: () => query, ilike: (column: string, value: unknown) => { state.lookups.push({ column, value }); return query; },
            order: () => query,
            limit: async () => ({ data: state.contracts, error: null }),
        };
        return query;
    },
    rpc: state.rpc,
};
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/sales/project-scope', async () => ({
    ...await vi.importActual('@/lib/sales/project-scope'), resolveSalesProjectScope: state.scope,
}));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: vi.fn() }));
vi.mock('../audit', () => ({ logAiAudit: state.audit }));

import { transferContractTool } from '../actions-contract-transfer';
import { executeDataTool } from '../index';
import { UNRESTRICTED_SALES_SCOPE } from '@/lib/sales/project-scope';
import { ubDateStr } from '@/lib/utils/date';

const contract = {
    id: 'contract-1', contract_number: 'MG-101', unit_label: 'A-101', contract_status: 'active', contract_date: '2026-01-15',
    sales_manager: 'Номин', customer_name: 'Бат Болд', customer_registration: 'УБ99010101', total_price: 300, paid_amount: 120, balance: 180,
};
const actor = { userId: 'user-1', userName: 'Номин', scope: UNRESTRICTED_SALES_SCOPE };
const args = { contract_number: 'MG-101', kind: 'transfer', customer_name: 'Дорж Сараа', customer_registration: 'чб88020202', customer_phone: '88114455', reason: 'Худалдсан' };
const perms = { canWrite: true, canDelete: false, role: 'admin', modules: ['contracts', 'ai-assistant'] };

beforeEach(() => {
    vi.clearAllMocks();
    state.contracts = [contract];
    state.lookups = [];
    state.scope.mockResolvedValue(UNRESTRICTED_SALES_SCOPE);
    state.rpc.mockResolvedValue({ data: { id: 'transfer-1', kind: 'transfer', from_customer_name: 'Бат Болд', to_customer_name: 'Дорж Сараа', replayed: false }, error: null });
});

describe('transfer_contract AI tool', () => {
    it('previews the change with the current holder, a stable request id and today’s UB date — no write', async () => {
        const preview: any = await transferContractTool('shop', args, false, actor);
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'transfer_contract', args: {
                contract_id: 'contract-1', contract_number: 'MG-101', kind: 'transfer', customer_name: 'Дорж Сараа',
                customer_registration: 'ЧБ88020202', customer_phone: '88114455', reason: 'Худалдсан',
                effective_date: ubDateStr(), expected_customer_name: 'Бат Болд',
            } },
            preview: { 'Одоогийн эзэмшигч': 'Бат Болд', 'Шинэ эзэмшигч': 'Дорж Сараа', 'Регистр': 'ЧБ88020202' },
        });
        expect(preview.action.args.client_request_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('asks for missing details instead of inventing them, and refuses non-transferable contracts', async () => {
        const missing: any = await transferContractTool('shop', { ...args, customer_registration: undefined, reason: undefined }, false, actor);
        expect(missing.error).toContain('регистр');
        expect(missing.missingFields).toEqual(['customer_registration', 'reason']);
        expect(await transferContractTool('shop', { ...args, kind: undefined }, false, actor)).toMatchObject({ missingFields: ['kind'] });
        state.contracts = [{ ...contract, contract_status: 'transferred' }];
        expect(await transferContractTool('shop', args, false, actor)).toHaveProperty('error');
        state.contracts = [{ ...contract, contract_date: '2026-09-01' }];
        expect(await transferContractTool('shop', { ...args, effective_date: '2026-08-01' }, false, actor)).toMatchObject({ error: expect.stringContaining('гэрээ байгуулсан') });
        state.contracts = [contract, { ...contract, id: 'contract-2', contract_number: 'MG-1010' }];
        expect(await transferContractTool('shop', args, false, actor)).toMatchObject({ options: [expect.objectContaining({ id: 'contract-1' }), expect.objectContaining({ id: 'contract-2' })] });
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('keeps restricted managers to their own contracts', async () => {
        const restricted = { ...actor, scope: { projectIds: ['project-1'], managerName: 'Сараа' } };
        expect(await transferContractTool('shop', args, false, restricted)).toMatchObject({ error: expect.stringContaining('өөрийн') });
    });

    it('confirms exactly the previewed request through ContractService', async () => {
        const preview: any = await transferContractTool('shop', args, false, actor);
        state.lookups = [];
        const result: any = await transferContractTool('shop', preview.action.args, true, actor);
        expect(result).toMatchObject({ success: true, transferId: 'transfer-1', message: expect.stringContaining('Бат Болд → Дорж Сараа') });
        expect(state.lookups).toEqual([]);
        expect(state.rpc).toHaveBeenCalledWith('transfer_contract', expect.objectContaining({
            p_shop_id: 'shop', p_contract_id: 'contract-1', p_request_id: preview.action.args.client_request_id, p_actor: 'user-1', p_actor_name: 'Номин',
            p_payload: expect.objectContaining({ kind: 'transfer', customer_registration: 'ЧБ88020202', phone_normalized: '88114455', expected_customer_name: 'Бат Болд' }),
        }));
        expect(state.rpc.mock.calls[0][1].p_payload).not.toHaveProperty('contract_number');
        expect(await transferContractTool('shop', { ...preview.action.args, client_request_id: undefined }, true, actor)).toHaveProperty('error');
        expect(state.rpc).toHaveBeenCalledTimes(1);
    });

    it('runs through the executor: contracts module, write permission and the trusted scope', async () => {
        expect(await executeDataTool('transfer_contract', args, 'shop', { ...perms, modules: ['leads'] }, 'user-1', true, 'Номин')).toHaveProperty('error');
        expect(await executeDataTool('transfer_contract', args, 'shop', { ...perms, canWrite: false }, 'user-1', true, 'Номин')).toHaveProperty('error');
        expect(state.rpc).not.toHaveBeenCalled();
        state.scope.mockResolvedValue({ projectIds: ['project-1'], managerName: 'Номин' });
        const preview: any = await executeDataTool('transfer_contract', args, 'shop', { ...perms, role: 'sales_manager' }, 'user-1', false, 'Номин');
        expect(state.scope).toHaveBeenCalledWith(expect.anything(), 'shop', { userId: 'user-1', role: 'sales_manager' });
        await executeDataTool('transfer_contract', preview.action.args, 'shop', { ...perms, role: 'sales_manager' }, 'user-1', true, 'Номин');
        expect(state.rpc.mock.calls[0][1].p_scope_manager).toBe('Номин');
        expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ tool: 'transfer_contract', success: true }));
    });
});
