// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { readSheetRows, readWorkbookSheets } from '@/lib/utils/xlsx';
import { toDateStr } from '@/lib/admin/import/mappers';
import {
    CONTRACT_LIST_COLUMNS, CONTRACT_LIST_MONEY_FORMAT, contractListNames, contractListPricePerSqm, contractListRow, contractUnitNumber, dbFloor,
    hubContractStatus, hubProductType,
} from '@/lib/contracts/list-format';
import { parseContractList, planContractListImport, type ContractListContract, type ContractListUnit } from '@/lib/contracts/list-import';
import type { MemoryDb } from '@/test/memory-db';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb }));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: async () => null, resolvePermissions: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Туршилтын shop' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(),
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET } from '../route';

const contract = (id: string, customer: string): Row => ({ id, shop_id: 'shop-1', deleted_at: null, unit_label: id, contract_status: 'active', customer_name: customer, total_price: 100, paid_amount: 40, balance: 60 });

/** HUB загварын fixture (зохиомол нэр): огноотой, огноогүй, цуцалсан, зогсоолын нэгжийн үнэ, нэр салгаагүй. */
const hubContracts: Row[] = [
    { id: 'h-undated', product_type: 'residential', block_name: 'Б2', floor: '03', unit_number: '17', legacy_unit_number: null, unit_label: 'Б2-17', model: 'C-1', contracted_area: 80, prepayment_condition: '50%', price_per_sqm: 6_500_000, total_price: 520_000_000, prepayment_due: 260_000_000, overdue_amount: null, order_date: null, contract_date: null, contract_status: 'active', customer_name: 'Тулга.Ганаа', customer_first_name: 'Тулга', customer_last_name: 'Ганаа', payment_condition: 'Энгийн' },
    { id: 'h-parking', product_type: 'parking', block_name: 'Б1', floor: 'B1', unit_number: '0', legacy_unit_number: '110', unit_label: 'Б1-110 (B1)', model: null, contracted_area: 13.25, prepayment_condition: '100%', price_per_sqm: null, total_price: 35_000_000, prepayment_due: 35_000_000, overdue_amount: 1_250_000.5, overdue_as_of: '2026-10-22', order_date: '2026-09-12', contract_date: '2026-09-12', contract_status: 'closed', customer_name: 'Сараа.Дорж', customer_first_name: null, customer_last_name: null, payment_condition: 'Тусгай' },
    { id: 'h-flat', product_type: 'residential', block_name: 'Б1', floor: '01', unit_number: '0', legacy_unit_number: '19', unit_label: 'Б1-19 (01)', model: 'A-2', contracted_area: 64.33, prepayment_condition: '10-30%', price_per_sqm: 7_000_000, total_price: 450_310_000, prepayment_due: 135_093_000, overdue_amount: 0, overdue_as_of: '2026-10-22', order_date: '2026-10-05', contract_date: '2026-10-05', contract_status: 'active', customer_name: 'Болд.Батаа', customer_first_name: 'Болд', customer_last_name: 'Батаа', payment_condition: 'Тусгай' },
    { id: 'h-cancelled', product_type: 'industry', block_name: 'Б2', floor: 'B2', unit_number: '5', legacy_unit_number: null, unit_label: 'Б2-5', model: null, contracted_area: 9.5, prepayment_condition: null, price_per_sqm: null, total_price: 14_000_000, prepayment_due: 0, overdue_amount: null, order_date: '2025-12-20', contract_date: '2025-12-20', contract_status: 'cancelled', customer_name: null, customer_first_name: 'Номин', customer_last_name: null, payment_condition: null },
    { id: 'h-transferred', product_type: 'residential', block_name: 'Б1', floor: '02', unit_number: '7', legacy_unit_number: null, unit_label: 'Б1-7', model: 'B', contracted_area: 55.1, prepayment_condition: '30%', price_per_sqm: 7_100_000, total_price: 391_210_000, prepayment_due: 117_363_000, overdue_amount: null, order_date: null, contract_date: null, contract_status: 'transferred', customer_name: 'Ану.Бат', customer_first_name: 'Ану', customer_last_name: 'Бат', payment_condition: 'Энгийн' },
].map((row) => ({ shop_id: 'shop-1', deleted_at: null, ...row }));
const ignored: Row[] = [
    { ...hubContracts[2], id: 'h-deleted', deleted_at: '2026-10-01T00:00:00Z' },
    { ...hubContracts[2], id: 'h-other-shop', shop_id: 'shop-2' },
];

