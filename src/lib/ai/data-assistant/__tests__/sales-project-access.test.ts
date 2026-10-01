import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeDataTool } from '../index';

const state = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, writes: [] as string[], failMembership: false }));
const garden = '00000000-0000-4000-8000-000000000010';
const elysium = '00000000-0000-4000-8000-000000000020';
const ownId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const perms = { role: 'sales_manager', canWrite: true, canDelete: true, modules: ['leads', 'viewings', 'ai-assistant', 'dashboard', 'contracts'] };

function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let single = false;
    let cap = Infinity;
    let update: Record<string, unknown> | undefined;
    let insert: Record<string, unknown> | undefined;
    const chain: Record<string, any> = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return chain; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
        limit: (n: number) => { cap = n; return chain; }, order: () => chain, range: () => chain,
        ilike: () => chain, or: () => chain,
        update: (row: Record<string, unknown>) => { update = row; return chain; },
        insert: (row: Record<string, unknown>) => { insert = row; return chain; },
        single: () => { single = true; return chain; }, maybeSingle: () => { single = true; return chain; },
        then: (resolve: (value: unknown) => unknown) => {
            if (table === 'sales_manager_projects' && state.failMembership) return Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve);
            const rows = state.rows[table] || [];
            let matches = rows.filter(row => filters.every(filter => filter(row))).slice(0, cap);
            if (update) { state.writes.push(table); matches.forEach(row => Object.assign(row, update)); }
            if (insert) { state.writes.push(table); const row = { id: 'created', ...insert }; rows.push(row); matches = [row]; }
            return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve);
        },
    };
    return chain;
}
const rpc = vi.fn(async (name: string, input: { p_shop_id: string; p_lead_id: string; p_user_id: string; p_manager_name: string; p_project_ids: string[]; p_input: { type: string; content: string } }) => {
    expect(name).toBe('record_scoped_sales_lead_contact');
    expect(input).toMatchObject({ p_shop_id: 'shop', p_user_id: 'user', p_manager_name: 'Батаа', p_project_ids: [garden] });
    const lead = state.rows.leads.find(row => row.id === input.p_lead_id)!;
    lead.last_contact_at = new Date().toISOString();
    const activity = { id: 'created', lead_id: input.p_lead_id, ...input.p_input, created_by_name: input.p_manager_name };
    state.rows.lead_activities.push(activity);
    state.writes.push('leads', 'lead_activities');
    return { data: activity, error: null };
});
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from, rpc }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from, rpc }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../audit', () => ({ logAiAudit: vi.fn() }));

