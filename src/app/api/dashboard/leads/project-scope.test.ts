// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    role: 'sales_manager',
    denied: null as Response | null,
    rows: {} as Record<string, Record<string, any>[]>,
    writes: [] as { table: string; data: Record<string, unknown> }[],
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.denied,
    requireModuleWrite: async () => state.denied,
    requireAnyModule: async () => state.denied,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: ['leads', 'viewings'] } }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: async () => {} }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: async () => {} }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkRateLimit: async () => ({ allowed: true }), getClientIdentifier: () => 'test', createRateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let mutation: 'insert' | 'update' | null = null;
    let payload: Record<string, any> = {};
    let first = 0;
    let last = Infinity;
    let head = false;
    const valueAt = (row: Record<string, any>, key: string) => key.split('.').reduce((value, part) => value?.[part], row);
    const run = () => {
        const source = state.rows[table] || [];
        let data = source.filter(row => filters.every(filter => filter(row)));
        const count = data.length;
        if (mutation === 'insert') {
            if (table === 'leads' && payload.client_request_id && source.some(row => row.shop_id === payload.shop_id && row.client_request_id === payload.client_request_id)) {
                return { data: null, error: { code: '23505', message: 'duplicate request' }, count: 0 };
            }
            const row = { id: `created-${state.writes.length}`, deleted_at: null, ...payload };
            state.rows[table] = [...source, row];
            data = [row];
            state.writes.push({ table, data: payload });
        } else if (mutation === 'update') {
            for (const row of data) Object.assign(row, payload);
            if (data.length) state.writes.push({ table, data: payload });
        }
        return { data: head ? null : data.slice(first, last + 1), error: null, count };
    };
    const query = {
        select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
        insert: (data: Record<string, any>) => { mutation = 'insert'; payload = data; return query; },
        update: (data: Record<string, any>) => { mutation = 'update'; payload = data; return query; },
        eq: (key: string, value: unknown) => { filters.push(row => valueAt(row, key) === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(valueAt(row, key))); return query; },
        ilike: (key: string, value: string) => { const search = value.replace(/%/g, '').toLowerCase(); filters.push(row => String(row[key] || '').toLowerCase().includes(search)); return query; },
        // Энгийн `col.is|eq|ilike.value` OR-уудыг үнэлнэ; and(...) зэрэг бусдыг (ажлын дараалал) үл хэрэгсэнэ.
        or: (value: string) => {
            const clauses = value.includes('(') ? [] : value.split(',').map(clause => clause.match(/^([\w.]+)\.(is|eq|ilike)\.(.*)$/));
            if (!clauses.length || clauses.some(clause => !clause)) return query;
            const tests = clauses.map(clause => {
                const [, key, op, raw] = clause!;
                if (op === 'is') return (row: Record<string, any>) => (valueAt(row, key) ?? null) === null;
                if (op === 'eq') return (row: Record<string, any>) => (valueAt(row, key) as unknown) === (raw === '""' ? '' : raw);
                const pattern = new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'iu');
                return (row: Record<string, any>) => pattern.test(String(valueAt(row, key) ?? ''));
            });
            filters.push(row => tests.some(test => test(row)));
            return query;
        },
        order: () => query,
        gte: () => query,
        lt: () => query,
        gt: () => query,
        range: (from: number, to: number) => { first = from; last = to; return query; },
        limit: (limit: number) => { last = limit - 1; return query; },
        maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        single: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return query;
} }) }));

