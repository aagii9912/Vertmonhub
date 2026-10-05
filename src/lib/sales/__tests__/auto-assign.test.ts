import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leastLoaded, pickAutoAssignManager } from '../auto-assign';
import { insertLeadOnce } from '@/lib/services/LeadService';

vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

type Row = Record<string, unknown>;
const shopId = 'shop-1';
const projectId = 'project-1';

/** Хүснэгт бүрийн мөрөөр шүүдэг энгийн DB; leads-ийн count, insert-ийг бичнэ. */
function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
    const writes: Array<{ table: string; row: Row }> = [];
    const db = {
        from(table: string) {
            const filters: Array<(row: Row) => boolean> = [];
            let payload: Row | null = null;
            let head = false;
            const run = () => {
                if (failing.includes(table)) return { data: null, error: { message: `${table} unavailable` }, count: null };
                if (payload) {
                    writes.push({ table, row: payload });
                    return { data: { id: `${table}-new`, ...payload }, error: null, count: null };
                }
                const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
                return { data: head ? null : rows, error: null, count: rows.length };
            };
            const query = {
                select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
                insert: (row: Row) => { payload = row; return query; },
                eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
                in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
                is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
                order: () => query,
                range: () => query,
                single: async () => run(),
                maybeSingle: async () => run(),
                then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
            };
            return query;
        },
    };
    return { db: db as unknown as SupabaseClient, writes };
}

const roster = (name: string, userId: string | null, isActive = true) => ({ shop_id: shopId, name, user_id: userId, is_active: isActive });
const member = (name: string, project = projectId) => ({ shop_id: shopId, project_id: project, manager_name: name });
const openLead = (manager: string, status = 'new') => ({ shop_id: shopId, project_id: projectId, sales_manager_name: manager, status, deleted_at: null });

describe('pickAutoAssignManager', () => {
    it('returns the only registered, active, linked manager of the project', async () => {
        const { db } = fakeDb({
            sales_managers: [roster('Чанцалдулам.Раднаа', 'u1'), roster('Хуучин', 'u2', false), roster('Дансгүй', null)],
            sales_manager_projects: [member('Чанцалдулам.Раднаа'), member('Хуучин'), member('Дансгүй')],
        });
        expect(await pickAutoAssignManager(db, shopId, projectId)).toBe('Чанцалдулам.Раднаа');
    });

    it('never picks managers of other projects, unlinked or ambiguous accounts', async () => {
        const { db } = fakeDb({
            sales_managers: [roster('Өөр төсөл', 'u1'), roster('Давхар А', 'u2'), roster('Давхар Б', 'u2', false)],
            sales_manager_projects: [member('Өөр төсөл', 'project-2'), member('Давхар А')],
        });
        expect(await pickAutoAssignManager(db, shopId, projectId)).toBeNull();
    });

    it('balances several managers by their open leads in the project, ties by name', async () => {
        const { db } = fakeDb({
            sales_managers: [roster('Ариунбилэг', 'u1'), roster('Энхзул', 'u2')],
            sales_manager_projects: [member('Ариунбилэг'), member('Энхзул')],
            leads: [openLead('Ариунбилэг'), openLead('Ариунбилэг'), openLead('Энхзул'), openLead('Энхзул', 'closed_won'), openLead('Энхзул', 'lost')],
        });
        expect(await pickAutoAssignManager(db, shopId, projectId)).toBe('Энхзул');
        expect(leastLoaded(['Ариунбилэг', 'Энхзул'], new Map())).toBe('Ариунбилэг');
    });
});

describe('insertLeadOnce auto-assignment', () => {
    const tables = () => ({ sales_managers: [roster('Чанцалдулам.Раднаа', 'u1')], sales_manager_projects: [member('Чанцалдулам.Раднаа')] });

    it('assigns an unassigned project lead and records it on the timeline', async () => {
        const { db, writes } = fakeDb(tables());
        const result = await insertLeadOnce(db, { shop_id: shopId, project_id: projectId, customer_phone: '99112233' });
        expect(result).toMatchObject({ ok: true, autoAssigned: 'Чанцалдулам.Раднаа' });
        expect(writes).toEqual([
            { table: 'leads', row: expect.objectContaining({ sales_manager_name: 'Чанцалдулам.Раднаа' }) },
            { table: 'lead_activities', row: expect.objectContaining({ type: 'manager', meta: { action: 'auto_assign', to: 'Чанцалдулам.Раднаа' } }) },
        ]);
    });

    it('keeps an explicit manager and leads without a project untouched', async () => {
        const { db, writes } = fakeDb(tables());
        await insertLeadOnce(db, { shop_id: shopId, project_id: projectId, sales_manager_name: 'Админы сонгосон' });
        await insertLeadOnce(db, { shop_id: shopId, project_id: null });
        expect(writes.map(write => [write.table, write.row.sales_manager_name])).toEqual([['leads', 'Админы сонгосон'], ['leads', undefined]]);
    });

    it('still saves the lead unassigned when the roster cannot be read', async () => {
        const { db, writes } = fakeDb(tables(), ['sales_managers']);
        const result = await insertLeadOnce(db, { shop_id: shopId, project_id: projectId });
        expect(result).toMatchObject({ ok: true, autoAssigned: null });
        expect(writes).toEqual([{ table: 'leads', row: { shop_id: shopId, project_id: projectId } }]);
    });
});
