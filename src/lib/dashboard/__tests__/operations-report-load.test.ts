import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOperationsReport } from '../operations-report-load';

function database(rows: Record<string, unknown[]> = {}, failure?: string, missingReceiptKind = false) {
    const calls: Array<{ table: string; filters: Array<[string, unknown]>; start: number }> = [];
    const from = vi.fn((table: string) => {
        const filters: Array<[string, unknown]> = [];
        let columns = '';
        const query = {
            select: (value: string) => { columns = value; return query; }, order: () => query,
            eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
            is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
            gte: () => query, lte: () => query,
            range: (start: number, end: number) => {
                calls.push({ table, filters, start });
                if (missingReceiptKind && table === 'finance_transactions' && columns.includes('receipt_kind')) return Promise.resolve({ data: null, error: { code: '42703', message: 'column finance_transactions.receipt_kind does not exist' } });
                return Promise.resolve({ data: table === failure ? null : (rows[table] || []).slice(start, end + 1), error: table === failure ? { message: 'query failed' } : null });
            },
        };
        return query;
    });
    return { db: { from } as unknown as SupabaseClient, calls, from };
}
const options = { shopId: 'shop-a', shopName: 'Тест', canReadFinance: true, now: new Date('2026-08-31T17:00:00Z') };

describe('operations report loading', () => {
    it('paginates all contract rows and scopes every table to the authorized shop', async () => {
        const { db, calls } = database({ property_contracts: Array.from({ length: 1_005 }, (_, id) => ({
            id: String(id), contract_date: '2026-09-01', contract_status: 'active', total_price: 100, prepayment_paid_cash: null,
        })) });
        const report = await loadOperationsReport(db, options);
        expect(report.contracts).toMatchObject({ count: 1_005, value: 100_500 });
        expect(report.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
        expect(calls.filter(c => c.table === 'property_contracts').map(c => c.start)).toEqual([0, 1000]);
        for (const call of calls) expect(call.filters).toContainEqual(['shop_id', 'shop-a']);
        for (const call of calls.filter(c => c.table === 'leads' || c.table === 'property_contracts')) expect(call.filters).toContainEqual(['deleted_at', null]);
    });
    it('never reads the financial ledger without finance permission', async () => {
        const { db, from } = database();
        const report = await loadOperationsReport(db, { ...options, canReadFinance: false });
        expect(report.cash).toBeNull();
        expect(from).not.toHaveBeenCalledWith('finance_transactions');
    });
    it.each(['property_contracts', 'leads', 'team_sales_targets', 'finance_transactions'])('fails the report if %s cannot be read', async table => {
        const { db } = database({}, table);
        await expect(loadOperationsReport(db, options)).rejects.toThrow('query failed');
    });
    it('validates AI or URL date arguments before touching the database', async () => {
        const { db, from } = database();
        await expect(loadOperationsReport(db, { ...options, from: 'yesterday' })).rejects.toThrow();
        expect(from).not.toHaveBeenCalled();
    });
    it('keeps legacy ledger receipts readable if only the optional receipt classification column is missing', async () => {
        const { db } = database({ finance_transactions: [{ txn_date: '2026-09-01', type: 'receipt', amount: 50, method: 'bank', contract_id: 'c1' }] }, undefined, true);
        const report = await loadOperationsReport(db, options);
        expect(report.cash).toMatchObject({ receipts: 50, receiptClassificationAvailable: false, unclassifiedCashReceipts: 50 });
    });
});
