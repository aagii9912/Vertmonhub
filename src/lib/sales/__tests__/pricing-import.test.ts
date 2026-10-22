import { describe, expect, it } from 'vitest';
import {
    BASE_PRICE_CONDITION, buildImportedRules, conditionLabel, parseBlock, parseFloorRange, parsePrice, parsePricingWorkbook, parseValidity,
    type PricingImportGrid,
} from '../pricing-import';
import { pivotPricingRows } from '../pricing-history';

// Same shape as the approved price lists (Б1 residential with two model columns, Б1 service with a
// two-row header and basement rows, Б2 without a validity line); the amounts are made up.
const residential: PricingImportGrid = { name: 'PQ-EL-B1-002 ', hidden: false, rows: [
    { row: 2, cells: [undefined, 'ELYSIUM Residence B1 блокийн орон сууцны үнийн санал'] },
    { row: 6, cells: [undefined, '2026/05/11-с 2026/08/31 хүртэл хүчинтэй'] },
    { row: 7, cells: [undefined, 'Давхар', 'Давхар', 'Талбай', 'Загвар', 'Загвар', 'Оноо', 'Зүг', 'Ашиглалтад орсны дараах үнэ', 0.5, 0.3, '10-30%'] },
    { row: 8, cells: [undefined, '2 давхар', '02 f', 49.19, 'E1', 'D', 1, 'Урагш', 6_000_000, undefined, 5_900_000, 6_100_000] },
    { row: 9, cells: [undefined, '3-4 давхар', '03 f', 51.03, 'E6', 'D', 5, 'Урагш', 7_000_000, undefined, 6_800_000, 7_000_000.000001] },
    { row: 10, cells: [undefined, '5–8 давхар', '05 f', 51.17, 'E6', 'D', 5, 'Урагш', 7_100_000, 6_500_000, 6_900_000, 'үнэ'] },
    { row: 11, cells: [undefined, 'Тайлбар: НӨАТ орсон'] },
] };
const service: PricingImportGrid = { name: 'PQ-EL-B1Y-001', hidden: false, rows: [
    { row: 3, cells: [undefined, 'B1-р блок үйлчилгээний үнийн санал'] },
    { row: 6, cells: [undefined, '2026/05/01-2026/07/30 хүртэл хүчинтэй'] },
    { row: 8, cells: [undefined, 'Д/д', 'Давхар', 'Загвар ', 'М.кв', 'Ашиглалтанд   орсон М.кв үнэ', 'Нийт үнэ', 'Төлбөрийн нөхцөл'] },
    { row: 9, cells: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, '10-30%', '10-50%', 0.3, 0.5] },
    { row: 10, cells: [undefined, 1, '1 давхар', 'G05', 35.8, 8_000_000, 286_400_000, 7_700_000, 7_600_000, 7_650_000, 7_400_000] },
    { row: 14, cells: [undefined, 6, 'Зоорийн давхар', 'G11', 116.57, 6_000_000, 699_420_000, 5_700_000, 5_600_000, 5_650_000, 5_500_000] },
    { row: 15, cells: [undefined, 7, 'Зоорийн давхар', 'G07', 83.93, 5_800_000, 486_794_000.00000006, 5_500_000, 5_400_000, 5_450_000, 5_300_000] },
] };
const b2: PricingImportGrid = { name: 'B2 Блок үнийн санал ', hidden: false, rows: [
    { row: 1, cells: [undefined, undefined, undefined, undefined, 'Улаанбаатар, Сүхбаатар дүүрэг'] },
    { row: 10, cells: [undefined, 'ELYSIUM Residence B2 блокийн орон сууцны үнийн санал'] },
    { row: 14, cells: [undefined, 'Давхар', 'Давхар', 'Талбай', 'Загвар', 'Оноо', 'Зүг', 'Ашиглалтад орсны дараах үнэ', 0.3, 0.5, '10-30%', '10-50%'] },
    { row: 15, cells: [undefined, '02 давхар', '02', 51.64, 'D', 1, 'Баруун', 7_000_000, 6_200_000, 6_000_000, 6_400_000, 6_200_000] },
] };

