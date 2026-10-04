// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ role: 'sales_manager', db: null as unknown as MemoryDb }));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null,
    requireModuleWrite: async () => null,
    requireAnyModule: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: ['leads'], canWrite: true, canDelete: false } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET as list, POST as create } from './route';
import { PATCH as patch } from './[id]/route';

const mandala = '00000000-0000-4000-8000-000000000001';
const ownLead = '00000000-0000-4000-8000-000000000011';
const colleagueLead = '00000000-0000-4000-8000-000000000013';
const investor = '30000000-0000-4000-8000-000000000001';
const archived = '30000000-0000-4000-8000-000000000002';
const foreign = '30000000-0000-4000-8000-000000000003';
const request = (path = '', method = 'GET', body?: Record<string, unknown>) =>
    new NextRequest(`http://localhost/api/dashboard/leads${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const ids = async (response: Response) => (await response.json()).leads.map((lead: { id: string }) => lead.id);
const lead = (id: string, extra: Record<string, unknown>) =>
    ({ id, shop_id: 'shop-1', project_id: mandala, status: 'new', deleted_at: null, category_id: null, customer_name: id, ...extra });

beforeEach(() => {
    state.role = 'sales_manager';
    state.db = createMemoryDb({
        user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
        projects: [{ id: mandala, shop_id: 'shop-1', name: 'Mandala Garden' }],
        sales_managers: [
            { shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true },
            { shop_id: 'shop-1', name: 'Хамтрагч', user_id: 'user-3', is_active: true },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: 'Манда', project_id: mandala },
            { shop_id: 'shop-1', manager_name: 'Хамтрагч', project_id: mandala },
        ],
        lead_categories: [
            { id: investor, shop_id: 'shop-1', name: 'Хөрөнгө оруулагч', tone: 'success', sort_order: 10, is_active: true },
            { id: archived, shop_id: 'shop-1', name: 'Бартер', tone: 'neutral', sort_order: 20, is_active: false },
            { id: foreign, shop_id: 'shop-2', name: 'Түрээслэгч', tone: 'neutral', sort_order: 10, is_active: true },
        ],
        leads: [
            lead(ownLead, { sales_manager_name: 'Манда', category_id: archived }),
            lead('own-plain', { sales_manager_name: 'Манда' }),
            lead('own-investor', { sales_manager_name: 'Манда', category_id: investor }),
            lead(colleagueLead, { sales_manager_name: 'Хамтрагч', category_id: investor }),
        ],
        lead_activities: [],
    });
});

describe('lead category filter, create and edit', () => {
    it('filters by category or uncategorized inside the caller scope', async () => {
        expect(await ids(await list(request(`?category=${investor}`)))).toEqual(['own-investor']);
        expect(await ids(await list(request('?category=none')))).toEqual(['own-plain']);
        expect(await ids(await list(request('?category=all')))).toHaveLength(3);
        expect((await list(request('?category=Бартер'))).status).toBe(400);
        state.role = 'admin';
        expect(await ids(await list(request(`?category=${investor}`)))).toEqual(['own-investor', colleagueLead]);
    });

    it('stores only an active category of the same project shop on create', async () => {
        const base = { project_id: mandala, customer_name: 'Шинэ' };
        expect((await create(request('', 'POST', { ...base, category_id: foreign }))).status).toBe(400);
        expect((await create(request('', 'POST', { ...base, category_id: archived }))).status).toBe(400);
        expect((await create(request('', 'POST', { ...base, category_id: 'Бартер' }))).status).toBe(400);
        expect(state.db.writes).toEqual([]);
        expect((await create(request('', 'POST', { ...base, category_id: investor }))).status).toBe(200);
        expect((await create(request('', 'POST', { ...base, customer_name: 'Ангилалгүй', category_id: null }))).status).toBe(200);
        const inserted = state.db.writes.filter((w) => w.table === 'leads').map((w) => w.data);
        expect(inserted.map((row) => row.category_id)).toEqual([investor, undefined]);
        // Ангилалгүй лид баганыг огт бичихгүй — migration-аас өмнөх DB дээр лид үүсгэх ажиллана.
        expect('category_id' in inserted[1]).toBe(false);
    });

    it('keeps other lead edits independent of the category column', async () => {
        const selects: string[] = [];
        const from = state.db.from;
        state.db.from = (table: string) => {
            const query = from(table);
            if (table !== 'leads') return query;
            const select = query.select;
            query.select = (columns?: string, options?: unknown) => { selects.push(columns ?? ''); return select(columns, options); };
            return query;
        };
        expect((await patch(request('', 'PATCH', { notes: 'Залгана' }), context(ownLead))).status).toBe(200);
        expect(selects.length).toBeGreaterThan(0);
        expect(selects.every((columns) => !columns.includes('category_id'))).toBe(true);
        expect((await patch(request('', 'PATCH', { category_id: investor }), context(ownLead))).status).toBe(200);
        expect(selects.some((columns) => columns.includes('category_id'))).toBe(true);
    });

    it('changes the category of an own lead and records it in the lead history', async () => {
        const response = await patch(request('', 'PATCH', { category_id: investor }), context(ownLead));
        expect(response.status).toBe(200);
        expect(state.db.tables.leads.find((row) => row.id === ownLead)?.category_id).toBe(investor);
        expect(state.db.tables.lead_activities).toEqual([expect.objectContaining({
            lead_id: ownLead, type: 'system', created_by: 'user-1', created_by_name: 'Манда',
            content: 'Ангилал: Бартер → Хөрөнгө оруулагч',
            meta: { field: 'category', from: archived, to: investor, from_name: 'Бартер', to_name: 'Хөрөнгө оруулагч' },
        })]);

        expect((await patch(request('', 'PATCH', { category_id: null }), context(ownLead))).status).toBe(200);
        expect(state.db.tables.lead_activities.at(-1)).toMatchObject({ content: 'Ангилал: Хөрөнгө оруулагч → Ангилалгүй', meta: { from: investor, to: null } });
    });

    it('keeps a current archived category but never assigns a new archived, foreign or malformed one', async () => {
        expect((await patch(request('', 'PATCH', { category_id: archived }), context(ownLead))).status).toBe(200);
        expect(state.db.tables.lead_activities).toEqual([]);
        for (const [id, category] of [['own-plain', archived], ['own-plain', foreign], ['own-plain', 'x'], ['own-plain', 5]] as const) {
            expect((await patch(request('', 'PATCH', { category_id: category }), context(id))).status).toBe(400);
        }
        // Хувийн хүрээнээс гадуурх лид — 404, бичилтгүй.
        expect((await patch(request('', 'PATCH', { category_id: investor }), context(colleagueLead))).status).toBe(404);
        expect(state.db.writes.filter((w) => w.op === 'update' && w.table === 'leads').map((w) => w.data.id)).toEqual([ownLead]);
    });
});
