import { describe, expect, it } from 'vitest';
import { inventoryStatusOf, mapInventoryRows, type InventoryImportContext } from '../units';
import { UNIT_STATUS_LABEL } from '@/lib/inventory/labels';

const context: InventoryImportContext = {
    shopId: '10000000-0000-4000-8000-000000000001',
    projectId: '20000000-0000-4000-8000-000000000002',
    projectName: 'Elysium Residence', sourceFile: 'Elysium products.xlsx',
};
const unit = { 'Код': 'Б1-201', 'Блок': 'Б1', 'Бүтээгдэхүүний төрөл': 'Орон сууц', 'Бүтээгдэхүүний төлөв': 'Худалдаанд' };

describe('mapInventoryRows', () => {
    it('maps a real product export into inventory with authoritative project and source scope', () => {
        const result = mapInventoryRows([{
            ...unit, shop_id: 'untrusted', project_id: 'untrusted',
            'Давхар': 2, 'Хуучин Тоот': 201, 'Шинэ тоот': '0201', 'Загвар': 'E-1',
            'Өрөөний тоо': 3, 'Цонхны харагдац': 'Зүүн', 'Борлуулах талбай': '82.50',
            'Шинэчилсэн борлуулах талбай': 82.5, 'Гэрээлсэн талбай': 80,
            'Айлын төрөл': 'A', 'Борлуулалтын суваг': 'Пропертис', 'Борлуулалтын менежер': 'Болд',
        }], context);
        expect(result.errors).toEqual([]);
        expect(result.rows).toEqual([{
            shop_id: context.shopId, project_id: context.projectId, phase: context.projectName,
            block: 'Б1', code: 'Б1-201', building_number: null, floor: '2', unit_number: '0201',
            legacy_unit_number: '201', category: 'residential', unit_type: 'A', model: 'E-1',
            rooms: 3, window_view: 'Зүүн', sale_area: 82.5, updated_sale_area: 82.5, contracted_area: 80,
            status: 'available', raw_status: 'Худалдаанд', sales_channel: 'Пропертис',
            sales_manager: 'Болд', source_file: context.sourceFile,
        }]);
        expect(result.summary).toMatchObject({ total: 1, valid: 1, byCategory: { residential: 1 }, byStatus: { available: 1 } });
    });

    it.each([
        ['Хадгалсан', 'reserved'], ['Захиалга үүссэн', 'ordered'], ['Гэрээ баталгаажаагүй', 'ordered'],
        ['Гэрээ баталгаажсан', 'sold'], ['Хүлээлгэсэн', 'handed_over'],
    ])('preserves the sale state %s', (raw, expected) => {
        const result = mapInventoryRows([{ ...unit, 'Бүтээгдэхүүний төлөв': raw }], context);
        expect(result.errors).toEqual([]);
        expect(result.rows[0].status).toBe(expected);
    });

    it('re-imports every status label the Excel export writes («Захиалсан» = ordered)', () => {
        const exported = { ...UNIT_STATUS_LABEL, available: 'Худалдаанд' };
        for (const [status, label] of Object.entries(exported)) expect(inventoryStatusOf(label)).toBe(status);
        expect(inventoryStatusOf(UNIT_STATUS_LABEL.available)).toBe('available');
        const result = mapInventoryRows([{ ...unit, 'Бүтээгдэхүүний төлөв': 'Захиалсан' }], context);
        expect(result.errors).toEqual([]);
        expect(result.rows[0]).toMatchObject({ status: 'ordered', raw_status: 'Захиалсан' });
    });

    it('accepts canonical English columns and explicit block fallback for single-block files', () => {
        const result = mapInventoryRows([
            { Code: 'P-001', category: 'parking', status: 'ordered', floor: 'B1', sale_area: '1,234.50', rooms: null },
            { code: 'S-001', category: 'industry', status: 'handed_over', sale_area: '1 234.50' },
            { code: 'C-001', category: 'commercial', status: 'reserved' },
        ], { ...context, block: 'Б1' });
        expect(result.errors).toEqual([]);
        expect(result.rows.map(row => row.category)).toEqual(['parking', 'industry', 'commercial']);
        expect(result.rows[0]).toMatchObject({ block: 'Б1', sale_area: 1234.5, rooms: null });
    });

    it('canonicalizes valid uppercase UUID scope to PostgreSQL lowercase IDs', () => {
        const result = mapInventoryRows([unit], {
            ...context,
            shopId: 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
            projectId: 'BCDEFABC-DEFA-4BCD-8EFA-BCDEFABCDEF0',
        });
        expect(result.errors).toEqual([]);
        expect(result.rows[0]).toMatchObject({
            shop_id: 'abcdefab-cdef-4abc-8def-abcdefabcdef',
            project_id: 'bcdefabc-defa-4bcd-8efa-bcdefabcdef0',
        });
    });

    it.each([
        { 'Бүтээгдэхүүний төлөв': '' }, { 'Бүтээгдэхүүний төлөв': 'Хүлээгдэж байна' }, { 'Бүтээгдэхүүний төлөв': 'constructor' },
        { 'Бүтээгдэхүүний төрөл': '' }, { 'Бүтээгдэхүүний төрөл': 'Бусад' }, { 'Бүтээгдэхүүний төрөл': '__proto__' },
        { 'Код': '' }, { 'Ээлж': '' }, { 'Блок': '' },
    ])('rejects unknown or blank required source values: %j', change => {
        const result = mapInventoryRows([{ ...unit, ...change }], { ...context, block: 'Б1' });
        expect(result.rows).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
    });

    it('requires phase on every row when the file has a phase column', () => {
        const result = mapInventoryRows([{ ...unit, 'Ээлж': 'Elysium' }, { ...unit, 'Код': 'Б1-202' }], context);
        expect(result.rows).toHaveLength(1);
        expect(result.errors).toEqual(['Мөр 3: Ээлж хоосон байна']);
    });

    it('takes the block from a «Б<n>-» code prefix when the file has neither a block column nor an explicit block', () => {
        const { 'Блок': _block, ...noBlock } = unit;
        const result = mapInventoryRows([noBlock, { ...noBlock, 'Код': 'Б2-14' }], context);
        expect(result.errors).toEqual([]);
        expect(result.rows.map(row => row.block)).toEqual(['Б1', 'Б2']);
        expect(mapInventoryRows([{ ...noBlock, 'Код': 'Б2-14' }], { ...context, block: 'Б1' }).rows[0].block).toBe('Б1');
    });

    it('rounds Excel floating-point residue to cents but still rejects real third decimals', () => {
        const result = mapInventoryRows([{ ...unit, 'Борлуулах талбай': '89.32000000000001', 'Гэрээлсэн талбай': 79.69999999999999 }], context);
        expect(result.errors).toEqual([]);
        expect(result.rows[0]).toMatchObject({ sale_area: 89.32, contracted_area: 79.7 });
        expect(mapInventoryRows([{ ...unit, 'Борлуулах талбай': '80.125' }], context).errors).toHaveLength(1);
    });

    it('separates ERP codes repeated on other floors by floor, else by model, and keeps true duplicates as errors', () => {
        const parking = { ...unit, 'Код': 'Б1-1', 'Бүтээгдэхүүний төрөл': 'Зогсоол' };
        const byFloor = mapInventoryRows([{ ...parking, 'Давхар': 'B1', 'Загвар': 'A-2' }, { ...parking, 'Давхар': '01', 'Загвар': 'A-1' }, unit], context);
        expect(byFloor.errors).toEqual([]);
        expect(byFloor.rows.map(row => row.code)).toEqual(['Б1-1 (B1)', 'Б1-1 (01)', 'Б1-201']);
        const byModel = mapInventoryRows([{ ...parking, 'Давхар': '01', 'Загвар': 'H-1' }, { ...parking, 'Давхар': '01', 'Загвар': 'H-2' }], context);
        expect(byModel.rows.map(row => row.code)).toEqual(['Б1-1 (H-1)', 'Б1-1 (H-2)']);
        const same = mapInventoryRows([{ ...parking, 'Давхар': '01', 'Загвар': 'A-1' }, { ...parking, 'Давхар': '01', 'Загвар': 'A-1' }], context);
        expect(same.errors[0]).toContain('Код давхардсан');
    });

    it('never guesses block or building from layout/code and never silently skips empty rows', () => {
        const result = mapInventoryRows([
            { code: 'E-1', category: 'residential', status: 'available', model: 'Б1-А' }, {},
        ], context);
        expect(result.rows).toHaveLength(0);
        expect(result.errors).toEqual(['Мөр 2: Блок хоосон байна', 'Мөр 3: Код хоосон байна']);
    });

    it.each(['82oops', '1,23.50', '1e2', 'Infinity', '-1', '0x10', '100000000', '80.123', true, {}, NaN])(
        'rejects malformed or out-of-schema area %j', area => {
            expect(mapInventoryRows([{ ...unit, 'Борлуулах талбай': area }], context).errors).toHaveLength(1);
        },
    );
    it.each(['3.5', -1, '2147483648', '3rooms'])(
        'rejects invalid integer rooms %j', rooms => {
            expect(mapInventoryRows([{ ...unit, 'Өрөөний тоо': rooms }], context).errors).toHaveLength(1);
        },
    );

    it.each([
        { 'Код': 'X'.repeat(51) }, { 'Давхар': 'X'.repeat(21) }, { 'Айлын төрөл': 'X'.repeat(31) },
        { 'Блок': 'Б'.repeat(51) }, { 'Борлуулалтын менежер': 'X'.repeat(256) },
    ])('rejects text exceeding schema lengths without truncating identifiers: %j', change => {
        expect(mapInventoryRows([{ ...unit, ...change }], context).errors).toHaveLength(1);
    });

    it('rejects duplicate inventory identity across blocks instead of overwriting either unit', () => {
        const result = mapInventoryRows([unit, { ...unit, 'Блок': 'Б2' }], context);
        expect(result.rows).toHaveLength(1);
        expect(result.errors[0]).toContain('Мөр 3: Код давхардсан');
        expect(mapInventoryRows([unit, { ...unit, 'Бүтээгдэхүүний төрөл': 'Зогсоол' }], context).errors).toEqual([]);
    });

    it.each([
        { shopId: '' }, { projectId: 'Elysium' }, { projectName: '' }, { sourceFile: '' },
        { sourceFile: 'X'.repeat(256) },
    ])('requires explicit valid import context: %j', change => {
        expect(mapInventoryRows([unit], { ...context, ...change }).errors).toHaveLength(1);
    });

    it('rejects an empty file', () => {
        expect(mapInventoryRows([], context).errors).toEqual(['Файлд нэгжийн мөр алга']);
    });

    it('counts arbitrary source phase/block names without inherited object-key collisions', () => {
        const result = mapInventoryRows([{ ...unit, phase: '__proto__', 'Блок': 'constructor' }], context);
        expect(result.errors).toEqual([]);
        expect(result.summary.byPhase.__proto__).toBe(1);
        expect(result.summary.byBlock.constructor).toBe(1);
    });
});
