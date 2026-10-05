import { describe, expect, it } from 'vitest';
import { contractsFromErpProducts, type ErpProductContractContext } from '../product-contracts';

const context: ErpProductContractContext = {
    shopId: '10000000-0000-4000-8000-000000000001',
    projectId: '20000000-0000-4000-8000-000000000002',
    projectName: 'Elysium Residence', sourceFile: 'Elysium ERP.xlsx', reportDate: '2026-09-26',
};
const apartment = {
    'Код': 'Б1-16', 'Давхар': '05', 'Загвар': 'E3', 'Шинэ тоот': '0', 'Хуучин Тоот': '16', 'Өрөөний тоо': '3',
    'Бүтээгдэхүүний төрөл': 'Орон сууц', 'Бүтээгдэхүүний төлөв': 'Гэрээ баталгаажсан', 'Захиалгын төлөв': 'confirm',
    'Захиалагч': 'Энхтуяа.Цэвээн ХА62122706', 'Борлуулалтын менежер': 'Ариунбилэг.Нямхүү', 'Борлуулалтын суваг': 'Пропертис',
    'Борлуулах талбай': '80.91', 'Гэрээлсэн талбай': '80.91', 'Борлуулалтын үнэ 1мкв': '5432000',
    'Нийт борлуулах үнэ': '439503120.0000001', 'Урьдчилгааны нөхцөл': '50%', 'Төлөх урьдчилгаа төлбөр': '219751560',
    'Үлдэгдэл төлбөр': '219751560',
};
const parking = {
    ...apartment, 'Код': 'Б1-19', 'Давхар': 'B1', 'Загвар': 'A-2', 'Бүтээгдэхүүний төрөл': 'Зогсоол', 'Захиалгын төлөв': 'closed',
    'Бүтээгдэхүүний төлөв': 'Хүлээлгэсэн', 'Гэрээлсэн талбай': '12.5', 'Борлуулалтын үнэ 1мкв': '79700000', 'Нийт борлуулах үнэ': '79700000',
};

describe('contractsFromErpProducts', () => {
    it('turns contracted units into contracts without inventing number, date or paid amount', () => {
        const result = contractsFromErpProducts([apartment, { ...apartment, 'Код': 'Б1-17', 'Бүтээгдэхүүний төлөв': 'Худалдаанд', 'Захиалагч': '' }], context);
        expect(result.errors).toEqual([]);
        expect(result.contracts).toEqual([expect.objectContaining({
            shop_id: context.shopId, project_id: context.projectId, product_type: 'residential', block_name: 'Б1',
            floor: '05', unit_label: 'Б1-16', unit_number: null, legacy_unit_number: '16', rooms: 3,
            contracted_area: 80.91, price_per_sqm: 5432000, total_price: 439503120, prepayment_condition: '50%',
            prepayment_due: 219751560, sales_channel: 'Пропертис', sales_manager: 'Ариунбилэг.Нямхүү',
            customer_name: 'Энхтуяа.Цэвээн', customer_registration: 'ХА62122706', contract_status: 'active',
            paid_amount: null, balance: null,
        })]);
        expect(result.contracts[0]).not.toHaveProperty('contract_number');
        expect(result.contracts[0]).not.toHaveProperty('contract_date');
        expect(result.contracts[0].notes).toContain('Elysium ERP.xlsx');
    });

    it('matches the unit code of the inventory import and drops a per-m² price that is really the unit price', () => {
        const result = contractsFromErpProducts([parking, { ...parking, 'Давхар': '01', 'Загвар': 'A-1', 'Бүтээгдэхүүний төлөв': 'Худалдаанд', 'Захиалагч': '' }], context);
        expect(result.errors).toEqual([]);
        expect(result.contracts).toHaveLength(1);
        expect(result.contracts[0]).toMatchObject({ unit_label: 'Б1-19 (B1)', product_type: 'parking', price_per_sqm: null, total_price: 79700000, contract_status: 'closed' });
    });

    it.each(['Захиалга үүссэн', 'Хадгалсан', 'Худалдаанд'])('does not treat «%s» as a contract', status => {
        expect(contractsFromErpProducts([{ ...apartment, 'Бүтээгдэхүүний төлөв': status }], context).contracts).toEqual([]);
    });

    it('fails the whole file when a contracted unit has no customer or the inventory rows are invalid', () => {
        const noCustomer = contractsFromErpProducts([apartment, { ...apartment, 'Код': 'Б1-17', 'Захиалагч': ' ХА62122706' }], context);
        expect(noCustomer.contracts).toEqual([]);
        expect(noCustomer.errors).toEqual(['Мөр 3: Б1-17 «Гэрээ баталгаажсан» төлөвтэй боловч захиалагчийн нэр хоосон']);
        const badUnit = contractsFromErpProducts([apartment, { ...apartment, 'Бүтээгдэхүүний төлөв': 'Тодорхойгүй' }], context);
        expect(badUnit.contracts).toEqual([]);
        expect(badUnit.errors).toHaveLength(1);
    });
});
