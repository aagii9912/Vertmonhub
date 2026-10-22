// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { CONTRACT_LIST_COLUMNS } from '@/lib/contracts/list-format';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    readDenied: null as Response | null,
    writeDenied: {} as Record<string, Response | null>,
    calls: [] as string[],
    userId: 'user-1' as string | null,
    project: 'project-1' as string | null,
    scope: vi.fn(),
    rpc: vi.fn(),
    tables: {} as Record<string, Row[]>,
    tableErrors: {} as Record<string, { code: string; message: string }>,
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: vi.fn(async (module: string) => { state.calls.push(`read:${module}`); return state.readDenied; }),
    requireModuleWrite: vi.fn(async (module: string) => { state.calls.push(`write:${module}`); return state.writeDenied[module] ?? null; }),
    requireModuleDelete: vi.fn(async () => null),
    requireAnyModule: vi.fn(async () => null),
    resolvePermissions: vi.fn(),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => state.userId }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(), resolveSalesProjectScope: state.scope,
}));
vi.mock('@/lib/sales/manager-identity', () => ({ resolveManagerIdentity: async () => ({ managerName: 'Номин', fullName: 'Номин Бат' }) }));
vi.mock('@/lib/projects/shop-project', () => ({ soleShopProjectId: async () => state.project }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        rpc: state.rpc,
        from(table: string) {
            const filters: Array<(row: Row) => boolean> = [];
            const result = () => {
                const error = state.tableErrors[table];
                if (error) return { data: null, error };
                return { data: (state.tables[table] ?? []).filter(row => filters.every(test => test(row))), error: null };
            };
            const query = {
                select: () => query, order: () => query, limit: () => query,
                eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
                is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return query; },
                not: (column: string) => { filters.push(row => row[column] !== null && row[column] !== undefined); return query; },
                range: async (from: number, to: number) => { const r = result(); return r.error ? r : { data: r.data!.slice(from, to + 1), error: null }; },
                maybeSingle: async () => { const r = result(); return r.error ? r : { data: r.data![0] ?? null, error: null }; },
            };
            return query;
        },
    }),
}));

import { GET, POST } from '../import/route';
import { ProjectScopeError } from '@/lib/sales/project-scope';

const unit = (code: string, category: string, extra: Row = {}) => ({ shop_id: 'shop-1', code, category, block: code.split('-')[0], floor: '05', model: 'A',
    unit_number: '0', legacy_unit_number: code.split('-')[1].split(' ')[0], status: 'sold', ...extra });
const contract = (n: number, extra: Row = {}) => ({
    shop_id: 'shop-1', deleted_at: null, id: `40000000-0000-4000-8000-00000000000${n}`, product_type: 'residential', unit_label: 'Б1-16', block_name: 'Б1',
    unit_number: null, legacy_unit_number: '16', contract_status: 'active', order_date: null, contract_date: null, total_price: 452400000, price_per_sqm: 7800000,
    contracted_area: 58, prepayment_condition: '30%', prepayment_due: 135720000, payment_condition: null, overdue_amount: null, overdue_as_of: null,
    customer_name: 'Тэмүүлэн.Болд', customer_first_name: null, customer_last_name: null, contract_number: null, sales_manager: null, paid_amount: null, ...extra,
});
const hubRow = (extra: Row = {}) => ({
    'Төрөл': 'Орон сууц', 'Блок': 'Б1', 'Тоот': 16, 'Давхар': '5', 'Загвар': 'A', 'Гэрээлсэн талбай': 58, 'Урьдчилгааны нөхцөл': '30%', 'М.кв үнэ': 7800000,
    'Нийт дүн': 452400000, 'Урьдчилгааны дүн': 135720000, 'Төлбөр хоцролт': 0, 'Захиалга өгсөн огноо': '2026-10-15', 'Төлөв': 'Гэрээ үүссэн',
    'Нэр': 'Тэмүүлэн', 'Овог': 'Болд', 'Захиалгын нөхцөл': 'Энгийн', ...extra,
});
const FILE_ROWS = [
    hubRow(),
    hubRow({ 'Төрөл': 'Зогсоол', 'Тоот': 10, 'Давхар': '1', 'Загвар': 'P', 'Гэрээлсэн талбай': 12.5, 'Урьдчилгааны нөхцөл': '100%', 'М.кв үнэ': 59000000,
        'Нийт дүн': 59000000, 'Урьдчилгааны дүн': 59000000, 'Захиалга өгсөн огноо': '2026-09-03', 'Нэр': 'Сараа', 'Овог': 'Дорж' }),
    hubRow({ 'Блок': 'Б2', 'Тоот': 231, 'Давхар': '22', 'Захиалга өгсөн огноо': '2026-10-15', 'Нэр': 'Нараа', 'Овог': 'Бат' }),
];
const fileOf = async (rows: Row[] = FILE_ROWS, name = 'HUB data.xlsx', columns: readonly string[] = CONTRACT_LIST_COLUMNS) =>
    new File([await buildWorkbookBuffer([{ name: 'Sheet1', columns, rows }])], name);