async function exportType(type: string) {
    const response = await GET(new NextRequest(`http://localhost/api/dashboard/export/excel?type=${type}`));
    const buffer = response.status === 200 ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
    return { response, buffer, rows: response.status === 200 ? await readSheetRows(buffer) : [] };
}

beforeEach(() => {
    state.db = createMemoryDb({
        property_contracts: [contract('A-1', 'Дорж Сараа'), contract('A-2', 'Бат'), contract('A-3', 'Тулга Ганбаатар')],
        contract_transfers: [
            { id: 't-1', shop_id: 'shop-1', contract_id: 'A-1', kind: 'transfer', effective_date: '2026-09-01', from_customer_name: 'Бат Болд', created_at: '2026-09-01T02:00:00Z' },
            { id: 't-2', shop_id: 'shop-1', contract_id: 'A-1', kind: 'transfer', effective_date: '2026-10-01', from_customer_name: 'Ганаа', created_at: '2026-10-01T02:00:00Z' },
            { id: 't-3', shop_id: 'shop-1', contract_id: 'A-3', kind: 'rename', effective_date: '2026-10-02', from_customer_name: 'Тулга', created_at: '2026-10-02T02:00:00Z' },
            { id: 't-4', shop_id: 'shop-2', contract_id: 'A-2', kind: 'transfer', effective_date: '2026-10-03', from_customer_name: 'Өөр shop', created_at: '2026-10-03T02:00:00Z' },
        ],
        projects: [{ id: 'p-1', shop_id: 'shop-1', name: 'Elysium Residence' }],
    });
});

describe('contracts Excel export (Дэлгэрэнгүй)', () => {
    it('shows the original buyer and the latest transfer date next to the current holder', async () => {
        const { response, rows } = await exportType('contracts');
        expect(response.status).toBe(200);
        const byCode = Object.fromEntries(rows.map(row => [row['Код'], row]));
        expect(byCode['A-1']).toMatchObject({ 'Худалдан авагч': 'Дорж Сараа', 'Анхны худалдан авагч': 'Бат Болд', 'Шилжүүлсэн огноо': '2026-10-01', 'Төлсөн': 40 });
        // Нэр засвар (ижил хүн) болон өөр shop-ийн түүх шилжүүлэгт тооцогдохгүй.
        expect(byCode['A-2']).toMatchObject({ 'Анхны худалдан авагч': '-', 'Шилжүүлсэн огноо': '-' });
        expect(byCode['A-3']).toMatchObject({ 'Худалдан авагч': 'Тулга Ганбаатар', 'Анхны худалдан авагч': '-', 'Шилжүүлсэн огноо': '-' });
    });

    it('writes an unknown (NULL) paid amount, balance and ₮/m² as an empty cell, never 0, and keeps a real 0', async () => {
        state.db.tables.property_contracts = [
            { ...contract('ERP-1', 'Сараа'), paid_amount: null, balance: null, price_per_sqm: null },
            { ...contract('PAID-0', 'Бат'), paid_amount: 0, balance: 100, price_per_sqm: 0 },
        ];
        const { rows } = await exportType('contracts');
        const byCode = Object.fromEntries(rows.map(row => [row['Код'], row]));
        expect(byCode['ERP-1']).not.toHaveProperty('Төлсөн');
        expect(byCode['ERP-1']).not.toHaveProperty('Үлдэгдэл');
        expect(byCode['ERP-1']).not.toHaveProperty('М.кв үнэ');
        expect(byCode['ERP-1']['Нийт дүн']).toBe(100);
        expect(byCode['PAID-0']).toMatchObject({ 'Төлсөн': 0, 'Үлдэгдэл': 100, 'М.кв үнэ': 0 });
    });

    it('names the file after the project', async () => {
        const { response } = await exportType('contracts');
        expect(decodeURIComponent(response.headers.get('Content-Disposition') ?? '')).toMatch(/Elysium_Residence_гэрээ_дэлгэрэнгүй_\d{4}-\d{2}-\d{2}\.xlsx/);
    });

    it('exports before the history table exists, but surfaces other history read errors', async () => {
        state.db.failNext.contract_transfers = { code: '42P01', message: 'relation "contract_transfers" does not exist' };
        expect((await exportType('contracts')).response.status).toBe(200);
        state.db.failNext.contract_transfers = { code: '57014', message: 'database unavailable' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await exportType('contracts')).response.status).toBe(500);
    });
});

