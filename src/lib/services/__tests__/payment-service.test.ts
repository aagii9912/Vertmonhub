import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addPayment, updatePayment } from '../PaymentService';

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
const rpc = vi.fn();
const from = vi.fn();
const db = { rpc, from } as unknown as SupabaseClient;
const id = '11111111-1111-4111-8111-111111111111';
const input = { client_request_id: id, due_date: '2026-09-13', amount: 100, paid_amount: 100, payment_method: 'bank_transfer', receipt_kind: 'advance' as const };

beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { id }, error: null }); });

describe('atomic payment service', () => {
    it('preserves the caller request ID and performs exactly one atomic RPC', async () => {
        expect(await addPayment(db, 'shop', 'contract', input)).toEqual({ payment: { id } });
        expect(rpc).toHaveBeenCalledWith('mutate_contract_payment', expect.objectContaining({
            p_shop_id: 'shop', p_contract_id: 'contract', p_payment_id: null, p_request_id: id,
            p_payload: expect.objectContaining({ receipt_kind: 'advance', paid_amount: 100 }),
        }));
        expect(from).not.toHaveBeenCalled();
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it('requires a stable creation ID rather than risking duplicate receipts on retry', async () => {
        expect(await addPayment(db, 'shop', 'contract', { due_date: input.due_date, amount: 100 })).toMatchObject({ status: 400 });
        expect(rpc).not.toHaveBeenCalled();
    });
    it('ordinary UI updates and AI updates use the same atomic receipt path', async () => {
        await updatePayment(db, 'shop', id, { paid_amount: 100 }, { contractId: 'contract' });
        expect(rpc).toHaveBeenCalledWith('mutate_contract_payment', {
            p_shop_id: 'shop', p_contract_id: 'contract', p_payment_id: id, p_payload: { paid_amount: 100 },
        });
        expect(from).not.toHaveBeenCalled();
    });
    it.each(['PGRST202', '42883'])('RPC unavailable (%s) returns 503 with no partial-write fallback', async code => {
        rpc.mockResolvedValue({ data: null, error: { code, message: 'missing function' } });
        expect(await addPayment(db, 'shop', 'contract', input)).toMatchObject({ status: 503 });
        expect(from).not.toHaveBeenCalled();
    });
    it('database failure or missing persisted result never becomes success', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'receipt insert failed' } });
        expect(await addPayment(db, 'shop', 'contract', input)).toMatchObject({ status: 500 });
        rpc.mockResolvedValue({ data: null, error: null });
        expect(await addPayment(db, 'shop', 'contract', input)).toMatchObject({ status: 500 });
    });
    it('rejects tenant fields and malformed payment data before executing RPC', async () => {
        expect(await updatePayment(db, 'shop', id, { paid_amount: 100, shop_id: 'another-shop' })).toMatchObject({ status: 400 });
        expect(await addPayment(db, 'shop', 'contract', { ...input, paid_amount: Number.NaN })).toMatchObject({ status: 400 });
        expect(rpc).not.toHaveBeenCalled();
    });
});
