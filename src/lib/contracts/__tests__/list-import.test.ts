import { describe, expect, it } from 'vitest';
import { buildWorkbookBuffer, readWorkbookSheets } from '@/lib/utils/xlsx';
import { CONTRACT_LIST_COLUMNS, CONTRACT_LIST_NUMFMT, contractListRow } from '../list-format';
import {
    canonicalJson, isContractListSheet, parseContractList, planContractListImport, resolveContractUnit, summarizeFileTotals,
    type ContractListContract, type ContractListOp, type ContractListPlanInput, type ContractListUnit, type HubRow,
} from '../list-import';

// Бодит файлын хэлбэр (толгойн дагах зай, « Орон сууц», тоон Тоот, хөвөгч үлдэгдэл), нэр нь зохиомол.
const HEADERS = ['Төрөл', 'Блок', 'Тоот', 'Давхар', 'Загвар', 'Гэрээлсэн талбай', 'Урьдчилгааны нөхцөл', 'М.кв үнэ', 'Нийт дүн',
    'Урьдчилгааны дүн', 'Төлбөр хоцролт', 'Захиалга өгсөн огноо', 'Төлөв', 'Нэр ', 'Овог ', 'Захиалгын нөхцөл'];
type Cells = Partial<Record<string, unknown>>;
const fileRow = (cells: Cells = {}) => ({
    'Төрөл': ' Орон сууц', 'Блок': 'Б2', 'Тоот': 231, 'Давхар': '22', 'Загвар': 'A', 'Гэрээлсэн талбай': 58, 'Урьдчилгааны нөхцөл': '10-30%',
    'М.кв үнэ': 7800000, 'Нийт дүн': 452400000, 'Урьдчилгааны дүн': 135720000, 'Төлбөр хоцролт': 0, 'Захиалга өгсөн огноо': new Date(2026, 9, 15),
    'Төлөв': 'Гэрээ үүссэн', 'Нэр ': 'Тэмүүлэн', 'Овог ': 'Болд', 'Захиалгын нөхцөл': 'Энгийн', ...cells,
});
const sheet = (rows: Cells[], columns = HEADERS, name = 'Sheet1') => ({ name, columns, rows });

const SHOP_UNITS: ContractListUnit[] = [
    { code: 'Б2-231', category: 'residential', block: 'Б2', floor: '22', model: 'A', unit_number: '0', legacy_unit_number: '231', status: 'available' },
    { code: 'Б1-16', category: 'residential', block: 'Б1', floor: '05', model: 'B', unit_number: '0', legacy_unit_number: '16', status: 'sold' },
    { code: 'Б1-10 (01)', category: 'parking', block: 'Б1', floor: '01', model: 'P', unit_number: '10', legacy_unit_number: '10', status: 'sold' },
    { code: 'Б1-10 (B1)', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '10', legacy_unit_number: '10', status: 'sold' },
    { code: 'Б1-17 (01)', category: 'parking', block: 'Б1', floor: '01', model: 'P', unit_number: '17', legacy_unit_number: '17', status: 'sold' },
    { code: 'Б1-17 (B1)', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '17', legacy_unit_number: '17', status: 'available' },
    { code: 'Б1-46 (H-1)', category: 'industry', block: 'Б1', floor: '01', model: 'H-1', unit_number: '46', legacy_unit_number: '46', status: 'sold' },
    { code: 'Б1-46 (H-2)', category: 'industry', block: 'Б1', floor: '01', model: 'H-2', unit_number: '46', legacy_unit_number: '46', status: 'available' },
    { code: 'Б1-110', category: 'residential', block: 'Б1', floor: '12', model: 'C', unit_number: '0', legacy_unit_number: '110', status: 'sold' },
    { code: 'Б1-110', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '110', legacy_unit_number: '110', status: 'ordered' },
    { code: 'Б2-152', category: 'residential', block: 'Б2', floor: '10', model: 'E', unit_number: '0', legacy_unit_number: '152', status: 'sold' },
    { code: 'Б1-31', category: 'residential', block: 'Б1', floor: '03', model: 'A', unit_number: '0', legacy_unit_number: '31', status: 'handed_over' },
];

const hub = (overrides: Partial<HubRow> = {}): HubRow => ({
    row: 2, productType: 'residential', block: 'Б1', unitNumber: '16', floor: '05', model: 'B', area: 58, prepaymentCondition: '30%',
    pricePerSqm: 7800000, total: 452400000, prepaymentDue: 135720000, overdue: 0, orderDate: '2026-10-15', status: 'active',
    firstName: 'Тэмүүлэн', lastName: 'Болд', paymentCondition: 'Энгийн', contractNumber: null, salesManager: null, paidTotal: null, ...overrides,
});
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const contract = (n: number, overrides: Partial<ContractListContract> = {}): ContractListContract => ({
    id: id(n), product_type: 'residential', unit_label: 'Б1-16', block_name: 'Б1', unit_number: null, legacy_unit_number: '16',
    contract_status: 'active', order_date: null, contract_date: null, total_price: 452400000, price_per_sqm: 7800000, contracted_area: 58,
    prepayment_condition: '30%', prepayment_due: 135720000, payment_condition: null, overdue_amount: null, overdue_as_of: null,
    customer_name: 'Тэмүүлэн.Болд', customer_first_name: null, customer_last_name: null, contract_number: null, sales_manager: null,
    paid_amount: null, ...overrides,
});
const plan = (input: Partial<ContractListPlanInput>) => planContractListImport({
    rows: [], units: SHOP_UNITS, contracts: [], transferredIds: new Set(), paymentContractIds: new Set(), latestImportDate: null,
    reportDate: '2026-10-22', fileName: 'HUB data.xlsx', today: '2026-10-22', ...input,
});
const updateOf = (ops: ContractListOp[], contractId: string) => ops.find(op => op.op === 'update' && op.id === contractId) as Extract<ContractListOp, { op: 'update' }> | undefined;
const inserts = (ops: ContractListOp[]) => ops.filter((op): op is Extract<ContractListOp, { op: 'insert' }> => op.op === 'insert');

