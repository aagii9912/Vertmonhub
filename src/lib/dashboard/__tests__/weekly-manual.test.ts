import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { weeklyManualMetricNames, weeklyManualStatus, type WeeklyManual } from '../weekly-manual';
import { loadWeeklyManual } from '../weekly-manual-load';

const manual = (overrides: Partial<WeeklyManual> = {}): WeeklyManual => ({
    month: '2026-11', managerless: { count: 0, contracts: [] }, undated: 0,
    plan: { contractAmount: true, contractCount: true, cashflow: true },
    manualActuals: { contractAmount: false, contractCount: false, cashflow: false },
    ...overrides,
});

describe('weeklyManualStatus', () => {
    it('is ready only when no contract lacks a manager or a date and the month has a contract plan', () => {
        expect(weeklyManualStatus(manual(), { contractsFromErp: false })).toEqual({ ready: true, pending: [] });
        const open = manual({ managerless: { count: 2, contracts: [] }, undated: 1, plan: { contractAmount: false, contractCount: true, cashflow: null } });
        expect(weeklyManualStatus(open, { contractsFromErp: false })).toEqual({ ready: false, pending: ['manager', 'date', 'plan'] });
    });

    it('does not ask for a count or cash plan, nor for manual actuals (the system figures are used)', () => {
        const partial = manual({ plan: { contractAmount: true, contractCount: false, cashflow: false } });
        expect(weeklyManualStatus(partial, { contractsFromErp: false }).ready).toBe(true);
    });

    it('leaves CRM contracts alone in a project that reads its contracts from the ERP sales export', () => {
        const open = manual({ managerless: { count: 5, contracts: [] }, undated: 3, plan: { contractAmount: false, contractCount: false, cashflow: null } });
        expect(weeklyManualStatus(open, { contractsFromErp: true })).toEqual({ ready: false, pending: ['plan'] });
    });
});

describe('weeklyManualMetricNames', () => {
    it('names entered and empty metrics and skips cash the viewer may not see', () => {
        const row = { contractAmount: true, contractCount: false, cashflow: null };
        expect(weeklyManualMetricNames(row, true)).toEqual(['гэрээний дүн']);
        expect(weeklyManualMetricNames(row, false)).toEqual(['гэрээний тоо']);
        expect(weeklyManualMetricNames({ contractAmount: true, contractCount: true, cashflow: false }, false)).toEqual(['мөнгөн урсгал']);
    });
});

