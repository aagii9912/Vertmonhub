import { describe, it, expect } from 'vitest';
import {
    monthRange,
    prevMonthOf,
    pctChange,
    countBy,
    buildKpiSummary,
    formatKpiReportText,
    type KpiViewingRow,
} from '../kpi-report';

describe('monthRange', () => {
    it('сарын [эхлэл, дараа сарын эхлэл) цонх буцаана', () => {
        const { start, end } = monthRange(2026, 7);
        expect(start.getFullYear()).toBe(2026);
        expect(start.getMonth()).toBe(6);
        expect(start.getDate()).toBe(1);
        expect(end.getMonth()).toBe(7);
    });

    it('12-р сар оны хил давна', () => {
        const { end } = monthRange(2026, 12);
        expect(end.getFullYear()).toBe(2027);
        expect(end.getMonth()).toBe(0);
    });
});

describe('prevMonthOf', () => {
    it('энгийн сар', () => {
        expect(prevMonthOf(2026, 7)).toEqual({ year: 2026, month: 6 });
    });
    it('1-р сар → өмнөх оны 12-р сар', () => {
        expect(prevMonthOf(2026, 1)).toEqual({ year: 2025, month: 12 });
    });
});

describe('pctChange', () => {
    it('өсөлт/бууралтыг бүхэл хувиар', () => {
        expect(pctChange(12, 10)).toBe(20);
        expect(pctChange(8, 10)).toBe(-20);
    });
    it('суурь 0 үед null (∞ гарахгүй)', () => {
        expect(pctChange(5, 0)).toBeNull();
    });
});

describe('countBy', () => {
    it('түлхүүрээр тоолж, хоосныг other болгоно', () => {
        const out = countBy(
            [{ s: 'new' }, { s: 'new' }, { s: null as unknown as string }],
            (r) => r.s,
        );
        expect(out).toEqual({ new: 2, other: 1 });
    });
});

describe('buildKpiSummary', () => {
    const viewings: KpiViewingRow[] = [
        { id: 'v1', status: 'completed' },
        { id: 'v2', status: 'scheduled' },
        { id: 'v3', status: 'cancelled' },
    ];

    it('цуцлагдсан уулзалтыг тооноос хасаж, delta-г зөв бодно', () => {
        const summary = buildKpiSummary({
            leads: [{ id: 'l1' }, { id: 'l2' }],
            viewings,
            contractCount: 3,
            revenue: 150_000_000,
            tasksDone: [{ id: 't1', title: 'Тайлан' }],
            prev: { leads: 1, viewings: 4, contracts: 3, revenue: 100_000_000 },
        });

        expect(summary.newLeads).toBe(2);
        expect(summary.viewings).toBe(2); // cancelled хасагдсан
        expect(summary.viewingsDone).toBe(1);
        expect(summary.tasksDone).toBe(1);
        expect(summary.deltas.leads).toBe(100);
        expect(summary.deltas.viewings).toBe(-50);
        expect(summary.deltas.contracts).toBe(0);
        expect(summary.deltas.revenue).toBe(50);
    });

    it('өмнөх сар 0 үед delta null', () => {
        const summary = buildKpiSummary({
            leads: [],
            viewings: [],
            contractCount: 0,
            revenue: 0,
            tasksDone: [],
            prev: { leads: 0, viewings: 0, contracts: 0, revenue: 0 },
        });
        expect(summary.deltas.leads).toBeNull();
        expect(summary.deltas.revenue).toBeNull();
    });
});

describe('formatKpiReportText', () => {
    it('бүх хэсгийг монголоор, хуулахад бэлэн текст болгоно', () => {
        const summary = buildKpiSummary({
            leads: [{ id: 'l1', status: 'new', source: 'facebook' }],
            viewings: [{ id: 'v1', status: 'completed' }],
            contractCount: 1,
            revenue: 250_000_000,
            tasksDone: [{ id: 't1', title: 'Танилцуулга бэлтгэсэн', completed_at: '2026-07-10T04:00:00Z' }],
            prev: { leads: 0, viewings: 0, contracts: 0, revenue: 0 },
        });

        const text = formatKpiReportText({
            managerName: 'Бат-Эрдэнэ',
            shopName: 'Mandala Garden',
            year: 2026,
            month: 7,
            summary,
            leadsByStatus: { new: 1 },
            leadsBySource: { facebook: 1 },
            viewingsByStatus: { completed: 1 },
            contracts: [
                {
                    id: 'c1',
                    contract_number: 'MG-101',
                    customer_name: 'Сараа',
                    total_price: 250_000_000,
                    contract_date: '2026-07-12',
                },
            ],
            tasksDone: [{ id: 't1', title: 'Танилцуулга бэлтгэсэн', completed_at: '2026-07-10T04:00:00Z' }],
            target: { teamTarget: 1_000_000_000, teamActual: 500_000_000, myShare: 50 },
        });

        expect(text).toContain('САРЫН KPI ТАЙЛАН — 2026 оны 7-р сар');
        expect(text).toContain('Менежер: Бат-Эрдэнэ · Mandala Garden');
        expect(text).toContain('• Шинэ лид: 1');
        expect(text).toContain('ЗОРИЛТ');
        expect(text).toContain('(50%)');
        expect(text).toContain('• Багийн гүйцэтгэлд миний хувь: 50%');
        expect(text).toContain('ЛИДИЙН ЭХ ҮҮСВЭР');
        expect(text).toContain('• Facebook: 1');
        expect(text).toContain('БАЙГУУЛСАН ГЭРЭЭНҮҮД');
        expect(text).toContain('№MG-101 · Сараа');
        expect(text).toContain('ХИЙСЭН АЖЛУУД');
        expect(text).toContain('Танилцуулга бэлтгэсэн');
        expect(text).toContain('Vertmon Hub автоматаар нэгтгэв');
    });

    it('зорилтгүй үед ЗОРИЛТ хэсэг гарахгүй', () => {
        const summary = buildKpiSummary({
            leads: [],
            viewings: [],
            contractCount: 0,
            revenue: 0,
            tasksDone: [],
            prev: { leads: 0, viewings: 0, contracts: 0, revenue: 0 },
        });
        const text = formatKpiReportText({
            managerName: 'Бат',
            year: 2026,
            month: 6,
            summary,
            leadsByStatus: {},
            leadsBySource: {},
            viewingsByStatus: {},
            contracts: [],
            tasksDone: [],
            target: null,
        });
        expect(text).not.toContain('ЗОРИЛТ');
        expect(text).not.toContain('ХИЙСЭН АЖЛУУД');
    });
});
