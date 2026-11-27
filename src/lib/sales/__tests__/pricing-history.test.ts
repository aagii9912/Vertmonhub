import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPricingPhases, diffPricingRules, pricingValidity, sortPricingRules, summarizePriceLists, withArchiveTimes } from '../pricing-history';
import { assertPricingProjectAccess, loadPricingSheet } from '../pricing-store';
import type { PricingRule } from '../pricing';

const rule = (overrides: Partial<PricingRule> = {}): PricingRule => ({
    block: 'Б1', model: 'E3', floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_000_000, advance_percent: 30, ...overrides,
});

describe('pricing archive rules', () => {
    it('uses the quote window: before it upcoming, after it expired', () => {
        const window = { valid_from: '2026-10-01', valid_until: '2026-10-31' };
        expect(pricingValidity(window, '2026-09-30')).toBe('upcoming');
        expect(pricingValidity(window, '2026-10-01')).toBe('valid');
        expect(pricingValidity(window, '2026-10-31')).toBe('valid');
        expect(pricingValidity(window, '2026-11-01')).toBe('expired');
        expect(pricingValidity({ valid_from: null, valid_until: null }, '2026-10-22')).toBe('expired');
    });

    it('marks changed, added and removed rules against the replaced version (Б and B are the same block)', () => {
        const previous = [rule(), rule({ payment_condition: '50%', price_per_sqm: 3_800_000, advance_percent: 50 }), rule({ model: 'E5', price_per_sqm: 4_100_000 })];
        const { rows, removed } = diffPricingRules([
            rule({ block: 'B1', price_per_sqm: 4_200_000 }),
            rule({ payment_condition: '50%', price_per_sqm: 3_800_000, advance_percent: 50 }),
            rule({ model: 'E7' }),
        ], previous);
        expect(rows.map(row => [row.rule.model, row.rule.payment_condition, row.change, row.previous])).toEqual([
            ['E3', '30%', 'changed', { price_per_sqm: 4_000_000, advance_percent: 30 }],
            ['E3', '50%', 'same', { price_per_sqm: 3_800_000, advance_percent: 50 }],
            ['E7', '30%', 'added', null],
        ]);
        expect(removed).toEqual([rule({ model: 'E5', price_per_sqm: 4_100_000 })]);
    });

    it('treats a moved floor range as a new rule and has nothing to compare for the first version', () => {
        const { rows, removed } = diffPricingRules([rule({ floor_max: 12 })], [rule()]);
        expect(rows[0].change).toBe('added');
        expect(removed).toHaveLength(1);
        expect(diffPricingRules([rule()], null)).toEqual({ rows: [{ rule: rule(), change: null, previous: null }], removed: [] });
    });

    it('sorts by block, model and floor with natural numbers, keeping the entered condition order', () => {
        const sorted = sortPricingRules([rule({ block: 'Б2', model: 'A' }), rule({ model: 'E10' }), rule({ payment_condition: '10-30%' }), rule({ model: 'E2' })]);
        expect(sorted.map(item => `${item.block}/${item.model}/${item.payment_condition}`)).toEqual(['Б1/E2/30%', 'Б1/E3/10-30%', 'Б1/E10/30%', 'Б2/A/30%']);
    });

    it('dates an archived version by the activation that replaced it', () => {
        expect(withArchiveTimes([
            { list_key: 'main', version: 3, status: 'active', created_at: '2026-10-20T02:00:00Z' },
            { list_key: 'main', version: 2, status: 'archived', created_at: '2026-10-08T02:00:00Z' },
            { list_key: 'main', version: 1, status: 'archived', created_at: '2026-10-01T02:00:00Z' },
        ]).map(row => row.archived_at)).toEqual([null, '2026-10-20T02:00:00Z', '2026-10-08T02:00:00Z']);
    });

    it('dates archives per list and keeps a stored archive time (a withdrawn price has no next activation)', () => {
        expect(withArchiveTimes([
            { list_key: 'forest', version: 2, status: 'archived', created_at: '2026-11-25T02:00:00Z', archived_at: '2026-11-27T05:00:00Z' },
            { list_key: 'main', version: 2, status: 'active', created_at: '2026-11-20T02:00:00Z' },
            { list_key: 'forest', version: 1, status: 'archived', created_at: '2026-11-10T02:00:00Z' },
            { list_key: 'main', version: 1, status: 'archived', created_at: '2026-11-01T02:00:00Z' },
        ]).map(row => row.archived_at)).toEqual(['2026-11-27T05:00:00Z', null, '2026-11-25T02:00:00Z', '2026-11-20T02:00:00Z']);
    });

    it('lists the project price lists from their activated versions: default first, named by the newest activation', () => {
        const summary = (list_key: string, list_name: string, version: number, status: 'active' | 'archived', valid_until = '2026-12-31') => ({
            id: `${list_key}${version}`, list_key, list_name, version, status, source: '', valid_from: '2026-11-01', valid_until,
            activated_at: '2026-11-01T02:00:00Z', activated_by: null, archived_at: null,
        });
        expect(summarizePriceLists([
            summary('forest', 'Forest Garden тусгай үнэ', 2, 'active', '2026-11-30'), summary('forest', 'Тусгай үнэ', 1, 'archived'),
            summary('main', 'Үндсэн үнэ', 1, 'active', '2027-02-28'), summary('old', 'Хуучин урамшуулал', 1, 'archived'),
        ], '2026-12-05')).toEqual([
            { key: 'main', name: 'Үндсэн үнэ', active_version: 1, valid_from: '2026-11-01', valid_until: '2027-02-28', validity: 'valid', archived: 0 },
            { key: 'forest', name: 'Forest Garden тусгай үнэ', active_version: 2, valid_from: '2026-11-01', valid_until: '2026-11-30', validity: 'expired', archived: 1 },
            { key: 'old', name: 'Хуучин урамшуулал', active_version: null, valid_from: null, valid_until: null, validity: null, archived: 1 },
        ]);
    });

    it('maps the project by phase, block and kind: apartment blocks first, a price badge per block, priced blocks without units last', () => {
        const row = (phase: string | null, block: string, category: string, total_units: number, available_units = 0) => ({ phase, block, category, total_units, available_units });
        const version = (list_key: string, validity: 'valid' | 'expired', blocks: string[]) => ({
            list_key, list_name: list_key === 'main' ? 'Үндсэн үнэ' : 'Forest Garden тусгай үнэ', version: 1, validity, valid_from: '2026-11-01', valid_until: '2027-02-28',
            rows: blocks.map(block => ({ rule: rule({ block }), change: null, previous: null })),
        });
        const phases = buildPricingPhases([
            row('Zoo Garden', 'Г1485', 'parking', 375, 300), row('Zoo Garden', '1480', 'industry', 63), row('Zoo Garden', '1480', 'parking', 13),
            row('Zoo Plus', 'Г1474', 'parking', 104), row('Zoo Plus', '202', 'residential', 120, 16), row('Zoo Plus', '201', 'parking', 96),
            // PostgREST returns counts as numbers or strings; both add up.
            row('Zoo Plus', '201', 'residential', '118' as unknown as number, '85' as unknown as number), row('Zoo Plus', '201', 'commercial', 42), row('Zoo Plus', '201', 'industry', 20),
            row('Water Garden', '301', 'residential', 111), row(null, '999', 'residential', 1), row('Zoo Plus', '', 'residential', 5),
        ], [version('main', 'valid', ['201', '202']), version('forest', 'expired', ['503']), version('forest', 'valid', ['201'])]);
        // Phases by apartments (Zoo Plus 238, Water Garden 111, no-phase 1, Zoo Garden 0), then the priced block that has no unit yet.
        expect(phases.map(phase => [phase.name, phase.blocks.map(block => block.block).join(' ')])).toEqual([
            ['Zoo Plus', '201 202 Г1474'], ['Water Garden', '301'], ['Ээлж тодорхойгүй', '999'], ['Zoo Garden', '1480 Г1485'], [null, '503'],
        ]);
        const [b201, b202] = phases[0].blocks;
        expect(b201.kinds.map(kind => [kind.category, kind.units, kind.available, kind.price?.list_key ?? null])).toEqual([
            ['residential', 118, 85, 'main'], ['parking', 96, 0, null], ['industry', 20, 0, null], ['commercial', 42, 0, null],
        ]);
        expect(b202.kinds[0].price).toMatchObject({ list_key: 'main', validity: 'valid', valid_until: '2027-02-28' });
        expect(phases[1].blocks[0].kinds[0].price).toBeNull();
        expect(phases[4].blocks[0].kinds).toEqual([{ category: 'residential', units: 0, available: 0, price: expect.objectContaining({ list_key: 'forest', validity: 'expired' }) }]);
        // Only apartments carry a price; a priced block's parking is not marked priced.
        expect(phases.flatMap(phase => phase.blocks.flatMap(block => block.kinds)).filter(kind => kind.category !== 'residential' && kind.price)).toEqual([]);
        expect(buildPricingPhases([], [])).toEqual([]);
    });
});

