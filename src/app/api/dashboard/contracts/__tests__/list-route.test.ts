// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
const state = vi.hoisted(() => ({
    tables: {} as Record<string, Row[]>,
    errors: {} as Record<string, { message: string; code?: string }>,
    reads: [] as Array<{ table: string; select: string }>,
    denied: null as Response | null,
    previousHolderIds: [] as string[],
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.denied, requireModuleWrite: async () => state.denied, requireModuleDelete: async () => state.denied, requireAnyModule: async () => state.denied,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Туршилт' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/services/ContractService', () => ({ contractIdsByPreviousHolder: async () => state.previousHolderIds }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/** PostgREST-ийн `col.op.value` нөхцөл (eq/neq/is/gt/ilike/in) — `.or()` доторх таслалыг хаалтаас гадна салгана. */
function clause(text: string): Filter {
    const match = /^([\w.]+)\.(eq|neq|is|gt|ilike|in)\.(.*)$/.exec(text);
    if (!match) throw new Error(`unsupported clause ${text}`);
    const [, key, op, raw] = match;
    return (row) => {
        const value = row[key];
        if (op === 'is') return raw === 'null' ? (value ?? null) === null : String(value) === raw;
        if (op === 'eq') return value !== null && value !== undefined && String(value) === raw;
        if (op === 'neq') return value !== null && value !== undefined && String(value) !== raw;
        if (op === 'gt') return value !== null && value !== undefined && Number(value) > Number(raw);
        if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').includes(String(value));
        const pattern = new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'iu');
        return value !== null && value !== undefined && pattern.test(String(value));
    };
}
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of text) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
    }
    return [...parts, current];
}

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const filters: Filter[] = [];
            const orders: Array<{ key: string; ascending: boolean }> = [];
            let range: [number, number] = [0, Infinity];
            let select = '*';
            const run = () => {
                state.reads.push({ table, select });
                if (state.errors[table]) return { data: null, error: state.errors[table], count: null };
                let rows = (state.tables[table] || []).filter((row) => filters.every((f) => f(row)));
                rows = [...rows].sort((a, b) => {
                    for (const { key, ascending } of orders) {
                        const x = a[key] as string | number | null | undefined;
                        const y = b[key] as string | number | null | undefined;
                        if (x === y) continue;
                        if (x === null || x === undefined) return 1;
                        if (y === null || y === undefined) return -1;
                        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
                    }
                    return 0;
                });
                return { data: rows.slice(range[0], range[1] + 1).map((row) => ({ ...row })), error: null, count: rows.length };
            };
            const q = {
                select: (columns: string) => { select = columns; return q; },
                eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
                is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return q; },
                gte: (key: string, value: string) => { filters.push((row) => row[key] !== null && row[key] !== undefined && String(row[key]) >= value); return q; },
                lte: (key: string, value: string) => { filters.push((row) => row[key] !== null && row[key] !== undefined && String(row[key]) <= value); return q; },
                or: (text: string) => { const parts = splitTopLevel(text).map(clause); filters.push((row) => parts.some((f) => f(row))); return q; },
                order: (key: string, options?: { ascending?: boolean }) => { orders.push({ key, ascending: options?.ascending !== false }); return q; },
                range: (from: number, to: number) => { range = [from, to]; return q; },
                limit: (n: number) => { range = [0, n - 1]; return q; },
                maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
                then: (resolve: (value: ReturnType<typeof run>) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
            };
            return q;
        },
    }),
}));

import { GET } from '../route';

const contract = (id: string, extra: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, contract_status: 'active', product_type: 'residential', block_name: 'Б1',
    unit_label: `Б1-${id}`, legacy_unit_number: null, unit_number: null, customer_name: `Худалдан авагч ${id}`,
    total_price: 100_000_000, prepayment_due: 30_000_000, paid_amount: null, balance: null, contracted_area: 50,
    overdue_amount: null, overdue_as_of: null, overdue_days: 0, payment_condition: 'Энгийн', contract_date: '2026-10-01', order_date: '2026-10-01',
    ...extra,
});

async function list(query = 'page=1&pageSize=25') {
    const response = await GET(new NextRequest(`http://localhost/api/dashboard/contracts?${query}`));
    return { response, body: await response.json() as Record<string, any> };
}
const ids = (body: Record<string, any>) => (body.contracts as Row[]).map((c) => c.id).sort();