async function post(fields: Record<string, string>, file?: File | null) {
    const form = new FormData();
    if (file !== null) form.set('file', file ?? await fileOf());
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return POST(new NextRequest('http://localhost/api/dashboard/contracts/import', { method: 'POST', body: form }));
}
const preview = async (file?: File) => post({ action: 'preview', reportDate: '2026-10-21' }, file);
const REQUEST = '11111111-1111-4111-8111-111111111111';
async function commit(fields: Record<string, string> = {}) {
    const planned = await (await preview()).json();
    return post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true', ...fields });
}

beforeEach(() => {
    vi.clearAllMocks();
    state.readDenied = null;
    state.writeDenied = {};
    state.calls = [];
    state.userId = 'user-1';
    state.project = 'project-1';
    state.tableErrors = {};
    state.scope.mockResolvedValue({ projectIds: null, managerName: null });
    state.rpc.mockResolvedValue({ data: { ok: true, replayed: false, import_id: 'import-1', inserted: 1, updated: 2, summary: { inserted: 1, updated: 2 } }, error: null });
    state.tables = {
        property_units: [unit('Б1-16', 'residential'), unit('Б1-10 (01)', 'parking', { floor: '01', model: 'P', unit_number: '10' }),
            unit('Б1-10 (B1)', 'parking', { floor: 'B1', model: 'P', unit_number: '10' }), unit('Б2-231', 'residential', { floor: '22', status: 'available' })],
        property_contracts: [contract(1), contract(2, { product_type: 'parking', unit_label: 'Б1-10 (01)', legacy_unit_number: '10', unit_number: '10', total_price: 66700000,
            price_per_sqm: null, contracted_area: 12.5, prepayment_condition: '30%', prepayment_due: 20010000, customer_name: 'Сараа.Дорж' })],
        contract_transfers: [], payment_schedules: [], finance_transactions: [], contract_list_imports: [],
    };
});

