import { describe, expect, it } from 'vitest';
import { calculateListPricing, calculatePricing, inventoryArea, inventoryFloor, priceListConflict, PricingSaveSchema, PricingSelectionSchema, type PricingConfig, type PricingSelection } from '../pricing';

const selection: PricingSelection = { block: 'Б1', model: 'E3', area_sqm: 80.32, floor: 5, payment_condition: '50%' };
const config: PricingConfig = {
    id: 'config', shop_id: 'shop', list_key: 'main', list_name: 'Үндсэн үнэ', version: 3, status: 'active', source: 'Баталсан хуудас',
    valid_from: '2026-10-01', valid_until: '2026-10-31', inventory_area_confirmed: true,
    rules: [{ block: 'B1', model: 'Е3', floor_min: 2, floor_max: 9, payment_condition: '50%', price_per_sqm: 4_000_001, advance_percent: 50 }],
};

describe('verified offer pricing', () => {
    it('matches canonical block/model and rounds total and advance once to whole tugrik', () => {
        expect(calculatePricing(config, selection, '2026-10-08')).toMatchObject({ available: true, quote: {
            config_id: 'config', version: 3, source: config.source, as_of: '2026-10-08', total_amount: 321_280_080,
            advance_amount: 160_640_040, balance_amount: 160_640_040,
        } });
    });
    it('never falls back to old rates, another model, or an unlisted condition', () => {
        for (const candidate of [null, { ...config, status: 'draft' as const }, { ...config, valid_until: '2026-08-31' }, { ...config, inventory_area_confirmed: false }]) {
            expect(calculatePricing(candidate, selection, '2026-10-08').available).toBe(false);
        }
        for (const candidate of [{ ...selection, model: 'E6' }, { ...selection, payment_condition: '30%' }, { ...selection, payment_condition: null }]) {
            expect(calculatePricing(config, candidate, '2026-10-08').available).toBe(false);
        }
    });
    it('respects inclusive floor/date boundaries and rejects overlapping rules', () => {
        expect(calculatePricing(config, { ...selection, floor: 2 }, '2026-10-01').available).toBe(true);
        expect(calculatePricing(config, { ...selection, floor: 9 }, '2026-10-31').available).toBe(true);
        expect(calculatePricing(config, { ...selection, floor: 10 }, '2026-10-08').available).toBe(false);
        const overlap = { ...config, rules: [...config.rules, { ...config.rules[0] }] };
        expect(calculatePricing(overlap, selection, '2026-10-08').available).toBe(false);
        expect(PricingSaveSchema.safeParse({ expected_version: 3, status: 'active', config: strip(overlap) }).success).toBe(false);
    });
    it('does not infer an advance from a range label', () => {
        const ranged = { ...config, rules: [{ ...config.rules[0], payment_condition: '10–30%', advance_percent: null }] };
        expect(calculatePricing(ranged, { ...selection, payment_condition: '10–30%' }, '2026-10-08')).toMatchObject({ available: true, quote: { advance_amount: null, balance_amount: null } });
        expect(PricingSaveSchema.safeParse({ expected_version: 3, status: 'active', config: strip(ranged) }).success).toBe(false);
        expect(PricingSaveSchema.safeParse({ expected_version: 3, status: 'draft', config: strip(ranged) }).success).toBe(true);
    });
    it('skips zero/invalid updated area and normalizes only valid residential floors', () => {
        expect(inventoryArea({ updated_sale_area: 0, sale_area: '51.72', contracted_area: 50 })).toBe(51.72);
        expect(inventoryArea({ updated_sale_area: 'bad', sale_area: null, contracted_area: 49.93 })).toBe(49.93);
        expect(inventoryFloor('02')).toBe(2);
        expect(inventoryFloor('B1')).toBeNull();
        expect(inventoryFloor('2-р')).toBeNull();
    });
    it('rejects impossible dates, precision loss, unknown client amounts, and an empty active config', () => {
        expect(PricingSelectionSchema.safeParse({ ...selection, total_amount: 1 }).success).toBe(false);
        expect(PricingSelectionSchema.safeParse({ ...selection, area_sqm: 80.325 }).success).toBe(false);
        expect(PricingSaveSchema.safeParse({ expected_version: 0, status: 'draft', config: { ...strip(config), valid_from: '2026-02-30' } }).success).toBe(false);
        expect(PricingSaveSchema.safeParse({ expected_version: 0, status: 'active', config: { ...strip(config), rules: [] } }).success).toBe(false);
    });
});

function strip(value: PricingConfig) {
    return { source: value.source, valid_from: value.valid_from, valid_until: value.valid_until, inventory_area_confirmed: value.inventory_area_confirmed, rules: value.rules };
}