beforeEach(() => {
    state.denied = null;
    state.errors = {};
    state.reads = [];
    state.previousHolderIds = [];
    state.tables = {
        property_contracts: [
            contract('1', { overdue_amount: 2_000_000, overdue_as_of: '2026-10-22', payment_condition: 'Тусгай' }),
            contract('2', { overdue_amount: 0, overdue_as_of: '2026-10-22', block_name: 'Б2', unit_label: 'Б2-2' }),
            contract('3', { contract_status: 'cancelled', total_price: 50_000_000, overdue_amount: 0, overdue_as_of: '2026-10-22' }),
            contract('4', { contract_date: null, order_date: null, product_type: 'parking', legacy_unit_number: '110', overdue_days: 12 }),
            contract('5', { overdue_amount: 700_000, overdue_as_of: '2026-09-30', contract_status: 'closed', paid_amount: 100_000_000, balance: 0 }),
            contract('6', { contract_date: null, order_date: null, contract_status: 'cancelled' }),
            contract('deleted', { deleted_at: '2026-10-01T00:00:00Z' }),
            contract('foreign', { shop_id: 'shop-2' }),
        ],
        contract_list_imports: [
            { shop_id: 'shop-1', report_date: '2026-09-30', file_name: 'HUB 0930.xlsx', row_count: 80, created_at: '2026-09-30T02:00:00Z' },
            { shop_id: 'shop-1', report_date: '2026-10-22', file_name: 'HUB data 1.xlsx', row_count: 83, created_at: '2026-10-22T02:00:00Z' },
            { shop_id: 'shop-2', report_date: '2026-10-23', file_name: 'other.xlsx', row_count: 1, created_at: '2026-10-23T02:00:00Z' },
        ],
    };
});

