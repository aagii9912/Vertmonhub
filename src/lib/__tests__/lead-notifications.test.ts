import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendLeadPushNotification } from '../notifications';

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, errors: new Set<string>(), send: vi.fn(), vapid: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: mocks.vapid, sendNotification: mocks.send } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const result = () => ({ data: (mocks.rows[table] || []).filter(row => filters.every(filter => filter(row))), error: mocks.errors.has(table) ? { message: 'read failed' } : null });
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        maybeSingle: async () => { const value = result(); return { ...value, data: value.data.length === 1 ? value.data[0] : null }; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
} }) }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
    mocks.errors.clear();
    mocks.send.mockResolvedValue(undefined);
    mocks.rows = {
        shops: [{ id: 'shop', user_id: 'owner' }],
        shop_members: ['assigned', 'other-manager', 'admin', 'super-admin', 'marketer'].map(user_id => ({ shop_id: 'shop', user_id })),
        user_roles: [{ user_id: 'owner', role: 'admin' }, { user_id: 'admin', role: 'admin' }, { user_id: 'super-admin', role: 'super_admin' }, { user_id: 'outsider', role: 'super_admin' }, { user_id: 'marketer', role: 'marketing' }],
        leads: [{ id: 'lead', shop_id: 'shop', project_id: 'mandala', sales_manager_name: 'Номин', deleted_at: null }],
        sales_managers: [{ shop_id: 'shop', name: 'Номин', user_id: 'assigned', is_active: true }, { shop_id: 'shop', name: 'Саруул', user_id: 'other-manager', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop', manager_name: 'Номин', project_id: 'mandala' }, { shop_id: 'shop', manager_name: 'Саруул', project_id: 'mandala' }],
        push_subscriptions: ['owner', 'assigned', 'other-manager', 'admin', 'super-admin', 'outsider', 'marketer', null].map(user_id => ({ id: String(user_id), shop_id: 'shop', user_id, endpoint: String(user_id), p256dh: 'key', auth: 'auth' })),
    };
});
const payload = { title: 'Холбогдох хүсэлт', body: 'Болд: 99112233' };
const delivered = () => mocks.send.mock.calls.map(call => call[0].endpoint).sort();

describe('lead push recipients', () => {
    it('sends personal details only to the assigned linked manager and organization admins', async () => {
        await sendLeadPushNotification('shop', 'lead', payload);
        expect(delivered()).toEqual(['admin', 'assigned', 'owner', 'super-admin']);
    });
    it.each(['project_id', 'sales_manager_name'])('sends an unknown %s only to organization admins', async key => {
        mocks.rows.leads[0][key] = null;
        await sendLeadPushNotification('shop', 'lead', payload);
        expect(delivered()).toEqual(['admin', 'owner', 'super-admin']);
    });
    it.each(['inactive', 'unlinked', 'outside-project', 'outside-shop', 'ambiguous-account'])('excludes an %s assigned manager', async condition => {
        if (condition === 'inactive') mocks.rows.sales_managers[0].is_active = false;
        if (condition === 'unlinked') mocks.rows.sales_managers[0].user_id = null;
        if (condition === 'outside-project') mocks.rows.sales_manager_projects[0].project_id = 'elysium';
        if (condition === 'outside-shop') mocks.rows.shop_members = mocks.rows.shop_members.filter(row => row.user_id !== 'assigned');
        if (condition === 'ambiguous-account') mocks.rows.sales_managers.push({ shop_id: 'shop', name: 'Давхар нэр', user_id: 'assigned', is_active: true });
        await sendLeadPushNotification('shop', 'lead', payload);
        expect(delivered()).toEqual(['admin', 'owner', 'super-admin']);
    });
    it('sends no data when the lead belongs to a different shop', async () => {
        mocks.rows.leads[0].shop_id = 'other-shop';
        await sendLeadPushNotification('shop', 'lead', payload);
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it('fails closed when shop membership cannot be verified', async () => {
        mocks.errors.add('shop_members');
        await sendLeadPushNotification('shop', 'lead', payload);
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it('routes a contact with no unique lead only to organization admins', async () => {
        await sendLeadPushNotification('shop', null, payload);
        expect(delivered()).toEqual(['admin', 'owner', 'super-admin']);
    });
});
