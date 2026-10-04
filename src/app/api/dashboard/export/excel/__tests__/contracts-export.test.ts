// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readSheetRows } from '@/lib/utils/xlsx';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    rows: {} as Record<string, Row[]>,
    errors: {} as Record<string, { message: string; code?: string }>,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: async () => null, resolvePermissions: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(),
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({ from: (table: string) => {
        const filters: Array<(r: Row) => boolean> = [];
        let range: [number, number] | null = null;
        const run = () => {
            if (state.errors[table]) return { data: null, error: state.errors[table] };
            let rows = (state.rows[table] || []).filter(r => filters.every(f => f(r)));
            if (range) rows = rows.slice(range[0], range[1] + 1);
            return { data: rows, error: null };
        };
        const q = {
            select: () => q,
            eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
            is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return q; },
            order: () => q,
            range: (a: number, b: number) => { range = [a, b]; return q; },
            then: (resolve: (value: ReturnType<typeof run>) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
        };
        return q;
    } }),
}));

import { GET } from '../route';

const contract = (id: string, customer: string): Row => ({ id, shop_id: 'shop-1', deleted_at: null, unit_label: id, contract_status: 'active', customer_name: customer, total_price: 100, paid_amount: 40, balance: 60 });

async function exportContracts() {
    const response = await GET(new NextRequest('http://localhost/api/dashboard/export/excel?type=contracts'));
    return { response, rows: response.status === 200 ? await readSheetRows(Buffer.from(await response.arrayBuffer())) : [] };
}

beforeEach(() => {
    state.errors = {};
    state.rows = {
        property_contracts: [contract('A-1', 'Дорж Сараа'), contract('A-2', 'Бат'), contract('A-3', 'Тулга Ганбаатар')],
        contract_transfers: [
            { shop_id: 'shop-1', contract_id: 'A-1', kind: 'transfer', effective_date: '2026-09-01', from_customer_name: 'Бат Болд', created_at: '2026-09-01T02:00:00Z' },
            { shop_id: 'shop-1', contract_id: 'A-1', kind: 'transfer', effective_date: '2026-10-01', from_customer_name: 'Ганаа', created_at: '2026-10-01T02:00:00Z' },
            { shop_id: 'shop-1', contract_id: 'A-3', kind: 'rename', effective_date: '2026-10-02', from_customer_name: 'Тулга', created_at: '2026-10-02T02:00:00Z' },
            { shop_id: 'shop-2', contract_id: 'A-2', kind: 'transfer', effective_date: '2026-10-03', from_customer_name: 'Өөр shop', created_at: '2026-10-03T02:00:00Z' },
        ],
    };
});

describe('contracts Excel export', () => {
    it('shows the original buyer and the latest transfer date next to the current holder', async () => {
        const { response, rows } = await exportContracts();
        expect(response.status).toBe(200);
        const byCode = Object.fromEntries(rows.map(row => [row['Код'], row]));
        expect(byCode['A-1']).toMatchObject({ 'Худалдан авагч': 'Дорж Сараа', 'Анхны худалдан авагч': 'Бат Болд', 'Шилжүүлсэн огноо': '2026-10-01', 'Төлсөн': 40 });
        // Нэр засвар (ижил хүн) болон өөр shop-ийн түүх шилжүүлэгт тооцогдохгүй.
        expect(byCode['A-2']).toMatchObject({ 'Анхны худалдан авагч': '-', 'Шилжүүлсэн огноо': '-' });
        expect(byCode['A-3']).toMatchObject({ 'Худалдан авагч': 'Тулга Ганбаатар', 'Анхны худалдан авагч': '-', 'Шилжүүлсэн огноо': '-' });
    });

    it('exports before the history table exists, but surfaces other history read errors', async () => {
        state.errors.contract_transfers = { code: '42P01', message: 'relation "contract_transfers" does not exist' };
        expect((await exportContracts()).response.status).toBe(200);
        state.errors.contract_transfers = { message: 'database unavailable' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await exportContracts()).response.status).toBe(500);
    });
});
