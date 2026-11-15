import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadHubListAmounts, sumHubAmounts } from '../hub-amounts-load';
import { contractListRemainder } from '../list-format';

type Row = Record<string, unknown>;
/** Хамгийн сүүлийн импорт (report_date, created_at буурах) ба гэрээг буцаадаг жижиг DB. */
function fakeDb(tables: { contract_list_imports?: Row[]; property_contracts?: Row[] }, error?: { code: string; message: string }) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        const rows = () => ((tables as Record<string, Row[] | undefined>)[table] ?? []).filter(row => filters.every(test => test(row)));
        const query: Record<string, unknown> = {
            select: () => query, order: () => query, limit: () => query, range: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            maybeSingle: async () => error && table === 'contract_list_imports' ? { data: null, error }
                : { data: [...rows()].sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)) || String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null, error: null },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}
const stored = (unitLabel: string, extra: Row = {}): Row => ({ row: 2, productType: 'residential', unitLabel, orderDate: '2026-10-15', status: 'active', paidTotal: 100, barterTotal: 0, ...extra });
const contract = (id: string, unitLabel: string, extra: Row = {}): Row => ({ id, shop_id: 's', deleted_at: null, product_type: 'residential', unit_label: unitLabel,
    contract_status: 'active', contract_date: '2026-10-15', order_date: '2026-10-15', ...extra });

describe('loadHubListAmounts', () => {
    const contracts = [contract('c1', 'Б1-1'), contract('c2', 'Б1-2'), contract('c3', 'Б1-3', { contract_status: 'cancelled' }), contract('c4', 'Б1-4'),
        contract('x1', 'Б1-1', { shop_id: 'other' }), contract('d1', 'Б1-2', { deleted_at: '2026-11-01' })];

    it('pairs the latest file\'s cash and barter with live contracts; blank stays null, an unmatched contract is absent', async () => {
        const amounts = await loadHubListAmounts(fakeDb({
            contract_list_imports: [
                { shop_id: 's', report_date: '2026-10-22', created_at: '2026-10-22T01:00:00Z', rows: [stored('Б1-1', { paidTotal: 1 })] },
                { shop_id: 's', report_date: '2026-11-13', created_at: '2026-11-13T01:00:00Z', rows: [
                    stored('Б1-1', { paidTotal: 120_000_000, barterTotal: 30_000_000 }),
                    stored('Б1-2', { row: 3, paidTotal: null, barterTotal: 0 }),
                    // Файлд цуцлагдсан мөр — амьд гэрээнд дүн өгөхгүй.
                    stored('Б1-3', { row: 4, status: 'cancelled', paidTotal: 5 }),
                ] },
                { shop_id: 'other', report_date: '2026-11-14', created_at: '2026-11-14T01:00:00Z', rows: [stored('Б1-1', { paidTotal: 999 })] },
            ],
            property_contracts: contracts,
        }), 's');
        expect(amounts?.asOf).toBe('2026-11-13');
        expect(Object.fromEntries(amounts!.byContract)).toEqual({ c1: { cash: 120_000_000, barter: 30_000_000 }, c2: { cash: null, barter: 0 } });
        // Нийлбэр: хоосныг 0 гэж нэмэхгүй; дүнгүй бол null.
        expect(sumHubAmounts(amounts!, ['c1', 'c2', 'c4'])).toEqual({ cash: 120_000_000, barter: 30_000_000 });
        expect(sumHubAmounts(amounts!, ['c4'])).toEqual({ cash: null, barter: null });
    });

    it('returns null without an import, without either column, or before the import table exists — and surfaces other errors', async () => {
        expect(await loadHubListAmounts(fakeDb({ property_contracts: contracts }), 's')).toBeNull();
        // Хуучин файл: «Бэлэн төлөлт», «Бартер» баганагүй (paidTotal null, barterTotal талбаргүй).
        const old = { shop_id: 's', report_date: '2026-10-22', created_at: '2026-10-22T01:00:00Z', rows: [{ ...stored('Б1-1'), paidTotal: null, barterTotal: undefined }] };
        expect(await loadHubListAmounts(fakeDb({ contract_list_imports: [old], property_contracts: contracts }), 's')).toBeNull();
        expect(await loadHubListAmounts(fakeDb({}, { code: '42P01', message: 'relation "contract_list_imports" does not exist' }), 's')).toBeNull();
        await expect(loadHubListAmounts(fakeDb({}, { code: '57014', message: 'timeout' }), 's')).rejects.toThrow('timeout');
    });
});

describe('contractListRemainder («Нийт үлдэгдэл»)', () => {
    it('is the file\'s formula, total − advance due, and unknown when either side is empty', () => {
        expect(contractListRemainder({ total_price: 591_408_000, prepayment_due: 177_422_400 })).toBe(413_985_600);
        expect(contractListRemainder({ total_price: '54800000', prepayment_due: '54800000' })).toBe(0);
        expect(contractListRemainder({ total_price: 100, prepayment_due: null })).toBeNull();
        expect(contractListRemainder({ total_price: null, prepayment_due: 10 })).toBeNull();
    });
});
