import { describe, expect, it } from 'vitest';
import { UnitPriceSaveSchema, unitPriceActivationError, unitPriceConflict, unitPriceValidity, type UnitPriceDraft, type UnitPriceList } from '../unit-pricing';
import { matchUnitPriceRows, parseUnitPriceWorkbook } from '../unit-pricing-import';
import { buildPricingPhases } from '../pricing-history';

const row = (code: string, prices: Record<string, number>, block = '201') => ({ block, code, model: 'Энгийн', area_sqm: 12.5, prices });
const draft = (patch: Partial<UnitPriceDraft> = {}): UnitPriceDraft => ({
    source: 'PQ-ZP-206-005', valid_from: '2026-10-08', valid_until: '2026-12-31', note: '',
    conditions: [{ label: '50%', advance_percent: 50 }, { label: '100%', advance_percent: 100 }],
    rows: [row('201-160', { '50%': 49_900_000, '100%': 47_800_000 }), row('201-161', { '50%': 49_900_000 })], ...patch,
});
const list = (patch: Partial<UnitPriceList> = {}): UnitPriceList => ({ ...draft(), id: 'l1', shop_id: 'shop', list_key: 'zp-201', list_name: '201, 202-р блокийн зогсоол', category: 'parking', version: 1, status: 'active', ...patch });

describe('per-unit price lists', () => {
    it('activates only a dated, sourced list whose every unit has a price and a unique code', () => {
        expect(unitPriceActivationError(draft())).toBeNull();
        // No end day is allowed: «2026/10/08-с хүчинтэй».
        expect(unitPriceActivationError(draft({ valid_until: null }))).toBeNull();
        expect(unitPriceActivationError(draft({ source: '' }))).toContain('эх сурвалж');
        expect(unitPriceActivationError(draft({ valid_from: null }))).toContain('эхлэх огноо');
        expect(unitPriceActivationError(draft({ conditions: [], rows: [] }))).toContain('нөхцөл');
        expect(unitPriceActivationError(draft({ rows: [row('201-160', {})] }))).toBe('201-160: үнэ оруулаагүй');
        expect(unitPriceActivationError(draft({ rows: [row('201-160', { '50%': 1 }), row(' 201-160 ', { '50%': 2 })] }))).toBe('201-160 код хоёр мөрд байна');
    });
    it('validates the saved shape: whole tugrik, known conditions, a real window', () => {
        const save = (config: unknown, status = 'draft') => UnitPriceSaveSchema.safeParse({ list_key: 'zp-201', list_name: 'Зогсоол', category: 'parking', expected_version: 0, status, config });
        expect(save(draft(), 'active').success).toBe(true);
        expect(save(draft({ rows: [row('201-160', { '30%': 1 })] })).error?.issues[0].message).toBe('201-160: жагсаалтад байхгүй нөхцөлийн үнэ байна');
        expect(save(draft({ rows: [row('201-160', { '50%': 49_900_000.5 })] })).error?.issues[0].message).toBe('Үнэ бүхэл төгрөг байна');
        expect(save(draft({ valid_from: '2026-12-31', valid_until: '2026-10-08' })).error?.issues[0].message).toBe('Хүчинтэй хугацаа буруу байна');
        expect(save(draft({ conditions: [{ label: '50%', advance_percent: 50 }, { label: '50%', advance_percent: 30 }] })).error?.issues[0].message).toBe('Төлбөрийн нөхцөл давхардсан байна');
        expect(save(draft({ source: '' }), 'active').error?.issues[0].message).toContain('эх сурвалж');
        expect(UnitPriceSaveSchema.safeParse({ list_key: 'zp', list_name: 'x', category: 'residential', expected_version: 0, status: 'draft', config: draft() }).success).toBe(false);
    });
    it('reads the window with an open end, and refuses a second active price for the same unit on the same days', () => {
        expect(unitPriceValidity({ valid_from: '2026-10-08', valid_until: null }, '2027-05-01')).toBe('valid');
        expect(unitPriceValidity({ valid_from: '2026-10-08', valid_until: '2026-12-31' }, '2027-01-01')).toBe('expired');
        expect(unitPriceValidity({ valid_from: '2026-10-08', valid_until: null }, '2026-10-07')).toBe('upcoming');
        expect(unitPriceConflict(draft(), 'parking', [list({ list_key: 'old', list_name: 'Хуучин жагсаалт', valid_until: null })])).toContain('«Хуучин жагсаалт» жагсаалтын идэвхтэй үнэтэй давхцаж байна: 201-160');
        // Other days, another kind, an archived list, or other units do not conflict.
        expect(unitPriceConflict(draft({ valid_from: '2027-01-01', valid_until: null }), 'parking', [list()])).toBeNull();
        expect(unitPriceConflict(draft(), 'industry', [list()])).toBeNull();
        expect(unitPriceConflict(draft(), 'parking', [list({ status: 'archived' })])).toBeNull();
        expect(unitPriceConflict(draft({ rows: [row('203-11', { '50%': 1 })] }), 'parking', [list()])).toBeNull();
    });
});

