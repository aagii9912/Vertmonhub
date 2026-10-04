import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { managerActivityFixture } from './support/manager-activity';

// react-query руу шилжсэн хуудсууд: анхны уншилт унавал хоосон биш алдаа + «Дахин оролдох»,
// сэргээгээд өгөгдөл харагдана; харилцагчийг жагсаалтаас (сэргээх боломжтой) хасна.
const shopId = '00000000-0000-4000-8000-000000000002';
const customerId = '00000000-0000-4000-8000-000000000050';
const leadId = '00000000-0000-4000-8000-000000000060';

async function setup(page: Page) {
    const state = { failCustomers: true, failPipeline: true, failLogs: true, deleted: [] as string[], errors: [] as string[] };
    const customer = { id: customerId, name: 'Бат Дорж', phone: '99112233', email: null, address: null, notes: null, tags: [],
        message_count: 3, last_contact_at: null, created_at: '2026-10-01T02:00:00Z', quality_score: 72, quality_tier: 'A', lifecycle_stage: 'lead' };
    page.on('pageerror', (error) => state.errors.push(error.message));
    await page.route('**/api/**', async (route) => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        if (path === '/api/me') return reply({ user: { fullName: 'Номин' }, role: 'admin',
            permissions: { ...ROLE_PERMISSIONS.admin, canWrite: true, canDelete: true, modules: [...ROLE_PERMISSIONS.admin.modules, 'customers', 'customer-service', 'leads'] },
            shops: [{ id: shopId, name: 'Vertmon · Туршилтын өгөгдөл', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: 'Номин', isManager: true, canViewTeam: true });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 1, inbox: 0, meetings: 0 });
        if (path === '/api/dashboard/my-stats') return reply({ manager: { name: 'Номин', isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, missing: [], period: 'today',
            kpis: { activeLeads: 1, newLeads: 1, viewingsToday: 0, viewingsThisWeek: 0, activeContracts: 0, salesThisMonth: 0 }, target: null, tasks: [], recentLeads: [], upcomingViewings: [], revenueTrend: [] });
        if (path === '/api/dashboard/reports/manager-activity') return reply(managerActivityFixture(url, 'Номин'));
        // Санал гомдлын хариуцагч = борлуулалтын менежерийн бүртгэл.
        if (path === '/api/dashboard/managers') return reply({ managers: [{ name: 'Номин', user_id: null, is_active: true, hasAccount: false, assignable: true, project_ids: [] }] });
        if (path === '/api/dashboard/customers' && request.method() === 'GET') {
            if (state.failCustomers) return reply({ error: 'Түр алдаа' }, 500);
            return reply({ customers: state.deleted.includes(customerId) ? [] : [customer] });
        }
        if (path === '/api/dashboard/customer-health') return reply({ health: { total: 1, newThisMonth: 1, dormant: 0, won: 0, avgQualityScore: 72, tiers: { A: 1, B: 0, C: 0 }, needFollowup: 0, avgDaysToConvert: null } });
        if (path === `/api/dashboard/customers/${customerId}`) {
            if (request.method() === 'DELETE') { state.deleted.push(customerId); return reply({ success: true }); }
            return reply({ customer: { ...customer, chat_history: [], service_logs: [] } });
        }
        if (path === '/api/dashboard/lead-categories') return reply({ categories: [{ id: 'investor', name: 'Хөрөнгө оруулагч', description: null, tone: 'success', sort_order: 10, is_active: true }] });
        if (path === '/api/dashboard/leads' && url.searchParams.get('pageSize') === '1000') {
            if (state.failPipeline) return reply({ error: 'Түр алдаа' }, 500);
            return reply({ leads: [{ id: leadId, customer_name: 'Энхжин', customer_phone: '88112233', status: 'new', source: 'facebook', sales_manager_name: 'Номин',
                project_id: null, budget_max: 300000000, category_id: 'investor', created_at: '2026-10-02T02:00:00Z', updated_at: '2026-10-02T02:00:00Z', stage_changed_at: '2026-10-02T02:00:00Z' }], pagination: { total: 1 } });
        }
        if (path === '/api/dashboard/contracts/stats/service') return reply({ stats: { total_contracts: 1, active_contracts: 1, closed_contracts: 0, total_sales: 286000000, total_collected: 80000000,
            collection_rate: 28, overdue_contract_count: 0, total_overdue_amount: 0, open_requests: 1, resolved_requests: 0, avg_resolution_hours: null, by_type: {} } });
        if (path === '/api/dashboard/service-logs') {
            if (state.failLogs) return reply({ error: 'Түр алдаа' }, 500);
            return reply({ logs: [{ id: 'log-1', type: 'complaint', subject: 'Цахилгааны асуудал', status: 'open', priority: 'normal', channel: 'phone',
                customer_name: 'Бат Дорж', customer_phone: '99112233', created_at: '2026-10-03T02:00:00Z' }], stats: { total: 1, open: 1, in_progress: 0, resolved: 0, by_type: {}, avg_resolution_hours: null } });
        }
        return reply({ error: `Missing fixture: ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

test('харилцагчийн уншилт унавал алдаа харуулж, сэргээгээд устгана', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard/customers');
    await expect(page.getByText('Харилцагчдын мэдээлэл татахад алдаа гарлаа', { exact: true })).toBeVisible();
    await expect(page.getByText('Харилцагч олдсонгүй', { exact: true })).not.toBeVisible();
    state.failCustomers = false;
    await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await page.getByText('Бат Дорж', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Харилцагчийг устгах', exact: true }).click();
    await page.getByRole('button', { name: 'Устгах', exact: true }).click();
    await expect(page.getByText('Харилцагч устгагдлаа', { exact: true })).toBeVisible();
    await expect(page.getByText('Харилцагч олдсонгүй', { exact: true })).toBeVisible();
    expect(state.deleted).toEqual([customerId]);
    expect(state.errors).toEqual([]);
});

test('pipeline болон санал гомдлын уншилт унавал алдаа харуулж, дахин оролдоход сэргэнэ', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard/leads/pipeline');
    await expect(page.getByText('Лийд татахад алдаа', { exact: true })).toBeVisible();
    state.failPipeline = false;
    await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await expect(page.getByText('Энхжин', { exact: true }).first()).toBeVisible();
    // Картанд лидийн ангилал (саарал pill + өнгөт цэг) харагдана.
    await expect(page.getByText('Хөрөнгө оруулагч', { exact: true }).first()).toBeVisible();

    await page.goto('/dashboard/customer-service');
    await expect(page.getByText('Санал гомдлын бүртгэл татахад алдаа гарлаа', { exact: true })).toBeVisible();
    state.failLogs = false;
    await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await expect(page.getByText('Цахилгааны асуудал', { exact: true }).first()).toBeVisible();
    expect(state.errors).toEqual([]);
});
