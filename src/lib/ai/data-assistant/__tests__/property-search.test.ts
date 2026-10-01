import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProperties, generateChartConfig } from '../functions';
import { dataToolsForPerms } from '@/lib/ai/claude/tools';
import { canUseToolModule, readTools } from '../tools';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let failedTable: string | undefined;
const reads: string[] = [];
const expressions: string[] = [];
const unit = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', project_id: null, category: 'residential', status: 'available',
    phase: 'Zoo Garden', block: '201', code: `201-${id}`, unit_number: id,
    rooms: 2, sale_area: '62.50', floor: '03', ...values,
});
const listing = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', project_id: null, name: `Зар ${id}`, type: 'apartment',
    status: 'available', is_active: true, deleted_at: null, price: '300000000', rooms: 2, ...values,
});

beforeEach(() => {
    vi.clearAllMocks();
    reads.length = 0;
    expressions.length = 0;
    failedTable = undefined;
    tables = { properties: [], property_units: [], projects: [] };
    mocks.from.mockImplementation((table: string) => {
        if (!(table in tables)) throw new Error(`Unexpected source: ${table}`);
        let rows = tables[table];
        let from = 0;
        let end = 999;
        const chain = {
            select: () => chain,
            eq: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return chain; },
            is: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return chain; },
            in: (field: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[field])); return chain; },
            gte: (field: string, value: number) => { rows = rows.filter(r => r[field] != null && Number(r[field]) >= value); return chain; },
            lte: (field: string, value: number) => { rows = rows.filter(r => r[field] != null && Number(r[field]) <= value); return chain; },
            ilike: (field: string, value: string) => {
                rows = rows.filter(r => String(r[field] ?? '').toLowerCase().includes(value.slice(1, -1).toLowerCase()));
                return chain;
            },
            or: (expression: string) => {
                expressions.push(expression);
                const predicates = [...expression.matchAll(/([a-z_]+)\.in\.\(([^)]+)\)|([a-z_]+)\.ilike\.%([^%]*)%/g)];
                rows = rows.filter(r => predicates.some(m => m[1]
                    ? m[2].split(',').includes(r[m[1]])
                    : String(r[m[3]] ?? '').toLowerCase().includes(m[4].toLowerCase())));
                return chain;
            },
            order: () => chain,
            limit: (value: number) => { end = value - 1; return chain; },
            range: (start: number, to: number) => { from = start; end = to; return chain; },
            then: (resolve: (value: unknown) => unknown) => {
                reads.push(table);
                return Promise.resolve({
                    data: failedTable === table ? null : rows.slice(from, end + 1),
                    error: failedTable === table ? { message: `${table} unavailable` } : null,
                }).then(resolve);
            },
        };
        return chain;
    });
});

function asRows(result: Awaited<ReturnType<typeof fetchProperties>>) {
    expect(Array.isArray(result)).toBe(true);
    return result as Row[];
}

