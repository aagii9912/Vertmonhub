import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeDataTool } from '../index';

/** In-memory PostgREST: eq/is/in/neq шүүлтүүр, insert/update бичилт, scoped contact RPC. */
const state = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, writes: [] as Array<{ table: string; data: Record<string, unknown> }> }));
const garden = '00000000-0000-4000-8000-000000000010';
const ownId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const perms = { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['leads', 'viewings', 'ai-assistant'] };
const adminPerms = { ...perms, role: 'admin' };

function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let single = false;
    let cap = Infinity;
    let update: Record<string, unknown> | undefined;
    let insert: Record<string, unknown> | undefined;
    const chain: Record<string, any> = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
        neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return chain; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return chain; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
        limit: (n: number) => { cap = n; return chain; }, order: () => chain, range: () => chain,
        ilike: () => chain, or: () => chain,
        update: (row: Record<string, unknown>) => { update = row; return chain; },
        insert: (row: Record<string, unknown>) => { insert = row; return chain; },
        single: () => { single = true; return chain; }, maybeSingle: () => { single = true; return chain; },
        then: (resolve: (value: unknown) => unknown) => {
            const rows = state.rows[table] || [];
            let matches = rows.filter(row => filters.every(filter => filter(row))).slice(0, cap);
            if (update) { state.writes.push({ table, data: update }); matches.forEach(row => Object.assign(row, update)); }
            if (insert) { state.writes.push({ table, data: insert }); const row = { id: `created-${rows.length}`, created_at: '2026-10-04T02:00:00Z', ...insert }; rows.push(row); matches = [row]; }
            return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve);
        },
    };
    return chain;
}
const rpc = vi.fn(async (name: string, input: { p_lead_id: string; p_user_id: string; p_manager_name: string; p_input: Record<string, unknown> }) => {
    expect(name).toBe('record_scoped_sales_lead_contact');
    const lead = state.rows.leads.find(row => row.id === input.p_lead_id);
    if (!lead || lead.sales_manager_name !== input.p_manager_name) return { data: null, error: { code: 'P0002' } };
    const quote = input.p_input.quote as Record<string, unknown> | undefined;
    const activity = {
        id: `rpc-${state.rows.lead_activities.length}`, lead_id: input.p_lead_id, type: input.p_input.type, content: input.p_input.content,
        meta: quote ? { ...quote } : {}, created_by: input.p_user_id, created_by_name: input.p_manager_name, created_at: '2026-10-04T03:00:00Z',
    };
    state.rows.lead_activities.push(activity);
    state.writes.push({ table: 'rpc', data: input.p_input });
    return { data: activity, error: null };
});
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from, rpc }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from, rpc }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../audit', () => ({ logAiAudit: vi.fn() }));

beforeEach(() => {
    state.writes = [];
    rpc.mockClear();
    state.rows = {
        user_profiles: [{ id: 'user', full_name: 'Батаа' }, { id: 'admin', full_name: 'Админ' }],
        sales_managers: [
            { shop_id: 'shop', name: 'Батаа', user_id: 'user', is_active: true },
            { shop_id: 'shop', name: 'Сараа', user_id: 'saraa', is_active: true },
        ],
        sales_manager_projects: [{ shop_id: 'shop', manager_name: 'Батаа', project_id: garden }],
        leads: [
            { id: ownId, shop_id: 'shop', project_id: garden, sales_manager_name: 'Батаа', customer_name: 'Өөрийн', status: 'offered', source: 'phone', notes: 'Анхны', created_at: '2026-09-01T02:00:00Z', deleted_at: null },
            { id: otherId, shop_id: 'shop', project_id: garden, sales_manager_name: 'Сараа', customer_name: 'Бусдын', status: 'new', created_at: '2026-09-01T02:00:00Z', deleted_at: null },
        ],
        lead_activities: [
            { id: 'a1', shop_id: 'shop', lead_id: ownId, type: 'quote', content: 'Үнийн санал', meta: { amount: 450_000_000, unit_label: 'A-1203' }, created_by: 'user', created_by_name: 'Батаа', created_at: '2026-09-02T02:00:00Z' },
            { id: 'a2', shop_id: 'shop', lead_id: ownId, type: 'quote', content: 'Үнийн санал', meta: { amount: 430_000_000, unit_label: 'A-1203' }, created_by: 'saraa', created_by_name: 'Сараа', created_at: '2026-09-03T02:00:00Z' },
            { id: 'a3', shop_id: 'shop', lead_id: otherId, type: 'call', content: 'Бусдын дуудлага', meta: {}, created_by: 'saraa', created_by_name: 'Сараа', created_at: '2026-09-03T02:00:00Z' },
        ],
        property_viewings: [], property_contracts: [], properties: [],
    };
});

