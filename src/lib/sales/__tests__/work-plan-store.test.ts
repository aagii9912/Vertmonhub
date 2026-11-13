// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: audit }));

import { createWorkPlanItem, deleteWorkPlanItem, readWorkPlan, updateWorkPlanItem } from '@/lib/sales/work-plan-store';

type Row = Record<string, unknown>;
const shop = 'shop-1';
const chantsal = '00000000-0000-4000-8000-000000000001';
const khongor = '00000000-0000-4000-8000-000000000002';
const former = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000009';
const itemId = '10000000-0000-4000-8000-000000000001';
const actor = { userId: 'user-1', name: 'Чанцал' };

/** Санах ойн жижиг DB: eq/is шүүлт, insert/update (select().single()/maybeSingle()), хүснэгт тус бүрийн алдаа. */
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, { code: string; message: string }> = {}) {
    let next = 1;
    const db = { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let write: { kind: 'insert' | 'update'; values: Row } | null = null;
        const matched = () => (tables[table] ??= []).filter(row => filters.every(test => test(row)));
        const run = () => {
            if (errors[table]) return { data: null, error: errors[table] };
            if (write?.kind === 'insert') {
                const row = { id: `10000000-0000-4000-8000-0000000000${String(10 + next++)}`, done_at: null, done_by_name: null, deleted_at: null, ...write.values };
                (tables[table] ??= []).push(row);
                return { data: [row], error: null };
            }
            if (write?.kind === 'update') {
                const rows = matched();
                rows.forEach(row => Object.assign(row, write!.values));
                return { data: rows, error: null };
            }
            return { data: matched(), error: null };
        };
        const query: Record<string, unknown> = {
            select: () => query, order: () => query, range: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            insert: (values: Row) => { write = { kind: 'insert', values }; return query; },
            update: (values: Row) => { write = { kind: 'update', values }; return query; },
            single: () => { const { data, error } = run(); return Promise.resolve({ data: data?.[0] ?? null, error }); },
            maybeSingle: () => { const { data, error } = run(); return Promise.resolve({ data: data?.[0] ?? null, error }); },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
        };
        return query;
    } };
    return db as unknown as SupabaseClient;
}

const base = (): Record<string, Row[]> => ({
    sales_managers: [
        { id: chantsal, shop_id: shop, name: 'Чанцалдулам.Раднаа', is_active: true },
        { id: khongor, shop_id: shop, name: 'Хонгорзул.Мөнхсайхан', is_active: true },
        { id: former, shop_id: shop, name: 'Энхзул.Бат', is_active: false },
        { id: outsider, shop_id: 'shop-2', name: 'Өөр.Төсөл', is_active: true },
    ],
    sales_manager_projects: [
        { shop_id: shop, manager_name: 'Чанцалдулам.Раднаа', project_id: 'p1' }, { shop_id: shop, manager_name: 'Хонгорзул.Мөнхсайхан', project_id: 'p1' },
        { shop_id: shop, manager_name: 'Энхзул.Бат', project_id: 'p1' },
    ],
    sales_work_plan_items: [
        { id: itemId, shop_id: shop, plan_month: '2026-11', title: 'Showroom тохижуулах', assignee_ids: [chantsal, former], sort_order: 10, done_at: null, done_by_name: null,
            created_by: 'user-2', created_by_name: 'Хонгор', deleted_at: null },
        { id: '10000000-0000-4000-8000-000000000002', shop_id: shop, plan_month: '2026-10', title: 'Өмнөх сарын ажил', assignee_ids: [], sort_order: 10, done_at: null, created_by: 'user-1', deleted_at: null },
        { id: '10000000-0000-4000-8000-000000000003', shop_id: 'shop-2', plan_month: '2026-11', title: 'Өөр төслийн ажил', assignee_ids: [], sort_order: 10, done_at: null, created_by: 'user-1', deleted_at: null },
        { id: '10000000-0000-4000-8000-000000000004', shop_id: shop, plan_month: '2026-11', title: 'Устгасан ажил', assignee_ids: [], sort_order: 20, done_at: null, created_by: 'user-1', deleted_at: '2026-11-02T00:00:00Z' },
    ],
});

beforeEach(() => { audit.mockReset(); });

