import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addContractPayment, markPaymentPaid } from '../actions';

const mocks = vi.hoisted(() => ({ from: vi.fn(), addPayment: vi.fn(), updatePayment: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/services/PaymentService', () => ({
    addPayment: mocks.addPayment, updatePayment: mocks.updatePayment, listPayments: vi.fn(),
}));

const payment = { id: 'payment-1', amount: 100, paid_amount: 40, paid_date: '2026-09-10', payment_method: 'bank', receipt_kind: 'advance', installment_number: 1 };
const requestId = '11111111-1111-4111-8111-111111111111';

function setupRead(row: unknown) {
    mocks.from.mockImplementation(() => {
        const result = { data: row, error: null };
        const chain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
            then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        };
        return chain;
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T18:00:00Z')); // Улаанбаатар: 09-14 02:00.
    setupRead([{ id: 'contract-1', customer_name: 'Болд', contract_number: 'C-1' }]);
    mocks.addPayment.mockResolvedValue({ payment });
    mocks.updatePayment.mockResolvedValue({ payment });
});
afterEach(() => vi.useRealTimers());

describe('payment action confirmations', () => {
    it('generates a request UUID in preview and reuses it for repeated confirmations', async () => {
        const preview = await addContractPayment('shop-1', { contract_id: 'contract-1', amount: 100 }, false);
        expect(preview).toMatchObject({ requiresConfirmation: true, action: { args: { due_date: '2026-09-14', client_request_id: expect.stringMatching(/^[\da-f-]{36}$/) } } });
        expect(mocks.addPayment).not.toHaveBeenCalled();
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');

        await addContractPayment('shop-1', preview.action.args, true);
        await addContractPayment('shop-1', preview.action.args, true);
        expect(mocks.addPayment).toHaveBeenCalledTimes(2);
        for (const call of mocks.addPayment.mock.calls) {
            expect(call[3].client_request_id).toBe(preview.action.args.client_request_id);
        }
    });

    it('requires the original request ID on confirmed creation', async () => {
        const result = await addContractPayment('shop-1', { contract_id: 'contract-1', amount: 100 }, true);
        expect(result).toHaveProperty('error');
        expect(mocks.addPayment).not.toHaveBeenCalled();
    });

    it('propagates unavailable payment transactions without reporting success', async () => {
        mocks.addPayment.mockResolvedValue({ error: 'Төлбөрийн шинэчлэл шаардлагатай', status: 503 });
        const result = await addContractPayment('shop-1', { contract_id: 'contract-1', amount: 100, client_request_id: requestId }, true);
        expect(result).toHaveProperty('error', 'Төлбөрийн шинэчлэл шаардлагатай');
        expect(result).not.toHaveProperty('success');
    });

    it('preserves stored method and kind, dates a new receipt today, and keeps preview stable', async () => {
        setupRead(payment);
        const preview = await markPaymentPaid('shop-1', { payment_id: payment.id }, false);
        expect(preview).toMatchObject({ action: { args: { paid_date: '2026-09-14', payment_method: 'bank', receipt_kind: 'advance' } } });
        expect(mocks.updatePayment).not.toHaveBeenCalled();
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');
        await markPaymentPaid('shop-1', preview.action.args, true);
        expect(mocks.updatePayment).toHaveBeenCalledWith(expect.anything(), 'shop-1', payment.id, { paid_amount: 100, paid_date: '2026-09-14', payment_method: 'bank', receipt_kind: 'advance' }, expect.anything());
    });

    it('preserves the prior receipt date when the paid amount does not change', async () => {
        setupRead(payment);
        expect(await markPaymentPaid('shop-1', { payment_id: payment.id, paid_amount: payment.paid_amount }, false)).toMatchObject({ action: { args: { paid_date: '2026-09-10' } } });
    });

    it('defaults a previously unpaid row to the current Ulaanbaatar date', async () => {
        setupRead({ ...payment, paid_amount: 0, paid_date: null });
        expect(await markPaymentPaid('shop-1', { payment_id: payment.id }, false)).toMatchObject({ action: { args: { paid_date: '2026-09-14' } } });
    });

    it('does not call a barter settlement cash income', async () => {
        const result = await addContractPayment('shop-1', { contract_id: 'contract-1', amount: 100, paid_amount: 100, payment_method: 'barter', receipt_kind: 'advance', client_request_id: requestId }, true);
        expect(result).toHaveProperty('message', expect.stringContaining('бартерын төлөлт'));
        expect(result).toHaveProperty('message', expect.not.stringContaining('кассад орлого'));
    });

    it.each([-1, 39, 101, Number.NaN])('rejects a payment reduction or invalid amount %s before confirmation', async (paid) => {
        setupRead(payment);
        expect(await markPaymentPaid('shop-1', { payment_id: payment.id, paid_amount: paid }, false)).toHaveProperty('error');
        expect(mocks.updatePayment).not.toHaveBeenCalled();
    });

    it('asks for receipt kind instead of guessing advance from the payment label', async () => {
        setupRead({ ...payment, receipt_kind: null, label: 'Урьдчилгаа' });
        const result = await markPaymentPaid('shop-1', { payment_id: payment.id }, false);
        expect(result).toMatchObject({ missingFields: ['receipt_kind'] });
        expect(result).not.toHaveProperty('requiresConfirmation');
    });

    it('requires an explicit valid method and kind for a new paid schedule', async () => {
        const result = await addContractPayment('shop-1', { contract_id: 'contract-1', amount: 100, paid_amount: 100, receipt_kind: 'installment', payment_method: 'card' }, false);
        expect(result).toMatchObject({ missingFields: ['payment_method'] });
        expect(mocks.addPayment).not.toHaveBeenCalled();
    });
});