type Row = Record<string, unknown>;
/** PostgREST-ийн шүүлтийг дуурайсан жижиг DB: `.or()`-ийн менежергүй нөхцөлийг ойлгоно. */
function fakeDb(tables: Record<string, Row[]>, calls: string[] = []) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        const query: Record<string, unknown> = {
            select: (columns: string) => { calls.push(`${table}:${columns}`); return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            or: (expression: string) => {
                calls.push(`${table}:or:${expression}`);
                if (expression === 'sales_manager.is.null,sales_manager.eq.""') filters.push(row => (row.sales_manager ?? null) === null || row.sales_manager === '');
                else throw new Error(`unexpected or: ${expression}`);
                return query;
            },
            order: () => query, range: () => query,
            maybeSingle: async () => ({ data: (tables[table] ?? []).filter(row => filters.every(f => f(row)))[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: (tables[table] ?? []).filter(row => filters.every(f => f(row))), error: null }).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}
const contract = (id: string, overrides: Row = {}): Row => ({
    id, shop_id: 's', deleted_at: null, contract_number: null, contract_date: '2026-11-05', contract_status: 'active', product_type: 'residential',
    block_name: 'Б1', unit_label: `Б1-${id}, E2`, unit_number: null, total_price: '450000000', sales_manager: null,
    customer_name: null, customer_first_name: 'Энхжин', customer_last_name: 'Бат', ...overrides,
});

describe('loadWeeklyManual', () => {
    // Хурал 2026-11-11 → тайлант долоо хоног 11-04..11-10, төлөвлөгөө 11-р сарынх.
    const tables = {
        property_contracts: [
            contract('53'),
            contract('54', { sales_manager: '', contract_date: '2026-10-20', product_type: 'parking', total_price: null }),
            contract('55', { contract_date: null }),
            contract('56', { sales_manager: 'Ану.Бат', contract_date: null, order_date: '2026-10-30' }),
            contract('57', { contract_status: 'cancelled' }),
            contract('58', { deleted_at: '2026-11-01T00:00:00Z' }),
            contract('59', { shop_id: 'other' }),
            contract('60', { contract_date: null, contract_status: 'cancelled' }),
        ],
        team_sales_targets: [
            { shop_id: 's', year: 2026, month: 11, target_amount: '900000000', cashflow_target_amount: null, contract_count_target: 0,
                manual_contract_actual_amount: null, manual_cashflow_actual_amount: '120000000', manual_contract_count_actual: null },
            { shop_id: 's', year: 2026, month: 10, target_amount: null },
        ],
    };

    it('lists live contracts without a manager and counts the undated ones', async () => {
        const result = await loadWeeklyManual(fakeDb(tables), { shopId: 's', meetingDate: '2026-11-11', canSeeCustomers: true, canSeeCash: true });
        expect(result.month).toBe('2026-11');
        // NULL ба хоосон мөр хоёулаа менежергүй; цуцалсан, устгасан, өөр төслийн гэрээ орохгүй.
        expect(result.managerless.count).toBe(3);
        expect(result.managerless.contracts).toEqual([
            { id: '53', number: null, date: '2026-11-05', block: 'Б1', unit: 'Б1-53, E2', kindLabel: 'Орон сууц', customer: 'Б.Энхжин', total: 450000000, inWeek: true },
            expect.objectContaining({ id: '54', kindLabel: 'Зогсоол', total: null, inWeek: false }),
            expect.objectContaining({ id: '55', date: null, inWeek: false }),
        ]);
        // Огноогүй амьд гэрээ: 55, 56 (цуцалсан 60 орохгүй).
        expect(result.undated).toBe(2);
        // Огноог мөр дээр нь оруулна: «Захиалга өгсөн огноо» хоосон гэрээнд л (56 нь бүртгэлтэй тул гэрээн дээрээ шалгана).
        expect(result.undatedContracts).toEqual([
            expect.objectContaining({ id: '55', date: null, manager: null, dateEntry: true, customer: 'Б.Энхжин', kindLabel: 'Орон сууц' }),
            expect.objectContaining({ id: '56', manager: 'Ану.Бат', dateEntry: false }),
        ]);
    });

    it('reports whether each plan and manual actual of the report month is entered — 0 is a value, empty is not', async () => {
        const result = await loadWeeklyManual(fakeDb(tables), { shopId: 's', meetingDate: '2026-11-11', canSeeCustomers: true, canSeeCash: true });
        expect(result.plan).toEqual({ contractAmount: true, contractCount: true, cashflow: false });
        expect(result.manualActuals).toEqual({ contractAmount: false, contractCount: false, cashflow: true });
        // Сарын мөр байхгүй бол бүгд хоосон.
        const empty = await loadWeeklyManual(fakeDb({ ...tables, team_sales_targets: [] }), { shopId: 's', meetingDate: '2026-11-11', canSeeCustomers: true, canSeeCash: true });
        expect(empty.plan).toEqual({ contractAmount: false, contractCount: false, cashflow: false });
    });

    it('hides customer names without contract access and the cash rows without finance access', async () => {
        const result = await loadWeeklyManual(fakeDb(tables), { shopId: 's', meetingDate: '2026-11-11', canSeeCustomers: false, canSeeCash: false });
        expect(result.managerless.contracts.every(row => row.customer === null)).toBe(true);
        expect(result.undatedContracts!.every(row => row.customer === null)).toBe(true);
        expect(result.plan.cashflow).toBeNull();
        expect(result.manualActuals.cashflow).toBeNull();
    });
});
