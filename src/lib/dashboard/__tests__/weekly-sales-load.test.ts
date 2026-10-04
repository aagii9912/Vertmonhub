import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWeeklySales } from '../weekly-sales-load';

type Row = Record<string, unknown>;
const salesColumns = ['Гэрээний дугаар', 'Бүтээгдэхүүн', 'Нийт дүн', 'Нийт төлсөн дүн', 'Захиалга өгсөн огноо', 'Төлөв', 'Үндсэн захиалагч'];
const productColumns = ['Код', 'Бүтээгдэхүүний төрөл', 'Бүтээгдэхүүний төлөв', 'Давхар', 'Загвар'];
const saleRow = (paid: string) => ({ 'Гэрээний дугаар': 'EL-1', 'Бүтээгдэхүүн': 'Б1-2, E2, Орон сууц, ЭЛИЗИУМ', 'Нийт дүн': '100', 'Нийт төлсөн дүн': paid,
    'Захиалга өгсөн огноо': '2026-09-17', 'Төлөв': 'Гэрээ үүссэн', 'Үндсэн захиалагч': 'Тест.Хүн АА12345678' });

function fakeDb(tables: Record<string, Row[]>, calls: string[] = []) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let selected = '';
        const query: Record<string, unknown> = {
            select: (columns: string) => { selected = columns; calls.push(`${table}:${columns}`); return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            is: () => query, gte: () => query, order: () => query,
            lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return query; },
            range: () => query,
            maybeSingle: async () => ({ data: (tables[table] ?? []).filter(row => filters.every(f => f(row)))[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => {
                let rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
                if (table === 'erp_imports' && selected.includes('columns:datasets->0->columns'))
                    rows = rows.map(row => ({ id: row.id, source: row.source, report_date: row.report_date, columns: (row.datasets as Array<{ columns: string[] }>)[0]?.columns ?? null }));
                return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
        };
        return query;
    } } as unknown as SupabaseClient;
}

describe('loadWeeklySales', () => {
    it('picks the latest sales and product snapshots up to the meeting and hides customers without contract access', async () => {
        const db = fakeDb({
            erp_imports: [
                { id: 'future', shop_id: 's', source: 'ERP гэрээ', report_date: '2026-09-30', datasets: [{ name: 'S', columns: salesColumns, keyColumns: [], rows: [saleRow('99')] }] },
                { id: 'now', shop_id: 's', source: 'ERP гэрээ', report_date: '2026-09-22', datasets: [{ name: 'S', columns: salesColumns, keyColumns: [], rows: [saleRow('60')] }] },
                { id: 'prev', shop_id: 's', source: 'ERP гэрээ', report_date: '2026-09-15', datasets: [{ name: 'S', columns: salesColumns, keyColumns: [], rows: [saleRow('30')] }] },
                { id: 'products', shop_id: 's', source: 'Elysium ERP', report_date: '2026-09-20', datasets: [{ name: 'P', columns: productColumns, keyColumns: [], rows: [
                    { 'Код': 'Б1-2', 'Бүтээгдэхүүний төрөл': 'Орон сууц', 'Бүтээгдэхүүний төлөв': 'Гэрээ баталгаажсан', 'Давхар': '02', 'Загвар': 'E2' },
                ] }] },
                { id: 'other-shop', shop_id: 'x', source: 'ERP гэрээ', report_date: '2026-09-22', datasets: [{ name: 'S', columns: salesColumns, keyColumns: [], rows: [] }] },
            ],
            team_sales_targets: [{ shop_id: 's', year: 2026, month: 9, target_amount: '200' }],
        });
        const report = await loadWeeklySales(db, { shopId: 's', meetingDate: '2026-09-23', canSeeCustomers: false });
        expect(report.sources).toEqual({ sales: { date: '2026-09-22', source: 'ERP гэрээ' }, previousSales: { date: '2026-09-15', source: 'ERP гэрээ' }, contracts: 'erp' });
        expect(report.cash).toMatchObject({ delta: 30 });
        expect(report.week.lines).toEqual([expect.objectContaining({ contractNumber: 'EL-1', customer: null })]);
        expect(report.month).toMatchObject({ total: 100, target: 200, attainmentPct: 50 });
        expect(report.inventory!.source).toEqual({ date: '2026-09-20', source: 'Elysium ERP', kind: 'erp' });

        const visible = await loadWeeklySales(db, { shopId: 's', meetingDate: '2026-09-23', canSeeCustomers: true });
        expect(visible.week.lines[0].customer).toBe('Тест.Хүн');
    });

    it('falls back to CRM contracts and units when no ERP export exists', async () => {
        const calls: string[] = [];
        const db = fakeDb({
            erp_imports: [],
            property_contracts: [{ id: 'c1', shop_id: 's', contract_date: '2026-09-18', product_type: 'parking', total_price: '40', contract_status: 'active', unit_label: '201-5' },
                { id: 'c2', shop_id: 's', contract_date: '2026-09-19', product_type: 'residential', total_price: '90', contract_status: 'cancelled' }],
            property_units: [{ shop_id: 's', code: '203-209', block: '1477', floor: '05', model: 'A', category: 'residential', sale_area: '57.93', status: 'sold', raw_status: 'Гэрээ баталгаажсан', sales_channel: 'Пропертис', updated_at: '2026-06-24T00:00:00Z' }],
        }, calls);
        const report = await loadWeeklySales(db, { shopId: 's', meetingDate: '2026-09-23', canSeeCustomers: true });
        expect(report.sources.contracts).toBe('crm');
        expect(report.week).toMatchObject({ count: 1, total: 40 });
        expect(report.inventory!.source).toEqual({ date: '2026-06-24', source: 'Байрны бүртгэл (CRM)', kind: 'crm' });
        expect(report.inventory!.floorMaps).toEqual([expect.objectContaining({ block: '203', models: ['A'], totals: { sold: 1, available: 0, other: 0, barter: 0 } })]);
        expect(report.month.target).toBeNull();
        expect(calls.some(call => call.startsWith('erp_imports:id, datasets'))).toBe(false);
    });
});
