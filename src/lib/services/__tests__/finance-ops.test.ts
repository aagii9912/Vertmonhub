import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addTransaction, financeSummary, payBill } from '../FinanceOps';

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/erp/audit', () => ({ logFinanceAudit: vi.fn() }));
afterEach(() => vi.useRealTimers());
type Row = Record<string, unknown>;
function readDb(tables: Record<string, Row[]>, failTable?: string) {
    const pages: { table: string; from: number }[] = [];
    const db = { from(table: string) {
        let rows = tables[table] || [];
        const q = {
            select: () => q,
            order: () => q,
            eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return q; },
            is: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return q; },
            gte: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) >= value); return q; },
            lte: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) <= value); return q; },
            range: async (from: number, to: number) => {
                pages.push({ table, from });
                return table === failTable ? { data: null, error: { message: 'read failed' } } : { data: rows.slice(from, to + 1), error: null };
            },
        };
        return q;
    } } as unknown as SupabaseClient;
    return { db, pages };
}

describe('finance totals keep cash, tenant, time and read completeness intact', () => {
    it('paginates both sources, excludes deleted/cancelled contracts, and separates noncash at the UB month boundary', async () => {
        const contract = { shop_id: 'shop', deleted_at: null, contract_status: 'active', total_price: 100, paid_amount: 30, balance: 70, vat_amount: 10 };
        const txn = { shop_id: 'shop', type: 'receipt', amount: 2, method: 'bank', txn_date: '2026-09-01', contract_id: null };
        const { db, pages } = readDb({
            property_contracts: [...Array.from({ length: 1001 }, () => contract), { ...contract, deleted_at: '2026-08-31' }, { ...contract, contract_status: 'cancelled' }, { ...contract, shop_id: 'other' }],
            finance_transactions: [...Array.from({ length: 1001 }, () => txn),
                { ...txn, method: 'barter', amount: 100 }, { ...txn, type: 'disbursement', method: 'barter', amount: 50 },
                { ...txn, method: null, amount: 40 }, { ...txn, type: 'disbursement', method: null, amount: 20 },
                { ...txn, type: 'disbursement', amount: 5 }, { ...txn, txn_date: '2026-08-31', amount: 999 },
                { ...txn, txn_date: '2026-10-01', amount: 999 }, { ...txn, shop_id: 'other', amount: 999 }],
        });
        const result = await financeSummary(db, 'shop', new Date('2026-08-31T16:30:00Z'));
        expect(result).toMatchObject({ totalRevenue: 100100, totalCollected: 30030, contractCount: 1001,
            monthReceipts: 2002, monthDisbursements: 5, monthNetCash: 1997,
            monthBarterReceipts: 100, monthBarterDisbursements: 50,
            monthUnclassifiedReceipts: 40, monthUnclassifiedDisbursements: 20, monthUnclassifiedCount: 2,
            range: { from: '2026-09-01', to: '2026-09-30' } });
        expect(pages).toContainEqual({ table: 'property_contracts', from: 1000 });
        expect(pages).toContainEqual({ table: 'finance_transactions', from: 1000 });
    });

    it.each(['property_contracts', 'finance_transactions'])('fails the report when %s cannot be read', async table => {
        const { db } = readDb({}, table);
        await expect(financeSummary(db, 'shop')).rejects.toThrow('read failed');
    });

    it('dates a manual transaction today in Ulaanbaatar before 08:00', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T17:00:00Z'));
        const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'txn' }, error: null }) }) });
        await addTransaction({ from: () => ({ insert }) } as unknown as SupabaseClient, 'shop', { type: 'receipt', amount: 50, method: 'cash' });
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ txn_date: '2026-09-01' }));
    });
});

describe('vendor payment service fails closed and preserves replay identity', () => {
    const client_request_id = '11111111-1111-4111-8111-111111111111';
    it('reuses the same caller UUID and never bypasses the transaction on a DB failure', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { id: 'bill', transaction_id: 'txn', paid_amount: 100 }, error: null });
        const from = vi.fn();
        const db = { rpc, from } as unknown as SupabaseClient;
        const input = { client_request_id, amount: 100, method: 'bank' as const, paid_date: '2026-09-01' };
        await payBill(db, 'shop', 'bill', input);
        await payBill(db, 'shop', 'bill', input);
        expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
        expect(rpc.mock.calls[0][1]).toMatchObject({ p_request_id: client_request_id, p_shop_id: 'shop', p_bill_id: 'bill' });
        for (const [code, status] of [['PGRST202', 503], ['23505', 409], ['23514', 500], ['P0002', 404]] as const) {
            rpc.mockResolvedValue({ data: null, error: { code, message: 'failed' } });
            expect(await payBill(db, 'shop', 'bill', input)).toMatchObject({ status });
        }
        expect(from).not.toHaveBeenCalled();
    });

    it('rejects missing UUID, malformed dates, and tenant fields before writes', async () => {
        const rpc = vi.fn();
        const db = { rpc } as unknown as SupabaseClient;
        expect(await payBill(db, 'shop', 'bill', { amount: 1 })).toMatchObject({ status: 400 });
        expect(await payBill(db, 'shop', 'bill', { client_request_id, amount: 1, paid_date: '2026-02-30' })).toMatchObject({ status: 400 });
        expect(await payBill(db, 'shop', 'bill', { client_request_id, amount: 1, ...{ shop_id: 'other' } })).toMatchObject({ status: 400 });
        expect(rpc).not.toHaveBeenCalled();
    });
});