beforeEach(() => {
    state.writes = [];
    state.failMembership = false;
    state.rows = {
        user_profiles: [{ id: 'user', full_name: 'Нэр өөрчлөгдсөн' }],
        sales_managers: [{ shop_id: 'shop', name: 'Батаа', user_id: 'user', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop', manager_name: 'Батаа', project_id: garden }],
        projects: [{ id: garden, shop_id: 'shop', name: 'Mandala Garden' }, { id: elysium, shop_id: 'shop', name: 'Elysium' }],
        leads: [
            { id: ownId, shop_id: 'shop', project_id: garden, sales_manager_name: 'Батаа', customer_name: 'Өөрийн', status: 'new', created_at: '2026-10-01', deleted_at: null },
            { id: otherId, shop_id: 'shop', project_id: garden, sales_manager_name: 'Сараа', customer_name: 'Бусдын', status: 'new', created_at: '2026-10-01', deleted_at: null },
            { id: 'wrong-project', shop_id: 'shop', project_id: elysium, sales_manager_name: 'Батаа', customer_name: 'Буруу төсөл', deleted_at: null },
            { id: 'unassigned', shop_id: 'shop', project_id: garden, sales_manager_name: null, deleted_at: null },
            { id: 'legacy', shop_id: 'shop', project_id: null, sales_manager_name: 'Батаа', deleted_at: null },
        ],
        property_viewings: [], lead_activities: [], property_contracts: [],
    };
    state.rows.leads.forEach(row => { row.created_at ??= '2026-10-01'; });
});

describe('AI uses the same project and personal lead boundary', () => {
    it('returns only the linked manager own project leads and ignores requested broad scope', async () => {
        expect(await executeDataTool('list_leads', { projectIds: [elysium], managerName: 'Сараа' }, 'shop', perms, 'user'))
            .toMatchObject([{ id: ownId, project_id: garden }]);
        expect(await executeDataTool('list_leads', { manager_name: 'Сараа' }, 'shop', perms, 'user')).toEqual([]);
        expect(await executeDataTool('list_lead_projects', {}, 'shop', perms, 'user')).toMatchObject({ projects: [{ id: garden }] });
    });

    it('does not reveal or mutate another manager lead by ID', async () => {
        expect(await executeDataTool('get_lead_details', { lead_id: otherId }, 'shop', perms, 'user')).toHaveProperty('error');
        expect(await executeDataTool('log_call', { lead_id: otherId, summary: 'Call' }, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(await executeDataTool('update_lead_status', { lead_id: otherId, new_status: 'contacted' }, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(await executeDataTool('schedule_viewing', { lead_id: otherId, scheduled_at: '2026-10-02T10:00:00+08:00' }, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(await executeDataTool('create_contract', { lead_id: otherId, customer_name: 'Бусдын' }, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(state.writes).toEqual([]);
        expect(state.rows.leads[1].status).toBe('new');
    });

    it('allows a contact on the assigned lead and preserves organization access', async () => {
        expect(await executeDataTool('log_call', { lead_id: ownId, summary: 'Ярьсан' }, 'shop', perms, 'user', true, 'Батаа')).toMatchObject({ success: true });
        expect(state.rows.leads[0].last_contact_at).toEqual(expect.any(String));
        expect(state.rows.lead_activities).toHaveLength(1);
        const all = await executeDataTool('list_leads', {}, 'shop', { ...perms, role: 'admin' }, 'admin');
        expect(all).toHaveLength(5);
    });

    it('fails closed when membership is unavailable or not configured', async () => {
        state.failMembership = true;
        expect(await executeDataTool('list_leads', {}, 'shop', perms, 'user')).toHaveProperty('error');
        state.failMembership = false;
        state.rows.sales_manager_projects = [];
        expect(await executeDataTool('list_leads', {}, 'shop', perms, 'user')).toEqual([]);
        expect(state.writes).toEqual([]);
    });

    it('does not broaden ambiguous accounts or authorize an unlinked profile name', async () => {
        state.rows.sales_managers.push({ shop_id: 'shop', name: 'Өөр нэр', user_id: 'user', is_active: true });
        expect(await executeDataTool('list_leads', {}, 'shop', { ...perms, role: 'custom_sales' }, 'user')).toEqual([]);
        state.rows.sales_managers = [{ shop_id: 'shop', name: 'Батаа', user_id: null, is_active: true }];
        state.rows.user_profiles[0].full_name = 'Батаа';
        expect(await executeDataTool('list_leads', {}, 'shop', { ...perms, role: 'custom_sales' }, 'user')).toEqual([]);
        expect(state.writes).toEqual([]);
    });

    it('stamps a linked contract from the authorized lead and rechecks confirmation', async () => {
        state.rows.leads[0].customer_id = 'customer';
        const args = { lead_id: ownId, customer_name: 'Өөрийн', total_price: 100 };
        expect(await executeDataTool('create_contract', args, 'shop', perms, 'user', false)).toHaveProperty('requiresConfirmation', true);
        state.rows.leads[0].sales_manager_name = 'Сараа';
        expect(await executeDataTool('create_contract', args, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(state.writes).toEqual([]);
        state.rows.leads[0].sales_manager_name = 'Батаа';
        expect(await executeDataTool('create_contract', { ...args, customer_id: 'other-customer' }, 'shop', perms, 'user', true)).toHaveProperty('error');
        expect(await executeDataTool('create_contract', args, 'shop', perms, 'user', true, 'Хуурамч нэр')).toMatchObject({ success: true });
        expect(state.rows.property_contracts[0]).toMatchObject({ shop_id: 'shop', project_id: garden, customer_id: 'customer', sales_manager: 'Батаа', lead_id: ownId });
    });
});