describe('AI apartment inventory search', () => {
    it('finds available two-room residential units when the listings table is empty', async () => {
        tables.property_units = [
            unit('440'), unit('three', { rooms: 3 }), unit('sold', { status: 'sold' }),
            unit('parking', { category: 'parking' }), unit('foreign', { shop_id: 'shop-2' }),
        ];
        expect(asRows(await fetchProperties('shop-1', { rooms: 2 }))).toMatchObject([
            { id: '440', source: 'property_units', code: '201-440', rooms: 2, size_sqm: '62.50', status: 'available', price: null },
        ]);
        expect(reads).toContain('property_units');
    });

    it('reads inventory even when listings exist, keeping both sources and excluding deleted/foreign/inactive listings', async () => {
        tables.property_units = [unit('440')];
        tables.properties = [listing('ad'), listing('deleted', { deleted_at: '2026-10-01' }),
            listing('foreign', { shop_id: 'shop-2' }), listing('inactive', { is_active: false }), listing('sold', { status: 'sold' })];
        expect(asRows(await fetchProperties('shop-1', { rooms: 2 })).map(r => [r.source, r.id]))
            .toEqual([['property_units', '440'], ['properties', 'ad']]);
    });

    it('keeps distinct units with the same code across phases and categories', async () => {
        tables.property_units = [unit('one', { code: '201-440', phase: 'Zoo Garden' }),
            unit('two', { code: '201-440', phase: 'Water Garden' }),
            unit('parking', { code: '201-440', category: 'parking' })];
        expect(asRows(await fetchProperties('shop-1', { code: '201-440' })).map(r => r.id)).toEqual(['one', 'two']);
        expect(asRows(await fetchProperties('shop-1', { category: 'parking', code: '201-440' })).map(r => r.id)).toEqual(['parking']);
    });

    it('supports exact phase/block/code/project filters without relaxing constraints', async () => {
        tables.property_units = [unit('yes', { project_id: 'p1' }), unit('wrong-phase', { phase: 'Water Garden', project_id: 'p1' }),
            unit('wrong-project', { project_id: 'p2' }), unit('wrong-block', { block: '202', project_id: 'p1' })];
        const rows = asRows(await fetchProperties('shop-1', { phase: 'Zoo Garden', block: '201', code: '201-yes', project_id: 'p1' }));
        expect(rows.map(r => r.id)).toEqual(['yes']);
    });

    it.each(['ordered', 'handed_over', 'reserved'])('supports unit status %s', async status => {
        tables.property_units = [unit('matching', { status }), unit('available')];
        expect(asRows(await fetchProperties('shop-1', { status })).map(r => r.id)).toEqual(['matching']);
    });

    it('includes handed-over units in sold queries and supports explicit all status', async () => {
        tables.property_units = ['sold', 'handed_over', 'ordered', 'available'].map(status => unit(status, { status }));
        expect(asRows(await fetchProperties('shop-1', { status: 'sold' })).map(r => r.id)).toEqual(['sold', 'handed_over']);
        expect(asRows(await fetchProperties('shop-1', { status: 'all' }))).toHaveLength(4);
    });

    it.each(['rented', 'barter'])('keeps listing-only status %s away from inventory', async status => {
        tables.property_units = [unit('available')];
        tables.properties = [listing('ad', { status })];
        expect(asRows(await fetchProperties('shop-1', { status })).map(r => r.id)).toEqual(['ad']);
        expect(reads).not.toContain('property_units');
    });

    it('maps commercial type to commercial inventory and does not substitute apartments for houses', async () => {
        tables.property_units = [unit('apartment'), unit('commercial', { category: 'commercial' })];
        tables.properties = [listing('house', { type: 'house' })];
        expect(asRows(await fetchProperties('shop-1', { type: 'office' })).map(r => r.id)).toEqual(['commercial']);
        expect(asRows(await fetchProperties('shop-1', { type: 'house' })).map(r => r.id)).toEqual(['house']);
    });

    it('finds project names through same-shop links as well as unit phase/code and listing names', async () => {
        tables.projects = [{ id: 'p1', shop_id: 'shop-1', name: 'Mandala Garden', district: 'Хан-Уул' },
            { id: 'foreign', shop_id: 'shop-2', name: 'Mandala Garden' }];
        tables.property_units = [unit('linked', { project_id: 'p1' }), unit('unlinked'), unit('foreign-project', { project_id: 'foreign' })];
        tables.properties = [listing('linked-ad', { project_id: 'p1' }), listing('named-ad', { name: 'Mandala Garden байр' })];
        expect(asRows(await fetchProperties('shop-1', { name_search: 'Mandala' })).map(r => r.id)).toEqual(['linked', 'linked-ad', 'named-ad']);
        expect(asRows(await fetchProperties('shop-1', { name_search: '201-unlinked' })).map(r => r.id)).toEqual(['unlinked']);
        expect(asRows(await fetchProperties('shop-1', { name_search: 'Zoo Garden' })).filter(r => r.source === 'property_units')).toHaveLength(3);
    });

    it('applies district constraints only to inventory linked to a known matching project district', async () => {
        tables.projects = [{ id: 'p1', shop_id: 'shop-1', name: 'Garden', district: 'Хан-Уул' },
            { id: 'p2', shop_id: 'shop-1', name: 'Tower', district: 'Баянгол' }];
        tables.property_units = [unit('yes', { project_id: 'p1' }), unit('wrong', { project_id: 'p2' }), unit('unknown')];
        tables.properties = [listing('ad', { district: 'Хан-Уул' }), listing('wrong-ad', { district: 'Баянгол' })];
        const rows = asRows(await fetchProperties('shop-1', { district: 'Хан-Уул' }));
        expect(rows.map(r => r.id)).toEqual(['yes', 'ad']);
        expect(rows[0].district).toBe('Хан-Уул');
    });

    it('separates unknown-price inventory from verified budget matches and keeps the trace clear', async () => {
        tables.property_units = [unit('unknown')];
        tables.properties = [listing('in-budget', { price: 200000000 }), listing('expensive', { price: 400000000 })];
        const result = await fetchProperties('shop-1', { rooms: 2, max_price: 300000000 });
        expect(result).toMatchObject({ properties: [{ id: 'in-budget' }], unverifiedUnits: [{ id: 'unknown', price: null }] });
        expect(result).toHaveProperty('message', expect.stringContaining('үнийг тодруулах'));
        expect(result).toHaveProperty('warning', expect.stringContaining('батлахгүй'));
    });

    it('honors a zero price maximum instead of treating it as an absent constraint', async () => {
        tables.properties = [listing('positive'), listing('zero', { price: 0 })];
        expect(asRows(await fetchProperties('shop-1', { max_price: 0 })).map(r => r.id)).toEqual(['zero']);
    });

    it('caps the combined sample and bounds excessive limits', async () => {
        tables.property_units = Array.from({ length: 105 }, (_, i) => unit(String(i)));
        tables.properties = [listing('ad')];
        expect(asRows(await fetchProperties('shop-1', { limit: 2 }))).toHaveLength(2);
        expect(asRows(await fetchProperties('shop-1', { limit: 10000 }))).toHaveLength(100);
    });

    it.each(['properties', 'property_units', 'projects'])('returns a read failure instead of false no-stock when %s fails', async table => {
        tables.property_units = [unit('available')];
        failedTable = table;
        expect(await fetchProperties('shop-1', { name_search: 'Garden' })).toHaveProperty('error');
    });

    it('returns an empty successful search distinctly from database failure', async () => {
        expect(await fetchProperties('shop-1', { rooms: 2 })).toEqual([]);
    });

    it.each([{ status: 'status.eq.sold' }, { type: 'parking' }, { rooms: -2 }, { rooms: 2.5 },
        { min_price: 400, max_price: 300 }, { type: 'office', category: 'residential' }, { name_search: '%,()' }])
    ('rejects invalid input %j before a read', async args => {
        expect(await fetchProperties('shop-1', args)).toHaveProperty('error');
        expect(reads).toHaveLength(0);
    });

    it('keeps embedded filter syntax as search text without injecting alternate predicates', async () => {
        tables.property_units = [unit('one')];
        expect(await fetchProperties('shop-1', { name_search: 'Garden%,status.eq.sold)' })).toEqual([]);
        expect(expressions.every(e => !e.includes(',status.eq.sold'))).toBe(true);
    });

    it('omits unknown prices from charts while preserving recorded zero prices', () => {
        expect(generateChartConfig('list_properties', {}, [{ name: 'Unknown', price: null }])).toBeNull();
        expect(generateChartConfig('list_properties', {}, [{ name: 'Unknown', price: null }, { name: 'Recorded', price: 0 }]))
            .toEqual({ type: 'bar', data: [{ name: 'Recorded', value: 0 }] });
    });

    it('keeps property permissions enforced and exposes the implemented unit filters', () => {
        const permitted = { role: 'sales_manager', canWrite: false, canDelete: false, modules: ['properties'] };
        expect(dataToolsForPerms(permitted).some(t => t.name === 'list_properties')).toBe(true);
        expect(dataToolsForPerms({ ...permitted, modules: ['dashboard'] }).some(t => t.name === 'list_properties')).toBe(false);
        expect(canUseToolModule('list_properties', { role: 'sales_manager', modules: ['dashboard'] })).toBe(false);
        const tool = readTools.find(t => t.name === 'list_properties')!;
        expect(tool.parameters?.properties?.status.enum).toEqual(expect.arrayContaining(['ordered', 'handed_over', 'all']));
        expect(tool.parameters?.properties).toHaveProperty('code');
    });
});
