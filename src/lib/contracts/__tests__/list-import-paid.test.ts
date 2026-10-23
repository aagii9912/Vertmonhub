import { describe, expect, it } from 'vitest';
import { hasHubPaidTotals, hubPaidByContract, storedHubPaidRows, type HubPaidContract } from '../list-import';

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
            { productType: 'residential', unitLabel: 'Б2-12/A', orderDate: '2026-10-08', status: 'active', paidTotal: 43_981_200 },
            { productType: 'residential', unitLabel: 'Б2-18/B', orderDate: '2026-10-13', status: 'active', paidTotal: null },
            { productType: 'residential', unitLabel: 'Б2-1', orderDate: '2026-10-01', status: 'active', paidTotal: null },
            { productType: 'residential', unitLabel: 'Б2-2', orderDate: '2026-10-01', status: 'active', paidTotal: null },
        ]);
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
        ]);
        expect(Object.fromEntries(paid)).toEqual({ a: 43_981_200, b: null, new: 53_669_700, drift: 30_000_000, park: 25_980_000 });
        expect(paid.has('old')).toBe(false);
        expect(paid.has('absent')).toBe(false);
        expect(paid.has('apartment')).toBe(false);
    });

    it('never gives one file row to two live contracts on the same unit', () => {
        const rows = storedHubPaidRows([stored('Б2-4/A', '2026-08-29', 10)]);
        const paid = hubPaidByContract(rows, [contract('x', 'Б2-4/A', '2026-10-01'), contract('y', 'Б2-4/A', '2026-08-29')]);
        expect(Object.fromEntries(paid)).toEqual({ y: 10 });
    });
});