describe('cell readers', () => {
    it('reads conditions, floors, prices, blocks and the validity line without guessing', () => {
        expect([0.3, 0.5, '10-30%', '10 – 50 %', '30', 30, 'Нийт үнэ'].map(conditionLabel)).toEqual(['30%', '50%', '10-30%', '10-50%', null, null, null]);
        expect(['2 давхар', '02 давхар', '3-4 давхар', '17–23 давхар', 5, 'Зоорийн давхар', '0 давхар', '9-3 давхар', 'Тайлбар'].map(parseFloorRange)).toEqual([
            { min: 2, max: 2 }, { min: 2, max: 2 }, { min: 3, max: 4 }, { min: 17, max: 23 }, { min: 5, max: 5 }, 'basement', null, null, null,
        ]);
        expect([8_110_000, '8,110,000₮', 7_000_000.000001, undefined, '—', 'үнэ', -1, 7_000_000.5].map(parsePrice)).toEqual([8_110_000, 8_110_000, 7_000_000, null, null, 'invalid', 'invalid', 'invalid']);
        expect(parseBlock(['ELYSIUM Residence B1 блокийн'])).toBe('Б1');
        expect(parseBlock(['Б2 Блок үнийн санал'])).toBe('Б2');
        expect(parseBlock(['PQ-EL-B1Y-001'])).toBeNull();
        expect(parseValidity(['2026/05/11-с 2026/08/31 хүртэл хүчинтэй'])).toEqual({ valid_from: '2026-05-11', valid_until: '2026-08-31' });
        expect(parseValidity(['2026/02/30-2026/03/01 хүртэл хүчинтэй'])).toEqual({ valid_from: null, valid_until: null });
        expect(parseValidity(['2026/09/30 хүртэл хүчинтэй'])).toEqual({ valid_from: null, valid_until: '2026-09-30' });
    });
});

describe('parsePricingWorkbook', () => {
    it('finds the header, the floor-range column and every condition column of a residential sheet', () => {
        const [sheet] = parsePricingWorkbook('Б1.xlsx', [residential]).sheets;
        expect(sheet).toMatchObject({ kind: 'residential', block: 'Б1', valid_from: '2026-05-11', valid_until: '2026-08-31',
            title: 'ELYSIUM Residence B1 блокийн орон сууцны үнийн санал' });
        expect(sheet.conditions).toEqual([{ label: BASE_PRICE_CONDITION, base: true }, { label: '50%', base: false }, { label: '30%', base: false }, { label: '10-30%', base: false }]);
        expect(sheet.modelColumns.map(column => column.sample)).toEqual([['E1', 'E6'], ['D']]);
        expect(sheet.rows.map(row => [row.row, row.floor_min, row.floor_max, row.models[0], row.prices])).toEqual([
            [8, 2, 2, 'E1', { [BASE_PRICE_CONDITION]: 6_000_000, '30%': 5_900_000, '10-30%': 6_100_000 }],
            [9, 3, 4, 'E6', { [BASE_PRICE_CONDITION]: 7_000_000, '30%': 6_800_000, '10-30%': 7_000_000 }],
            [10, 5, 8, 'E6', { [BASE_PRICE_CONDITION]: 7_100_000, '50%': 6_500_000, '30%': 6_900_000 }],
        ]);
        expect(sheet.issues).toEqual([{ row: 10, message: '«10-30%» үнэ буруу («үнэ»)' }]);
    });

    it('reads a two-row header, reports basement rows once and skips hidden or foreign sheets', () => {
        const parsed = parsePricingWorkbook('Б1.xlsx', [service, { ...b2, hidden: true }, { name: 'Тэмдэглэл', hidden: false, rows: [{ row: 1, cells: ['Сайн уу'] }] }]);
        expect(parsed.skipped).toEqual([{ name: 'B2 Блок үнийн санал ', reason: 'Нуусан лист' }, { name: 'Тэмдэглэл', reason: '«Давхар», «Загвар» баганатай толгой мөр олдсонгүй' }]);
        const [sheet] = parsed.sheets;
        expect(sheet).toMatchObject({ kind: 'service', block: 'Б1', valid_from: '2026-05-01', valid_until: '2026-07-30' });
        expect(sheet.conditions.map(condition => condition.label)).toEqual([BASE_PRICE_CONDITION, '10-30%', '10-50%', '30%', '50%']);
        expect(sheet.rows).toEqual([{ row: 10, floor_min: 1, floor_max: 1, models: ['G05'], prices: { [BASE_PRICE_CONDITION]: 8_000_000, '10-30%': 7_700_000, '10-50%': 7_600_000, '30%': 7_650_000, '50%': 7_400_000 } }]);
        expect(sheet.issues).toEqual([{ row: null, message: 'Зоорийн давхрын 2 мөр (14–15-р мөр) орсонгүй: үнийн мөр 1–200 давхарын дугаартай байна' }]);
    });

    it('keeps a sheet without a validity line; the admin enters the window', () => {
        expect(parsePricingWorkbook('Б2.xlsx', [b2]).sheets[0]).toMatchObject({ block: 'Б2', valid_from: null, valid_until: null, title: 'ELYSIUM Residence B2 блокийн орон сууцны үнийн санал' });
    });
});

