import { describe, expect, it } from 'vitest';
import {
    suggestErpKeyColumns, blockOfCode, erpDate, erpNumber, isProductsDataset, isSalesDataset, parseErpProduct, parseErpSale,
    parseProductLabel, productKind, readErpRecords,
} from '../records';

// Бодит экспортын баганатай синтетик мөр (хувийн мэдээлэлгүй).
const sale = (overrides: Record<string, string> = {}) => ({
    'Гэрээний дугаар': 'EL-P-26/19', 'Захиалга өгсөн огноо': '2026-09-10', 'Борлуулалтын менежер': 'Менежер.Нэг',
    'Бүтээгдэхүүн': 'Б1-76, A-1, Зогсоол, ЭЛИЗИУМ-МИ', 'Блокын дугаар': '645-Гараж-ЭЛИЗИУМ', 'Борлуулалтын суваг': 'Пропертис',
    'Захиалгын нөхцөл': 'Тусгай', 'Үндсэн захиалагч': 'Тест.Хэрэглэгч АА12345678', 'Урьдчилгааны нөхцөл': '30%',
    'Урьдчилгааны дүн': '21780000', 'Төлөв': 'Гэрээ үүссэн', 'Банкны төлөв': '', 'М.кв үнэ': '72600000',
    'Гэрээлсэн талбай': '12.5', 'Нийт дүн': '72600000', 'Нийт төлсөн дүн': '0', 'Төлбөрийн буцаалтын дүн': '0',
    'Нийт үлдэгдэл': '72600000', 'Төлбөр хоцролт': '0', 'Нийт хоцорсон хоног': '0', 'Нийт тооцсон алданги': '0',
    ...overrides,
});
const product = (overrides: Record<string, string> = {}) => ({
    'Код': 'Б1-2', 'Давхар': '02', 'Загвар': 'E2', 'Өрөөний тоо': '2', 'Борлуулах талбай': '64.16',
    'Шинэчилсэн борлуулах талбай': '0', 'Нийт борлуулах үнэ': '365712000', 'Борлуулалтын суваг': 'Пропертис',
    'Борлуулалтын менежер': 'Менежер.Нэг', 'Бүтээгдэхүүний төлөв': 'Гэрээ баталгаажсан', 'Бүтээгдэхүүний төрөл': 'Орон сууц',
    ...overrides,
});

describe('ERP value parsing', () => {
    it('never turns blanks or text into zero', () => {
        expect(erpNumber('54,800,000')).toBe(54800000);
        expect(erpNumber('79.69999999999999')).toBeCloseTo(79.7);
        expect(erpNumber('0')).toBe(0);
        expect(erpNumber('')).toBeNull();
        expect(erpNumber('499,392,00')).toBe(49939200);
        expect(erpNumber('тодорхойгүй')).toBeNull();
        expect(erpDate('2026-09-25 00:00:00')).toBe('2026-09-25');
        expect(erpDate('25/09/2026')).toBeNull();
    });

    it('classifies product labels without guessing unknown kinds', () => {
        expect(productKind('Орон сууц')).toBe('residential');
        expect(productKind('Зогсоол')).toBe('parking');
        expect(productKind('Агуулах')).toBe('industry');
        expect(productKind('Үйлчилгээ')).toBe('commercial');
        expect(productKind('Пентхаус')).toBe('other');
        expect(parseProductLabel('Б1-110, A-1, Зогсоол, ЭЛИЗИУМ-МИ')).toEqual({ code: 'Б1-110', model: 'A-1', kind: 'parking' });
        expect(blockOfCode('Б2-15')).toBe('Б2');
        expect(blockOfCode('Код')).toBeNull();
    });
});

