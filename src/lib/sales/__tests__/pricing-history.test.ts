import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { diffPricingRules, pricingValidity, sortPricingRules, withArchiveTimes } from '../pricing-history';
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
            { status: 'active', created_at: '2026-10-20T02:00:00Z' },
            { status: 'archived', created_at: '2026-10-08T02:00:00Z' },
            { status: 'archived', created_at: '2026-10-01T02:00:00Z' },
        ]).map(row => row.archived_at)).toEqual([null, '2026-10-20T02:00:00Z', '2026-10-08T02:00:00Z']);
    });
});

type Row = { id: string; shop_id: string; version: number; status: string; created_at: string; created_by: string; config: Record<string, unknown> };
const config = (rules: PricingRule[], valid_from = '2026-10-01', valid_until = '2026-12-31') => ({ source: 'Баталсан үнэ', valid_from, valid_until, inventory_area_confirmed: true, rules });
const ROWS: Row[] = [
    { id: 'c3', shop_id: 'shop', version: 3, status: 'active', created_at: '2026-10-20T02:00:00Z', created_by: 'admin', config: config([rule({ price_per_sqm: 4_200_000 })]) },
    { id: 'c1', shop_id: 'shop', version: 1, status: 'archived', created_at: '2026-10-01T02:00:00Z', created_by: 'admin', config: config([rule()], '2026-10-01', '2026-10-31') },
];

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
            range: async () => ({ data: filtered().map(({ config: value, ...row }) => ({ ...row, source: value.source, valid_from: value.valid_from, valid_until: value.valid_until })), error: null }),
            maybeSingle: async () => ({ data: table === 'projects' ? null : filtered()[0] ?? null, error: null }),
        };
        return chain;
    } } as unknown as SupabaseClient;
    return { db, calls };
}

describe('loadPricingSheet', () => {
    it('shows the active version compared with the one it archived, never drafts', async () => {
        const { db, calls } = database();
        const sheet = await loadPricingSheet(db, 'shop', { asOf: '2026-10-22' });
        expect(calls[0].filters).toContainEqual(['in', 'status', ['active', 'archived']]);
        expect(calls.filter(call => call.table === 'project_pricing_configs').every(call => call.filters.some(([op, column]) => op === 'in' && column === 'status'))).toBe(true);
        expect(sheet.history.map(row => [row.version, row.status, row.archived_at, row.activated_by])).toEqual([
            [3, 'active', null, 'Болд'], [1, 'archived', '2026-10-20T02:00:00Z', 'Болд'],
        ]);
        expect(sheet.selected).toMatchObject({ version: 3, validity: 'valid', previous_version: 1, removed: [] });
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