describe('GET /api/dashboard/contracts', () => {
    it('answers the module gate before reading anything', async () => {
        state.denied = NextResponse.json({ error: 'Нэвтрээгүй' }, { status: 401 });
        const { response } = await list();
        expect(response.status).toBe(401);
        expect(state.reads).toEqual([]);
    });

    it('returns project-wide stats (cancelled out of the money), the latest HUB file and filter facets', async () => {
        const { response, body } = await list();
        expect(response.status).toBe(200);
        expect(ids(body)).toEqual(['1', '2', '3', '4', '5', '6']);
        expect(body.stats).toMatchObject({
            total: 6, active: 3, closed: 1, cancelled: 2,
            total_sales: 400_000_000, prepayment_due: 120_000_000, area: 200,
            // Сүүлийн файлын (2026-10-22) мөр л; 2026-09-30-ныхыг хуучирсан гэж тоолно.
            overdue_amount: 2_000_000, overdue_as_of: '2026-10-22', overdue_count: 1, overdue_stale: 1, overdue_days_count: 1,
            unknown_paid: 3, total_paid: 100_000_000,
        });
        expect(body.footer).toEqual(body.stats);
        expect(body.latestImport).toEqual({ report_date: '2026-10-22', file_name: 'HUB data 1.xlsx', row_count: 83, not_in_file: 3 });
        expect(body.facets).toEqual({ blocks: ['Б1', 'Б2'], paymentConditions: ['Тусгай', 'Энгийн'], productTypes: ['parking', 'residential'] });
        expect(body.pagination).toMatchObject({ total: 6, page: 1, pageSize: 25, totalPages: 1 });
    });

    it('keeps the tiles project-wide while the footer sums only the filtered rows', async () => {
        const { body } = await list('page=1&pageSize=25&block=Б2');
        expect(ids(body)).toEqual(['2']);
        expect(body.stats.total).toBe(6);
        expect(body.footer).toMatchObject({ total: 1, total_sales: 100_000_000, overdue_amount: 0 });
    });

    it.each([
        ['productType=parking', ['4']],
        ['paymentCondition=Тусгай', ['1']],
        ['status=cancelled', ['3', '6']],
        // ₮ хоцролт эсвэл системийн хоног.
        ['overdue=1', ['1', '4', '5']],
        // Огноогүй амьд гэрээ (цуцалсныг хассан).
        ['undated=1', ['4']],
        // Сүүлийн файлд байгаагүй: хоцролтын огноо хоосон эсвэл өмнөх файлынх.
        ['notInLatest=1', ['4', '5', '6']],
        ['from=2026-10-01&to=2026-10-01', ['1', '2', '3', '5']],
        ['search=110', ['4']],
    ])('filters %s', async (query, expected) => {
        expect(ids((await list(`page=1&pageSize=25&${query}`)).body)).toEqual(expected);
    });

    it('finds a transferred contract by its previous holder', async () => {
        state.previousHolderIds = ['5'];
        expect(ids((await list('page=1&pageSize=25&search=Өмнөх эзэмшигч')).body)).toEqual(['5']);
    });

    it('ignores «not in the latest file» for a project that never imported a HUB file', async () => {
        state.tables.contract_list_imports = [];
        const { body } = await list('page=1&pageSize=25&notInLatest=1');
        expect(ids(body)).toHaveLength(6);
        expect(body.latestImport).toBeNull();
        // Импортгүй төсөлд мэдэгдэж буй бүх ₮ хоцролтын нийлбэр.
        expect(body.stats).toMatchObject({ overdue_amount: 2_700_000, overdue_stale: 0, overdue_as_of: null });
    });

    it('skips stats, footer and the import read for ⌘K (stats=0)', async () => {
        const { body } = await list('search=Б1-1&page=1&pageSize=5&stats=0');
        expect(ids(body)).toEqual(['1']);
        expect(body).not.toHaveProperty('stats');
        expect(body).not.toHaveProperty('footer');
        expect(state.reads.map((read) => read.table)).toEqual(['property_contracts']);
    });

    it('sorts by the HUB columns and falls back to the contract date for unknown columns', async () => {
        const sorted = async (query: string) => ((await list(`page=1&pageSize=25&${query}`)).body.contracts as Row[]).map((c) => c.id);
        expect((await sorted('sortBy=overdue_amount&sortOrder=desc')).slice(0, 2)).toEqual(['1', '5']);
        expect((await sorted('sortBy=legacy_unit_number;drop')).slice(-2)).toEqual(['4', '6']);
    });

    it('pages on the server and counts the filtered set', async () => {
        const { body } = await list('page=2&pageSize=4&sortBy=unit_label&sortOrder=asc');
        expect(body.contracts).toHaveLength(2);
        expect(body.pagination).toMatchObject({ total: 6, page: 2, pageSize: 4, totalPages: 2, hasMore: false });
    });

    it('fails loudly instead of showing an empty project when a read fails', async () => {
        state.errors.contract_list_imports = { code: '57014', message: 'timeout' };
        const { response, body } = await list();
        expect(response.status).toBe(500);
        expect(body.error).toBe('Гэрээ татахад алдаа гарлаа');
    });

    it('still returns every matching row without pagination (contract generator search)', async () => {
        const { body } = await list('search=Б1-1');
        expect(ids(body)).toEqual(['1']);
        expect(body.stats.total).toBe(1);
    });

    it('adds the «Сэжим (хаанаас ирсэн)» name to every row with one extra read (archived names too), null otherwise', async () => {
        state.tables.property_contracts[0].referral_source_id = 'ref-facebook';
        state.tables.property_contracts[1].referral_source_id = 'ref-barmash';
        state.tables.sales_referral_sources = [
            { id: 'ref-facebook', shop_id: 'shop-1', name: 'Facebook', sort_order: 10, archived_at: null },
            { id: 'ref-barmash', shop_id: 'shop-1', name: 'Бармаш түрээслэгч', sort_order: 20, archived_at: '2026-10-20T00:00:00Z' },
            { id: 'ref-foreign', shop_id: 'shop-2', name: 'Монкон', sort_order: 10, archived_at: null },
        ];
        for (const query of ['page=1&pageSize=25', 'search=Б']) {
            state.reads = [];
            const { body } = await list(query);
            const names = Object.fromEntries((body.contracts as Row[]).map((c) => [c.id, c.referral_source_name]));
            expect(names).toMatchObject({ '1': 'Facebook', '2': 'Бармаш түрээслэгч', '4': null });
            expect(state.reads.filter((read) => read.table === 'sales_referral_sources')).toHaveLength(1);
        }
    });

    it('skips the referral read when no row has one and tolerates the table missing', async () => {
        const { body } = await list();
        expect((body.contracts as Row[]).every((c) => c.referral_source_name === null)).toBe(true);
        expect(state.reads.some((read) => read.table === 'sales_referral_sources')).toBe(false);
        state.tables.property_contracts[0].referral_source_id = 'ref-facebook';
        state.errors.sales_referral_sources = { code: 'PGRST205', message: "Could not find the table 'public.sales_referral_sources'" };
        const missing = await list();
        expect(missing.response.status).toBe(200);
        expect((missing.body.contracts as Row[]).find((c) => c.id === '1')?.referral_source_name).toBeNull();
    });
});
