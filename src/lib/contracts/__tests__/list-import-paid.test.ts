import { describe, expect, it } from 'vitest';
import {
    contractListHasWork, hasHubPaidTotals, hubPaidByContract, hubPaidDifference, planContractListImport, storedHubPaidRows,
    type ContractListContract, type ContractListUnit, type HubPaidContract, type HubPaidRow, type HubRow,
} from '../list-import';

const FILE_DATE = '2026-10-20';

/** contract_list_imports.rows-д хадгалагдсан мөр (ContractListStoredRow-ийн хэсэг). */
const stored = (unitLabel: string | null, orderDate: string, paidTotal: unknown, over: Record<string, unknown> = {}) => ({
    row: 2, productType: 'residential', block: 'Б2', unitNumber: '1', unitLabel, orderDate, status: 'active', total: 500_000_000, paidTotal, ...over,
});
const contract = (id: string, unit: string, date: string | null, over: Partial<HubPaidContract> = {}): HubPaidContract => ({
    id, product_type: 'residential', unit_label: unit, contract_status: 'active', contract_date: date, ...over,
});

describe('HUB «Нийт төлсөн дүн» rows', () => {
    it('reads stored rows defensively: unresolved units, bad shapes and negative amounts never become paid', () => {
        const rows = storedHubPaidRows([
            stored('Б2-12/A', '2026-10-08', 43_981_200),
            stored('Б2-18/B', '2026-10-13', null),
            stored(null, '2026-10-13', 5),
            stored('Б2-22/A', 'bad', 5),
            stored('Б2-1', '2026-10-01', -3),
            stored('Б2-2', '2026-10-01', '100'),
            stored('Б2-3', '2026-10-01', 1, { status: 'transferred' }),
            null, 'x',
        ]);
        expect(rows).toEqual([
            { row: 2, productType: 'residential', unitLabel: 'Б2-12/A', orderDate: '2026-10-08', status: 'active', paidTotal: 43_981_200 },
            { row: 2, productType: 'residential', unitLabel: 'Б2-18/B', orderDate: '2026-10-13', status: 'active', paidTotal: null },
            { row: 2, productType: 'residential', unitLabel: 'Б2-1', orderDate: '2026-10-01', status: 'active', paidTotal: null },
            { row: 2, productType: 'residential', unitLabel: 'Б2-2', orderDate: '2026-10-01', status: 'active', paidTotal: null },
        ]);
        expect(storedHubPaidRows([stored('Б2-1', '2026-10-01', 1, { row: 'x' })])[0].row).toBe(0);
        expect(hasHubPaidTotals(rows)).toBe(true);
        expect(hasHubPaidTotals(rows.filter(row => row.paidTotal === null))).toBe(false);
        expect(storedHubPaidRows(undefined)).toEqual([]);
        expect(storedHubPaidRows({})).toEqual([]);
    });

    it('pairs file rows with live contracts by the import key: same date first, then newest with newest', () => {
        const rows = storedHubPaidRows([
            stored('Б2-12/A', '2026-10-08', 43_981_200),
            stored('Б2-18/B', '2026-10-13', null),
            // Дахин зарагдсан байр: цуцалсан хуучин мөр оролцохгүй, шинэ мөр шинэ гэрээнд.
            stored('Б1-21/E3', '2026-07-27', 99, { status: 'cancelled' }),
            stored('Б1-21/E3', '2026-10-15', 53_669_700),
            // Огноо зөрсөн (засварлаагүй) гэрээ — үлдсэн шинэ ↔ шинэ.
            stored('Б2-8/A', '2026-09-29', 30_000_000),
            // Зогсоол: ижил кодтой орон сууцтай андуурахгүй (төрөл түлхүүрт орно).
            stored('Б1-13 (01)', '2026-10-04', 25_980_000, { productType: 'parking' }),
        ]);
        const paid = hubPaidByContract(rows, [
            contract('a', 'Б2-12/A', '2026-10-08'),
            contract('b', 'Б2-18/B', '2026-10-13'),
            contract('old', 'Б1-21/E3', '2026-07-27', { contract_status: 'cancelled' }),
            contract('new', 'Б1-21/E3', null, { order_date: '2026-10-15' }),
            contract('drift', 'Б2-8/A', '2026-09-30'),
            contract('park', 'Б1-13 (01), Б1-14 (01)', '2026-10-04', { product_type: 'parking' }),
            contract('apartment', 'Б1-13 (01)', '2026-10-04'),
            contract('absent', 'Б2-99/F', '2026-10-15'),
        ], FILE_DATE);
        expect(Object.fromEntries(paid)).toEqual({ a: 43_981_200, b: null, new: 53_669_700, drift: 30_000_000, park: 25_980_000 });
        expect(paid.has('old')).toBe(false);
        expect(paid.has('absent')).toBe(false);
        expect(paid.has('apartment')).toBe(false);
    });

    it('never gives one file row to two live contracts on the same unit', () => {
        const rows = storedHubPaidRows([stored('Б2-4/A', '2026-08-29', 10)]);
        const paid = hubPaidByContract(rows, [contract('x', 'Б2-4/A', '2026-10-01'), contract('y', 'Б2-4/A', '2026-08-29')], FILE_DATE);
        expect(Object.fromEntries(paid)).toEqual({ y: 10 });
    });

    it('never gives an old sale\'s paid total to a contract made after the file date', () => {
        // Файл 10-10: Б2-5 амьд, 09-01 захиалсан (гэрээ A). Файлын дараа A-г цуцалж, байрыг B-д 10-15-нд дахин зарсан.
        const rows = storedHubPaidRows([stored('Б2-5', '2026-09-01', 50_000_000)]);
        const contracts = [
            contract('A', 'Б2-5', '2026-09-01', { contract_status: 'cancelled' }),
            contract('B', 'Б2-5', '2026-10-15'),
        ];
        expect(Object.fromEntries(hubPaidByContract(rows, contracts, '2026-10-10'))).toEqual({});
        // Захиалга файлаас өмнө, гэрээ файлаас хойш: захиалгын огноогоор (импортын дүрэм) тулгана.
        const ordered = [contract('C', 'Б2-5', '2026-10-12', { order_date: '2026-09-01' })];
        expect(Object.fromEntries(hubPaidByContract(rows, ordered, '2026-10-10'))).toEqual({ C: 50_000_000 });
        // Огноогүй гэрээ хуучин байж болно — тулгалтад оролцоно.
        expect(Object.fromEntries(hubPaidByContract(rows, [contract('D', 'Б2-5', null)], '2026-10-10'))).toEqual({ D: 50_000_000 });
    });

    it('follows the import when the file cancelled a sale the CRM still shows live', () => {
        // Файлд A (09-01) цуцлагдаж, байр B-д (10-15) зарагдсан; CRM-д A амьд хэвээр, B бүртгэгдээгүй. Импорт A-г
        // цуцалж B-г шинээр нэмнэ — B-ийн төлсөн дүн A-д (9-р сарын cohort) очихгүй, A тодорхойгүй.
        const rows = storedHubPaidRows([
            stored('Б2-6', '2026-09-01', 50_000_000, { status: 'cancelled' }),
            stored('Б2-6', '2026-10-15', 20_000_000),
        ]);
        expect(Object.fromEntries(hubPaidByContract(rows, [contract('A', 'Б2-6', '2026-09-01')], FILE_DATE))).toEqual({});
    });

    it('pairs exactly like the contract import planner on the same unit', () => {
        const units = [{ code: 'Б2-7', category: 'residential', block: 'Б2', floor: null, model: null, unit_number: '7', legacy_unit_number: null, status: 'sold' }];
        const hubRow = (row: number, orderDate: string, status: 'active' | 'cancelled', paidTotal: number) => ({
            row, productType: 'residential' as const, block: 'Б2', unitNumber: '7', floor: null, model: null, area: null, prepaymentCondition: null,
            pricePerSqm: null, total: 100, prepaymentDue: null, overdue: null, orderDate, status, firstName: null, lastName: null,
            paymentCondition: null, contractNumber: null, salesManager: null, paidTotal,
        });
        const fileRows = [hubRow(2, '2026-08-01', 'cancelled', 1), hubRow(3, '2026-09-20', 'active', 7)];
        const db = (id: string, status: string, date: string | null) => ({
            id, product_type: 'residential', unit_label: 'Б2-7', block_name: 'Б2', unit_number: '7', legacy_unit_number: null, contract_status: status,
            order_date: null, contract_date: date, total_price: 100, price_per_sqm: null, contracted_area: null, prepayment_condition: null,
            prepayment_due: null, payment_condition: null, overdue_amount: null, overdue_as_of: null, customer_name: null, customer_first_name: null,
            customer_last_name: null, contract_number: null, sales_manager: null, paid_amount: null,
        });
        const contracts = [db('old', 'active', '2026-08-01'), db('drift', 'active', '2026-09-21')];
        const plan = planContractListImport({
            rows: fileRows, units, contracts, transferredIds: new Set(), paymentContractIds: new Set(),
            latestImportDate: null, reportDate: FILE_DATE, today: FILE_DATE,
        });
        // Импорт: цуцалсан мөр «old»-ийг цуцална, амьд мөр «drift»-д (огноог засна).
        const updates = new Map(plan.ops.flatMap(op => (op.op === 'update' ? [[op.id, op.set] as const] : [])));
        expect(plan.errors).toEqual([]);
        expect(updates.get('old')).toMatchObject({ contract_status: 'cancelled' });
        expect(updates.get('drift')).toMatchObject({ order_date: '2026-09-20' });
        expect(plan.counts.insert).toBe(0);
        const paid = hubPaidByContract(storedHubPaidRows(plan.rows), contracts, FILE_DATE);
        expect(Object.fromEntries(paid)).toEqual({ drift: 7 });
    });
});

