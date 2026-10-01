// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { readSheetRows } from '@/lib/utils/xlsx';
import { normalizeErpSheets } from '@/lib/erp/import';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), from: vi.fn(), rpc: vi.fn(), send: vi.fn(), get: vi.fn(), create: vi.fn(), contacts: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: async () => 'user', supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { GET as erpGet, POST as erpPost } from '@/app/api/dashboard/erp-imports/route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
const own = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let update: Row | null = null;
    let insert: Row | null = null;
    const execute = (single = false) => {
        if (insert) tables[table].push(insert);
        const data = tables[table].filter(r => filters.every(f => f(r)));
        if (update) for (const r of data) Object.assign(r, update);
        return { data: single ? data[0] ?? null : data, error: null, count: data.length };
    };
    const q = {
        select: () => q, eq: (key: string, value: unknown) => { filters.push(r => key === 'design' && typeof value === 'string' ? JSON.stringify(r[key]) === value : r[key] === value); return q; },
        is: (key: string, value: unknown) => { filters.push(r => r[key] === value); return q; },
        order: () => q, range: () => q, limit: () => q,
        update: (values: Row) => { update = values; return q; }, insert: (values: Row) => { insert = values; return q; },
        maybeSingle: async () => execute(true), single: async () => execute(true),
        then: (resolve: (v: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return q;
}
beforeEach(() => {
 vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({id: 'allowed'}); tables = {erp_imports: []}; mocks.from.mockImplementation(query);
});
it('checks dedicated read/write modules before any data or provider operations', async () => {
    mocks.read.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    mocks.write.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await erpGet(new NextRequest('http://localhost/api/dashboard/erp-imports'))).status).toBe(403);
    expect((await erpPost(new NextRequest('http://localhost/api/dashboard/erp-imports', { method: 'POST' }))).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledWith('erp-imports'); expect(mocks.write).toHaveBeenCalledWith('erp-imports');
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it('rejects stale ERP previews before committing and does not expose another shop import', async () => {
    tables.erp_imports.push({ id: own, shop_id: 'allowed', source: 'ERP', report_date: '2026-01-01', datasets: [] }, { id: foreign, shop_id: 'other', source: 'ERP', datasets: [] });
    const form = new FormData(); form.set('file', new File(['ID,Дүн\n1,100'], 'test.csv')); form.set('source', 'ERP'); form.set('action', 'commit');
    form.set('options', JSON.stringify({ source: 'ERP', reportDate: '2026-01-02', keys: { Sheet1: ['ID'] }, expectedPrevious: null, requestId: '00000000-0000-4000-8000-000000000099' }));
    expect((await erpPost(new NextRequest('http://localhost/api/dashboard/erp-imports', { method: 'POST', body: form }))).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await erpGet(new NextRequest(`http://localhost/api/dashboard/erp-imports?id=${foreign}`))).status).toBe(404);
});
it('exports all matching ERP rows with separate before/after values and retains string IDs', async () => {
    const dataset = (amount: number) => normalizeErpSheets([{ name: 'Гэрээ', columns: ['ID', 'Дүн'], rows: [{ ID: '001', Дүн: amount }] }], { Гэрээ: ['ID'] });
    tables.erp_imports.push({ id: own, shop_id: 'allowed', source: 'ERP', report_date: '2026-01-01', previous_id: null, datasets: dataset(100) },
        { id: foreign, shop_id: 'allowed', source: 'ERP', report_date: '2026-01-08', previous_id: own, datasets: dataset(150) });
    const response = await erpGet(new NextRequest(`http://localhost/api/dashboard/erp-imports?id=${foreign}&export=1&changesOnly=1`));
    expect(response.status).toBe(200);
    const rows = await readSheetRows(await response.arrayBuffer(), 'Гэрээ');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 'Өмнөх · ID': '001', 'Шинэ · ID': '001', 'Өмнөх · Дүн': '100', 'Шинэ · Дүн': '150', Төлөв: 'Өөрчлөгдсөн' });
});
it('returns a previously committed request after a newer import without reapplying it', async () => {
    const datasets = normalizeErpSheets([{ name: 'Sheet1', columns: ['ID', 'Дүн'], rows: [{ ID: '1', Дүн: '100' }] }], { Sheet1: ['ID'] });
    tables.erp_imports.push({ id: foreign, shop_id: 'allowed', source: 'ERP', report_date: '2026-01-08', datasets },
        { id: own, shop_id: 'allowed', source: 'ERP', report_date: '2026-01-01', datasets, content_hash: createHash('sha256').update(JSON.stringify(datasets)).digest('hex') });
    const form = new FormData(); form.set('file', new File(['ID,Дүн\n1,100'], 'test.csv')); form.set('source', 'ERP'); form.set('action', 'commit');
    form.set('options', JSON.stringify({ source: 'ERP', reportDate: '2026-01-01', keys: { Sheet1: ['ID'] }, expectedPrevious: null, requestId: own }));
    const response = await erpPost(new NextRequest('http://localhost/api/dashboard/erp-imports', { method: 'POST', body: form }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ id: own }); expect(mocks.rpc).not.toHaveBeenCalled();
});