describe('buildImportedRules', () => {
    const [b1] = parsePricingWorkbook('Б1.xlsx', [residential]).sheets;
    const [b2Sheet] = parsePricingWorkbook('Б2.xlsx', [b2]).sheets;
    const conditions = { [BASE_PRICE_CONDITION]: { include: false, advance_percent: null }, '50%': { include: true, advance_percent: 50 }, '30%': { include: true, advance_percent: 30 }, '10-30%': { include: true, advance_percent: null }, '10-50%': { include: true, advance_percent: 10 } };

    it('makes one rule per row × chosen condition with the admin-confirmed advance, skipping empty cells', () => {
        const { rules, errors } = buildImportedRules([{ sheet: b1, include: true, block: 'Б1', modelColumn: 0 }, { sheet: b2Sheet, include: true, block: 'Б2', modelColumn: 0 }], conditions);
        expect(errors).toEqual([]);
        expect(rules.filter(rule => rule.block === 'Б1').map(rule => `${rule.model} ${rule.floor_min}-${rule.floor_max} ${rule.payment_condition} ${rule.price_per_sqm} ${rule.advance_percent}`)).toEqual([
            'E1 2-2 30% 5900000 30', 'E1 2-2 10-30% 6100000 null',
            'E6 3-4 30% 6800000 30', 'E6 3-4 10-30% 7000000 null',
            'E6 5-8 50% 6500000 50', 'E6 5-8 30% 6900000 30',
        ]);
        expect(rules.filter(rule => rule.block === 'Б2')).toHaveLength(4);
        expect(rules.some(rule => rule.payment_condition === BASE_PRICE_CONDITION)).toBe(false);
        // The page shows them as the price list: one row per model × floors, one column per condition.
        const table = pivotPricingRows(rules.map(rule => ({ rule, change: null, previous: null })));
        expect(table.groups).toHaveLength(4);
        expect(table.conditions.map(condition => condition.label)).toEqual(['10-30%', '10-50%', '30%', '50%']);
    });

    it('uses the chosen model column and reports overlaps and missing blocks instead of saving them', () => {
        const letters = buildImportedRules([{ sheet: b1, include: true, block: 'Б1', modelColumn: 1 }], conditions);
        expect(new Set(letters.rules.map(rule => rule.model))).toEqual(new Set(['D']));
        expect(letters.errors).toEqual([]);
        const twice = buildImportedRules([{ sheet: b1, include: true, block: 'Б1', modelColumn: 0 }, { sheet: b1, include: true, block: 'B1', modelColumn: 0 }], conditions);
        expect(twice.errors[0]).toMatch(/E1 · 30%: 2–2 ба 2–2 давхар давхардсан/);
        expect(buildImportedRules([{ sheet: b1, include: true, block: ' ', modelColumn: 0 }], conditions).errors).toEqual(['«PQ-EL-B1-002 »: блокийг оруулна уу']);
        expect(buildImportedRules([{ sheet: b1, include: false, block: '', modelColumn: 0 }], conditions)).toEqual({ rules: [], errors: [] });
    });
});
