import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDashboardStats } from '../functions';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));

type Row = Record<string, string | number | null>;
let tables: Record<string, Row[]>;
let failure: { table: string; from: number } | undefined;
const pages: Array<{ table: string; from: number; to: number }> = [];
const row = (id: string, values: Row = {}): Row => ({ id, shop_id: 'shop-1', deleted_at: null, ...values });

beforeEach(() => {
    vi.clearAllMocks();
    pages.length = 0;
    failure = undefined;
    tables = { property_contracts: [], customers: [], leads: [], property_units: [] };
    mocks.from.mockImplementation((table: string) => {
        if (!(table in tables)) throw new Error(`Unexpected source: ${table}`);
        let rows = tables[table];
        let from = 0;
        let to = 999;
        let head = false;
        const chain = {
            select: (_fields: string, options?: { head?: boolean }) => { head = !!options?.head; return chain; },
            eq: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return chain; },
            is: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return chain; },
            gte: (field: string, value: string) => { rows = rows.filter(r => String(r[field]) >= value); return chain; },
            order: () => chain,
            range: (start: number, end: number) => { from = start; to = end; pages.push({ table, from, to }); return chain; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({
                data: head ? null : rows.slice(from, Math.min(to + 1, from + 1000)),
                count: head ? rows.length : null,
                error: failure?.table === table && failure.from === from ? { message: `${table} unavailable` } : null,
            }).then(resolve),
        };
        return chain;
    });
});

describe('AI dashboard statistics', () => {
    it('counts canonical residential inventory across pages, scopes rows and distinguishes contract value from cash', async () => {
        tables.property_units = [
            ...Array.from({ length: 1000 }, (_, i) => row(`u${i}`, { category: 'residential', status: 'available' })),
            ...['sold', 'handed_over', 'reserved', 'ordered'].map(status => row(status, { category: 'residential', status })),
            row('parking', { category: 'parking', status: 'available' }),
            row('foreign', { shop_id: 'other-shop', category: 'residential', status: 'available' }),
        ];
        tables.property_contracts = [
            ...Array.from({ length: 1000 }, (_, i) => row(`c${i}`, { total_price: '1', contract_date: '2026-09-01' })),
            row('last', { total_price: 75, contract_date: '2026-09-01' }),
            row('deleted', { total_price: 999, contract_date: '2026-09-01', deleted_at: '2026-09-02' }),
            row('foreign', { total_price: 999, contract_date: '2026-09-01', shop_id: 'other-shop' }),
            row('old', { total_price: 999, contract_date: '1999-01-01' }),
        ];
        tables.leads = [
            ...Array.from({ length: 1000 }, (_, i) => row(`l${i}`, { status: 'new', created_at: '2026-09-01T00:00:00Z' })),
            row('won', { status: 'closed_won', created_at: '2026-09-01T00:00:00Z' }),
            row('deleted', { status: 'new', created_at: '2026-09-01T00:00:00Z', deleted_at: '2026-09-02' }),
            row('foreign', { status: 'new', created_at: '2026-09-01T00:00:00Z', shop_id: 'other-shop' }),
            row('old', { status: 'new', created_at: '1999-01-01T00:00:00Z' }),
        ];
        tables.customers = [row('one'), row('two'), row('deleted', { deleted_at: '2026-09-02' }), row('foreign', { shop_id: 'other-shop' })];

        const result = await fetchDashboardStats('shop-1', 'all_time');
        expect(result).toMatchObject({
            totalProperties: 1004, totalContracts: 1001, totalContractValue: 1075, totalCustomers: 2,
            totalLeads: 1001, leadsByStatus: { new: 1000, closed_won: 1 },
            inventory: {
                source: 'property_units', category: 'residential', total: 1004, available: 1000, sold: 2, pending: 2,
                statusCounts: { available: 1000, sold: 1, handed_over: 1, reserved: 1, ordered: 1 },
            },
        });
        expect(result).not.toHaveProperty('totalRevenue');
        expect(result.contractValueBasis).toContain('бодитоор хүлээн авсан мөнгөн орлого биш');
        for (const table of ['property_units', 'property_contracts', 'leads']) {
            expect(pages.filter(p => p.table === table).map(p => p.from)).toEqual([0, 1000]);
        }
    });

    it.each(['property_contracts', 'customers', 'leads', 'property_units'])('rejects failed %s reads instead of returning zero statistics', async table => {
        failure = { table, from: 0 };
        await expect(fetchDashboardStats('shop-1')).rejects.toThrow(`${table} unavailable`);
    });

    it('rejects an incomplete later inventory page', async () => {
        tables.property_units = Array.from({ length: 1001 }, (_, i) => row(`u${i}`, { category: 'residential', status: 'available' }));
        failure = { table: 'property_units', from: 1000 };
        await expect(fetchDashboardStats('shop-1')).rejects.toThrow('property_units unavailable');
    });

    it('reports a successfully empty inventory as zero', async () => {
        expect(await fetchDashboardStats('shop-1')).toMatchObject({
            totalProperties: 0, totalContractValue: 0, totalContracts: 0,
            inventory: { total: 0, available: 0, sold: 0, pending: 0 },
        });
    });
});
