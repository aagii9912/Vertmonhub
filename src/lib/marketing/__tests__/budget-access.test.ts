import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), remove: vi.fn(), shop: vi.fn(), from: vi.fn(), spend: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write, requireModuleDelete: mocks.remove }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: vi.fn(async () => 'user') }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock('@/lib/marketing/spend-load', () => ({ loadMarketingSpend: mocks.spend }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
import { GET, PUT, POST, DELETE } from '@/app/api/marketing/budget/route';

const project = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const entryId = '00000000-0000-4000-8000-000000000003';
type ReadResult = { data: unknown; error: { code?: string; message: string } | null };
const results: Record<string, ReadResult> = {};
const queries: Array<{ table: string; eq: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> }> = [];
function query(table: string) {
    const q = {
        table, eq: vi.fn(), upsert: vi.fn(), insert: vi.fn(),
        select: vi.fn(), order: vi.fn(), range: vi.fn(), is: vi.fn(), gte: vi.fn(), lte: vi.fn(), update: vi.fn(),
        maybeSingle: vi.fn(async () => {
            const result = results[table] ?? { data: null, error: null };
            const id = q.eq.mock.calls.find(([column]) => column === 'id')?.[1];
            return Array.isArray(result.data) ? { ...result, data: result.data.find(r => !id || r.id === id) ?? null } : result;
        }),
        single: vi.fn(async () => ({ data: { id: entryId }, error: null })),
        then: (resolve: (value: ReadResult) => unknown) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve),
    };
    for (const fn of [q.eq, q.upsert, q.insert, q.select, q.order, q.range, q.is, q.gte, q.lte, q.update]) fn.mockReturnValue(q);
    queries.push(q);
    return q;
}
const request = (method = 'GET', body?: unknown, params = '') => new NextRequest(`http://localhost/api/marketing/budget?year=2026&shopId=hostile${params}`, {
    method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
beforeEach(() => {
    vi.clearAllMocks(); queries.length = 0;
    for (const key of Object.keys(results)) delete results[key];
    mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.remove.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: 'allowed' }); mocks.spend.mockResolvedValue([]); mocks.from.mockImplementation(query);
    results.projects = { data: [{ id: project, name: 'Elysium' }], error: null };
});

it('checks read/write/delete module permission before touching data', async () => {
    for (const [guard, handler, method] of [[mocks.read, GET, 'GET'], [mocks.write, PUT, 'PUT'], [mocks.write, POST, 'POST'], [mocks.remove, DELETE, 'DELETE']] as const) {
        guard.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
        expect((await handler(request(method))).status).toBe(403);
    }
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.spend).not.toHaveBeenCalled();
});

it('saves annual allocation in one bulk upsert using verified organization scope', async () => {
    const response = await PUT(request('PUT', { year: 2026, annualAmount: 1201, shop_id: 'hostile' }));
    expect(response.status).toBe(200);
    const budget = queries.find(q => q.table === 'marketing_budgets')!;
    expect(budget.upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = budget.upsert.mock.calls[0];
    expect(rows).toHaveLength(12); expect(rows.every((r: { shop_id: string }) => r.shop_id === 'allowed')).toBe(true);
    expect(rows.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0)).toBe(1201);
    expect(options).toEqual({ onConflict: 'shop_id,year,month' });
    expect(rows[0]).not.toHaveProperty('note');
});

it('saves a project plan separately and rejects a foreign project for reads and writes', async () => {
    expect((await PUT(request('PUT', { year: 2026, project_id: project, annualAmount: 1200 }))).status).toBe(200);
    const budget = queries.find(q => q.table === 'marketing_project_budgets')!;
    expect(budget.upsert.mock.calls[0][0]).toEqual(Array.from({ length: 12 }, (_, i) => ({ shop_id: 'allowed', project_id: project, year: 2026, month: i + 1, amount: 100 })));
    expect(budget.upsert.mock.calls[0][1]).toEqual({ onConflict: 'shop_id,project_id,year,month' });
    expect(queries.find(q => q.table === 'projects')?.eq).toHaveBeenCalledWith('shop_id', 'allowed');
    const writes = budget.upsert.mock.calls.length;
    expect((await PUT(request('PUT', { year: 2026, project_id: foreign, annualAmount: 1200 }))).status).toBe(404);
    expect((await GET(request('GET', undefined, `&project=${foreign}`))).status).toBe(404);
    expect(queries.filter(q => q.table === 'marketing_project_budgets')).toHaveLength(writes);
});

