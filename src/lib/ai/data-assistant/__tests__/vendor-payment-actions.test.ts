import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { payBillTool } from '../actions2';

const mocks = vi.hoisted(() => ({ from: vi.fn(), payBill: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/services/FinanceOps', () => ({ payBill: mocks.payBill }));
const bill = { id: 'bill-1', bill_number: 'B-1', total_amount: 100, paid_amount: 0, status: 'pending', vendors: { name: 'Нийлүүлэгч' } };
function setupRead(rows = [bill]) {
    mocks.from.mockImplementation(() => {
        const q = { select: () => q, eq: () => q, ilike: () => q, limit: async () => ({ data: rows, error: null }) };
        return q;
    });
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T17:00:00Z'));
    setupRead();
    mocks.payBill.mockResolvedValue({ bill: { ...bill, paid_amount: 100, status: 'paid' } });
});
afterEach(() => vi.useRealTimers());

describe('vendor payment confirmation and retry', () => {
    it('keeps the preview UUID, amount and UB date through repeated confirmations, even after full payment', async () => {
        const preview = await payBillTool('shop', { bill_id: bill.id, method: 'bank' }, false);
        expect(preview).toMatchObject({ action: { args: { amount: 100, paid_date: '2026-09-01', client_request_id: expect.stringMatching(/^[\da-f-]{36}$/) } } });
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');
        expect(mocks.payBill).not.toHaveBeenCalled();
        await payBillTool('shop', preview.action.args, true);
        setupRead([{ ...bill, paid_amount: 100, status: 'paid' }]);
        vi.setSystemTime(new Date('2026-09-02T17:00:00Z'));
        await payBillTool('shop', preview.action.args, true);
        expect(mocks.payBill.mock.calls[0][3]).toEqual(mocks.payBill.mock.calls[1][3]);
        expect(mocks.payBill.mock.calls[0][3]).toMatchObject({ client_request_id: preview.action.args.client_request_id, paid_date: '2026-09-01', amount: 100 });
    });

    it('requires an existing preview ID for confirmation and propagates failure', async () => {
        expect(await payBillTool('shop', { bill_id: bill.id, amount: 100 }, true)).toHaveProperty('error');
        expect(mocks.payBill).not.toHaveBeenCalled();
        const preview = await payBillTool('shop', { bill_id: bill.id, amount: 100 }, false);
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');
        mocks.payBill.mockResolvedValue({ error: 'RPC unavailable', status: 503 });
        expect(await payBillTool('shop', preview.action.args, true)).toEqual({ error: 'RPC unavailable' });
    });

    it('does not choose a bill silently when a number matches multiple bills', async () => {
        setupRead([bill, { ...bill, id: 'bill-2' }]);
        expect(await payBillTool('shop', { bill_number: 'B' }, false)).toHaveProperty('error');
        expect(mocks.payBill).not.toHaveBeenCalled();
    });
});
