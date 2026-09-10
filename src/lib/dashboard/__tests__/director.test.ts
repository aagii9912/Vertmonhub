import { describe, it, expect } from 'vitest';
import {
    buildFunnel,
    buildLeaderboard,
    buildOverdue,
    countByUnitType,
    attainmentPct,
    momDeltaPct,
} from '../director';

describe('buildFunnel', () => {
    const leads = [
        { id: 'a', source: 'facebook' },
        { id: 'b', source: 'facebook' },
        { id: 'c', source: 'phone' },
        { id: 'd', source: null },
    ];

    it('эх үүсвэр бүрээр лид → уулзалт → гэрээ тоолж, лидээр эрэмбэлнэ', () => {
        const r = buildFunnel(leads, ['a', 'a', 'c'], ['a']);
        expect(r.rows[0]).toEqual({ source: 'facebook', leads: 2, viewings: 1, contracts: 1, conversionPct: 50 });
        expect(r.rows.find((x) => x.source === 'phone')).toEqual({ source: 'phone', leads: 1, viewings: 1, contracts: 0, conversionPct: 0 });
        expect(r.rows.find((x) => x.source === 'other')?.leads).toBe(1);
        expect(r.totals).toEqual({ leads: 4, viewings: 2, contracts: 1 });
    });

    it('нэг лид олон уулзалттай ч нэг л удаа тоологдоно; үл мэдэгдэх лид алгасна', () => {
        const r = buildFunnel(leads, ['a', 'a', 'zzz'], []);
        expect(r.totals.viewings).toBe(1);
    });

    it('хязгаараас хэтэрвэл «other» болгон нэгтгэнэ', () => {
        const many = Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, source: `src${i}` }));
        const r = buildFunnel(many, [], [], 4);
        expect(r.rows).toHaveLength(4);
        expect(r.rows[3].source).toBe('other');
        expect(r.rows[3].leads).toBe(6);
        expect(r.totals.leads).toBe(9);
    });
});

describe('buildLeaderboard', () => {
    it('борлуулалтаар эрэмбэлж, хувийн зорилтыг тэнцүү хуваана', () => {
        const rows = buildLeaderboard({
            rosterNames: ['Б. Батзаяа', 'Д. Номин', 'Н. Ариунаа'],
            contracts: [
                { sales_manager: 'Д. Номин', total_price: 331_000_000 },
                { sales_manager: 'Б. Батзаяа', total_price: 245_000_000 },
                { sales_manager: 'Б. Батзаяа', total_price: 167_000_000 },
                { sales_manager: 'Б. Батзаяа', total_price: 100, contract_status: 'cancelled' },
                { sales_manager: 'Хэн нэгэн', total_price: 999 },
            ],
            viewings: [{ sales_manager_name: 'Д. Номин' }, { sales_manager_name: 'Д. Номин' }],
            leads: [{ sales_manager_name: 'Н. Ариунаа' }],
            teamTargetMonth: 900_000_000,
        });
        expect(rows.map((r) => r.name)).toEqual(['Б. Батзаяа', 'Д. Номин', 'Н. Ариунаа']);
        expect(rows[0]).toMatchObject({ rank: 1, contracts: 2, sales: 412_000_000, target: 300_000_000, targetPct: 137 });
        expect(rows[1]).toMatchObject({ rank: 2, contracts: 1, sales: 331_000_000, viewings: 2, targetPct: 110 });
        expect(rows[2]).toMatchObject({ rank: 3, contracts: 0, sales: 0, leads: 1, targetPct: 0 });
    });

    it('roster хоосон бол өгөгдлөөс нэрсийг гаргана', () => {
        const rows = buildLeaderboard({
            rosterNames: [],
            contracts: [{ sales_manager: 'X', total_price: 1 }],
            viewings: [{ sales_manager_name: 'Y' }],
            leads: [],
            teamTargetMonth: 0,
        });
        expect(rows.map((r) => r.name)).toEqual(['X', 'Y']);
        expect(rows[0].targetPct).toBe(0);
    });
});

describe('buildOverdue', () => {
    const today = new Date('2026-09-08T10:00:00');
    const info = new Map([
        ['c1', { customer: 'Л. Ганхуяг', contractNumber: 'MG-1' }],
        ['c2', { customer: 'Б. Оюун', contractNumber: 'MG-2' }],
    ]);

    it('хугацаа өнгөрсөн, төлөгдөөгүй үлдэгдлийг гэрээгээр нэгтгэнэ', () => {
        const r = buildOverdue(
            [
                { contract_id: 'c1', due_date: '2026-08-27', amount: 20_000_000, paid_amount: 0, status: 'pending' },
                { contract_id: 'c1', due_date: '2026-09-01', amount: 15_000_000, paid_amount: 3_800_000, status: 'partial' },
                { contract_id: 'c2', due_date: '2026-09-03', amount: 28_700_000, paid_amount: 0, status: 'overdue' },
                { contract_id: 'c2', due_date: '2026-09-14', amount: 10_000_000, paid_amount: 0, status: 'pending' }, // ирээдүй
                { contract_id: 'c1', due_date: '2026-07-01', amount: 5_000_000, paid_amount: 5_000_000, status: 'paid' },
            ],
            info,
            today,
        );
        expect(r.count).toBe(2);
        expect(r.total).toBe(31_200_000 + 28_700_000);
        expect(r.items[0]).toEqual({ contractId: 'c1', customer: 'Л. Ганхуяг', contractNumber: 'MG-1', amount: 31_200_000, daysOverdue: 12 });
        expect(r.items[1].daysOverdue).toBe(5);
    });

    it('өнөөдөр дуусах төлбөр хугацаа хэтэрсэнд ОРОХГҮЙ', () => {
        const r = buildOverdue([{ contract_id: 'c1', due_date: '2026-09-08', amount: 1, paid_amount: 0, status: 'pending' }], info, today);
        expect(r.count).toBe(0);
    });
});

describe('жижиг туслахууд', () => {
    it('countByUnitType', () => {
        expect(countByUnitType([{ unit_type: '3 өрөө' }, { unit_type: '2 өрөө' }, { unit_type: '3 өрөө' }, { unit_type: null }])).toEqual([
            { type: '3 өрөө', count: 2 },
            { type: '2 өрөө', count: 1 },
            { type: 'Бусад', count: 1 },
        ]);
    });
    it('attainmentPct / momDeltaPct', () => {
        expect(attainmentPct(1_240, 1_500)).toBe(83);
        expect(attainmentPct(10, 0)).toBe(0);
        expect(momDeltaPct(1_240, 1_105)).toBe(12);
        expect(momDeltaPct(5, 0)).toBeNull();
    });
});
