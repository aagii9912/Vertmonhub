import { describe, expect, it } from 'vitest';
import { buildWeeklySales, monthWeeks } from '../weekly-sales';
import type { ErpProduct, ErpSale } from '@/lib/erp/records';

const sale = (key: string, overrides: Partial<ErpSale> = {}): ErpSale => ({
    key, contractNumber: key.split('|')[0], orderDate: '2026-09-17', manager: 'Менежер.А', product: key.split('|')[1] ?? key,
    unitCode: 'Б1-10', model: 'E3', kind: 'residential', block: 'Б1', channel: 'Пропертис', condition: 'Энгийн', customer: 'Захиалагч',
    advanceCondition: '30%', advanceAmount: 30, status: 'active', statusLabel: 'Гэрээ үүссэн', bankStatus: null, pricePerSqm: 5,
    area: 20, total: 100, paid: 30, refund: 0, balance: 70, overdue: 0, overdueDays: 0, penalty: 0, ...overrides,
});
const unit = (code: string, overrides: Partial<ErpProduct> = {}): ErpProduct => ({
    key: code, code, block: 'Б1', floor: 2, model: 'E1', kind: 'residential', rooms: 2, area: 49.19, price: 1,
    status: 'available', statusLabel: 'Худалдаанд', barter: false, manager: null, ...overrides,
});
const range = { from: '2026-09-16', to: '2026-09-22' };

describe('monthWeeks', () => {
    it('splits a month into Wednesday–Tuesday weeks and merges a one-day stub (September 2026)', () => {
        expect(monthWeeks('2026-09')).toEqual([
            { label: '1-р долоо хоног', from: '2026-09-01', to: '2026-09-08' },
            { label: '2-р долоо хоног', from: '2026-09-09', to: '2026-09-15' },
            { label: '3-р долоо хоног', from: '2026-09-16', to: '2026-09-22' },
            { label: '4-р долоо хоног', from: '2026-09-23', to: '2026-09-29' },
            { label: '5-р долоо хоног', from: '2026-09-30', to: '2026-09-30' },
        ]);
        expect(monthWeeks('2026-10')[0]).toEqual({ label: '1-р долоо хоног', from: '2026-10-01', to: '2026-10-06' });
        expect(monthWeeks('2026-02').at(-1)!.to).toBe('2026-02-28');
    });
});

