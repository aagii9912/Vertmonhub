import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ score: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: mocks.error, warn: mocks.warn, info: vi.fn() } }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: mocks.score }));

import {
    buildTransferPayload, contractIdsByPreviousHolder, listContractTransfers, transferContract,
} from '../ContractService';
import { TransferContractSchema } from '@/lib/contracts/transfer';
import { UNRESTRICTED_SALES_SCOPE } from '@/lib/sales/project-scope';

const rpc = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn() };
const from = vi.fn(() => query);
const db = { rpc, from } as unknown as SupabaseClient;
const requestId = '11111111-1111-4111-8111-111111111111';
const actor = { userId: 'user-1', name: 'Номин', scope: UNRESTRICTED_SALES_SCOPE };
const input = {
    client_request_id: requestId, kind: 'transfer', customer_name: ' Дорж Сараа ', customer_registration: 'чб 88020202',
    customer_phone: '+976 8811-4455', effective_date: '2026-06-01', reason: 'Худалдсан', expected_customer_name: 'Бат Болд',
};
const stored = {
    id: 'transfer-1', shop_id: 'shop', contract_id: 'contract', kind: 'transfer', effective_date: '2026-06-01',
    to_customer_id: 'customer-2', to_customer_name: 'Дорж Сараа', from_customer_name: 'Бат Болд', created_by: 'user-1',
    client_request_id: requestId, client_request_payload: { kind: 'transfer' }, replayed: false, customer_created: true,
};

beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: stored, error: null });
    for (const method of ['select', 'eq', 'or', 'order'] as const) query[method].mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.useRealTimers());

describe('ContractService.transferContract', () => {
    it('calls the atomic RPC once with a server-built payload and the trusted actor', async () => {
        const result = await transferContract(db, 'shop', 'contract', input, actor);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('transfer_contract', {
            p_shop_id: 'shop', p_contract_id: 'contract', p_request_id: requestId, p_actor: 'user-1', p_actor_name: 'Номин', p_scope_manager: null,
            p_payload: {
                kind: 'transfer', customer_name: 'Дорж Сараа', customer_registration: 'ЧБ88020202', customer_phone: '+976 8811-4455',
                phone_normalized: '88114455', effective_date: '2026-06-01', reason: 'Худалдсан', expected_customer_name: 'Бат Болд',
            },
        });
        expect(from).not.toHaveBeenCalled();
        expect(result).toEqual({
            transfer: { id: 'transfer-1', contract_id: 'contract', kind: 'transfer', effective_date: '2026-06-01', to_customer_id: 'customer-2', to_customer_name: 'Дорж Сараа', from_customer_name: 'Бат Болд' },
            replayed: false, customerCreated: true,
        });
        expect(mocks.score).toHaveBeenCalledWith('customer-2');
    });

    it('rejects client-supplied money, manager or dedup keys before the RPC', async () => {
        for (const extra of [{ paid_amount: 0 }, { sales_manager: 'Сараа' }, { phone_normalized: '99999999' }, { contract_date: '2026-01-01' }]) {
            expect(await transferContract(db, 'shop', 'contract', { ...input, ...extra }, actor)).toMatchObject({ status: 400 });
        }
        expect(await transferContract(db, 'shop', 'contract', { ...input, client_request_id: undefined }, actor)).toMatchObject({ status: 400 });
        expect(await transferContract(db, 'shop', 'contract', null, actor)).toMatchObject({ status: 400 });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('keeps a rename payload to the fields that were given (registration and phone stay on the contract)', async () => {
        await transferContract(db, 'shop', 'contract', { client_request_id: requestId, kind: 'rename', customer_name: 'Бат-Болд', customer_last_name: '' , effective_date: '2026-06-01' }, actor);
        expect(rpc.mock.calls[0][1].p_payload).toEqual({ kind: 'rename', customer_name: 'Бат-Болд', customer_last_name: null, effective_date: '2026-06-01' });
    });

    it('restricted managers may only transfer their own contracts; the RPC rechecks under the lock', async () => {
        expect(await transferContract(db, 'shop', 'contract', input, { ...actor, scope: { projectIds: [], managerName: null } })).toMatchObject({ status: 403 });
        expect(rpc).not.toHaveBeenCalled();
        await transferContract(db, 'shop', 'contract', input, { ...actor, scope: { projectIds: ['project'], managerName: 'Номин' } });
        expect(rpc.mock.calls[0][1].p_scope_manager).toBe('Номин');
    });

    it('defaults the effective date to the Ulaanbaatar day even when the server runs in UTC', async () => {
        const originalTz = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-10-04T17:30:00Z')); // УБ: 2026-10-05 01:30
            const { effective_date: _date, ...withoutDate } = input;
            await transferContract(db, 'shop', 'contract', withoutDate, actor);
            expect(rpc.mock.calls[0][1].p_payload.effective_date).toBe('2026-10-05');
            const data = TransferContractSchema.parse(withoutDate);
            expect(buildTransferPayload(data).effective_date).toBe('2026-10-05');
            // УБ-ийн маргаашийн огноо татгалзагдана (UTC-ийн «өнөөдөр»-өөр биш).
            expect(await transferContract(db, 'shop', 'contract', { ...input, effective_date: '2026-10-06' }, actor)).toMatchObject({ status: 400 });
            expect(rpc).toHaveBeenCalledTimes(1);
        } finally {
            process.env.TZ = originalTz;
        }
    });

    it.each([
        ['PGRST202', 503], ['42883', 503], ['P0002', 404], ['42501', 403], ['23505', 409], ['40001', 409], ['22023', 400], ['22008', 400],
    ])('maps RPC error %s to HTTP %i without a partial-write fallback', async (code, status) => {
        rpc.mockResolvedValue({ data: null, error: { code, message: 'Гэрээний эзэмшигч өөрчлөгдсөн байна' } });
        expect(await transferContract(db, 'shop', 'contract', input, actor)).toMatchObject({ status });
        expect(from).not.toHaveBeenCalled();
        expect(mocks.score).not.toHaveBeenCalled();
    });

    it('never reports success for an unknown database failure or an empty result', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'audit insert failed' } });
        expect(await transferContract(db, 'shop', 'contract', input, actor)).toMatchObject({ status: 500 });
        rpc.mockResolvedValue({ data: null, error: null });
        expect(await transferContract(db, 'shop', 'contract', input, actor)).toMatchObject({ status: 500 });
        expect(mocks.error).toHaveBeenCalled();
    });

    it('returns a replay without re-scoring the customer', async () => {
        rpc.mockResolvedValue({ data: { ...stored, replayed: true, customer_created: false }, error: null });
        expect(await transferContract(db, 'shop', 'contract', input, actor)).toMatchObject({ replayed: true, customerCreated: false });
        expect(mocks.score).not.toHaveBeenCalled();
    });
});

