// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadLeadTimeline, loadPhoneDuplicates, TIMELINE_DUPLICATE_LIMIT, TIMELINE_DUPLICATE_PAGE, TIMELINE_DUPLICATE_SCAN_MAX } from '../timeline-load';

vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Result = { data: unknown; error: { message: string } | null };

/** Хүснэгт бүрт нэг хариу (эсвэл дуудлага бүрт дараалсан хариу); дуудлагын шүүлтүүдийг тэмдэглэнэ. */
function fakeDb(results: Record<string, Result | Result[]>) {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const from = vi.fn((table: string) => {
        const entry = results[table];
        const result = (Array.isArray(entry) ? entry.shift() : entry) ?? { data: [], error: null };
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'is', 'in', 'neq', 'ilike', 'order', 'range', 'limit']) {
            chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
        }
        chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
        return chain;
    });
    return { db: { from } as unknown as SupabaseClient, calls, from };
}

const lead = { id: 'lead-1', created_at: '2026-09-01T02:00:00Z', source: 'phone', sales_manager_name: 'Манда', customer_phone: '+976 9911-2233' };
const roster = [{ name: 'Манда', user_id: 'u-manda', is_active: true }, { name: 'Сараа', user_id: 'u-saraa', is_active: true }];

describe('loadLeadTimeline', () => {
    it('surfaces failed sources in partial instead of an empty, complete-looking history', async () => {
        const { db } = fakeDb({
            lead_activities: { data: null, error: { message: 'timeout' } },
            sales_managers: { data: roster, error: null },
            leads: { data: null, error: { message: 'timeout' } },
        });
        const { timeline, activities } = await loadLeadTimeline(db, 'shop-1', lead, { projectIds: null, managerName: null });
        expect(activities).toBeNull();
        expect(timeline.partial.sort()).toEqual(['activities', 'duplicates']);
        expect(timeline.events.map((e) => e.kind)).toEqual(['created']);
    });

    it('reads the full history in order and resolves unnamed actors from profiles', async () => {
        const { db, calls } = fakeDb({
            lead_activities: { data: [
                { id: 'a1', lead_id: 'lead-1', type: 'call', content: 'Ярьсан', meta: {}, created_by: 'u-manda', created_by_name: 'manda@x.mn', created_at: '2026-09-02T02:00:00Z' },
                { id: 'a2', lead_id: 'lead-1', type: 'note', content: 'Тэмдэглэл', meta: {}, created_by: 'u-admin', created_by_name: null, created_at: '2026-09-03T02:00:00Z' },
            ], error: null },
            sales_managers: { data: roster, error: null },
            user_profiles: { data: [{ id: 'u-admin', full_name: 'Админ Болд' }], error: null },
        });
        const { timeline } = await loadLeadTimeline(db, 'shop-1', lead, { projectIds: null, managerName: null });
        expect(timeline.partial).toEqual([]);
        expect(timeline.events.map((e) => [e.kind, e.actor, e.manager])).toEqual([['note', 'Админ Болд', null], ['call', 'Манда', 'Манда'], ['created', null, null]]);
        expect(calls).toContainEqual({ table: 'lead_activities', method: 'range', args: [0, 999] });
        expect(calls).toContainEqual({ table: 'user_profiles', method: 'in', args: ['id', ['u-admin']] });
        expect(calls.filter((c) => c.table === 'lead_activities' && c.method === 'eq')).toEqual([
            { table: 'lead_activities', method: 'eq', args: ['shop_id', 'shop-1'] },
            { table: 'lead_activities', method: 'eq', args: ['lead_id', 'lead-1'] },
        ]);
    });
});