describe('buildWeeklySales', () => {
    it('counts a manager\'s week even when the week starts in the previous month', () => {
        const report = buildWeeklySales({
            range: { from: '2026-09-30', to: '2026-10-06' },
            sales: { info: { date: '2026-10-06', source: 'ERP' }, rows: [sale('A|1', { orderDate: '2026-09-30' }), sale('B|1', { orderDate: '2026-10-02', manager: 'Менежер.Б' })] },
            previousSales: null, crmContracts: null, inventory: null, monthTarget: null,
        });
        expect(report.month.month).toBe('2026-10');
        expect(report.byManager).toEqual([
            expect.objectContaining({ manager: 'Менежер.Б', weekCount: 1, monthCount: 1 }),
            expect.objectContaining({ manager: 'Менежер.А', weekCount: 1, monthCount: 0 }),
        ]);
    });

    it('lists the week and month from the ERP export without cancelled contracts', () => {
        const report = buildWeeklySales({
            range,
            sales: { info: { date: '2026-09-22', source: 'Elysium гэрээ' }, rows: [
                sale('A|1'),
                sale('B|1', { orderDate: '2026-09-03', kind: 'parking', total: 50, channel: 'Бартер' }),
                sale('C|1', { status: 'cancelled', statusLabel: 'Цуцлагдсан' }),
                sale('D|1', { orderDate: '2026-09-10', total: null }),
                sale('E|1', { orderDate: '2026-08-30' }),
                sale('F|1', { orderDate: null }),
            ] },
            previousSales: null, crmContracts: null, inventory: null, monthTarget: 400,
        });
        expect(report.week).toMatchObject({ count: 1, total: 100, lines: [expect.objectContaining({ key: 'A|1', kindLabel: 'Орон сууц' })] });
        expect(report.month).toMatchObject({ count: 3, total: 150, missingTotals: 1, barter: 1, target: 400, attainmentPct: 38 });
        expect(report.month.byWeek).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'residential', weeks: [0, 1, 1, 0, 0], count: 2 }),
            expect.objectContaining({ kind: 'parking', weeks: [1, 0, 0, 0, 0], count: 1 }),
        ]));
        expect(report.previousWeek).toMatchObject({ from: '2026-09-09', to: '2026-09-15', count: 1 });
        expect(report.cash).toBeNull();
        expect(report.notes).toEqual(expect.arrayContaining([expect.stringContaining('1 гэрээний огноо хоосон'), expect.stringContaining('өмнөх долоо хоногийн ERP')]));
        expect(report.sources.contracts).toBe('erp');
    });

    it('computes cash from paid differences between two snapshots and attributes it to managers', () => {
        const report = buildWeeklySales({
            range,
            sales: { info: { date: '2026-09-22', source: 'ERP' }, rows: [
                sale('A|1', { paid: 80 }), sale('N|1', { paid: 20, manager: 'Менежер.Б' }), sale('U|1', { paid: null }),
            ] },
            previousSales: { info: { date: '2026-09-15', source: 'ERP' }, rows: [sale('A|1', { paid: 30 })] },
            crmContracts: null, inventory: null, monthTarget: null,
        });
        expect(report.cash).toMatchObject({ from: '2026-09-15', to: '2026-09-22', delta: 70, unknown: 1 });
        expect(report.byManager).toEqual(expect.arrayContaining([
            expect.objectContaining({ manager: 'Менежер.А', cash: 50 }), expect.objectContaining({ manager: 'Менежер.Б', cash: 20 }),
        ]));
        expect(report.month.attainmentPct).toBeNull();
    });

    it('falls back to CRM contracts and builds inventory with floor maps', () => {
        const report = buildWeeklySales({
            range, sales: null, previousSales: null,
            crmContracts: [{ key: 'crm-1', contractNumber: null, date: '2026-09-18', kind: 'parking', kindLabel: 'Зогсоол', block: '202', unit: '5',
                customer: null, area: 12.5, pricePerSqm: null, advanceCondition: null, total: 40, advance: null, paid: null, manager: null, channel: null, status: 'active' }],
            inventory: { info: { date: '2026-09-26', source: 'Elysium ERP', kind: 'erp' }, rows: [
                unit('Б1-1'),
                unit('Б1-2', { model: 'E2', status: 'sold', statusLabel: 'Гэрээ баталгаажсан', manager: 'Менежер.А' }),
                unit('Б1-3', { model: 'E3', status: 'reserved', statusLabel: 'Хадгалсан' }),
                unit('Б1-90', { floor: 15, model: 'E4', status: 'sold', barter: true }),
                unit('Б1-200', { kind: 'parking', floor: null, model: 'A-1' }),
            ] },
            monthTarget: null,
        });
        expect(report.week).toMatchObject({ count: 1, total: 40 });
        expect(report.sources.contracts).toBe('crm');
        expect(report.inventory!.blocks).toEqual([
            expect.objectContaining({ block: 'Б1', kind: 'parking', total: 1, statuses: { available: 1 } }),
            expect.objectContaining({ block: 'Б1', kind: 'residential', total: 4, barter: 1, statuses: { available: 1, sold: 2, reserved: 1 } }),
        ]);
        const [map] = report.inventory!.floorMaps;
        expect(map.models).toEqual(['E1', 'E2', 'E3', 'E4']);
        expect(map.floors.map(row => [row.floor, row.counts])).toEqual([
            [15, { sold: 0, available: 0, other: 0, barter: 1 }],
            [2, { sold: 1, available: 1, other: 1, barter: 0 }],
        ]);
        expect(map.totals).toEqual({ sold: 1, available: 1, other: 1, barter: 1 });
    });
});