/** RPC-ийн бичихийг санах ойд дуурайна — дахин төлөвлөхөд өөрчлөлт 0 байх ёстой. */
function applyOps(contracts: ContractListContract[], ops: ContractListOp[]): ContractListContract[] {
    const next = new Map(contracts.map(row => [row.id, { ...row }]));
    let n = 900;
    for (const op of ops) {
        if (op.op === 'update') Object.assign(next.get(op.id)!, op.set);
        else next.set(id(++n), { ...contract(n, { customer_name: null, prepayment_condition: null, prepayment_due: null, price_per_sqm: null, contracted_area: null, unit_number: null, legacy_unit_number: null }), ...op.fields } as ContractListContract);
    }
    return [...next.values()];
}

const UPDATE_COLUMNS = ['order_date', 'contract_date', 'payment_condition', 'prepayment_condition', 'prepayment_due', 'total_price', 'price_per_sqm',
    'contracted_area', 'overdue_amount', 'overdue_as_of', 'contract_status', 'customer_first_name', 'customer_last_name', 'contract_number', 'sales_manager'];
const INSERT_COLUMNS = ['product_type', 'block_name', 'floor', 'unit_number', 'legacy_unit_number', 'model', 'unit_label', 'contracted_area', 'price_per_sqm',
    'total_price', 'prepayment_condition', 'prepayment_due', 'payment_condition', 'order_date', 'contract_date', 'contract_status', 'customer_name',
    'customer_first_name', 'customer_last_name', 'overdue_amount', 'overdue_as_of', 'contract_number', 'sales_manager', 'notes'];