describe('per-unit price file', () => {
    const header = ['№', 'Борлуулах талбай', 'Бүтээгдэхүүний төрөл', 'Загвар', 'Үнэлгээ', 'Захиалгын төлөв', 'Блок', 'Код', 'Хуучин Тоот'];
    it('reads a commissioned-block list with one «Үнэ» column, its start day, and skips the signature lines', () => {
        const file = parseUnitPriceWorkbook('204-205.xlsx', [{ name: 'Sheet1', hidden: false, rows: [
            { row: 2, cells: ['ЗУУ ПЛАС" төслийн 204, 205-р блокийн Зогсоолын үнийн санал'] },
            { row: 4, cells: ['2026/10/08-с хүчинтэй.'] },
            { row: 6, cells: [...header, 'Үнэ'] },
            { row: 7, cells: [1, 34.2, 'Зогсоол', 'VIP 1', 4, 'Ашиглалтад орсон', 205, 'Г1474-342', 342, 77_000_000] },
            { row: 8, cells: [2, 12.5, 'Зогсоол', 'Энгийн', 2, 'Ашиглалтад орсон', 205, 'Г1474-23', 23, '52,000,000'] },
            { row: 9, cells: [3, 12.5, 'Зогсоол', 'Энгийн', 2, 'Ашиглалтад орсон', 205, 'Г1474-23', 23, 52_000_000] },
            { row: 10, cells: [4, 12.5, 'Зогсоол', 'Энгийн', 2, 'Ашиглалтад орсон', 205, 'Г1474-24', 24, '-'] },
            { row: 14, cells: [null, null, 'Монкон Констракшн ХХК Гүйцэтгэх захирал', null, null, null, null, null, null, 'Г. Батбаяр'] },
        ] }, { name: 'Хуучин', hidden: true, rows: [{ row: 1, cells: ['x'] }] }]);
        expect(file.skipped).toEqual([{ name: 'Хуучин', reason: 'Нуусан лист' }]);
        const [sheet] = file.sheets;
        expect(sheet).toMatchObject({ valid_from: '2026-10-08', valid_until: null, conditions: ['Үнэ'] });
        expect(sheet.rows.map(item => [item.code, item.block, item.model, item.area_sqm, item.prices])).toEqual([
            ['Г1474-342', '205', 'VIP 1', 34.2, { 'Үнэ': 77_000_000 }], ['Г1474-23', '205', 'Энгийн', 12.5, { 'Үнэ': 52_000_000 }],
        ]);
        expect(sheet.issues).toEqual([{ row: 9, message: 'Г1474-23 код давхардсан' }, { row: 10, message: 'Г1474-24: үнэ байхгүй' }]);
    });
    it('reads a pre-order list with a price per condition; a dash is a condition not offered for that unit', () => {
        const [sheet] = parseUnitPriceWorkbook('201-202.xlsx', [{ name: 'Sheet1', hidden: false, rows: [
            { row: 3, cells: ['2026/10/08-с 2026/12/31 хүртэл хүчинтэй.'] },
            { row: 5, cells: [...header, 'Ашиглалтад орсон үнэ', 0.5, 0.3, '0-100%', '0-50%', '0-30%', 1] },
            { row: 6, cells: [1, 34.2, 'Зогсоол', 'VIP 1', 4, 'Ашиглалтад ороогүй', 201, '201-288', 288, 77_000_000, 73_900_000, 75_100_000, '-', '-', '-', 72_600_000] },
            { row: 7, cells: [7, 13.75, 'Зогсоол', 'Өргөн', 3, 'Ашиглалтад ороогүй', 201, '201-158', 158, 57_000_000, 54_700_000, 55_600_000, 54_500_000, 55_700_000, 56_200_000, 53_400_000] },
        ] }]).sheets;
        expect(sheet).toMatchObject({ valid_from: '2026-10-08', valid_until: '2026-12-31', conditions: ['Ашиглалтад орсны дараа', '50%', '30%', '0-100%', '0-50%', '0-30%', '100%'], issues: [] });
        expect(Object.keys(sheet.rows[0].prices)).toEqual(['Ашиглалтад орсны дараа', '50%', '30%', '100%']);
        expect(sheet.rows[1].prices).toMatchObject({ '0-100%': 54_500_000, '100%': 53_400_000 });
    });
    it('needs a «Код» column and a price column', () => {
        expect(parseUnitPriceWorkbook('x.xlsx', [{ name: 'S', hidden: false, rows: [{ row: 1, cells: ['Блок', 'Загвар', 'Үнэ'] }] }]).skipped[0].reason).toContain('«Код»');
    });
    it('takes each unit block from the register and reports codes the register does not have', () => {
        const register = [{ code: 'Г1474-342', block: 'Г1474', model: 'VIP 1', area_sqm: 34.2 }, { code: '201-160', block: '201', model: 'Энгийн', area_sqm: 12.5 }];
        const result = matchUnitPriceRows([
            { row: 7, block: '205', code: 'г1474-342', model: null, area_sqm: null, prices: { 'Үнэ': 77_000_000 } },
            { row: 8, block: '201', code: '201-160', model: 'Энгийн', area_sqm: 12.5, prices: { 'Үнэ': 52_000_000 } },
            { row: 9, block: '201', code: '201-999', model: null, area_sqm: null, prices: { 'Үнэ': 1 } },
        ], register);
        expect(result.rows).toEqual([
            { block: 'Г1474', code: 'Г1474-342', model: 'VIP 1', area_sqm: 34.2, prices: { 'Үнэ': 77_000_000 } },
            { block: '201', code: '201-160', model: 'Энгийн', area_sqm: 12.5, prices: { 'Үнэ': 52_000_000 } },
            { block: '201', code: '201-999', model: null, area_sqm: null, prices: { 'Үнэ': 1 } },
        ]);
        expect(result).toMatchObject({ unknown: ['201-999'], moved: 1 });
    });
});

it('marks a block parking as priced from the per-unit list that covers it, never from the apartment price', () => {
    const blocks = [
        { phase: 'Zoo Plus', block: '201', category: 'residential', total_units: 118, available_units: 85 },
        { phase: 'Zoo Plus', block: '201', category: 'parking', total_units: 96, available_units: 80 },
        { phase: 'Zoo Plus', block: '201', category: 'industry', total_units: 20, available_units: 20 },
        { phase: 'Zoo Plus', block: 'Г1474', category: 'parking', total_units: 104, available_units: 90 },
    ];
    const sheet = { list_key: 'zp-201', list_name: '201, 202-р блокийн зогсоол', version: 2, validity: 'valid' as const, valid_from: '2026-10-08', valid_until: '2026-12-31', category: 'parking' as const, rows: [row('201-160', { '50%': 1 })] };
    const [phase] = buildPricingPhases(blocks, [], [sheet]);
    const kinds = Object.fromEntries(phase.blocks.flatMap(block => block.kinds.map(kind => [`${block.block}/${kind.category}`, kind.price?.list_key ?? null])));
    expect(kinds).toEqual({ '201/residential': null, '201/parking': 'zp-201', '201/industry': null, 'Г1474/parking': null });
});