describe('contracts HUB export (16 багана)', () => {
    beforeEach(() => { state.db.tables.property_contracts = [...hubContracts, ...ignored]; });

    it('writes exactly the 16 HUB headers in order with the file\'s formats, widths and bold header', async () => {
        const { response, buffer } = await exportType('contracts_hub');
        expect(response.status).toBe(200);
        expect(decodeURIComponent(response.headers.get('Content-Disposition') ?? '')).toMatch(/filename\*=UTF-8''Elysium_Residence_гэрээ_\d{4}-\d{2}-\d{2}\.xlsx$/);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        const sheet = workbook.worksheets[0];
        const header = (sheet.getRow(1).values as unknown[]).slice(1);
        expect(header).toEqual([...CONTRACT_LIST_COLUMNS]);
        expect(header.every((cell) => typeof cell === 'string' && cell === cell.trim())).toBe(true);
        expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
        expect(sheet.getRow(1).getCell(1).alignment).toMatchObject({ horizontal: 'center', wrapText: true });
        expect(sheet.getColumn(1).width).toBe(13);
        expect(sheet.actualRowCount).toBe(1 + hubContracts.length);

        const col = (name: string) => CONTRACT_LIST_COLUMNS.indexOf(name as typeof CONTRACT_LIST_COLUMNS[number]) + 1;
        const second = sheet.getRow(2);
        expect(second.getCell(col('Нийт дүн')).numFmt).toBe(CONTRACT_LIST_MONEY_FORMAT);
        expect(second.getCell(col('Гэрээлсэн талбай')).numFmt).toBe('#,##0.00');
        expect(second.getCell(col('Захиалга өгсөн огноо')).numFmt).toBe('yyyy-mm-dd');
        expect(second.getCell(col('Захиалга өгсөн огноо')).value).toBeInstanceOf(Date);
    });

    it('sorts by order date (newest first, undated last) and then by unit, keeps cancelled rows and skips deleted or foreign ones', async () => {
        const { rows } = await exportType('contracts_hub');
        expect(rows.map((row) => `${row['Блок']}-${row['Тоот']}`)).toEqual(['Б1-19', 'Б1-110', 'Б2-5', 'Б1-7', 'Б2-17']);
        expect(rows.map((row) => row['Төлөв'])).toEqual(['Гэрээ үүссэн', 'Гэрээ хаасан', 'Цуцлагдсан', 'Тоот шилжсэн', 'Гэрээ үүссэн']);
        expect(rows.map((row) => row['Төрөл'])).toEqual(['Орон сууц', 'Зогсоол', 'Агуулах', 'Орон сууц', 'Орон сууц']);
    });

    it('writes NULL as an empty cell and 0 as 0; ERP unit price under «М.кв үнэ» for parking and storage', async () => {
        const { rows } = await exportType('contracts_hub');
        const [flat, parking, cancelled, , undated] = rows;
        expect(flat['Төлбөр хоцролт']).toBe(0);
        expect(cancelled['Урьдчилгааны дүн']).toBe(0);
        expect(cancelled).not.toHaveProperty('Төлбөр хоцролт');
        expect(undated).not.toHaveProperty('Захиалга өгсөн огноо');
        expect(cancelled).not.toHaveProperty('Захиалгын нөхцөл');
        // Зогсоол, агуулахад ₮/м² хоосон бол ERP шиг нэгжийн үнэ (= нийт дүн).
        expect(parking['М.кв үнэ']).toBe(35_000_000);
        expect(cancelled['М.кв үнэ']).toBe(14_000_000);
        expect(parking['Давхар']).toBe('B1');
        expect(flat['Давхар']).toBe('1');
        expect(flat['Тоот']).toBe(19);
    });

    it('writes the stored order day on a UTC (Vercel) or western server too, never the day before', async () => {
        const original = process.env.TZ;
        try {
            for (const tz of ['UTC', 'America/New_York', 'Asia/Ulaanbaatar']) {
                process.env.TZ = tz;
                const { buffer } = await exportType('contracts_hub');
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
                const sheet = workbook.worksheets[0];
                const col = CONTRACT_LIST_COLUMNS.indexOf('Захиалга өгсөн огноо') + 1;
                // exceljs огнооны серийг UTC шөнө дундаар уншина — тэр өдөр нь хадгалсан DATE-тэй ижил байх ёстой.
                const days = [2, 3, 4].map((r) => (sheet.getRow(r).getCell(col).value as Date).toISOString().slice(0, 10));
                expect(days, tz).toEqual(['2026-10-05', '2026-09-12', '2025-12-20']);
            }
        } finally {
            if (original === undefined) delete process.env.TZ;
            else process.env.TZ = original;
        }
    });

    it('still writes the header row for a project without contracts', async () => {
        state.db.tables.property_contracts = [];
        const { buffer } = await exportType('contracts_hub');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        expect((workbook.worksheets[0].getRow(1).values as unknown[]).slice(1)).toEqual([...CONTRACT_LIST_COLUMNS]);
        expect(workbook.worksheets[0].actualRowCount).toBe(1);
    });

    it('round-trips: every exported cell reads back to the stored contract through the HUB vocabulary', async () => {
        const { rows } = await exportType('contracts_hub');
        const byUnit = new Map(hubContracts.map((c) => [`${c.block_name}-${contractUnitNumber(c)}`, c]));
        expect(rows).toHaveLength(hubContracts.length);
        const amount = (value: unknown) => (value === undefined ? null : Number(value));
        for (const row of rows) {
            const c = byUnit.get(`${row['Блок']}-${row['Тоот']}`)!;
            const expected = contractListRow(c);
            const names = contractListNames(c);
            expect(hubProductType(row['Төрөл'] as string)).toBe(c.product_type);
            expect(row['Блок']).toBe(c.block_name);
            expect(String(row['Тоот'])).toBe(contractUnitNumber(c));
            expect(dbFloor(row['Давхар'])).toBe(c.floor);
            expect(row['Загвар'] ?? null).toBe(c.model);
            expect(amount(row['Гэрээлсэн талбай'])).toBe(c.contracted_area);
            expect(row['Урьдчилгааны нөхцөл'] ?? null).toBe(c.prepayment_condition);
            expect(amount(row['М.кв үнэ'])).toBe(contractListPricePerSqm(c));
            expect(amount(row['Нийт дүн'])).toBe(c.total_price);
            expect(amount(row['Урьдчилгааны дүн'])).toBe(c.prepayment_due);
            expect(amount(row['Төлбөр хоцролт'])).toBe(c.overdue_amount);
            expect(row['Захиалга өгсөн огноо'] === undefined ? null : toDateStr(row['Захиалга өгсөн огноо'])).toBe(c.order_date ?? c.contract_date);
            expect(hubContractStatus(row['Төлөв'] as string)).toBe(c.contract_status);
            expect(row['Нэр'] ?? null).toBe(names.first);
            expect(row['Овог'] ?? null).toBe(names.last);
            expect(row['Захиалгын нөхцөл'] ?? null).toBe(c.payment_condition);
            // Экспортын мөр нь list-format-ийн мөртэй нүд бүрээр ижил.
            for (const column of CONTRACT_LIST_COLUMNS) {
                const written = expected[column];
                const read = row[column];
                if (written === null) expect(read).toBeUndefined();
                else if (written instanceof Date) expect(toDateStr(read)).toBe(toDateStr(written));
                else expect(read).toBe(written);
            }
        }
    });
});