describe('parseContractList', () => {
    it('reads the owner file shape: trailing-space headers, padded floors, numeric Тоот, local dates and float residue', () => {
        const parsed = parseContractList([sheet([
            fileRow(),
            fileRow({ 'Төрөл': 'Зогсоол', 'Блок': 'Б1', 'Тоот': 17, 'Давхар': 'B1', 'Загвар': 'P', 'Гэрээлсэн талбай': 12.499999999999998,
                'М.кв үнэ': 86600000, 'Нийт дүн': 94999999.99999999, 'Урьдчилгааны дүн': 403415999.9999999, 'Төлбөр хоцролт': -1.490116e-8,
                'Захиалга өгсөн огноо': '2026-09-03', 'Төлөв': 'Гэрээ хаасан', 'Овог ': '', 'Захиалгын нөхцөл': 'Тусгай' }),
            fileRow({ 'Давхар': '1', 'Тоот': '084', 'Нийт дүн': '452,400,000', 'Төлбөр хоцролт': '', 'Урьдчилгааны дүн': ' - ', 'Төлөв': 'цуцлагдсан' }),
        ])], { reportDate: '2026-10-22' });
        expect(parsed.errors).toEqual([]);
        expect(parsed.found).toBe(true);
        expect(parsed.sheetName).toBe('Sheet1');
        expect(parsed.rows[0]).toEqual({
            row: 2, productType: 'residential', block: 'Б2', unitNumber: '231', floor: '22', model: 'A', area: 58, prepaymentCondition: '10-30%',
            pricePerSqm: 7800000, total: 452400000, prepaymentDue: 135720000, overdue: 0, orderDate: '2026-10-15', status: 'active',
            firstName: 'Тэмүүлэн', lastName: 'Болд', paymentCondition: 'Энгийн', contractNumber: null, salesManager: null, paidTotal: null,
        });
        expect(parsed.rows[1]).toMatchObject({ row: 3, productType: 'parking', unitNumber: '17', floor: 'B1', area: 12.5, total: 95000000,
            prepaymentDue: 403416000, overdue: 0, orderDate: '2026-09-03', status: 'closed', lastName: null });
        expect(parsed.rows[2]).toMatchObject({ floor: '01', unitNumber: '084', total: 452400000, overdue: null, prepaymentDue: 0, status: 'cancelled' });
        expect(parsed.ignoredColumns).toEqual([]);
        expect(parsed.extraColumns).toEqual([]);
    });

    it('fails the whole file listing every row error with its row number', () => {
        const parsed = parseContractList([sheet([
            fileRow(),
            fileRow({ 'Төлөв': 'Гэрээ баталгаажсан' }),
            fileRow({ 'Нийт дүн': 0, 'Төлбөр хоцролт': -5 }),
            fileRow({ 'Төрөл': 'Оффис', 'Захиалга өгсөн огноо': '15/40/2026' }),
            fileRow({ 'Захиалга өгсөн огноо': '2026-10-25', 'М.кв үнэ': 'гурав' }),
            fileRow({ 'Тоот': '' }),
        ])], { reportDate: '2026-10-22' });
        expect(parsed.rows).toEqual([]);
        expect(parsed.errors).toEqual([
            'Мөр 3: «Гэрээ баталгаажсан» төлөв танигдсангүй (Гэрээ үүссэн / Гэрээ хаасан / Цуцлагдсан)',
            'Мөр 4: «Нийт дүн» хоосон эсвэл 0',
            'Мөр 4: «Төлбөр хоцролт» сөрөг байж болохгүй',
            'Мөр 5: «Оффис» төрөл танигдсангүй',
            'Мөр 5: «Захиалга өгсөн огноо» буруу (15/40/2026)',
            'Мөр 6: «М.кв үнэ» тоо биш байна',
            'Мөр 6: захиалгын огноо 2026-10-25 файлын огнооноос (2026-10-22) хойш байна',
            'Мөр 7: «Тоот» хоосон',
        ]);
    });

    it('skips «Тоот шилжсэн», undated and unit-less (total) rows with a reason; recognises extra and ignored columns', () => {
        const columns = [...HEADERS, 'Гэрээний дугаар', 'Борлуулалтын менежер', 'Нийт төлсөн дүн', 'Банкны төлөв'];
        const parsed = parseContractList([sheet([
            fileRow({ 'Гэрээний дугаар': 'EL-001', 'Борлуулалтын менежер': 'Менежер Нэг', 'Нийт төлсөн дүн': 135720000, 'Банкны төлөв': 'Ок' }),
            fileRow({ 'Төлөв': 'Тоот шилжсэн' }),
            fileRow({ 'Захиалга өгсөн огноо': '' }),
            { 'Нийт дүн': 900000000 },
        ], columns)]);
        expect(parsed.errors).toEqual([]);
        expect(parsed.rows).toHaveLength(1);
        expect(parsed.rows[0]).toMatchObject({ contractNumber: 'EL-001', salesManager: 'Менежер Нэг', paidTotal: 135720000 });
        expect(parsed.skipped).toEqual([
            { row: 3, reason: 'Тоот шилжсэн — импортлохгүй' },
            { row: 4, reason: 'Захиалга өгсөн огноо хоосон — импортлохгүй (гэрээ хэвээр)' },
            { row: 5, reason: 'Байрны мэдээлэлгүй мөр (нийлбэр эсвэл хоосон) — алгассан' },
        ]);
        expect(parsed.extraColumns).toEqual(['Гэрээний дугаар', 'Борлуулалтын менежер', 'Нийт төлсөн дүн']);
        expect(parsed.ignoredColumns).toEqual(['Банкны төлөв']);
    });

    it('finds the HUB sheet among others and explains which columns are missing otherwise', () => {
        expect(isContractListSheet(HEADERS)).toBe(true);
        expect(isContractListSheet(HEADERS.slice(1))).toBe(false);
        const picked = parseContractList([sheet([{ Код: 'Б1-1' }], ['Код', 'Төрөл'], 'Products'), sheet([fileRow()], HEADERS, 'HUB')]);
        expect(picked.sheetName).toBe('HUB');
        const missing = parseContractList([sheet([{}], HEADERS.filter(h => h !== 'Төлөв' && h !== 'Овог '))]);
        expect(missing).toMatchObject({ found: false, rows: [] });
        expect(missing.errors).toEqual(['Файлд HUB загварын 16 баганатай sheet олдсонгүй. Дутуу багана: Төлөв, Овог']);
    });

    it('reads a real .xlsx written by the export helpers (Date cells, number formats)', async () => {
        const buffer = await buildWorkbookBuffer([{ name: 'Sheet1', columns: [...CONTRACT_LIST_COLUMNS], numFmts: CONTRACT_LIST_NUMFMT, headerStyle: 'bold',
            rows: [contractListRow({ ...contract(1), order_date: '2026-09-15', overdue_amount: 20010000 })] }]);
        const parsed = parseContractList(await readWorkbookSheets(buffer));
        expect(parsed.errors).toEqual([]);
        expect(parsed.rows[0]).toMatchObject({ unitNumber: '16', orderDate: '2026-09-15', total: 452400000, overdue: 20010000, firstName: 'Тэмүүлэн.Болд', lastName: null });
    });
});