describe('loadPhoneDuplicates', () => {
    const rows = [
        { id: 'dup-1', customer_name: 'Болд', customer_phone: '99112233', status: 'new', sales_manager_name: 'Сараа', created_at: '2026-09-05T00:00:00Z' },
        { id: 'dup-2', customer_name: null, customer_phone: '9911 2233', status: 'contacted', sales_manager_name: 'Манда', created_at: '2026-09-04T00:00:00Z' },
        { id: 'near', customer_name: 'Өөр', customer_phone: '899112233', status: 'new', sales_manager_name: 'Дорж', created_at: '2026-09-03T00:00:00Z' },
    ];

    it('searches the whole shop by full number and masks other leads for a restricted manager', async () => {
        const { db, calls } = fakeDb({ leads: { data: rows, error: null } });
        const masked = await loadPhoneDuplicates(db, 'shop-1', lead, { projectIds: ['p1'], managerName: 'Манда' });
        expect(masked).toEqual({ count: 2, managers: ['Сараа'], masked: true, leads: [], truncated: false });
        expect(calls).toContainEqual({ table: 'leads', method: 'ilike', args: ['customer_phone', '%9911%2233%'] });
        expect(calls).toContainEqual({ table: 'leads', method: 'neq', args: ['id', 'lead-1'] });
        expect(calls).toContainEqual({ table: 'leads', method: 'range', args: [0, TIMELINE_DUPLICATE_PAGE - 1] });
        // Хүрээний шүүлтгүй — зориуд тухайн shop-ийн бүх лид.
        expect(calls.some((c) => c.table === 'leads' && c.method === 'in')).toBe(false);

        const open = await loadPhoneDuplicates(db, 'shop-1', lead, { projectIds: null, managerName: null });
        expect(open?.leads).toEqual([
            { id: 'dup-1', name: 'Болд', anonymous: false, status: 'new', sales_manager_name: 'Сараа', created_at: '2026-09-05T00:00:00Z' },
            { id: 'dup-2', name: 'Нэргүй харилцагч', anonymous: true, status: 'contacted', sales_manager_name: 'Манда', created_at: '2026-09-04T00:00:00Z' },
        ]);
    });

    it('pages past loose candidates so exact matches are not missed, and flags only an incomplete count', async () => {
        const loose = (page: number) => Array.from({ length: TIMELINE_DUPLICATE_PAGE }, (_, i) => ({
            id: `loose-${page}-${i}`, customer_name: 'Өөр', customer_phone: `9911${String(page)}2233${i}`, status: 'new', sales_manager_name: 'Дорж', created_at: null,
        }));
        // Эхний хуудас бүхэлдээ ойролцоо дугаар — бүтэн таарах лид 2-р хуудсанд.
        const { db, calls } = fakeDb({ leads: [{ data: loose(1), error: null }, { data: [rows[0]], error: null }] });
        expect(await loadPhoneDuplicates(db, 'shop-1', lead, { projectIds: ['p1'], managerName: 'Манда' }))
            .toEqual({ count: 1, managers: ['Сараа'], masked: true, leads: [], truncated: false });
        expect(calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([[0, TIMELINE_DUPLICATE_PAGE - 1], [TIMELINE_DUPLICATE_PAGE, 2 * TIMELINE_DUPLICATE_PAGE - 1]]);

        // Шалгах дээд хэмжээнд хүрвэл тоо нь доод үнэлгээ.
        const pages = TIMELINE_DUPLICATE_SCAN_MAX / TIMELINE_DUPLICATE_PAGE;
        const capped = fakeDb({ leads: Array.from({ length: pages }, (_, i) => ({ data: i ? loose(i) : [rows[0], ...loose(0).slice(1)], error: null })) });
        expect(await loadPhoneDuplicates(capped.db, 'shop-1', lead, { projectIds: null, managerName: null })).toMatchObject({ count: 1, truncated: true });
        expect(capped.from).toHaveBeenCalledTimes(pages);

        // Хязгаараас олон бүтэн таарвал хязгаараар таслаад доод үнэлгээ.
        const many = Array.from({ length: TIMELINE_DUPLICATE_LIMIT + 5 }, (_, i) => ({ ...rows[0], id: `dup-${i}` }));
        const full = await loadPhoneDuplicates(fakeDb({ leads: { data: many, error: null } }).db, 'shop-1', lead, { projectIds: null, managerName: null });
        expect(full).toMatchObject({ count: TIMELINE_DUPLICATE_LIMIT, truncated: true });
        expect(full?.leads).toHaveLength(TIMELINE_DUPLICATE_LIMIT);
    });

    it('skips short or missing phones without querying', async () => {
        const { db, from } = fakeDb({});
        expect(await loadPhoneDuplicates(db, 'shop-1', { ...lead, customer_phone: '1234' }, { projectIds: null, managerName: null })).toBeNull();
        expect(await loadPhoneDuplicates(db, 'shop-1', { ...lead, customer_phone: null }, { projectIds: null, managerName: null })).toBeNull();
        expect(from).not.toHaveBeenCalled();
    });
});