it('rejects invalid money, duplicate months, mismatched annual totals and impossible spend dates', async () => {
    for (const body of [{ year: 2026, annualAmount: -1 }, { year: 2026, annualAmount: 1.5 },
        { year: 2026, months: [{ month: 1, amount: 1 }, { month: 1, amount: 2 }] },
        { year: 2026, annualAmount: 12, months: [{ month: 1, amount: 12 }] }]) {
        expect((await PUT(request('PUT', body))).status).toBe(400);
    }
    expect((await POST(request('POST', { spentAt: '2026-02-30', amount: 1 }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
});

it('loads only selected project budgets, spend and real contract revenue; flags unassigned spend', async () => {
    results.marketing_project_budgets = { data: [{ month: 1, amount: 1200 }], error: null };
    results.property_contracts = { data: [
        { contract_date: '2026-01-05', contract_number: 'A1', total_price: 600, contract_status: 'active' },
        { contract_date: '2026-01-05', contract_number: 'A2', total_price: 9000, contract_status: 'cancelled' },
        { contract_date: '2026-01-05', contract_number: null, total_price: 9000, contract_status: 'active' },
    ], error: null };
    mocks.spend.mockResolvedValue([
        { id: 'own', project_id: project, spent_at: '2026-01-01', amount: 400, channel: 'board' },
        { id: 'foreign', project_id: foreign, spent_at: '2026-01-01', amount: 800, channel: 'board' },
        { id: 'unassigned', project_id: null, spent_at: '2026-01-01', amount: 100, channel: 'board' },
    ]);
    const response = await GET(request('GET', undefined, `&project=${project}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.overview.totals).toMatchObject({ budget: 1200, spend: 400, revenue: 600 });
    expect(body.unassignedSpendCount).toBe(1); expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['own']);
    for (const table of ['marketing_project_budgets', 'property_contracts']) {
        expect(queries.find(q => q.table === table)?.eq).toHaveBeenCalledWith('project_id', project);
        expect(queries.find(q => q.table === table)?.eq).toHaveBeenCalledWith('shop_id', 'allowed');
    }
});

it('reports missing project migration without writing or hiding unrelated read failures', async () => {
    results.marketing_project_budgets = { data: null, error: { code: 'PGRST205', message: 'Could not find marketing_project_budgets table in schema cache' } };
    expect((await PUT(request('PUT', { year: 2026, project_id: project, annualAmount: 12 }))).status).toBe(503);
    const response = await GET(request('GET', undefined, `&project=${project}`));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ available: false, projects: [{ id: project, name: 'Elysium' }] });
    expect(mocks.spend).not.toHaveBeenCalled();
    results.marketing_project_budgets = { data: [], error: null };
    mocks.spend.mockRejectedValueOnce(new Error('private database detail'));
    const failure = await GET(request('GET', undefined, `&project=${project}`));
    expect(failure.status).toBe(500); expect(await failure.text()).not.toContain('private database detail');
});

it('stamps project onto manual spend and scopes removal to the selected project and shop', async () => {
    expect((await POST(request('POST', { project_id: project, spentAt: '2026-01-01', amount: 100, channel: 'board' }))).status).toBe(200);
    expect(queries.find(q => q.table === 'marketing_spend_entries')?.insert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'allowed', project_id: project, amount: 100 }));
    const missing = await DELETE(request('DELETE', undefined, `&id=${entryId}&project=${project}`));
    expect(missing.status).toBe(404);
    const removal = queries.filter(q => q.table === 'marketing_spend_entries')[1];
    expect(removal.eq).toHaveBeenCalledWith('shop_id', 'allowed'); expect(removal.eq).toHaveBeenCalledWith('project_id', project);
});