describe('POST /api/dashboard/contracts/import — gates', () => {
    it('requires contracts write, then erp-imports write, before reading the file', async () => {
        state.writeDenied.contracts = Response.json({ error: 'Эрхгүй' }, { status: 403 });
        expect((await preview()).status).toBe(403);
        expect(state.calls).toEqual(['write:contracts']);
        state.calls = [];
        state.writeDenied = { 'erp-imports': Response.json({ error: 'Эрхгүй' }, { status: 403 }) };
        expect((await preview()).status).toBe(403);
        expect(state.calls).toEqual(['write:contracts', 'write:erp-imports']);
        expect(state.scope).not.toHaveBeenCalled();
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('refuses project-restricted managers, shops without a single project and anonymous callers', async () => {
        state.scope.mockResolvedValue({ projectIds: ['project-1'], managerName: 'Номин' });
        const restricted = await preview();
        expect(restricted.status).toBe(403);
        expect(await restricted.json()).toEqual({ error: 'Гэрээний импорт удирдлагад зориулагдсан' });
        state.scope.mockRejectedValue(new ProjectScopeError(503, 'Менежерийн харьяаллыг шалгаж чадсангүй'));
        expect((await preview()).status).toBe(503);
        state.scope.mockResolvedValue({ projectIds: null, managerName: null });
        state.project = null;
        expect((await preview()).status).toBe(400);
        state.userId = null;
        expect((await preview()).status).toBe(401);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('validates the upload: file, type, HUB columns and row errors', async () => {
        expect((await post({ action: 'preview' }, null)).status).toBe(400);
        const xls = await post({ action: 'preview' }, new File([new Uint8Array([1, 2, 3])], 'old.xls'));
        expect(xls.status).toBe(400);
        expect((await xls.json()).error).toContain('.xls');
        const other = await preview(await fileOf([{ Код: 'Б1-1' }], 'products.xlsx', ['Код']));
        expect(other.status).toBe(400);
        expect((await other.json()).error).toContain('16 баганатай sheet олдсонгүй');
        const broken = await preview(await fileOf([hubRow({ 'Төлөв': 'Батлагдсан' }), hubRow({ 'Тоот': 999 })]));
        expect(broken.status).toBe(400);
        expect((await broken.json()).errors).toEqual(['Мөр 2: «Батлагдсан» төлөв танигдсангүй (Гэрээ үүссэн / Гэрээ хаасан / Цуцлагдсан)']);
        const unknownUnit = await preview(await fileOf([hubRow({ 'Тоот': 999 })]));
        expect((await unknownUnit.json()).errors).toEqual(['Мөр 2: Орон сууц Б1-999 байр олдсонгүй']);
        expect((await post({ action: 'delete' })).status).toBe(400);
        // Хуанлид байхгүй огноо overdue_as_of болж урьдчилан харагдахгүй (RPC-ийн англи алдаа ч биш).
        expect((await post({ action: 'preview', reportDate: '2026-02-31' })).status).toBe(400);
    });
});

describe('POST /api/dashboard/contracts/import — preview and commit', () => {
    it('previews the plan without writing: counts, review, missing, hash', async () => {
        const response = await preview();
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({
            counts: { insert: 1, insertCancelled: 0, update: 2, unchanged: 0, review: 1, blocking: 0, missing: 0 },
            sheetName: 'Sheet1', rowCount: 3, opsCount: 3, canCommit: true, latestImport: null, reportDate: '2026-10-21',
            review: [{ label: 'Зогсоол Б1-10 (01)', changes: expect.arrayContaining([{ field: 'total_price', label: 'Нийт дүн', from: 66700000, to: 59000000 }]) }],
            unitStatusMismatches: [{ label: 'Б2-231', kind: 'live_on_free' }],
        });
        expect(body.planHash).toMatch(/^[0-9a-f]{64}$/);
        expect(body).not.toHaveProperty('ops');
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('commits through the RPC with the server-side actor, project and recomputed hash', async () => {
        const planned = await (await preview()).json();
        const response = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true' });
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ ok: true, import_id: 'import-1', inserted: 1, updated: 2 });
        expect(state.rpc).toHaveBeenCalledTimes(1);
        const [name, args] = state.rpc.mock.calls[0];
        expect(name).toBe('import_contract_list');
        expect(args).toMatchObject({ p_shop_id: 'shop-1', p_project_id: 'project-1', p_report_date: '2026-10-21', p_file_name: 'HUB data.xlsx',
            p_request_id: REQUEST, p_plan_hash: planned.planHash, p_allow_older: false, p_actor: 'user-1', p_actor_name: 'Номин' });
        expect(args.p_ops).toHaveLength(3);
        expect(args.p_rows).toHaveLength(3);
        expect(args.p_summary).toMatchObject({ counts: { insert: 1, update: 2 }, sheet: 'Sheet1', rowCount: 3 });
        expect(JSON.stringify(args.p_ops)).not.toMatch(/paid_amount|balance/);
    });

    it('answers a stale preview with 409 and requires accepting review items', async () => {
        const stale = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: 'a'.repeat(64), acceptReview: 'true' });
        expect(stale.status).toBe(409);
        expect(await stale.json()).toEqual({ error: 'Өгөгдөл өөрчлөгдсөн, дахин шалгана уу', code: 'stale_preview' });
        const unreviewed = await commit({ acceptReview: 'false' });
        expect(unreviewed.status).toBe(400);
        expect((await unreviewed.json()).code).toBe('review_required');
        expect((await post({ action: 'commit', reportDate: '2026-10-21' })).status).toBe(400);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('refuses to commit while blocking conflicts exist', async () => {
        state.tables.property_contracts[1] = { ...state.tables.property_contracts[1], paid_amount: 1000 };
        const planned = await (await preview()).json();
        expect(planned).toMatchObject({ canCommit: false, blocking: [{ code: 'paid_known', label: 'Зогсоол Б1-10 (01)' }] });
        const response = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true' });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: 'blocking', blocking: [{ code: 'paid_known' }] });
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('needs explicit confirmation for a file older than the latest import', async () => {
        state.tables.contract_list_imports = [{ shop_id: 'shop-1', request_id: 'old', report_date: '2026-10-22', file_name: 'a.xlsx', row_count: 3, created_at: '2026-10-22T01:00:00Z', created_by_name: 'Номин' }];
        const planned = await (await preview()).json();
        expect(planned).toMatchObject({ olderThanLatest: '2026-10-22', latestImport: { report_date: '2026-10-22' } });
        const refused = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true' });
        expect(refused.status).toBe(400);
        expect((await refused.json()).code).toBe('older_file');
        const allowed = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true', allowOlder: 'true' });
        expect(allowed.status).toBe(201);
        expect(state.rpc.mock.calls[0][1].p_allow_older).toBe(true);
    });

    it('returns the stored result for a retried request id and refuses its reuse with another plan', async () => {
        const planned = await (await preview()).json();
        state.tables.contract_list_imports = [{ shop_id: 'shop-1', request_id: REQUEST, id: 'import-1', plan_hash: planned.planHash, report_date: '2026-10-21',
            summary: { inserted: 1, updated: 2 } }];
        const replay = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: planned.planHash, acceptReview: 'true' });
        expect(replay.status).toBe(200);
        expect(await replay.json()).toEqual({ ok: true, replayed: true, import_id: 'import-1', inserted: 1, updated: 2, summary: { inserted: 1, updated: 2 } });
        const reused = await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: 'b'.repeat(64) });
        expect(reused.status).toBe(409);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('maps RPC errors and conflict results', async () => {
        const cases: Array<[unknown, number, Record<string, unknown>]> = [
            [{ data: null, error: { code: '23505', message: 'dup', hint: 'request_reused' } }, 409, { code: 'request_reused' }],
            [{ data: null, error: { code: '23505', message: 'dup' } }, 409, { code: 'duplicate_contract_number', error: 'Гэрээний дугаар давхардсан байна. Файлаа шалгана уу' }],
            [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_contracts_shop_number"',
                details: 'Key (shop_id, contract_number)=(00000000-0000-4000-8000-000000000001, EL-7) already exists.' } }, 409,
                { code: 'duplicate_contract_number', error: 'Гэрээний дугаар «EL-7» давхардсан байна. Файлаа шалгана уу' }],
            [{ data: null, error: { code: '40001', message: 'serialization' } }, 409, { code: 'stale_preview' }],
            [{ data: null, error: { code: '42501', message: 'denied' } }, 403, {}],
            [{ data: null, error: { code: '22023', message: 'Импортын утгын төрөл буруу байна' } }, 400, { error: 'Импортын утгын төрөл буруу байна' }],
            [{ data: null, error: { code: 'PGRST202', message: 'missing' } }, 503, {}],
            [{ data: null, error: { code: '42883', message: 'missing' } }, 503, {}],
            [{ data: null, error: { code: 'XX000', message: 'boom' } }, 500, {}],
            [{ data: { ok: false, code: 'older_file', latest: '2026-10-22' }, error: null }, 409, { code: 'older_file', latest: '2026-10-22' }],
            [{ data: { ok: false, conflicts: [{ id: 'c1', label: 'Б1-16', code: 'changed', field: 'order_date' }] }, error: null }, 409,
                { code: 'conflicts', conflicts: [{ id: 'c1', label: 'Б1-16', code: 'changed', field: 'order_date', message: 'Урьдчилан харсны дараа гэрээ өөрчлөгдсөн' }] }],
        ];
        for (const [result, status, body] of cases) {
            state.rpc.mockResolvedValueOnce(result);
            const response = await commit();
            expect(response.status, JSON.stringify(result)).toBe(status);
            expect(await response.json()).toMatchObject(body);
        }
    });

    it('answers 503 when the import migration is missing', async () => {
        state.tableErrors.contract_list_imports = { code: '42P01', message: 'relation "public.contract_list_imports" does not exist' };
        const response = await preview();
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('migration');
        state.tableErrors = { property_contracts: { code: '42703', message: 'column property_contracts.overdue_amount does not exist' } };
        expect((await preview()).status).toBe(503);
    });

    it('hashes exactly the canonical plan of the report date and ops', async () => {
        const body = await (await preview()).json();
        await post({ action: 'commit', reportDate: '2026-10-21', requestId: REQUEST, planHash: body.planHash, acceptReview: 'true' });
        const args = state.rpc.mock.calls[0][1];
        const { canonicalJson } = await import('@/lib/contracts/list-import');
        expect(createHash('sha256').update(canonicalJson({ reportDate: '2026-10-21', ops: args.p_ops })).digest('hex')).toBe(body.planHash);
    });
});

describe('GET /api/dashboard/contracts/import', () => {
    it('is gated by contracts read and returns the latest import', async () => {
        state.tables.contract_list_imports = [{ shop_id: 'shop-1', report_date: '2026-10-21', file_name: 'HUB.xlsx', row_count: 83, created_at: '2026-10-21T02:00:00Z', created_by_name: 'Номин' }];
        const response = await GET(new NextRequest('http://localhost/api/dashboard/contracts/import'));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ available: true, latest: { report_date: '2026-10-21', row_count: 83 } });
        expect(state.calls).toEqual(['read:contracts']);
        state.tableErrors.contract_list_imports = { code: 'PGRST205', message: 'Could not find the table' };
        expect(await (await GET(new NextRequest('http://localhost/api/dashboard/contracts/import'))).json()).toEqual({ latest: null, available: false });
        state.readDenied = Response.json({ error: 'Эрхгүй' }, { status: 403 });
        expect((await GET(new NextRequest('http://localhost/api/dashboard/contracts/import'))).status).toBe(403);
    });
});