type Row = { id: string; shop_id: string; list_key?: string; list_name?: string; version: number; status: string; created_at: string; created_by: string; archived_at?: string | null; config: Record<string, unknown> };
const config = (rules: PricingRule[], valid_from = '2026-10-01', valid_until = '2026-12-31') => ({ source: 'Баталсан үнэ', valid_from, valid_until, inventory_area_confirmed: true, rules });
const ROWS: Row[] = [
    { id: 'c3', shop_id: 'shop', version: 3, status: 'active', created_at: '2026-10-20T02:00:00Z', created_by: 'admin', config: config([rule({ price_per_sqm: 4_200_000 })]) },
    { id: 'c1', shop_id: 'shop', version: 1, status: 'archived', created_at: '2026-10-01T02:00:00Z', created_by: 'admin', config: config([rule()], '2026-10-01', '2026-10-31') },
];

const BLOCKS = [{ phase: 'Elysium Residence', block: 'Б1', category: 'residential', total_units: 110, available_units: 40 }, { phase: 'Elysium Residence', block: 'Б1', category: 'parking', total_units: 193, available_units: 100 }];
function database(rows = ROWS) {
    const calls: Array<{ table: string; select: string; filters: unknown[][] }> = [];
    const db = { from(table: string) {
        const call = { table, select: '', filters: [] as unknown[][] }; calls.push(call);
        const filtered = () => rows.filter(row => call.filters.every(([op, column, value]) => op === 'in'
            ? (value as unknown[]).includes(row[column as keyof Row]) : row[column as keyof Row] === value));
        const chain = {
            select: (columns: string) => { call.select = columns; return chain; },
            eq: (column: string, value: unknown) => { call.filters.push(['eq', column, value]); return chain; },
            in: (column: string, value: unknown[]) => { call.filters.push(['in', column, value]); return table === 'user_profiles' ? Promise.resolve({ data: [{ id: 'admin', full_name: 'Болд' }], error: null }) : chain; },
            order: () => chain, limit: () => chain,
            range: async () => table === 'property_block_summary' ? { data: BLOCKS, error: null }
                : ({ data: filtered().map(({ config: value, ...row }) => ({ ...row, source: value.source, valid_from: value.valid_from, valid_until: value.valid_until })), error: null }),
            maybeSingle: async () => ({ data: table === 'projects' ? null : filtered()[0] ?? null, error: null }),
        };
        return chain;
    } } as unknown as SupabaseClient;
    return { db, calls };
}