describe('resolveContractUnit', () => {
    it('matches the code exactly, else the «(…)» suffix by floor, then by model; category separates parking from flats', () => {
        expect(resolveContractUnit(hub(), SHOP_UNITS)).toEqual({ unit: SHOP_UNITS[1] });
        expect(resolveContractUnit(hub({ productType: 'parking', unitNumber: '10', floor: 'B1' }), SHOP_UNITS)).toMatchObject({ unit: { code: 'Б1-10 (B1)' } });
        expect(resolveContractUnit(hub({ productType: 'parking', unitNumber: '10', floor: '01' }), SHOP_UNITS)).toMatchObject({ unit: { code: 'Б1-10 (01)' } });
        expect(resolveContractUnit(hub({ productType: 'industry', unitNumber: '46', floor: '01', model: 'H-2' }), SHOP_UNITS)).toMatchObject({ unit: { code: 'Б1-46 (H-2)' } });
        expect(resolveContractUnit(hub({ unitNumber: '110', floor: '12' }), SHOP_UNITS)).toMatchObject({ unit: { code: 'Б1-110', category: 'residential' } });
        expect(resolveContractUnit(hub({ productType: 'parking', unitNumber: '110', floor: 'B1' }), SHOP_UNITS)).toMatchObject({ unit: { code: 'Б1-110', category: 'parking' } });
    });

    it('returns a row error when nothing or several units match', () => {
        expect(resolveContractUnit(hub({ row: 9, unitNumber: '999' }), SHOP_UNITS)).toEqual({ error: 'Мөр 9: Орон сууц Б1-999 байр олдсонгүй' });
        expect(resolveContractUnit(hub({ row: 10, productType: 'parking', unitNumber: '10', floor: '02' }), SHOP_UNITS))
            .toEqual({ error: 'Мөр 10: Зогсоол Б1-10 — давхар/загвараар нэг байр тодорхойгүй (Б1-10 (01), Б1-10 (B1))' });
        expect(resolveContractUnit(hub({ row: 11, productType: 'industry', unitNumber: '46', floor: '01', model: 'H-9' }), SHOP_UNITS))
            .toMatchObject({ error: expect.stringContaining('Мөр 11: Агуулах Б1-46') });
    });
});