describe('HUB export → import round trip', () => {
    // Сүүлийн импортын дараах төслийн байдал (зохиомол нэр): огноо order_date = contract_date, хоцролт файлын огноогоор.
    const REPORT_DATE = '2026-10-22';
    const units: ContractListUnit[] = [
        { code: 'Б1-16', category: 'residential', block: 'Б1', floor: '05', model: 'B', unit_number: '0', legacy_unit_number: '16', status: 'sold' },
        { code: 'Б2-231', category: 'residential', block: 'Б2', floor: '22', model: 'A', unit_number: '231', legacy_unit_number: null, status: 'sold' },
        { code: 'Б1-19 (B1)', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '19', legacy_unit_number: '19', status: 'sold' },
        { code: 'Б1-19 (01)', category: 'parking', block: 'Б1', floor: '01', model: 'P', unit_number: '19', legacy_unit_number: '19', status: 'sold' },
        { code: 'Б1-46 (H-1)', category: 'industry', block: 'Б1', floor: '01', model: 'H-1', unit_number: '46', legacy_unit_number: '46', status: 'sold' },
        { code: 'Б1-46 (H-2)', category: 'industry', block: 'Б1', floor: '01', model: 'H-2', unit_number: '46', legacy_unit_number: '46', status: 'available' },
        { code: 'Б2-152', category: 'residential', block: 'Б2', floor: '10', model: 'E', unit_number: '0', legacy_unit_number: '152', status: 'sold' },
        { code: 'Б2-084', category: 'residential', block: 'Б2', floor: '03', model: 'C', unit_number: '0', legacy_unit_number: '084', status: 'sold' },
    ];
    type Fixture = ContractListContract & { floor: string | null; model: string | null };
    const onUnit = (n: number, code: string, overrides: Partial<Fixture>): Fixture => {
        const unit = units.find((u) => u.code === code)!;
        return {
            id: `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`, product_type: unit.category, unit_label: unit.code, block_name: unit.block,
            floor: unit.floor, model: unit.model, unit_number: unit.unit_number === '0' ? null : unit.unit_number, legacy_unit_number: unit.legacy_unit_number,
            contract_status: 'active', order_date: null, contract_date: null, total_price: null, price_per_sqm: null, contracted_area: null,
            prepayment_condition: null, prepayment_due: null, payment_condition: null, overdue_amount: null, overdue_as_of: REPORT_DATE,
            customer_name: null, customer_first_name: null, customer_last_name: null, contract_number: null, sales_manager: null, paid_amount: null,
            ...overrides,
        };
    };
    const dated = (day: string) => ({ order_date: day, contract_date: day });
    // PostgREST numeric-ийг текстээр буцаадаг тул зарим дүнг '…00' хэлбэрээр.
    const contracts: Fixture[] = [
        onUnit(1, 'Б1-16', { ...dated('2026-10-05'), contracted_area: '58.00', price_per_sqm: '7800000.00', total_price: '452400000.00', prepayment_condition: '30%',
            prepayment_due: '135720000.00', payment_condition: 'Тусгай', overdue_amount: '20010000.00', customer_name: 'Болд.Батаа', customer_first_name: 'Болд',
            customer_last_name: 'Батаа', contract_number: 'EL-001', sales_manager: 'Менежер А' }),
        // Хаасан; нэр салгаагүй (зөвхөн customer_name); хуучин/шинэ тоотгүй — «Тоот» кодоос; ₮/м² хоосон; урьдчилгаа 0; төлсөн дүн мэдэгдэнэ.
        onUnit(2, 'Б2-231', { ...dated('2026-09-12'), unit_number: null, contract_status: 'closed', contracted_area: 64.33, total_price: 501774000, prepayment_due: 0,
            overdue_amount: '0.00', customer_name: 'Сараа.Дорж', paid_amount: '501774000.00' }),
        // Зогсоол «(B1)»: ₮/м² NULL → экспортод нэгжийн үнэ, импорт 1%-ийн дүрмээр буцааж бичихгүй.
        onUnit(3, 'Б1-19 (B1)', { ...dated('2026-08-01'), contracted_area: 13.25, total_price: 35000000, prepayment_condition: '100%', prepayment_due: 35000000,
            customer_name: 'Ану.Бат', customer_first_name: 'Ану', customer_last_name: 'Бат' }),
        // Зогсоол «(01)»: ижил «Тоот», өөр давхар; ₮/м² хадгалсан.
        onUnit(4, 'Б1-19 (01)', { ...dated('2026-09-03'), contracted_area: 12.5, price_per_sqm: 6376000, total_price: 79700000, prepayment_condition: '100%',
            prepayment_due: 79700000, payment_condition: 'Энгийн', overdue_amount: 0, customer_name: 'Тэмүүлэн.Болд', customer_first_name: 'Тэмүүлэн', customer_last_name: 'Болд' }),
        // Агуулах: ижил давхарт хоёр «(H-…)» байр — загвараар; 2025 оны захиалга.
        onUnit(5, 'Б1-46 (H-1)', { ...dated('2025-12-20'), contracted_area: 9.5, total_price: 14000000, prepayment_condition: '50%', prepayment_due: 7000000,
            customer_name: 'Номин.Гэрэл', customer_first_name: 'Номин', customer_last_name: 'Гэрэл' }),
        // Цуцлагдаж дахин зарагдсан байр: цуцалсан гэрээ + шинэ идэвхтэй гэрээ.
        onUnit(6, 'Б2-152', { ...dated('2026-07-29'), contract_status: 'cancelled', contracted_area: 70.2, price_per_sqm: 7000000, total_price: 491400000,
            prepayment_condition: '30%', prepayment_due: 147420000, customer_name: 'Нараа.Бат', customer_first_name: 'Нараа', customer_last_name: 'Бат' }),
        onUnit(7, 'Б2-152', { ...dated('2026-09-15'), contracted_area: 70.2, price_per_sqm: 7100000, total_price: 498420000, prepayment_condition: '30%',
            prepayment_due: 149526000, payment_condition: 'Энгийн', overdue_amount: 1250000.5, customer_name: 'Тулга.Ганаа', customer_first_name: 'Тулга',
            customer_last_name: 'Ганаа' }),
        // Тэгээр эхэлсэн тоот («084») экспортод текстээр үлдэх ёстой, эс бөгөөс «Б2-84» болж байр олдохгүй.
        onUnit(8, 'Б2-084', { ...dated('2026-10-10'), contracted_area: 45, price_per_sqm: 8000000, total_price: 360000000, prepayment_condition: '20%',
            prepayment_due: 72000000, customer_name: 'Оюун.Дулам', customer_first_name: 'Оюун', customer_last_name: 'Дулам' }),
    ];

    beforeEach(() => {
        state.db.tables.property_contracts = contracts.map((c) => ({ shop_id: 'shop-1', deleted_at: null, ...c }));
    });

    it('re-imports its own HUB export with zero inserts, updates, review items or blocking conflicts (UB and UTC servers)', async () => {
        const original = process.env.TZ;
        try {
            for (const tz of ['Asia/Ulaanbaatar', 'UTC']) {
                process.env.TZ = tz;
                const { response, buffer } = await exportType('contracts_hub');
                expect(response.status, tz).toBe(200);

                const parsed = parseContractList(await readWorkbookSheets(buffer), { reportDate: REPORT_DATE });
                expect(parsed.errors, tz).toEqual([]);
                expect(parsed.skipped, tz).toEqual([]);
                expect(parsed.ignoredColumns, tz).toEqual([]);
                expect(parsed.rows, tz).toHaveLength(contracts.length);

                const plan = planContractListImport({
                    rows: parsed.rows, units, contracts, transferredIds: new Set(), paymentContractIds: new Set([contracts[1].id]),
                    latestImportDate: REPORT_DATE, reportDate: REPORT_DATE, fileName: 'Elysium_Residence_гэрээ.xlsx', today: REPORT_DATE,
                });
                expect(plan.errors, tz).toEqual([]);
                expect(plan.ops, tz).toEqual([]);
                expect(plan.counts, tz).toEqual({ insert: 0, insertCancelled: 0, update: 0, unchanged: contracts.length, review: 0, blocking: 0, missing: 0 });
                expect(plan.review, tz).toEqual([]);
                expect(plan.blocking, tz).toEqual([]);
                expect(plan.inserts, tz).toEqual([]);
                expect(plan.updates, tz).toEqual([]);
                expect(plan.info, tz).toEqual([]);
                expect(plan.missing, tz).toEqual([]);
                expect(plan.unitStatusMismatches, tz).toEqual([]);
                expect(plan.olderThanLatest, tz).toBeNull();
                expect(plan.units, tz).toEqual({ distinct: contracts.length - 1, resold: 1 });
            }
        } finally {
            if (original === undefined) delete process.env.TZ;
            else process.env.TZ = original;
        }
    });
});