describe('ContractService history reads', () => {
    it('lists a contract history in the shop, and degrades only when the table is missing', async () => {
        query.limit.mockResolvedValue({ data: [{ id: 't1' }], error: null });
        expect(await listContractTransfers(db, 'shop', 'contract')).toEqual({ transfers: [{ id: 't1' }], available: true });
        expect(query.eq).toHaveBeenCalledWith('shop_id', 'shop');
        expect(query.eq).toHaveBeenCalledWith('contract_id', 'contract');
        query.limit.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.contract_transfers'" } });
        expect(await listContractTransfers(db, 'shop', 'contract')).toEqual({ transfers: [], available: false });
        query.limit.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
        expect(await listContractTransfers(db, 'shop', 'contract')).toMatchObject({ status: 500 });
    });

    it('finds contracts by a previous holder with a sanitized filter and surfaces real errors', async () => {
        query.limit.mockResolvedValue({ data: [{ contract_id: 'c1' }, { contract_id: 'c1' }, { contract_id: 'c2' }], error: null });
        expect(await contractIdsByPreviousHolder(db, 'shop', 'Бат,(Болд)%')).toEqual(['c1', 'c2']);
        expect(query.or.mock.calls[0][0]).toContain('from_customer_name.ilike.%Бат Болд%');
        expect(query.or.mock.calls[0][0]).not.toMatch(/[()]/);
        expect(await contractIdsByPreviousHolder(db, 'shop', ' % ')).toEqual([]);
        query.limit.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "contract_transfers" does not exist' } });
        expect(await contractIdsByPreviousHolder(db, 'shop', 'Бат')).toEqual([]);
        query.limit.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
        await expect(contractIdsByPreviousHolder(db, 'shop', 'Бат')).rejects.toThrow('timeout');
    });
});