describe('«Нийт төлсөн дүн»-гийн дахин импорт (ижил файлын огноо)', () => {
    const units: ContractListUnit[] = ['7', '8'].map(n => ({
        code: `Б2-${n}`, category: 'residential', block: 'Б2', floor: null, model: null, unit_number: n, legacy_unit_number: null, status: 'sold',
    }));
    const fileRow = (row: number, unitNumber: string, paidTotal: number | null): HubRow => ({
        row, productType: 'residential', block: 'Б2', unitNumber, floor: null, model: null, area: null, prepaymentCondition: null, pricePerSqm: null,
        total: 100, prepaymentDue: null, overdue: null, orderDate: '2026-09-20', status: 'active', firstName: null, lastName: null,
        paymentCondition: null, contractNumber: null, salesManager: null, paidTotal,
    });
    // Өмнө нь энэ файлын огноогоор импортлогдсон гэрээ — файлтай яг ижил (хоцролтын огноо орно).
    const db = (n: string): ContractListContract => ({
        id: `c${n}`, product_type: 'residential', unit_label: `Б2-${n}`, block_name: 'Б2', unit_number: n, legacy_unit_number: null,
        contract_status: 'active', order_date: '2026-09-20', contract_date: '2026-09-20', total_price: 100, price_per_sqm: null, contracted_area: null,
        prepayment_condition: null, prepayment_due: null, payment_condition: null, overdue_amount: null, overdue_as_of: FILE_DATE, customer_name: null,
        customer_first_name: null, customer_last_name: null, contract_number: null, sales_manager: null, paid_amount: null,
    });
    const plan = (rows: HubRow[], sameDateImportRows?: unknown) => planContractListImport({
        rows, units, contracts: [db('7'), db('8')], transferredIds: new Set(), paymentContractIds: new Set(),
        latestImportDate: FILE_DATE, sameDateImportRows, reportDate: FILE_DATE, today: FILE_DATE,
    });
    const stored = plan([fileRow(2, '7', 10), fileRow(3, '8', null)]).rows;

    it('plans zero contract ops but a paid update when only «Нийт төлсөн дүн» changed', () => {
        const next = plan([fileRow(2, '7', 25), fileRow(3, '8', 40)], stored);
        expect(next.errors).toEqual([]);
        expect(next.ops).toEqual([]);
        expect(next.counts).toMatchObject({ update: 0, unchanged: 2 });
        expect(next.paidUpdate).toEqual({ rows: 2, changed: 2, reimport: true });
        expect(next.summary.paidUpdate).toEqual(next.paidUpdate);
        expect(next.rows.map(row => row.paidTotal)).toEqual([25, 40]);
        // Нэг мөрийн дүн л өөрчлөгдсөн.
        expect(plan([fileRow(2, '7', 25), fileRow(3, '8', null)], stored).paidUpdate).toEqual({ rows: 1, changed: 1, reimport: true });
    });

    it('an identical file (any row order or numbering) is not a paid update', () => {
        expect(plan([fileRow(2, '7', 10), fileRow(3, '8', null)], stored).paidUpdate).toBeNull();
        expect(plan([fileRow(5, '8', null), fileRow(9, '7', 10)], stored).paidUpdate).toBeNull();
    });

    it('never replaces stored totals with a file that has none, and needs a clean file', () => {
        expect(plan([fileRow(2, '7', null), fileRow(3, '8', null)], stored).paidUpdate).toBeNull();
        expect(plan([fileRow(2, '7', 25), fileRow(3, '999', 1)], stored)).toMatchObject({ errors: ['Мөр 3: Орон сууц Б2-999 байр олдсонгүй'], paidUpdate: null });
    });

    it('a file date without an import makes every paid row new', () => {
        expect(plan([fileRow(2, '7', 10), fileRow(3, '8', null)]).paidUpdate).toEqual({ rows: 1, changed: 1, reimport: false });
        expect(plan([fileRow(2, '7', 10)], null).paidUpdate).toEqual({ rows: 1, changed: 1, reimport: false });
    });

    it('hashes the stored rows: files differing only in paid totals never share a plan hash', () => {
        const a = plan([fileRow(2, '7', 10), fileRow(3, '8', null)], stored);
        expect(a.ops).toEqual([]);
        expect(plan([fileRow(3, '8', null), fileRow(2, '7', 10)], stored).canonical).toBe(a.canonical);
        expect(plan([fileRow(2, '7', 11), fileRow(3, '8', null)], stored).canonical).not.toBe(a.canonical);
        expect(a.canonical).toContain('"paidTotal":10');
    });

    it('hashes the same-date import it compared against, only when the file has paid totals', () => {
        const file = [fileRow(2, '7', 25), fileRow(3, '8', 40)];
        const base = plan(file, stored);
        // Тэр огноонд өөр дүнтэй импорт хадгалагдсан: зөрүү ижил (2 мөр) ч hash өөр.
        const otherBase = plan([fileRow(2, '7', 11), fileRow(3, '8', null)]).rows;
        expect(plan(file, otherBase).paidUpdate).toEqual(base.paidUpdate);
        expect(plan(file, otherBase).canonical).not.toBe(base.canonical);
        // Тэр огноогоор импорт гарч ирсэн; суурийн мөрийн дараалал, дугаар хамаагүй.
        expect(plan(file).canonical).not.toBe(base.canonical);
        expect(plan(file, [...stored].reverse().map((row, index) => ({ ...row, row: index + 10 }))).canonical).toBe(base.canonical);
        // Төлсөн дүнгүй файл суурьтай харьцуулахгүй — hash-д орохгүй.
        const blank = [fileRow(2, '7', null), fileRow(3, '8', null)];
        expect(plan(blank, stored).canonical).toBe(plan(blank).canonical);
    });

    it('commits only plans with contract ops or a paid update', () => {
        expect(contractListHasWork(plan([fileRow(2, '7', 25), fileRow(3, '8', 40)], stored))).toBe(true);
        expect(contractListHasWork(plan([fileRow(2, '7', 10), fileRow(3, '8', null)], stored))).toBe(false);
        expect(contractListHasWork({ ops: [{ op: 'update' } as never], paidUpdate: null })).toBe(true);
    });

    it('counts changed, added and removed rows by unit, date and status', () => {
        const row = (unitLabel: string, paidTotal: number | null, over: Partial<HubPaidRow> = {}): HubPaidRow => ({
            row: 2, productType: 'residential', unitLabel, orderDate: '2026-09-20', status: 'active', paidTotal, ...over,
        });
        const before = [row('Б2-7', 10), row('Б2-8', null), row('Б2-9', 5)];
        expect(hubPaidDifference(before, before)).toBe(0);
        expect(hubPaidDifference([...before].reverse().map((r, i) => ({ ...r, row: i + 10 })), before)).toBe(0);
        expect(hubPaidDifference([row('Б2-7', 11), row('Б2-8', null), row('Б2-9', 5)], before)).toBe(1);
        // 0 ба хоосон ялгаатай; нэмэгдсэн ба хасагдсан мөр тус бүр.
        expect(hubPaidDifference([row('Б2-7', 10), row('Б2-8', 0), row('Б2-9', 5)], before)).toBe(1);
        expect(hubPaidDifference([row('Б2-7', 10), row('Б2-8', null), row('Б2-10', 5)], before)).toBe(2);
        expect(hubPaidDifference([row('Б2-7', 10)], before)).toBe(2);
        expect(hubPaidDifference([row('Б2-7', 10, { status: 'cancelled' }), row('Б2-8', null), row('Б2-9', 5)], before)).toBe(2);
    });
});
