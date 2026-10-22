import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ledgerReceipts, loadPlanPerformance } from '../plan-performance-load';

type Row = Record<string, unknown>;
function database(rows: Record<string, Row[]> = {}, options: { failure?: string; missingOverdue?: boolean; missingImports?: boolean } = {}) {
    const calls: Array<{ table: string; columns: string; filters: Array<[string, unknown]>; start?: number }> = [];
    const from = vi.fn((table: string) => {
        const filters: Array<[string, unknown]> = [];
        let columns = '';
        const result = (start?: number, end?: number) => {
            calls.push({ table, columns, filters, start });
            if (table === options.failure) return { data: null, error: { message: 'query failed' } };
            if (options.missingOverdue && table === 'property_contracts' && columns.includes('overdue_amount')) {
                return { data: null, error: { code: '42703', message: 'column property_contracts.overdue_amount does not exist' } };
            }
            if (options.missingImports && table === 'contract_list_imports') return { data: null, error: { code: '42P01', message: 'relation does not exist' } };
            const data = (rows[table] ?? []).filter(row => filters.every(([key, value]) => !(key in row) || row[key] === value));
            return { data: start === undefined ? data : data.slice(start, (end ?? 0) + 1), error: null };
        };
        const query = {
            select: (value: string) => { columns = value; return query; },
            eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
            is: (key: string, value: unknown) => { filters.push([`is:${key}`, value]); return query; },
            gte: (key: string, value: unknown) => { filters.push([`gte:${key}`, value]); return query; },
            in: (key: string, value: unknown) => { filters.push([`in:${key}`, value]); return query; },
            lte: (key: string, value: unknown) => { filters.push([`lte:${key}`, value]); return query; },
            order: () => query,
            limit: () => query,
            range: (start: number, end: number) => Promise.resolve(result(start, end)),
            maybeSingle: () => { const { data, error } = result(); return Promise.resolve({ data: data?.[0] ?? null, error }); },
            then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
        };
        return query;
    });
    return { db: { from } as unknown as SupabaseClient, calls, from };
}

const options = { shopId: 'shop-a', year: 2026, canReadFinance: true, now: new Date('2026-10-22T04:00:00Z') };
const contract = (over: Row = {}): Row => ({
    id: 'c1', contract_date: '2026-09-03', contract_status: 'active', product_type: 'residential', block_name: 'Б1', unit_label: 'Б1-1',
    total_price: 100, prepayment_due: 30, paid_amount: 10, overdue_amount: 5, overdue_as_of: '2026-10-20', ...over,
});

