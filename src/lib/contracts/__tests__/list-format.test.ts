import { describe, expect, it } from 'vitest';
import {
    CONTRACT_LIST_COLUMNS, CONTRACT_LIST_MONEY_FORMAT, CONTRACT_LIST_NUMFMT, HUB_STATUS_LABEL, HUB_TYPE_LABEL,
    contractListNames, contractListPricePerSqm, contractListRow, contractUnitNumber, customerShortName, dbFloor, hubContractStatus,
    hubFloor, hubProductType, isDerivedPricePerSqm,
} from '../list-format';

describe('HUB гэрээний жагсаалтын толь', () => {
    it('16 багана ERP-ийн файлын дарааллаар', () => {
        expect(CONTRACT_LIST_COLUMNS).toEqual([
            'Төрөл', 'Блок', 'Тоот', 'Давхар', 'Загвар', 'Гэрээлсэн талбай', 'Урьдчилгааны нөхцөл', 'М.кв үнэ', 'Нийт дүн',
            'Урьдчилгааны дүн', 'Төлбөр хоцролт', 'Захиалга өгсөн огноо', 'Төлөв', 'Нэр', 'Овог', 'Захиалгын нөхцөл',
        ]);
        expect(CONTRACT_LIST_NUMFMT).toHaveLength(16);
        expect(CONTRACT_LIST_NUMFMT[CONTRACT_LIST_COLUMNS.indexOf('Нийт дүн')]).toBe(CONTRACT_LIST_MONEY_FORMAT);
        expect(CONTRACT_LIST_NUMFMT[CONTRACT_LIST_COLUMNS.indexOf('Гэрээлсэн талбай')]).toBe('#,##0.00');
        expect(CONTRACT_LIST_NUMFMT[CONTRACT_LIST_COLUMNS.indexOf('Захиалга өгсөн огноо')]).toBe('yyyy-mm-dd');
        expect(CONTRACT_LIST_NUMFMT[CONTRACT_LIST_COLUMNS.indexOf('Тоот')]).toBeUndefined();
    });

    it('«Төрөл» хоёр чиглэлд: тэргүүлэх зай, том жижиг үсэг хамаагүй', () => {
        expect(hubProductType(' Орон сууц')).toBe('residential');
        expect(hubProductType('зогсоол ')).toBe('parking');
        expect(hubProductType(' Агуулах')).toBe('industry');
        expect(hubProductType('Үйлчилгээ')).toBe('commercial');
        expect(hubProductType('parking')).toBe('parking');
        expect(hubProductType('Оффис')).toBeNull();
        expect(hubProductType('')).toBeNull();
        for (const [key, label] of Object.entries(HUB_TYPE_LABEL)) expect(hubProductType(label)).toBe(key);
    });

    it('«Төлөв»: HUB-ийн үг ба апп-ын нэр яг таарвал, бусдыг таахгүй', () => {
        expect(hubContractStatus('Гэрээ үүссэн')).toBe('active');
        expect(hubContractStatus(' гэрээ  хаасан ')).toBe('closed');
        expect(hubContractStatus('Цуцлагдсан')).toBe('cancelled');
        expect(hubContractStatus('Тоот шилжсэн')).toBe('transferred');
        expect(hubContractStatus('Идэвхтэй')).toBe('active');
        expect(hubContractStatus('Хаагдсан')).toBe('closed');
        expect(hubContractStatus('Цуцалсан')).toBe('cancelled');
        expect(hubContractStatus('Гэрээ баталгаажсан')).toBeNull();
        expect(hubContractStatus('Захиалга үүссэн')).toBeNull();
        for (const [key, label] of Object.entries(HUB_STATUS_LABEL)) expect(hubContractStatus(label)).toBe(key);
    });

    it('давхар: DB хоёр оронтой, файл тэггүй', () => {
        expect(dbFloor('1')).toBe('01');
        expect(dbFloor(1)).toBe('01');
        expect(dbFloor(' 22 ')).toBe('22');
        expect(dbFloor('B1')).toBe('B1');
        expect(dbFloor('')).toBeNull();
        expect(dbFloor(null)).toBeNull();
        expect(hubFloor('01')).toBe('1');
        expect(hubFloor('22')).toBe('22');
        expect(hubFloor('B1')).toBe('B1');
        expect(hubFloor(null)).toBeNull();
        expect(dbFloor(hubFloor('05'))).toBe('05');
    });

    it('«Тоот»: хуучин тоот, шинэ тоот (0 биш), эс бөгөөс кодын блокийн дараах хэсэг', () => {
        expect(contractUnitNumber({ legacy_unit_number: '16', unit_number: '0', unit_label: 'Б1-16', block_name: 'Б1' })).toBe('16');
        expect(contractUnitNumber({ legacy_unit_number: null, unit_number: '305', unit_label: 'Б1-16', block_name: 'Б1' })).toBe('305');
        expect(contractUnitNumber({ legacy_unit_number: null, unit_number: '0', unit_label: 'Б1-19 (B1)', block_name: 'Б1' })).toBe('19');
        expect(contractUnitNumber({ unit_label: 'Б1-46 (H-1)', block_name: 'Б1' })).toBe('46');
        expect(contractUnitNumber({ unit_label: 'Б2-231', block_name: 'Б2' })).toBe('231');
        expect(contractUnitNumber({ unit_label: '203-305, 3B-2', block_name: '203' })).toBe('305');
        expect(contractUnitNumber({ unit_label: 'Б2-231', block_name: 'Б1' })).toBeNull();
        expect(contractUnitNumber({ unit_label: null, block_name: 'Б1' })).toBeNull();
    });

    it('М.кв үнэ: хадгалсан утга, эс бөгөөс зогсоол/агуулахад нэгжийн үнэ (ERP-ийн загвар)', () => {
        expect(contractListPricePerSqm({ price_per_sqm: '5432000.00', product_type: 'residential', total_price: 439503120 })).toBe(5432000);
        expect(contractListPricePerSqm({ price_per_sqm: null, product_type: 'parking', total_price: '86600000.00' })).toBe(86600000);
        expect(isDerivedPricePerSqm({ price_per_sqm: null, product_type: 'parking', total_price: 86600000 })).toBe(true);
        expect(contractListPricePerSqm({ price_per_sqm: null, product_type: 'industry', total_price: 30000000 })).toBe(30000000);
        expect(contractListPricePerSqm({ price_per_sqm: null, product_type: 'residential', total_price: 439503120 })).toBeNull();
        expect(isDerivedPricePerSqm({ price_per_sqm: 5432000, product_type: 'parking', total_price: 1 })).toBe(false);
        expect(contractListPricePerSqm({ price_per_sqm: null, product_type: 'parking', total_price: null })).toBeNull();
    });

    it('нэр: салгасан нэр, эс бөгөөс customer_name-ийг «Нэр»-д (fallback)', () => {
        expect(contractListNames({ customer_first_name: 'Сараа ', customer_last_name: 'Дорж', customer_name: 'Дорж.Сараа' }))
            .toEqual({ first: 'Сараа', last: 'Дорж', fallback: false });
        expect(contractListNames({ customer_first_name: null, customer_last_name: 'Дорж', customer_name: 'x' }))
            .toEqual({ first: null, last: 'Дорж', fallback: false });
        expect(contractListNames({ customer_first_name: null, customer_last_name: null, customer_name: 'Бат.Болд' }))
            .toEqual({ first: 'Бат.Болд', last: null, fallback: true });
        expect(contractListNames({ customer_first_name: null, customer_last_name: null, customer_name: null }))
            .toEqual({ first: null, last: null, fallback: false });
    });

    it('экспортын мөр: HUB-ийн үг, тэггүй давхар, тоо Тоот, огноо Date, NULL хоосон, 0 нь 0', () => {
        const row = contractListRow({
            product_type: 'parking', block_name: 'Б1', floor: 'B1', unit_number: '0', legacy_unit_number: null, unit_label: 'Б1-19 (B1)',
            model: 'A-2', contracted_area: '12.50', prepayment_condition: '100%', price_per_sqm: null, total_price: '79700000.00',
            prepayment_due: null, overdue_amount: 0, order_date: null, contract_date: '2026-09-03', contract_status: 'closed',
            customer_name: 'Тест.Хэрэглэгч', customer_first_name: null, customer_last_name: null, payment_condition: 'Энгийн',
        });
        expect(Object.keys(row)).toEqual([...CONTRACT_LIST_COLUMNS]);
        expect(row).toMatchObject({
            'Төрөл': 'Зогсоол', 'Блок': 'Б1', 'Тоот': 19, 'Давхар': 'B1', 'Загвар': 'A-2', 'Гэрээлсэн талбай': 12.5,
            'Урьдчилгааны нөхцөл': '100%', 'М.кв үнэ': 79700000, 'Нийт дүн': 79700000, 'Урьдчилгааны дүн': null,
            'Төлбөр хоцролт': 0, 'Төлөв': 'Гэрээ хаасан', 'Нэр': 'Тест.Хэрэглэгч', 'Овог': null, 'Захиалгын нөхцөл': 'Энгийн',
        });
        const date = row['Захиалга өгсөн огноо'] as Date;
        expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 3, 0]);

        const ordered = contractListRow({ product_type: 'residential', order_date: '2026-08-12', contract_date: '2026-09-01', floor: '05', legacy_unit_number: 'A-3', contract_status: 'cancelled', overdue_amount: null });
        expect((ordered['Захиалга өгсөн огноо'] as Date).getDate()).toBe(12);
        expect(ordered).toMatchObject({ 'Тоот': 'A-3', 'Давхар': '5', 'Төлөв': 'Цуцлагдсан', 'Төлбөр хоцролт': null, 'Төрөл': 'Орон сууц' });
        expect(contractListRow({ product_type: 'other', contract_status: 'weird' })).toMatchObject({ 'Төрөл': 'other', 'Төлөв': 'weird', 'Захиалга өгсөн огноо': null });
        // Тэгээр эхэлсэн тоот текстээр (дахин импортлоход «Б2-084» байр хэвээр олдоно).
        expect(contractListRow({ legacy_unit_number: '084' })['Тоот']).toBe('084');
        expect(contractListRow({ legacy_unit_number: '84' })['Тоот']).toBe(84);
    });
});

describe('customerShortName', () => {
    it('prints «О.Нэр» like the sales team deck, else the full name, never a registration number', () => {
        expect(customerShortName({ customer_first_name: 'Мэндбаяр', customer_last_name: 'Батаа', customer_name: 'Батаа Мэндбаяр УП12345678' })).toBe('Б.Мэндбаяр');
        expect(customerShortName({ customer_first_name: 'Золзаяа', customer_last_name: 'лхагва', customer_name: null })).toBe('Л.Золзаяа');
        expect(customerShortName({ customer_first_name: null, customer_last_name: null, customer_name: 'Монкон ХХК' })).toBe('Монкон ХХК');
        expect(customerShortName({ customer_first_name: 'Ганчимэг', customer_last_name: null, customer_name: null })).toBe('Ганчимэг');
        expect(customerShortName({ customer_first_name: ' ', customer_last_name: null, customer_name: null })).toBeNull();
    });
});