import { ANONYMOUS_LEAD_CONTACT, ANONYMOUS_LEAD_LABEL, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';
import { GET as list, POST as create } from './route';
import { GET as summary } from './summary/route';
import { GET as detail, PATCH as patch } from './[id]/route';
import { GET as activities, POST as contact } from './[id]/activities/route';
import { POST as claim } from './[id]/claim/route';
import { POST as convert } from './[id]/convert/route';
import { GET as projects } from './projects/route';
import { GET as managers } from '../managers/route';
import { GET as counts } from '../nav-counts/route';

const mandala = '00000000-0000-4000-8000-000000000001';
const elysium = '00000000-0000-4000-8000-000000000002';
const ownLead = '00000000-0000-4000-8000-000000000011';
const otherLead = '00000000-0000-4000-8000-000000000012';
const colleagueLead = '00000000-0000-4000-8000-000000000013';
const unassignedLead = '00000000-0000-4000-8000-000000000014';
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (path = '', method = 'GET', body?: Record<string, unknown>) => new NextRequest(`http://localhost/api/dashboard/leads${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
    state.role = 'sales_manager';
    state.denied = null;
    state.writes = [];
    state.rows = {
        user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
        projects: [{ id: mandala, shop_id: 'shop-1', name: 'Mandala Garden' }, { id: elysium, shop_id: 'shop-1', name: 'Elysium' }],
        sales_managers: [
            { shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true },
            { shop_id: 'shop-1', name: 'Хамтрагч', user_id: 'user-3', is_active: true },
            { shop_id: 'shop-1', name: 'Эли', user_id: 'user-2', is_active: true },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: 'Манда', project_id: mandala },
            { shop_id: 'shop-1', manager_name: 'Хамтрагч', project_id: mandala },
            { shop_id: 'shop-1', manager_name: 'Эли', project_id: elysium },
        ],
        leads: [
            { id: ownLead, shop_id: 'shop-1', project_id: mandala, customer_name: 'Өөрийн лид', status: 'new', sales_manager_name: 'Манда', deleted_at: null },
            { id: otherLead, shop_id: 'shop-1', project_id: elysium, customer_name: 'Өөр төслийн лид', status: 'new', sales_manager_name: 'Эли', deleted_at: null, client_request_id: '00000000-0000-4000-8000-000000000099' },
            { id: colleagueLead, shop_id: 'shop-1', project_id: mandala, customer_name: 'Хамтрагчийн лид', status: 'new', sales_manager_name: 'Хамтрагч', deleted_at: null },
            { id: unassignedLead, shop_id: 'shop-1', project_id: mandala, customer_name: 'Хуваарилаагүй', status: 'new', sales_manager_name: null, deleted_at: null },
            { id: 'legacy', shop_id: 'shop-1', project_id: null, customer_name: 'Хуучин лид', status: 'new', sales_manager_name: 'Манда', deleted_at: null },
        ],
        property_viewings: [
            { id: 'own-viewing', shop_id: 'shop-1', status: 'scheduled', deleted_at: null, leads: { project_id: mandala, sales_manager_name: 'Манда' } },
            { id: 'colleague-viewing', shop_id: 'shop-1', status: 'scheduled', deleted_at: null, leads: { project_id: mandala, sales_manager_name: 'Хамтрагч' } },
            { id: 'elysium-viewing', shop_id: 'shop-1', status: 'scheduled', deleted_at: null, leads: { project_id: elysium, sales_manager_name: 'Эли' } },
        ],
    };
});

describe('project and personal lead API boundaries', () => {
    it('lists and counts only assigned-to-self leads inside the manager project', async () => {
        const result = await list(request());
        expect((await result.json()).leads.map((lead: { id: string }) => lead.id)).toEqual([ownLead]);
        expect((await (await summary(request())).json())).toMatchObject({ all: 1, mine: 1, new: 1, canClaim: false });
        expect((await (await list(request('?manager=Хамтрагч'))).json()).leads).toEqual([]);
    });

    it('keeps navigation lead/viewing counts in the same personal scope', async () => {
        expect(await (await counts()).json()).toMatchObject({ leads: 1, meetings: 1 });
    });

    it('keeps the all-project selector within the manager own assigned scope', async () => {
        const response = await list(request('?project=all'));
        expect(response.status).toBe(200);
        expect((await response.json()).leads.map((lead: { id: string }) => lead.id)).toEqual([ownLead]);
    });

    it('rejects foreign project selection and leaves an unlinked manager empty', async () => {
        expect((await list(request(`?project=${elysium}`))).status).toBe(403);
        expect((await list(request('?project=bad'))).status).toBe(400);
        state.rows.sales_manager_projects = [];
        expect((await (await list(request())).json()).leads).toEqual([]);
        expect((await (await summary(request())).json()).all).toBe(0);
    });

    it('blocks detail, activity, edit, conversion and claim access to foreign or colleague leads', async () => {
        for (const id of [otherLead, colleagueLead, unassignedLead]) {
            expect((await detail(request(), context(id))).status).toBe(404);
            expect((await activities(request(), context(id))).status).toBe(404);
            expect((await contact(request('', 'POST', { content: 'Хандалт' }), context(id))).status).toBe(404);
            expect((await patch(request('', 'PATCH', { notes: 'Хандалт' }), context(id))).status).toBe(404);
            expect((await convert(request('', 'POST', {}), context(id))).status).toBe(404);
            expect((await claim(request('', 'POST', { next_followup_at: '2099-01-01T00:00:00Z' }), context(id))).status).toBe(404);
        }
        expect(state.writes).toEqual([]);
    });

    it('allows personal lead edits while preventing manager reassignment', async () => {
        expect((await patch(request('', 'PATCH', { notes: 'Өөрийн тэмдэглэл' }), context(ownLead))).status).toBe(200);
        expect((await patch(request('', 'PATCH', { sales_manager_name: 'Хамтрагч' }), context(ownLead))).status).toBe(403);
        expect((await patch(request('', 'PATCH', { sales_manager_name: null }), context(ownLead))).status).toBe(403);
    });

    it('requires an authorized project for new leads and stamps the manager', async () => {
        expect((await create(request('', 'POST', { customer_name: 'Шинэ' }))).status).toBe(400);
        expect((await create(request('', 'POST', { customer_name: 'Шинэ', project_id: elysium }))).status).toBe(403);
        expect((await create(request('', 'POST', { customer_name: 'Шинэ', project_id: mandala }))).status).toBe(200);
        expect(state.writes).toContainEqual({ table: 'leads', data: expect.objectContaining({ project_id: mandala, sales_manager_name: 'Манда' }) });
    });

    it('creates an anonymous lead only when explicitly chosen and reachable', async () => {
        const missing = await create(request('', 'POST', { project_id: mandala, customer_phone: '99112233' }));
        expect(missing.status).toBe(400);
        expect((await missing.json()).error).toBe(LEAD_NAME_OR_ANONYMOUS);
        const unreachable = await create(request('', 'POST', { project_id: mandala, anonymous: true }));
        expect(unreachable.status).toBe(400);
        expect((await unreachable.json()).error).toBe(ANONYMOUS_LEAD_CONTACT);
        expect(state.writes).toEqual([]);

        const created = await create(request('', 'POST', { project_id: mandala, anonymous: true, customer_name: ANONYMOUS_LEAD_LABEL, customer_phone: '9911 2233' }));
        expect(created.status).toBe(200);
        expect(state.writes).toContainEqual({ table: 'leads', data: expect.objectContaining({
            project_id: mandala, customer_name: null, customer_phone: '9911 2233', sales_manager_name: 'Манда',
        }) });
        // «нэргүй» хайлт нэргүй лидийг НЭМЖ буцаана (хүрээндээ): жинхэнэ нэр «Нэргүй» болон
        // хуучин «Facebook lead» мөр ч олдоно; хүрээнээс гадуурх мөр орохгүй.
        state.rows.leads.push(
            { id: 'named-nergui', shop_id: 'shop-1', project_id: mandala, customer_name: 'Нэргүй', status: 'new', sales_manager_name: 'Манда', deleted_at: null },
            { id: 'legacy-fb', shop_id: 'shop-1', project_id: mandala, customer_name: 'Facebook lead', status: 'new', sales_manager_name: 'Манда', deleted_at: null },
            { id: 'foreign-anon', shop_id: 'shop-1', project_id: elysium, customer_name: null, status: 'new', sales_manager_name: 'Эли', deleted_at: null },
        );
        const names = async (q: string) => (await (await list(request(`?q=${encodeURIComponent(q)}`))).json()).leads
            .map((lead: { customer_name: string | null }) => lead.customer_name).sort();
        expect(await names('Нэргүй')).toEqual(['Facebook lead', 'Нэргүй', null].sort());
        expect(await names(ANONYMOUS_LEAD_LABEL)).toEqual(['Facebook lead', null].sort());
        expect(await names('Өөрийн')).toEqual(['Өөрийн лид']);
    });

    it('lets a manager name their own lead later and records it in the history', async () => {
        state.rows.leads.push({ id: 'anon', shop_id: 'shop-1', project_id: mandala, customer_name: null, status: 'new', sales_manager_name: 'Манда', deleted_at: null });
        expect((await patch(request('', 'PATCH', { customer_name: '  ' }), context('anon'))).status).toBe(400);
        expect((await patch(request('', 'PATCH', { customer_name: ANONYMOUS_LEAD_LABEL }), context('anon'))).status).toBe(400);
        expect((await patch(request('', 'PATCH', { customer_name: null }), context('anon'))).status).toBe(400);
        expect((await patch(request('', 'PATCH', { customer_name: 'Бат' }), context(colleagueLead))).status).toBe(404);
        expect(state.writes).toEqual([]);

        expect((await patch(request('', 'PATCH', { customer_name: ' Г.  Бат ' }), context('anon'))).status).toBe(200);
        expect(state.rows.leads.find(lead => lead.id === 'anon')).toMatchObject({ customer_name: 'Г. Бат' });
        // «Нэргүй» бол жинхэнэ нэр — хадгалагдана.
        expect((await patch(request('', 'PATCH', { customer_name: 'Нэргүй' }), context(ownLead))).status).toBe(200);
        expect(state.rows.leads.find(lead => lead.id === ownLead)).toMatchObject({ customer_name: 'Нэргүй' });
        expect(state.writes).toContainEqual({ table: 'lead_activities', data: expect.objectContaining({
            lead_id: 'anon', type: 'system', content: `Нэр: ${ANONYMOUS_LEAD_LABEL} → Г. Бат`,
            meta: { field: 'customer_name', from: null, to: 'Г. Бат' },
        }) });
    });

    it('never returns a foreign lead through an idempotency replay', async () => {
        const response = await create(request('', 'POST', { customer_name: 'Шинэ', project_id: mandala, client_request_id: '00000000-0000-4000-8000-000000000099' }));
        expect(response.status).toBe(409);
        expect(await response.json()).not.toHaveProperty('lead');
        expect(state.writes).toEqual([]);
    });

    it('limits project and manager selectors to accessible project memberships', async () => {
        expect((await (await projects()).json()).projects.map((project: { id: string }) => project.id)).toEqual([mandala]);
        const result = await managers(new Request('http://localhost/api/dashboard/managers'));
        expect((await result.json()).managers.map((manager: { name: string }) => manager.name).sort()).toEqual(['Манда', 'Хамтрагч'].sort());
        expect((await managers(new Request(`http://localhost/api/dashboard/managers?project=${elysium}`))).status).toBe(403);
    });

    it('lets organization roles read all leads and assign only project members', async () => {
        state.role = 'admin';
        expect((await (await list(request())).json()).leads).toHaveLength(5);
        expect((await patch(request('', 'PATCH', { sales_manager_name: 'Эли' }), context(ownLead))).status).toBe(400);
        expect((await patch(request('', 'PATCH', { sales_manager_name: 'Хамтрагч' }), context(ownLead))).status).toBe(200);
        expect((await patch(request('', 'PATCH', { project_id: elysium, sales_manager_name: 'Эли' }), context(ownLead))).status).toBe(200);
        expect(state.rows.leads.find(lead => lead.id === ownLead)).toMatchObject({ project_id: elysium, sales_manager_name: 'Эли' });
    });

    it('rejects assignment to a lead without a project', async () => {
        state.role = 'admin';
        expect((await patch(request('', 'PATCH', { sales_manager_name: 'Манда' }), context('legacy'))).status).toBe(400);
        expect(state.writes).toEqual([]);
    });
});
