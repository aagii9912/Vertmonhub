import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSalesKpi } from '../kpi-load';

type Row = Record<string, unknown>;
const salesColumns = ['Гэрээний дугаар', 'Бүтээгдэхүүн', 'Нийт дүн', 'Нийт төлсөн дүн', 'Захиалга өгсөн огноо', 'Төлөв', 'Борлуулалтын менежер', 'Төлбөр хоцролт'];
const sale = (number: string, manager: string, values: Record<string, string>) => ({ 'Гэрээний дугаар': number, 'Бүтээгдэхүүн': `Б1-${number}, E1, Орон сууц`,
    'Захиалга өгсөн огноо': '2026-10-05', 'Төлөв': 'Гэрээ үүссэн', 'Борлуулалтын менежер': manager, 'Нийт дүн': '100', 'Нийт төлсөн дүн': '0', 'Төлбөр хоцролт': '0', ...values });
const snapshot = (id: string, date: string, rows: Row[]) => ({ id, shop_id: 's', source: 'Elysium гэрээ', report_date: date, datasets: [{ name: 'S', columns: salesColumns, keyColumns: [], rows }] });

function fakeDb(tables: Record<string, Row[]>) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let selected = '';
        const query: Record<string, unknown> = {
            select: (columns: string) => { selected = columns; return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
            not: (key: string) => { filters.push(row => row[key] !== null && row[key] !== undefined); return query; },
            lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return query; },
            gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return query; },
            lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return query; },
            order: () => query, range: () => query,
            then: (resolve: (value: unknown) => unknown) => {
                let rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
                // Бодит query шиг: шинэ snapshot эхэнд.
                if (selected.includes('columns:datasets->0->columns')) rows = rows.map(row => ({ ...row, columns: (row.datasets as Array<{ columns: string[] }>)[0].columns }))
                    .sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
                return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
        };
        return query;
    } } as unknown as SupabaseClient;
}

describe('loadSalesKpi', () => {
    it('computes ERP and CRM actuals per manager and scores them against saved plans', async () => {
        const db = fakeDb({
            erp_imports: [
                snapshot('start', '2026-09-30', [sale('1', 'Номин', { 'Захиалга өгсөн огноо': '2026-09-20', 'Нийт төлсөн дүн': '20', 'Төлбөр хоцролт': '30' })]),
                snapshot('end', '2026-11-03', [
                    sale('1', 'Номин', { 'Захиалга өгсөн огноо': '2026-09-20', 'Нийт төлсөн дүн': '60', 'Төлбөр хоцролт': '10' }),
                    sale('2', 'Номин', { 'Нийт дүн': '400', 'Нийт төлсөн дүн': '120' }),
                    sale('3', 'Сараа', { 'Төлөв': 'Цуцлагдсан', 'Нийт дүн': '900' }),
                ]),
                snapshot('too-late', '2026-11-20', [sale('4', 'Номин', { 'Нийт дүн': '999999' })]),
            ],
            sales_managers: [{ shop_id: 's', name: 'Номин', is_active: true }, { shop_id: 's', name: 'Сараа', is_active: true }, { shop_id: 's', name: 'Хуучин', is_active: false }],
            sales_kpi_months: [{ shop_id: 's', year: 2026, month: 10, manager_name: 'Номин', plans: { contract_amount: 400, cash_collected: 160, new_meetings: 2 }, manual: { calls_chats: 30 }, review: { management: 5 } }],
            property_viewings: [
                { shop_id: 's', status: 'completed', meeting_type: 'new_customer', deleted_at: null, scheduled_at: '2026-10-10T03:00:00.000Z', sales_manager_name: 'Номин' },
                { shop_id: 's', status: 'completed', meeting_type: 'repeat_customer', deleted_at: null, scheduled_at: '2026-10-10T03:00:00.000Z', sales_manager_name: 'Номин' },
                { shop_id: 's', status: 'completed', meeting_type: 'new_customer', deleted_at: null, scheduled_at: '2026-09-30T15:59:00.000Z', sales_manager_name: 'Номин' },
            ],
            leads: [
                { shop_id: 's', deleted_at: null, status: 'contacted', sales_manager_name: 'Номин', last_contact_at: '2026-10-01T00:00:00Z', next_followup_at: '2099-01-01T00:00:00Z', viewing_scheduled_at: null, created_at: '2026-10-01T00:00:00Z' },
                { shop_id: 's', deleted_at: null, status: 'contacted', sales_manager_name: 'Номин', last_contact_at: '2026-10-01T00:00:00Z', next_followup_at: '2026-10-02T00:00:00Z', viewing_scheduled_at: null, created_at: '2026-10-01T00:00:00Z' },
            ],
        });
        const report = await loadSalesKpi(db, { shopId: 's', year: 2026, month: 10, now: new Date('2026-10-20T00:00:00Z') });
        expect(report.sources).toEqual({ contracts: { date: '2026-11-03', source: 'Elysium гэрээ' }, cashFrom: { date: '2026-09-30', source: 'Elysium гэрээ' } });
        expect(report.managers.map(row => row.manager)).toEqual(['Номин', 'Сараа']);
        const nomin = report.managers[0];
        const actual = (key: string) => nomin.items.find(item => item.key === key)!.actual;
        expect([actual('contract_amount'), actual('cash_collected'), actual('overdue_collected'), actual('new_meetings'), actual('calls_chats'), actual('followup'), actual('management')])
            .toEqual([400, 160, 20, 1, 30, 50, 5]);
        expect(nomin).toMatchObject({ contracts: 1, review: { management: 5 }, coveredWeight: 75 });
        // (25 + 25 + 5 + 15) / 75
        expect(nomin.total).toBe(93.3);
        expect(report.managers[1].items.find(item => item.key === 'contract_amount')).toMatchObject({ actual: 0, missing: 'plan' });
    });

    it('marks ERP figures unavailable instead of zero without the needed snapshots, and limits to one manager', async () => {
        const db = fakeDb({ erp_imports: [], sales_managers: [{ shop_id: 's', name: 'Номин', is_active: true }, { shop_id: 's', name: 'Сараа', is_active: true }] });
        const report = await loadSalesKpi(db, { shopId: 's', year: 2026, month: 10, only: 'Сараа' });
        expect(report.managers).toHaveLength(1);
        const items = report.managers[0].items;
        expect(items.filter(item => ['contract_amount', 'cash_collected', 'overdue_collected'].includes(item.key)).map(item => item.actual)).toEqual([null, null, null]);
        expect(report.managers[0].total).toBeNull();
    });
});