describe('loadPricingSheet', () => {
    it('keeps each price list apart: its own active version, comparison and archive, with a withdrawn list still listed', async () => {
        const special = (version: number, status: string, created_at: string, price: number, archived_at: string | null = null): Row => ({
            id: `f${version}`, shop_id: 'shop', list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', version, status, created_at, created_by: 'admin', archived_at,
            config: config([rule({ block: '503', price_per_sqm: price })], '2026-11-01', '2026-11-30'),
        });
        const rows = [...ROWS.map(row => ({ ...row, list_key: 'main', list_name: 'Үндсэн үнэ' })),
            special(2, 'active', '2026-11-10T02:00:00Z', 5_000_000), special(1, 'archived', '2026-11-01T02:00:00Z', 4_900_000, '2026-11-10T02:00:00Z')];
        const main = await loadPricingSheet(database(rows).db, 'shop', { asOf: '2026-11-15' });
        expect(main.lists.map(list => [list.key, list.active_version, list.validity, list.archived])).toEqual([['main', 3, 'valid', 1], ['forest', 2, 'valid', 1]]);
        expect(main.selected).toMatchObject({ list_key: 'main', version: 3, previous_version: 1 });
        expect(main.history.map(row => `${row.list_key}:${row.version}`)).toEqual(['main:3', 'main:1', 'forest:2', 'forest:1']);

        const forest = await loadPricingSheet(database(rows).db, 'shop', { list: 'forest', asOf: '2026-12-01' });
        expect(forest.selected).toMatchObject({ list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', version: 2, validity: 'expired', previous_version: 1 });
        expect(forest.selected?.rows[0]).toMatchObject({ change: 'changed', previous: { price_per_sqm: 4_900_000 } });
        // Version numbers repeat across lists: version 1 of the special list is not the default list's version 1.
        expect((await loadPricingSheet(database(rows).db, 'shop', { list: 'forest', version: 1 })).selected).toMatchObject({ id: 'f1', previous_version: null });
        await expect(loadPricingSheet(database(rows).db, 'shop', { list: 'forest', version: 3 })).rejects.toMatchObject({ status: 404 });
        await expect(loadPricingSheet(database(rows).db, 'shop', { list: 'missing' })).rejects.toMatchObject({ status: 404 });

        // Withdrawn: no active version, the list stays for its archive and the default list is shown first.
        const withdrawn = rows.map(row => row.id === 'f2' ? { ...row, status: 'archived', archived_at: '2026-11-20T02:00:00Z' } : row);
        const after = await loadPricingSheet(database(withdrawn).db, 'shop', { list: 'forest', asOf: '2026-11-21' });
        expect(after.selected).toBeNull();
        expect(after.lists.find(list => list.key === 'forest')).toMatchObject({ active_version: null, validity: null, archived: 2 });
        expect(after.history.find(row => row.id === 'f2')?.archived_at).toBe('2026-11-20T02:00:00Z');
    });

    it('shows the active version compared with the one it archived, never drafts', async () => {
        const { db, calls } = database();
        const sheet = await loadPricingSheet(db, 'shop', { asOf: '2026-10-22' });
        expect(calls[0].filters).toContainEqual(['in', 'status', ['active', 'archived']]);
        expect(calls.filter(call => call.table === 'project_pricing_configs').every(call => call.filters.some(([op, column]) => op === 'in' && column === 'status'))).toBe(true);
        expect(sheet.history.map(row => [row.version, row.status, row.archived_at, row.activated_by])).toEqual([
            [3, 'active', null, 'Болд'], [1, 'archived', '2026-10-20T02:00:00Z', 'Болд'],
        ]);
        expect(sheet.selected).toMatchObject({ version: 3, validity: 'valid', previous_version: 1, removed: [] });
        // The block view: every list's active version, and the register's blocks with their price state.
        expect(sheet.active.map(version => `${version.list_key}:${version.version}`)).toEqual(['main:3']);
        expect(sheet.phases).toEqual([{ name: 'Elysium Residence', blocks: [{ block: 'Б1', kinds: [
            { category: 'residential', units: 110, available: 40, price: { list_key: 'main', list_name: 'Үндсэн үнэ', version: 3, validity: 'valid', valid_from: '2026-10-01', valid_until: '2026-12-31' } },
            { category: 'parking', units: 193, available: 100, price: null },
        ] }] }]);
        expect(calls.find(call => call.table === 'property_block_summary')?.filters).toContainEqual(['eq', 'shop_id', 'shop']);
        expect(sheet.selected?.rows[0]).toMatchObject({ change: 'changed', previous: { price_per_sqm: 4_000_000 } });
        expect(JSON.stringify(sheet)).not.toContain('"admin"');
    });

    it('opens an archived version and rejects versions that were never activated', async () => {
        const archived = await loadPricingSheet(database().db, 'shop', { version: 1, asOf: '2026-10-22' });
        // Validity is by dates only; the page labels any archived version «Архивласан» from its status.
        expect(archived.selected).toMatchObject({ version: 1, status: 'archived', previous_version: null, validity: 'valid' });
        expect(archived.selected?.rows[0].change).toBeNull();
        await expect(loadPricingSheet(database().db, 'shop', { version: 2 })).rejects.toMatchObject({ status: 404 });
        expect(await loadPricingSheet(database([]).db, 'shop')).toMatchObject({ history: [], selected: null });
    });
});

describe('assertPricingProjectAccess', () => {
    function projects(ids: string[]) {
        const limit = vi.fn().mockResolvedValue({ data: ids.map(id => ({ id })), error: null });
        return { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit }) }) }) }) } as unknown as SupabaseClient;
    }
    it('lets org roles through and limits managers to their registered project', async () => {
        await expect(assertPricingProjectAccess(projects([]), 'shop', { projectIds: null, managerName: null })).resolves.toBeUndefined();
        await expect(assertPricingProjectAccess(projects(['p1']), 'shop', { projectIds: ['p1'], managerName: 'Бат' })).resolves.toBeUndefined();
        await expect(assertPricingProjectAccess(projects(['p2']), 'shop', { projectIds: ['p1'], managerName: 'Бат' })).rejects.toMatchObject({ status: 403 });
        await expect(assertPricingProjectAccess(projects(['p1']), 'shop', { projectIds: [], managerName: null })).rejects.toMatchObject({ status: 403 });
    });
});