describe('plan performance loading', () => {
    it('reads every contract page, the plan and the latest import of the authorized shop only', async () => {
        const { db, calls } = database({
            property_contracts: Array.from({ length: 1_003 }, (_, index) => contract({ id: `c${index}` })),
            team_sales_targets: [{ year: 2025, month: 12, revision: 1, target_amount: 10, block_amounts: {} }, { year: 2026, month: 9, revision: 1, target_amount: 300_000, block_amounts: {} }],
            contract_list_imports: [{ report_date: '2026-10-20' }],
        });
        const report = await loadPlanPerformance(db, options);
        expect(report.months[8].total.metrics.contract).toMatchObject({ plan: 300_000, actual: 100_300, pct: 33.4 });
        expect(report.years).toEqual([2025, 2026]);
        expect(report.overdue).toMatchObject({ amount: 5_015, count: 1_003, asOf: '2026-10-20' });
        expect(calls.filter(call => call.table === 'property_contracts').map(call => call.start)).toEqual([0, 1000]);
        for (const call of calls) expect(call.filters).toContainEqual(['shop_id', 'shop-a']);
        for (const call of calls.filter(call => call.table === 'property_contracts')) expect(call.filters).toContainEqual(['is:deleted_at', null]);
    });

    it('never reads the ledger without finance permission and omits the cash section', async () => {
        const { db, from } = database({ property_contracts: [contract()] });
        const report = await loadPlanPerformance(db, { ...options, canReadFinance: false });
        expect(report.cash).toBeNull();
        expect(report.months[8].total.metrics.cashflow).toBeUndefined();
        expect(from).not.toHaveBeenCalledWith('finance_transactions');
    });

    it('applies the operations cash rules to the year ledger', async () => {
        const { db, calls } = database({
            property_contracts: [contract()],
            finance_transactions: [
                { txn_date: '2026-09-04', type: 'receipt', amount: 40, method: 'bank', contract_id: 'c1' },
                { txn_date: '2026-09-05', type: 'receipt', amount: 900, method: 'barter', contract_id: 'c1' },
                { txn_date: '2026-09-06', type: 'disbursement', amount: 5, method: 'cash', contract_id: 'c1' },
            ],
        });
        const report = await loadPlanPerformance(db, options);
        expect(report.months[8].blocks.b1.metrics.cashflow).toMatchObject({ actual: 40, lowerBound: false });
        const ledger = calls.find(call => call.table === 'finance_transactions' && call.columns.includes('amount'))!;
        expect(ledger.filters).toEqual(expect.arrayContaining([['gte:txn_date', '2026-01-01'], ['lte:txn_date', '2026-12-31']]));
    });

    it('reads the first cash receipt of all years and reports an empty ledger as unknown cash', async () => {
        const empty = database({ property_contracts: [contract()] });
        const report = await loadPlanPerformance(empty.db, options);
        expect(report.cash).toMatchObject({ availability: 'no_ledger', ledgerSince: null, unknownPaid: 0 });
        expect(report.months[8].total.metrics.cashflow).toMatchObject({ actual: null });
        const first = empty.calls.find(call => call.table === 'finance_transactions' && call.columns === 'txn_date')!;
        expect(first.filters).toEqual([['shop_id', 'shop-a'], ['type', 'receipt'], ['in:method', ['cash', 'bank', 'bank_transfer', 'mortgage']]]);

        const { db } = database({
            property_contracts: [contract()],
            finance_transactions: [
                { txn_date: '2025-11-02', type: 'receipt', amount: 10, method: 'cash', contract_id: 'c1' },
                { txn_date: '2026-09-04', type: 'receipt', amount: 40, method: 'bank', contract_id: 'c1' },
            ],
        });
        const recorded = await loadPlanPerformance(db, options);
        expect(recorded.cash).toMatchObject({ availability: 'full', ledgerSince: '2025-11-02' });
        expect(recorded.months[7].total.metrics.cashflow).toMatchObject({ actual: 0, lowerBound: false });
    });

    it('keeps the report when only the new overdue columns or import table are missing', async () => {
        const { db } = database({ property_contracts: [contract()] }, { missingOverdue: true, missingImports: true });
        const report = await loadPlanPerformance(db, options);
        expect(report.overdue).toMatchObject({ available: false, amount: null });
        expect(report.months[8].total.metrics.contract!.actual).toBe(100);
    });

    it.each(['property_contracts', 'team_sales_targets', 'finance_transactions', 'contract_list_imports'])('fails if %s cannot be read', async table => {
        const { db } = database({ property_contracts: [contract()] }, { failure: table });
        await expect(loadPlanPerformance(db, options)).rejects.toThrow();
    });

    it('rejects an invalid year before reading', async () => {
        const { db, from } = database();
        await expect(loadPlanPerformance(db, { ...options, year: 1999 })).rejects.toThrow();
        expect(from).not.toHaveBeenCalled();
    });
});

describe('ledgerReceipts', () => {
    it('groups cash receipts by month and contract and ignores other years, barter and disbursements', () => {
        expect(ledgerReceipts([
            { txn_date: '2026-09-30', type: 'receipt', amount: 10, method: 'cash', contract_id: 'a' },
            { txn_date: '2026-09-01', type: 'receipt', amount: '5', method: 'mortgage', contract_id: 'a' },
            { txn_date: '2026-10-01', type: 'receipt', amount: 7, method: 'bank_transfer', contract_id: null },
            { txn_date: '2026-10-02', type: 'receipt', amount: 70, method: 'barter', contract_id: null },
            { txn_date: '2025-12-31', type: 'receipt', amount: 99, method: 'cash', contract_id: 'a' },
            { txn_date: '2026-11-03', type: 'disbursement', amount: 3, method: 'cash', contract_id: 'a' },
        ], 2026)).toEqual([
            { month: '2026-09', contractId: 'a', amount: 15 },
            { month: '2026-10', contractId: null, amount: 7 },
        ]);
    });
});