describe('planContractListImport', () => {
    it('fills dates, names, overdue and conditions on a matched undated contract (auto) and is idempotent after commit', () => {
        const contracts = [contract(1)];
        const rows = [hub({ overdue: 20010000 })];
        const result = plan({ rows, contracts });
        expect(result.errors).toEqual([]);
        expect(result.counts).toEqual({ insert: 0, insertCancelled: 0, update: 1, unchanged: 0, review: 0, blocking: 0, missing: 0 });
        expect(result.ops).toEqual([{ op: 'update', id: id(1), label: 'Б1-16', review: false,
            set: { order_date: '2026-10-15', contract_date: '2026-10-15', payment_condition: 'Энгийн', overdue_amount: 20010000, overdue_as_of: '2026-10-22',
                customer_first_name: 'Тэмүүлэн', customer_last_name: 'Болд' },
            expect: { order_date: null, contract_date: null, payment_condition: null, overdue_amount: null, overdue_as_of: null,
                customer_first_name: null, customer_last_name: null, customer_name: 'Тэмүүлэн.Болд' } }]);
        expect(result.updates.map(group => [group.field, group.count])).toEqual([
            ['order_date', 1], ['contract_date', 1], ['payment_condition', 1], ['overdue_amount', 1], ['overdue_as_of', 1], ['customer_first_name', 1], ['customer_last_name', 1],
        ]);
        const again = plan({ rows, contracts: applyOps(contracts, result.ops), latestImportDate: '2026-10-22' });
        expect(again.ops).toEqual([]);
        expect(again.counts).toMatchObject({ update: 0, unchanged: 1 });
    });

    it('row 23/45 style: a unit cancelled and resold updates the live contract and records the cancellation as a new cancelled contract', () => {
        const contracts = [contract(1, { product_type: 'parking', unit_label: 'Б1-17 (01)', legacy_unit_number: '17', unit_number: '17', total_price: 79700000, price_per_sqm: null, contracted_area: 12.5, prepayment_condition: '100%', prepayment_due: 79700000 })];
        const rows = [
            hub({ row: 23, productType: 'parking', unitNumber: '17', floor: '01', model: 'P', area: 12.5, pricePerSqm: 79700000, total: 79700000, prepaymentCondition: '100%', prepaymentDue: 79700000, orderDate: '2026-09-03' }),
            hub({ row: 45, productType: 'parking', unitNumber: '17', floor: '01', model: 'P', area: 12.5, pricePerSqm: 79700000, total: 79700000, prepaymentCondition: '100%', prepaymentDue: 79700000, orderDate: '2026-07-29', status: 'cancelled' }),
        ];
        const result = plan({ rows, contracts });
        expect(result.counts).toMatchObject({ insert: 0, insertCancelled: 1, update: 1, review: 0, blocking: 0, missing: 0 });
        expect(updateOf(result.ops, id(1))?.set).toMatchObject({ order_date: '2026-09-03', contract_date: '2026-09-03' });
        // Зогсоолын «М.кв үнэ» = нэгжийн үнэ: 1%-ийн дүрмээр хадгалахгүй.
        expect(updateOf(result.ops, id(1))?.set).not.toHaveProperty('price_per_sqm');
        const [cancelled] = inserts(result.ops);
        expect(cancelled.fields).toMatchObject({ product_type: 'parking', unit_label: 'Б1-17 (01)', block_name: 'Б1', floor: '01', unit_number: '17', legacy_unit_number: '17',
            contract_status: 'cancelled', order_date: '2026-07-29', contract_date: '2026-07-29', total_price: 79700000, overdue_as_of: '2026-10-22',
            customer_name: 'Тэмүүлэн.Болд', notes: 'Гэрээний жагсаалт «HUB data.xlsx» (2026-10-22)-аас импортолсон.' });
        expect(cancelled.fields).not.toHaveProperty('price_per_sqm');
        expect(result.units).toEqual({ distinct: 1, resold: 1 });
        const again = plan({ rows, contracts: applyOps(contracts, result.ops) });
        expect(again.ops).toEqual([]);
    });

    it('a dated contract cancelled and its unit resold between imports: the cancelled row cancels it, the live row is a new contract', () => {
        // Өмнөх импортоор огноотой болсон гэрээ; дараагийн файлд тэр огноогоор «Цуцлагдсан» + шинэ худалдаа.
        const contracts = [contract(1, { order_date: '2026-07-29', contract_date: '2026-07-29', payment_condition: 'Энгийн', overdue_amount: 0, overdue_as_of: '2026-09-30',
            customer_first_name: 'Тэмүүлэн', customer_last_name: 'Болд' })];
        const rows = [
            hub({ row: 2, orderDate: '2026-10-15', firstName: 'Сараа', lastName: 'Дорж', total: 460000000, pricePerSqm: null }),
            hub({ row: 3, orderDate: '2026-07-29', status: 'cancelled' }),
        ];
        const result = plan({ rows, contracts, latestImportDate: '2026-09-30' });
        expect(result.blocking).toEqual([]);
        expect(result.info).toEqual([]);
        expect(result.counts).toMatchObject({ insert: 1, insertCancelled: 0, update: 1, review: 1 });
        const cancel = updateOf(result.ops, id(1))!;
        expect(cancel.set).toMatchObject({ contract_status: 'cancelled' });
        expect(cancel.set).not.toHaveProperty('order_date');
        expect(cancel.set).not.toHaveProperty('total_price');
        expect(inserts(result.ops).map(op => op.fields)).toEqual([expect.objectContaining({ contract_status: 'active', order_date: '2026-10-15',
            total_price: 460000000, customer_name: 'Сараа.Дорж' })]);
        expect(plan({ rows, contracts: applyOps(contracts, result.ops), latestImportDate: '2026-10-22' }).ops).toEqual([]);

        // Төлбөртэй бол цуцлахгүй (батлахыг хаана) — гэхдээ шинэ худалдааг хуучин гэрээнд оноохгүй.
        const paid = plan({ rows, contracts, paymentContractIds: new Set([id(1)]) });
        expect(paid.blocking.map(item => item.code)).toEqual(['has_payments']);
        expect(updateOf(paid.ops, id(1))?.set).not.toHaveProperty('order_date');

        // Өөр огноотой хуучин цуцлалт (одоогийн худалдаа файлд алга): огноотой амьд гэрээг цуцлахгүй, цуцлалтыг түүх болгоно.
        const unrelated = plan({ rows: [hub({ row: 3, orderDate: '2026-05-01', status: 'cancelled' })], contracts });
        expect(updateOf(unrelated.ops, id(1))).toBeUndefined();
        expect(inserts(unrelated.ops).map(op => [op.fields.contract_status, op.fields.order_date])).toEqual([['cancelled', '2026-05-01']]);
        expect(unrelated.missing.map(item => item.contractId)).toEqual([id(1)]);
        expect(unrelated.counts).toMatchObject({ review: 0, insertCancelled: 1 });
    });

    it('inserts new contracts with unit columns, NULL paid never sent, and lists unit status mismatches', () => {
        const result = plan({ rows: [
            hub({ block: 'Б2', unitNumber: '231', floor: '22', model: 'A' }),
            hub({ row: 3, block: 'Б2', unitNumber: '152', floor: '10', model: 'E', status: 'cancelled', orderDate: '2026-10-04' }),
        ] });
        expect(result.counts).toMatchObject({ insert: 1, insertCancelled: 1, update: 0 });
        const active = inserts(result.ops).find(op => op.fields.contract_status === 'active')!;
        const cancelled = inserts(result.ops).find(op => op.fields.contract_status === 'cancelled')!;
        expect(active.fields).toEqual({
            product_type: 'residential', unit_label: 'Б2-231', block_name: 'Б2', floor: '22', model: 'A', legacy_unit_number: '231',
            contracted_area: 58, price_per_sqm: 7800000, total_price: 452400000, prepayment_condition: '30%', prepayment_due: 135720000,
            payment_condition: 'Энгийн', order_date: '2026-10-15', contract_date: '2026-10-15', contract_status: 'active',
            customer_name: 'Тэмүүлэн.Болд', customer_first_name: 'Тэмүүлэн', customer_last_name: 'Болд', overdue_amount: 0, overdue_as_of: '2026-10-22',
            notes: 'Гэрээний жагсаалт «HUB data.xlsx» (2026-10-22)-аас импортолсон.',
        });
        expect(cancelled.fields.contract_status).toBe('cancelled');
        expect(result.unitStatusMismatches).toEqual([
            { label: 'Б2-152', unitStatus: 'sold', unitStatusLabel: 'Зарагдсан', kind: 'cancelled_on_sold' },
            { label: 'Б2-231', unitStatus: 'available', unitStatusLabel: 'Чөлөөтэй', kind: 'live_on_free' },
        ]);
        expect(result.inserts.map(item => [item.label, item.status, item.name])).toEqual([['Б2-152', 'cancelled', 'Тэмүүлэн.Болд'], ['Б2-231', 'active', 'Тэмүүлэн.Болд']]);
    });

    it('never creates a second live contract on a unit (unit_taken) and blocks rows of units with unlinked contracts', () => {
        const taken = plan({ rows: [hub(), hub({ row: 3, orderDate: '2026-08-01' })], contracts: [contract(1, { order_date: '2026-10-15', contract_date: '2026-10-15' })] });
        expect(taken.blocking).toEqual([{ code: 'unit_taken', label: 'Б1-16', row: 3, message: 'Мөр 3: байранд өөр идэвхтэй гэрээ байна — нэг байранд хоёр идэвхтэй гэрээ үүсгэхгүй' }]);
        expect(inserts(taken.ops)).toEqual([]);
        const twoNew = plan({ rows: [hub({ block: 'Б2', unitNumber: '231', floor: '22', model: 'A' }), hub({ row: 3, block: 'Б2', unitNumber: '231', floor: '22', model: 'A', orderDate: '2026-08-01' })] });
        expect(inserts(twoNew.ops)).toHaveLength(1);
        expect(twoNew.blocking.map(item => item.code)).toEqual(['unit_taken']);

        // AI/лидээс үүссэн гэрээ: unit_label хоосон эсвэл нэгжийн кодтой таарахгүй.
        const unlinked = plan({ rows: [hub()], contracts: [contract(1, { unit_label: null }), contract(2, { unit_label: 'Б1-16а', block_name: null, legacy_unit_number: null, contract_status: 'cancelled' })] });
        expect(unlinked.ops).toEqual([]);
        expect(unlinked.blocking).toEqual([{ code: 'unlinked', label: 'Б1-16', row: 2, contractId: id(1),
            message: 'Байртай холбоогүй гэрээ (Б1-16) — гэрээний байрыг «Б1-16» болгож засаад дахин оруулна уу' }]);
        expect(unlinked.missing).toEqual([]);
        const byLabel = plan({ rows: [hub({ productType: 'parking', unitNumber: '10', floor: 'B1', model: 'P' })], contracts: [contract(3, { product_type: 'parking', unit_label: 'Б1-10', block_name: null, legacy_unit_number: null })] });
        expect(byLabel.blocking.map(item => [item.code, item.contractId])).toEqual([['unlinked', id(3)]]);
    });

    it('lists live contracts missing from the file (with undated flag) and never touches them', () => {
        const result = plan({ rows: [hub()], contracts: [
            contract(1),
            contract(2, { unit_label: 'Б1-31', legacy_unit_number: '31' }),
            contract(3, { unit_label: 'Б1-110', legacy_unit_number: '110', order_date: '2026-05-01' }),
            contract(4, { unit_label: 'Б2-152', legacy_unit_number: '152', contract_status: 'cancelled' }),
        ] });
        expect(result.missing).toEqual([
            { contractId: id(3), label: 'Б1-110', status: 'active', orderDate: '2026-05-01', total: 452400000, undated: false },
            { contractId: id(2), label: 'Б1-31', status: 'active', orderDate: null, total: 452400000, undated: true },
        ]);
        expect(result.stillUndated).toBe(1);
        expect(result.ops.map(op => op.op === 'update' && op.id)).toEqual([id(1)]);
    });

    it('puts price/condition/area/date changes from stored values under review; status → closed is automatic', () => {
        const contracts = [contract(1, { product_type: 'parking', unit_label: 'Б1-10 (01)', legacy_unit_number: '10', unit_number: '10', total_price: '66700000.00',
            prepayment_condition: '30%', prepayment_due: 20010000, price_per_sqm: null, contracted_area: 12.5, order_date: '2026-09-02', contract_date: '2026-09-02' })];
        const result = plan({ rows: [hub({ row: 35, productType: 'parking', unitNumber: '10', floor: '01', model: 'P', area: 12.5, pricePerSqm: 59000000,
            total: 59000000, prepaymentCondition: '100%', prepaymentDue: 59000000, orderDate: '2026-09-03', overdue: 20010000, status: 'closed' })], contracts });
        expect(result.counts).toMatchObject({ update: 1, review: 1, blocking: 0 });
        expect(result.review).toEqual([{ contractId: id(1), label: 'Зогсоол Б1-10 (01)', row: 35, changes: [
            { field: 'order_date', label: 'Захиалга өгсөн огноо', from: '2026-09-02', to: '2026-09-03' },
            { field: 'contract_date', label: 'Гэрээний огноо', from: '2026-09-02', to: '2026-09-03' },
            { field: 'prepayment_condition', label: 'Урьдчилгааны нөхцөл', from: '30%', to: '100%' },
            { field: 'total_price', label: 'Нийт дүн', from: 66700000, to: 59000000 },
            { field: 'prepayment_due', label: 'Урьдчилгааны дүн', from: 20010000, to: 59000000 },
        ] }]);
        const op = updateOf(result.ops, id(1))!;
        expect(op.review).toBe(true);
        expect(op.set.contract_status).toBe('closed');
        // expect нь DB-ийн түүхий утга (RPC тоог тоогоор харьцуулна).
        expect(op.expect).toMatchObject({ total_price: '66700000.00', contract_status: 'active' });
        expect(result.updates.find(group => group.field === 'contract_status')?.items).toEqual([{ contractId: id(1), label: 'Зогсоол Б1-10 (01)', from: 'active', to: 'closed' }]);
    });

    it('blocks money changes on contracts with known paid amounts and cancellations of contracts with payments', () => {
        const paid = plan({ rows: [hub({ total: 450000000 })], contracts: [contract(1, { paid_amount: 1000, order_date: '2026-10-15', contract_date: '2026-10-15' })] });
        expect(paid.blocking).toEqual([{ code: 'paid_known', label: 'Б1-16', row: 2, contractId: id(1),
            message: 'Төлсөн дүн бүртгэлтэй гэрээ — Нийт дүн импортоор өөрчлөгдөхгүй, гэрээний хуудсаас засна' }]);
        expect(updateOf(paid.ops, id(1))?.set).not.toHaveProperty('total_price');

        const cancelRow = hub({ status: 'cancelled', orderDate: '2026-07-01' });
        const withSchedule = plan({ rows: [cancelRow], contracts: [contract(1)], paymentContractIds: new Set([id(1)]) });
        expect(withSchedule.blocking.map(item => item.code)).toEqual(['has_payments']);
        expect(updateOf(withSchedule.ops, id(1))?.set).not.toHaveProperty('contract_status');
        const withPaid = plan({ rows: [cancelRow], contracts: [contract(1, { paid_amount: '5.00' })] });
        expect(withPaid.blocking.map(item => item.code)).toEqual(['has_payments']);
        // Төлбөргүй: файлд цуцлагдсан, байранд амьд мөр алга → амьд гэрээ цуцлагдана (шалгах).
        const cancel = plan({ rows: [cancelRow], contracts: [contract(1)] });
        expect(cancel.review[0].changes).toContainEqual({ field: 'contract_status', label: 'Төлөв', from: 'active', to: 'cancelled' });
        expect(cancel.counts).toMatchObject({ insertCancelled: 0, update: 1, review: 1 });
        expect(cancel.unitStatusMismatches).toEqual([{ label: 'Б1-16', unitStatus: 'sold', unitStatusLabel: 'Зарагдсан', kind: 'cancelled_on_sold' }]);
    });

    it('revives a cancelled contract with the same order date (review) and puts closed → active under review', () => {
        const revived = plan({ rows: [hub({ orderDate: '2026-07-01' })], contracts: [contract(1, { contract_status: 'cancelled', order_date: '2026-07-01', contract_date: '2026-07-01' })] });
        expect(inserts(revived.ops)).toEqual([]);
        expect(revived.review[0].changes).toContainEqual({ field: 'contract_status', label: 'Төлөв', from: 'cancelled', to: 'active' });
        const reopened = plan({ rows: [hub()], contracts: [contract(1, { contract_status: 'closed', order_date: '2026-10-15', contract_date: '2026-10-15' })] });
        expect(reopened.review[0].changes).toContainEqual({ field: 'contract_status', label: 'Төлөв', from: 'closed', to: 'active' });
    });

    it('never changes the holder: differing names are info, Hub-transferred contracts keep their names, export fallback names are not split names', () => {
        const differs = plan({ rows: [hub({ firstName: '88112233', lastName: null })], contracts: [contract(1)] });
        expect(differs.info).toEqual([{ code: 'holder_differs', label: 'Б1-16', row: 2, contractId: id(1), fileName: '88112233', currentName: 'Тэмүүлэн.Болд',
            message: 'Эзэмшигч зөрүүтэй — импорт өөрчлөхгүй; «Гэрээ шилжүүлэх» → нэр засах' }]);
        expect(updateOf(differs.ops, id(1))?.set).not.toHaveProperty('customer_first_name');
        expect(updateOf(differs.ops, id(1))?.expect).not.toHaveProperty('customer_name');

        const transferred = plan({ rows: [hub()], contracts: [contract(1)], transferredIds: new Set([id(1)]) });
        expect(transferred.info.map(item => item.code)).toEqual(['holder_transferred']);
        expect(updateOf(transferred.ops, id(1))?.set).not.toHaveProperty('customer_first_name');

        const fallback = plan({ rows: [hub({ firstName: 'Тэмүүлэн . Болд', lastName: null })], contracts: [contract(1)] });
        expect(fallback.info).toEqual([]);
        expect(updateOf(fallback.ops, id(1))?.set).not.toHaveProperty('customer_first_name');

        const partlyFilled = plan({ rows: [hub()], contracts: [contract(1, { customer_first_name: 'Тэмүүлэн' })] });
        expect(updateOf(partlyFilled.ops, id(1))?.set).toMatchObject({ customer_last_name: 'Болд' });
        expect(updateOf(partlyFilled.ops, id(1))?.set).not.toHaveProperty('customer_first_name');
    });

    it('fills contract number and manager only when empty and never sends paid/balance columns', () => {
        const result = plan({ rows: [hub({ contractNumber: 'EL-1', salesManager: 'Менежер', paidTotal: 5 })], contracts: [contract(1), contract(2, { unit_label: 'Б1-110', legacy_unit_number: '110', contract_number: 'OLD' })] });
        expect(updateOf(result.ops, id(1))?.set).toMatchObject({ contract_number: 'EL-1', sales_manager: 'Менежер' });
        for (const op of result.ops) {
            const keys = op.op === 'update' ? Object.keys(op.set) : Object.keys(op.fields);
            expect(keys.every(key => (op.op === 'update' ? UPDATE_COLUMNS : INSERT_COLUMNS).includes(key))).toBe(true);
        }
        expect(result.rows[0]).toMatchObject({ paidTotal: 5, unitLabel: 'Б1-16' });
        expect(result.summary).not.toHaveProperty('rows');
        expect(JSON.stringify(result.summary)).not.toContain('Тэмүүлэн');
    });

    it('guards the report date and flags files older than the latest import', () => {
        expect(plan({ rows: [hub()], reportDate: '2026-10-23' }).errors).toContain('Файлын огноо (2026-10-23) өнөөдрөөс хойш байж болохгүй');
        const early = plan({ rows: [hub()], reportDate: '2026-10-10' });
        expect(early.errors).toContain('Файлын огноо (2026-10-10) файлын хамгийн сүүлийн захиалгын огнооноос (2026-10-15) өмнө байна');
        expect(early.ops).toEqual([]);
        expect(plan({ rows: [hub()], reportDate: '2026-10-20', latestImportDate: '2026-10-21' }).olderThanLatest).toBe('2026-10-21');
        expect(plan({ rows: [hub()], latestImportDate: '2026-10-21' }).olderThanLatest).toBeNull();
        expect(plan({ rows: [hub({ unitNumber: '999' })] }).errors).toEqual(['Мөр 2: Орон сууц Б1-999 байр олдсонгүй']);
    });

    it('produces a stable canonical plan independent of input order, changing with the data', () => {
        const contracts = [contract(1), contract(2, { unit_label: 'Б1-110', legacy_unit_number: '110' })];
        const rows = [hub(), hub({ row: 3, unitNumber: '110', floor: '12', model: 'C' })];
        const a = plan({ rows, contracts });
        const b = plan({ rows: [...rows].reverse(), contracts: [...contracts].reverse() });
        expect(b.canonical).toBe(a.canonical);
        expect(plan({ rows, contracts, reportDate: '2026-10-21' }).canonical).not.toBe(a.canonical);
        expect(plan({ rows, contracts: [contract(1, { payment_condition: 'Тусгай' }), contracts[1]] }).canonical).not.toBe(a.canonical);
        expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }] })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
    });

    it('sums the file per status in whole cents', () => {
        expect(summarizeFileTotals([hub({ total: 0.1, prepaymentDue: null, overdue: 0.2 }), hub({ total: 0.2, overdue: null }), hub({ status: 'cancelled', total: 5 })])).toEqual([
            { status: 'active', label: 'Гэрээ үүссэн', rows: 2, total: 0.3, prepaymentDue: 135720000, overdue: 0.2 },
            { status: 'cancelled', label: 'Цуцлагдсан', rows: 1, total: 5, prepaymentDue: 135720000, overdue: 0 },
        ]);
    });

    it('round trip: the HUB export of the contracts re-imports with zero changes', async () => {
        const contracts = [
            contract(1, { order_date: '2026-09-15', contract_date: '2026-09-15', payment_condition: 'Энгийн', overdue_amount: 20010000, overdue_as_of: '2026-10-22' }),
            contract(2, { product_type: 'parking', unit_label: 'Б1-10 (B1)', unit_number: '10', legacy_unit_number: '10', total_price: 86600000, price_per_sqm: null,
                contracted_area: 12.5, prepayment_condition: '100%', prepayment_due: 86600000, order_date: '2026-08-01', contract_date: '2026-08-01', contract_status: 'closed',
                customer_first_name: 'Сараа', customer_last_name: 'Дорж', customer_name: 'Сараа.Дорж', overdue_amount: 0, overdue_as_of: '2026-10-22' }),
            contract(3, { unit_label: 'Б2-152', block_name: 'Б2', legacy_unit_number: '152', contract_status: 'cancelled', order_date: '2026-10-04', contract_date: '2026-10-04',
                customer_first_name: 'Нараа', customer_last_name: 'Бат', customer_name: 'Нараа.Бат', overdue_amount: null, overdue_as_of: '2026-10-22' }),
            contract(4, { unit_label: 'Б1-31', legacy_unit_number: '31' }), // огноогүй — экспортод огноогүй мөр, импорт алгасна
        ];
        const units = SHOP_UNITS.map(unit => ({ ...unit, floor: unit.code === 'Б1-16' ? '05' : unit.floor }));
        const buffer = await buildWorkbookBuffer([{ name: 'Sheet1', columns: [...CONTRACT_LIST_COLUMNS], numFmts: CONTRACT_LIST_NUMFMT,
            rows: contracts.map(row => contractListRow({ ...row, floor: units.find(unit => unit.code === row.unit_label && unit.category === row.product_type)?.floor ?? null, model: 'X' })) }]);
        const parsed = parseContractList(await readWorkbookSheets(buffer), { reportDate: '2026-10-22' });
        expect(parsed.errors).toEqual([]);
        expect(parsed.skipped).toEqual([{ row: 5, reason: 'Захиалга өгсөн огноо хоосон — импортлохгүй (гэрээ хэвээр)' }]);
        const result = plan({ rows: parsed.rows, contracts, units, latestImportDate: '2026-10-22' });
        expect(result.errors).toEqual([]);
        expect(result.ops).toEqual([]);
        expect(result.counts).toMatchObject({ unchanged: 3, missing: 1 });
    });
});
