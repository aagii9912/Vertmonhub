import { describe, it, expect } from 'vitest';
import { computeAnomalies, summarizeAnomalies, type AnomalyInput } from '../oversight';

const NOW = new Date('2026-08-22T09:00:00.000Z');

function daysAgo(n: number): string {
    return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}
function daysAhead(n: number): string {
    return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

const base: AnomalyInput = {
    managers: [
        { name: 'Батбаяр', is_active: true },
        { name: 'Сараа', is_active: true },
        { name: 'Хуучин', is_active: false },
    ],
    activities: [],
    leads: [],
    staleDays: 5,
    inactiveDays: 2,
    now: NOW,
};

describe('computeAnomalies — идэвхгүй менежер', () => {
    it('бүртгэл ХООСОН үед хэнийг ч идэвхгүй гэж зарлахгүй', () => {
        // Миграци ороогүй / бүртгэл эхлээгүй орчинд бүх менежерийг худал
        // «идэвхгүй» гэж тэмдэглэвэл анхааруулга нь утгагүй болно.
        const out = computeAnomalies(base);
        expect(out.filter((a) => a.kind === 'no_activity')).toEqual([]);
    });

    it('бүртгэлтэй үед идэвх бичигдээгүй менежерийг тэмдэглэнэ', () => {
        const out = computeAnomalies({
            ...base,
            activities: [{ actor_name: 'Батбаяр', occurred_at: daysAgo(1), kind: 'call' }],
        });
        const idle = out.filter((a) => a.kind === 'no_activity').map((a) => a.manager);
        expect(idle).toEqual(['Сараа']);
    });

    it('идэвхгүй (is_active=false) менежерийг шалгахгүй', () => {
        const out = computeAnomalies({
            ...base,
            activities: [{ actor_name: 'Батбаяр', occurred_at: daysAgo(1), kind: 'call' }],
        });
        expect(out.some((a) => a.manager === 'Хуучин')).toBe(false);
    });
});

describe('computeAnomalies — дагалт ба хүйтэн лид', () => {
    it('хугацаа хэтэрсэн дагалтыг тэмдэглэж, 3+ хоног бол critical', () => {
        const out = computeAnomalies({
            ...base,
            leads: [
                { id: 'a', customer_name: 'Дорж', sales_manager_name: 'Батбаяр', next_followup_at: daysAgo(4), updated_at: daysAgo(4) },
                { id: 'b', customer_name: 'Оюун', sales_manager_name: 'Сараа', next_followup_at: daysAgo(1), updated_at: daysAgo(1) },
            ],
        });
        const overdue = out.filter((a) => a.kind === 'overdue_followup');
        expect(overdue).toHaveLength(2);
        expect(overdue.find((a) => a.detail.leadId === 'a')?.severity).toBe('critical');
        expect(overdue.find((a) => a.detail.leadId === 'b')?.severity).toBe('warn');
    });

    it('ирээдүйн дагалттай лийдийг тэмдэглэхгүй', () => {
        const out = computeAnomalies({
            ...base,
            leads: [{ id: 'a', customer_name: 'Дорж', sales_manager_name: 'Батбаяр', next_followup_at: daysAhead(2), updated_at: daysAgo(30) }],
        });
        expect(out.filter((a) => a.kind === 'overdue_followup')).toEqual([]);
        // Дагалт товлосон тул «хүйтэн» ч биш
        expect(out.filter((a) => a.kind === 'cold_lead')).toEqual([]);
    });

    it('удаан хөндөөгүй, дагалтгүй лийдийг хүйтэн гэж үзнэ', () => {
        const out = computeAnomalies({
            ...base,
            leads: [{ id: 'c', customer_name: 'Ганаа', sales_manager_name: 'Сараа', updated_at: daysAgo(9) }],
        });
        const cold = out.filter((a) => a.kind === 'cold_lead');
        expect(cold).toHaveLength(1);
        expect(cold[0].detail.idleDays).toBe(9);
    });

    it('босгоос доош хугацаатай лийдийг хүйтэн гэж үзэхгүй', () => {
        const out = computeAnomalies({
            ...base,
            leads: [{ id: 'd', customer_name: 'Дулмаа', sales_manager_name: 'Сараа', updated_at: daysAgo(2) }],
        });
        expect(out.filter((a) => a.kind === 'cold_lead')).toEqual([]);
    });

    it('эзэнгүй лийдийг тэмдэглэнэ', () => {
        const out = computeAnomalies({
            ...base,
            leads: [{ id: 'e', customer_name: 'Эрдэнэ', sales_manager_name: null, updated_at: daysAgo(1) }],
        });
        const un = out.filter((a) => a.kind === 'unassigned_lead');
        expect(un).toHaveLength(1);
        expect(un[0].manager).toBeNull();
    });
});

describe('computeAnomalies — эрэмбэлэлт', () => {
    it('critical → warn → info дарааллаар эрэмбэлнэ', () => {
        const out = computeAnomalies({
            ...base,
            activities: [{ actor_name: 'Батбаяр', occurred_at: daysAgo(1), kind: 'call' }],
            leads: [
                { id: 'a', customer_name: 'A', sales_manager_name: 'Батбаяр', next_followup_at: daysAgo(5), updated_at: daysAgo(5) },
                { id: 'b', customer_name: 'B', sales_manager_name: 'Батбаяр', updated_at: daysAgo(6) },
            ],
        });
        const sev = out.map((a) => a.severity);
        const rank = { critical: 0, warn: 1, info: 2 } as const;
        const ranks = sev.map((s) => rank[s]);
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    });
});

describe('summarizeAnomalies', () => {
    it('ноцтой байдал ба менежерээр нэгтгэнэ', () => {
        const out = computeAnomalies({
            ...base,
            activities: [{ actor_name: 'Батбаяр', occurred_at: daysAgo(1), kind: 'call' }],
            leads: [
                { id: 'a', customer_name: 'A', sales_manager_name: 'Батбаяр', next_followup_at: daysAgo(5), updated_at: daysAgo(5) },
                { id: 'b', customer_name: 'B', sales_manager_name: 'Батбаяр', next_followup_at: daysAgo(4), updated_at: daysAgo(4) },
            ],
        });
        const s = summarizeAnomalies(out);
        expect(s.critical).toBe(2);
        expect(s.byManager[0]).toEqual({ manager: 'Батбаяр', count: 2 });
    });
});