describe('сарын ажлын төлөвлөгөө — store', () => {
    it('reads this shop and month only, names assignees from the roster and offers active registered managers', async () => {
        const plan = await readWorkPlan(fakeDb(base()), shop, '2026-11');
        expect(plan.available).toBe(true);
        expect(plan.items.map(item => item.title)).toEqual(['Showroom тохижуулах']);
        // Идэвхгүй болсон хариуцагч нэрээрээ үлдэнэ, гэхдээ шинээр оноох жагсаалтад байхгүй.
        expect(plan.items[0].assignees).toEqual([{ id: chantsal, name: 'Чанцалдулам.Раднаа' }, { id: former, name: 'Энхзул.Бат' }]);
        expect(plan.roster.map(manager => manager.name)).toEqual(['Хонгорзул.Мөнхсайхан', 'Чанцалдулам.Раднаа']);
    });

    it('reports a missing table as unavailable instead of an empty plan, and refuses writes with 503', async () => {
        const missing = { sales_work_plan_items: { code: 'PGRST205', message: "Could not find the table 'public.sales_work_plan_items'" } };
        expect(await readWorkPlan(fakeDb(base(), missing), shop, '2026-11')).toMatchObject({ available: false, items: [] });
        expect(await createWorkPlanItem(fakeDb(base(), missing), shop, { month: '2026-11', title: 'Ажил', assigneeIds: [] }, actor)).toMatchObject({ ok: false, status: 503 });
        await expect(readWorkPlan(fakeDb(base(), { sales_work_plan_items: { code: '57014', message: 'statement timeout' } }), shop, '2026-11')).rejects.toThrow('statement timeout');
    });

    it('adds an item at the end with its author, and only assigns active managers of this shop', async () => {
        const tables = base();
        const created = await createWorkPlanItem(fakeDb(tables), shop, { month: '2026-11', title: 'Борлуулалтын оффис', assigneeIds: [khongor] }, actor);
        expect(created).toMatchObject({ ok: true, item: { title: 'Борлуулалтын оффис', month: '2026-11', done: false, sort_order: 20, created_by: 'user-1', assignees: [{ id: khongor, name: 'Хонгорзул.Мөнхсайхан' }] } });
        expect(tables.sales_work_plan_items.at(-1)).toMatchObject({ shop_id: shop, created_by_name: 'Чанцал', assignee_ids: [khongor] });
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entity: 'work_plan_item', action: 'create', shopId: shop }));

        for (const bad of [outsider, former]) {
            const refused = base();
            expect(await createWorkPlanItem(fakeDb(refused), shop, { month: '2026-11', title: 'Ажил', assigneeIds: [bad] }, actor)).toMatchObject({ ok: false, status: 400 });
            expect(refused.sales_work_plan_items).toHaveLength(4);
        }
    });

    it('checks an item off with who did it, clears that on uncheck and keeps a current inactive assignee', async () => {
        const tables = base();
        const db = fakeDb(tables);
        expect(await updateWorkPlanItem(db, shop, itemId, { done: true }, actor)).toMatchObject({ ok: true, item: { done: true, done_by_name: 'Чанцал' } });
        expect(tables.sales_work_plan_items[0]).toMatchObject({ done_by: 'user-1', done_by_name: 'Чанцал' });
        expect(tables.sales_work_plan_items[0].done_at).toEqual(expect.any(String));
        expect(await updateWorkPlanItem(db, shop, itemId, { done: false }, actor)).toMatchObject({ ok: true, item: { done: false } });
        expect(tables.sales_work_plan_items[0]).toMatchObject({ done_at: null, done_by: null, done_by_name: null });
        // Идэвхгүй болсон одоогийн хариуцагч хэвээр үлдэж болно; өөр shop-ийн менежер оноогдохгүй.
        expect(await updateWorkPlanItem(db, shop, itemId, { assigneeIds: [former, khongor] }, actor)).toMatchObject({ ok: true, item: { assignees: [{ id: former }, { id: khongor }] } });
        expect(await updateWorkPlanItem(db, shop, itemId, { assigneeIds: [outsider] }, actor)).toMatchObject({ ok: false, status: 400 });
        // Өөр shop-ийн, устгасан, байхгүй ажил — 404.
        for (const other of ['10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000099']) {
            expect(await updateWorkPlanItem(db, shop, other, { done: true }, actor)).toMatchObject({ ok: false, status: 404 });
        }
    });

    it('writes nothing and no audit entry when the patch changes nothing', async () => {
        const tables = base();
        expect(await updateWorkPlanItem(fakeDb(tables), shop, itemId, { title: 'Showroom тохижуулах', done: false, assigneeIds: [former, chantsal] }, actor)).toMatchObject({ ok: true });
        expect(tables.sales_work_plan_items[0]).not.toHaveProperty('updated_at');
        expect(audit).not.toHaveBeenCalled();
    });

    it('soft-deletes own items; others\' only with the delete permission', async () => {
        const tables = base();
        const db = fakeDb(tables);
        expect(await deleteWorkPlanItem(db, shop, itemId, actor, false)).toMatchObject({ ok: false, status: 403 });
        expect(tables.sales_work_plan_items[0].deleted_at).toBeNull();
        expect(await deleteWorkPlanItem(db, shop, itemId, actor, true)).toEqual({ ok: true, id: itemId });
        expect(tables.sales_work_plan_items[0].deleted_at).toEqual(expect.any(String));
        expect((await readWorkPlan(db, shop, '2026-11')).items).toEqual([]);
        expect(await deleteWorkPlanItem(db, shop, itemId, actor, true)).toMatchObject({ ok: false, status: 404 });
        // Өөрийн нэмсэн ажлыг бичих эрхээр.
        const own = base();
        own.sales_work_plan_items[0].created_by = 'user-1';
        expect(await deleteWorkPlanItem(fakeDb(own), shop, itemId, actor, false)).toMatchObject({ ok: true });
    });
});