describe('several price lists in one project', () => {
    const forest: PricingConfig = {
        id: 'forest', shop_id: 'shop', list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', version: 1, status: 'active', source: 'PQ-FG-503-001',
        valid_from: '2026-10-01', valid_until: '2026-10-15', inventory_area_confirmed: true,
        rules: [{ block: '503', model: 'A', floor_min: 2, floor_max: 12, payment_condition: '50%', price_per_sqm: 4_800_000, advance_percent: 50 }],
    };
    const forestUnit: PricingSelection = { block: '503', model: 'A', area_sqm: 105.78, floor: 5, payment_condition: '50%' };

    it('prices each unit from the list that covers its block, inside that list own window', () => {
        expect(calculateListPricing([config, forest], selection, '2026-10-20')).toMatchObject({ available: true, quote: { config_id: 'config', price_per_sqm: 4_000_001 } });
        expect(calculateListPricing([config, forest], forestUnit, '2026-10-10')).toMatchObject({ available: true, quote: { config_id: 'forest', total_amount: 507_744_000 } });
        // The special price ended on the 15th while the default list is still valid: no price, never the other list.
        expect(calculateListPricing([config, forest], forestUnit, '2026-10-20')).toEqual({ available: false, reason: 'Үнийн хүчинтэй хугацаанд багтахгүй байна', quote: null });
        expect(calculateListPricing([config, forest], { ...forestUnit, block: '504' }, '2026-10-10')).toEqual({ available: false, reason: 'Энэ байр, давхар, нөхцөлийн баталсан үнэ байхгүй', quote: null });
    });
    it('one list behaves exactly as before, and drafts or archived versions never price', () => {
        expect(calculateListPricing([config], selection, '2026-10-08')).toEqual(calculatePricing(config, selection, '2026-10-08'));
        expect(calculateListPricing([], selection, '2026-10-08')).toEqual(calculatePricing(null, selection, '2026-10-08'));
        expect(calculateListPricing([{ ...forest, status: 'archived' }, { ...config, status: 'draft' }], forestUnit, '2026-10-10').available).toBe(false);
    });
    it('never chooses between two lists that both price the unit', () => {
        const clash = { ...forest, rules: [{ ...config.rules[0], price_per_sqm: 3_500_000 }] };
        expect(calculateListPricing([config, clash], selection, '2026-10-08')).toEqual({ available: false, reason: 'Үнийн дүрэм давхардсан байна', quote: null });
    });
    it('refuses activation only when another active list prices the same unit and condition on the same days', () => {
        const draft = { source: 'Шинэ', valid_from: '2026-10-10', valid_until: '2026-11-30', inventory_area_confirmed: true, rules: [{ ...forest.rules[0], floor_min: 12, floor_max: 16 }] };
        expect(priceListConflict(draft, [config, forest])).toContain('«Forest Garden тусгай үнэ» жагсаалтын идэвхтэй үнэтэй давхцаж байна: 503 · A · 12–16 давхар · 50%');
        // Separate days, floors, conditions or blocks; an archived list; an undated draft.
        expect(priceListConflict({ ...draft, valid_from: '2026-10-16' }, [config, forest])).toBeNull();
        expect(priceListConflict({ ...draft, rules: [{ ...draft.rules[0], floor_min: 13 }] }, [forest])).toBeNull();
        expect(priceListConflict({ ...draft, rules: [{ ...draft.rules[0], payment_condition: '30%' }] }, [forest])).toBeNull();
        expect(priceListConflict({ ...draft, rules: [{ ...draft.rules[0], block: '504' }] }, [forest])).toBeNull();
        expect(priceListConflict(draft, [{ ...forest, status: 'archived' }])).toBeNull();
        expect(priceListConflict({ ...draft, valid_until: null }, [forest])).toBeNull();
    });
    it('saves to the default list unless a list is named, and validates the list key and name', () => {
        const base = { expected_version: 0, status: 'draft' as const, config: { source: '', valid_from: null, valid_until: null, inventory_area_confirmed: false, rules: [] } };
        expect(PricingSaveSchema.parse(base)).toMatchObject({ list_key: 'main', list_name: 'Үндсэн үнэ' });
        expect(PricingSaveSchema.parse({ ...base, list_key: 'forest-garden', list_name: '  Forest Garden  ' })).toMatchObject({ list_key: 'forest-garden', list_name: 'Forest Garden' });
        for (const bad of [{ list_key: 'Forest' }, { list_key: '' }, { list_name: '   ' }, { list_name: 'x'.repeat(81) }]) expect(PricingSaveSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    });
});