describe('AI manager history and price quotes', () => {
    it('adds a compact manager history with conflicts to the scoped lead details', async () => {
        const result = await executeDataTool('get_lead_details', { lead_id: ownId }, 'shop', perms, 'user');
        expect(result.lead).toMatchObject({ id: ownId, sales_manager_name: 'Батаа' });
        expect(result.manager_history.managers.map((m: { name: string; quotes: number }) => [m.name, m.quotes])).toEqual([['Батаа', 1], ['Сараа', 1]]);
        expect(result.manager_history.conflicts.map((c: { kind: string }) => c.kind)).toEqual(['quote_mismatch', 'non_owner_contact', 'parallel_managers']);
        expect(JSON.stringify(result.manager_history)).not.toContain('Бусдын дуудлага');
        expect(Object.keys(result).indexOf('manager_history')).toBe(1);
        expect(await executeDataTool('get_lead_details', { lead_id: otherId }, 'shop', perms, 'user')).toHaveProperty('error');
    });

    it('previews a price quote, then records it through the locked contact RPC', async () => {
        const preview = await executeDataTool('log_price_quote', { lead_id: ownId, amount: '450,000,000', unit_label: ' A-1203 ' }, 'shop', perms, 'user', false, 'Батаа');
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'log_price_quote', args: { lead_id: ownId, amount: 450_000_000, unit_label: 'A-1203', note: '' } },
            preview: { 'Үнийн санал': '450,000,000₮', 'Байр/тоот': 'A-1203' },
        });
        expect(state.writes).toEqual([]);
        const done = await executeDataTool('log_price_quote', preview.action.args, 'shop', perms, 'user', true, 'Батаа');
        expect(done).toMatchObject({ success: true, leadId: ownId });
        expect(state.writes).toEqual([{ table: 'rpc', data: { type: 'quote', content: 'Үнийн санал: 450,000,000₮ · A-1203', quote: { amount: 450_000_000, unit_label: 'A-1203' } } }]);
    });

    it('rejects invented or foreign quotes before writing', async () => {
        for (const amount of [undefined, 0, -5, 12.5, '450 сая', 1e14]) {
            expect(await executeDataTool('log_price_quote', { lead_id: ownId, amount }, 'shop', perms, 'user', true, 'Батаа')).toHaveProperty('error');
        }
        expect(await executeDataTool('log_price_quote', { lead_id: otherId, amount: 1 }, 'shop', perms, 'user', true, 'Батаа')).toHaveProperty('error');
        expect(await executeDataTool('log_price_quote', { lead_id: ownId, amount: 1 }, 'shop', { ...perms, canWrite: false }, 'user', true, 'Батаа')).toHaveProperty('error');
        expect(state.writes).toEqual([]);
    });

    it('writes AI notes into the attributed lead history instead of the lead notes field', async () => {
        expect(await executeDataTool('add_lead_note', { lead_id: ownId, note: 'Маргааш залгана' }, 'shop', perms, 'user', true, 'Батаа')).toMatchObject({ success: true });
        expect(state.writes).toEqual([{ table: 'rpc', data: { type: 'note', content: 'Маргааш залгана' } }]);
        expect(state.rows.leads[0].notes).toBe('Анхны');

        state.writes = [];
        expect(await executeDataTool('add_lead_note', { lead_id: otherId, note: 'Админы тэмдэглэл' }, 'shop', adminPerms, 'admin', true, 'Админ')).toMatchObject({ success: true });
        expect(state.writes).toEqual([{ table: 'lead_activities', data: expect.objectContaining({
            lead_id: otherId, type: 'note', content: 'Админы тэмдэглэл', created_by: 'admin', created_by_name: 'Админ',
        }) }]);
        expect(state.rows.leads[1]).not.toHaveProperty('notes');
    });
});