describe('property.sale rows', () => {
    it('keeps one record per contract product and strips registration numbers', () => {
        const parsed = parseErpSale(sale())!;
        expect(parsed).toMatchObject({
            key: 'EL-P-26/19|Б1-76, A-1, Зогсоол, ЭЛИЗИУМ-МИ', contractNumber: 'EL-P-26/19', orderDate: '2026-09-10',
            unitCode: 'Б1-76', model: 'A-1', kind: 'parking', block: 'Б1', status: 'active', total: 72600000, paid: 0,
            advanceAmount: 21780000, customer: 'Тест.Хэрэглэгч', bankStatus: null,
        });
        expect(parseErpSale(sale({ 'Төлөв': 'Цуцлагдсан' }))!.status).toBe('cancelled');
        expect(parseErpSale(sale({ 'Төлөв': 'Гэрээ хаасан' }))!.status).toBe('closed');
        expect(parseErpSale(sale({ 'Төлөв': 'Тоот шилжсэн' }))!.status).toBe('transferred');
        expect(parseErpSale(sale({ 'Нийт төлсөн дүн': '' }))!.paid).toBeNull();
        expect(parseErpSale(sale({ 'Гэрээний дугаар': '' }))).toBeNull();
    });

    it('detects the dataset kind from its columns', () => {
        expect(isSalesDataset({ columns: Object.keys(sale()) })).toBe(true);
        expect(isProductsDataset({ columns: Object.keys(sale()) })).toBe(false);
        expect(isProductsDataset({ columns: Object.keys(product()) })).toBe(true);
    });
});

describe('product rows', () => {
    it('uses the same inventory vocabulary as the units import and keeps the source label', () => {
        expect(parseErpProduct(product())).toMatchObject({ code: 'Б1-2', block: 'Б1', floor: 2, model: 'E2', kind: 'residential',
            area: 64.16, status: 'sold', statusLabel: 'Гэрээ баталгаажсан', barter: false });
        expect(parseErpProduct(product({ 'Бүтээгдэхүүний төлөв': 'Худалдаанд' }))!.status).toBe('available');
        expect(parseErpProduct(product({ 'Бүтээгдэхүүний төлөв': 'Хадгалсан' }))!.status).toBe('reserved');
        expect(parseErpProduct(product({ 'Бүтээгдэхүүний төлөв': 'Хүлээлгэсэн' }))).toMatchObject({ status: 'handed_over', statusLabel: 'Хүлээлгэсэн' });
        expect(parseErpProduct(product({ 'Бүтээгдэхүүний төлөв': 'Захиалга үүссэн' }))!.status).toBe('ordered');
        expect(parseErpProduct(product({ 'Бүтээгдэхүүний төлөв': 'Шинэ төлөв' }))).toMatchObject({ status: null, statusLabel: 'Шинэ төлөв' });
        expect(parseErpProduct(product({ 'Борлуулалтын суваг': 'Бартер' }))!.barter).toBe(true);
        expect(parseErpProduct(product({ 'Шинэчилсэн борлуулах талбай': '65.2' }))!.area).toBe(65.2);
    });

    it('reads only the matching sheets of a snapshot', () => {
        const datasets = [
            { name: 'Products', columns: Object.keys(product()), keyColumns: ['Код'], rows: [product(), product({ 'Код': '' })] },
            { name: 'Sales', columns: Object.keys(sale()), keyColumns: ['Гэрээний дугаар'], rows: [sale()] },
        ];
        expect(readErpRecords(datasets, isProductsDataset, parseErpProduct)).toHaveLength(1);
        expect(readErpRecords(datasets, isSalesDataset, parseErpSale)).toHaveLength(1);
    });
});

describe('suggestErpKeyColumns', () => {
    it('suggests stable keys for the two weekly exports only', () => {
        expect(suggestErpKeyColumns(Object.keys(sale()))).toEqual(['Гэрээний дугаар', 'Бүтээгдэхүүн']);
        expect(suggestErpKeyColumns(Object.keys(product()))).toEqual(['Бүтээгдэхүүний төрөл', 'Загвар', 'Код']);
        expect(suggestErpKeyColumns(['Огноо', 'Дүн'])).toEqual([]);
    });
});
