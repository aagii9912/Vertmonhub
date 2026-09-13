import { test, expect, type Page } from '@playwright/test';
import { buildOperationsReport } from '../src/lib/dashboard/operations-report';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';

const leadId = '00000000-0000-4000-8000-000000000010';
const shopId = '00000000-0000-4000-8000-000000000002';
const viewingId = '00000000-0000-4000-8000-000000000020';

/** Browser/API contracts use in-memory data; SQL integrity is tested separately. */
async function fixtures(page: Page) {
    const state = { lead: null as Record<string, any> | null, viewings: [] as Record<string, any>[],
        requests: [] as { path: string; body: Record<string, any> }[], failStats: false, missingStats: false,
        unhandled: [] as string[], pageErrors: [] as string[] };
    page.on('pageerror', error => state.pageErrors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        if (path === '/api/me') return reply({ user: { fullName: 'Тест Менежер' }, role: 'sales_manager', permissions: ROLE_PERMISSIONS.sales_manager,
            shops: [{ id: shopId, name: 'Туршилтын байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: 'Тест Менежер', isManager: true, canViewTeam: false });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: state.lead ? 1 : 0, inbox: 0, meetings: state.viewings.length });
        if (path === '/api/dashboard/managers') return reply({ managers: [], mineName: 'Тест Менежер' });
        if (path === '/api/dashboard/my-stats') {
            if (state.failStats) return reply({ error: 'Туршилтын түр алдаа' }, 503);
            return reply({ manager: { name: 'Тест Менежер', isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, period: 'today',
                missing: state.missingStats ? ['leads'] : [], kpis: { activeLeads: state.lead ? 1 : 0, newLeads: state.lead ? 1 : 0, leadsByStatus: {},
                    viewingsToday: 0, viewingsThisWeek: state.viewings.length, activeContracts: 0, overdueContracts: 0, salesThisMonth: 0, salesThisYear: 0, contractCountThisYear: 0 },
                target: null, tasks: [], recentLeads: state.lead ? [state.lead] : [], upcomingViewings: [], revenueTrend: Array(12).fill(0) });
        }
        if (path === '/api/dashboard/leads' && request.method() === 'POST') {
            const body = request.postDataJSON();
            state.requests.push({ path, body });
            state.lead = { ...body, id: leadId, shop_id: shopId, status: 'new', sales_manager_name: 'Тест Менежер',
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(), next_followup_at: null };
            return reply({ lead: state.lead }, 201);
        }
        if (path === `/api/dashboard/leads/${leadId}`) return reply({ lead: state.lead, viewings: state.viewings, contracts: [], activities: [], property: null });
        if (path === '/api/dashboard/leads/summary') return reply({ all: 1, mine: 1, new: 0, meetings: 1, active: 1, mineName: 'Тест Менежер', canClaim: true,
            queues: { unassigned: 0, uncontacted: 0, no_followup: 0, overdue: 0 } });
        if (path === '/api/dashboard/leads') return reply({ leads: url.searchParams.has('phone') ? [] : state.lead ? [state.lead] : [],
            pagination: { total: state.lead ? 1 : 0, page: 1, pageSize: 25, totalPages: 1, hasMore: false } });
        if (path === '/api/dashboard/properties/search') return reply({ properties: [] });
        if (path === '/api/dashboard/viewings' && request.method() === 'POST') {
            const body = request.postDataJSON();
            state.requests.push({ path, body });
            if (state.lead) state.lead.status = 'viewing_scheduled';
            state.viewings = [{ ...body, id: viewingId, status: 'scheduled', lead: state.lead, property: null, sales_manager_name: 'Тест Менежер' }];
            return reply({ viewing: state.viewings[0], lead_id: leadId }, 201);
        }
        if (path === '/api/dashboard/viewings') return reply({ viewings: state.viewings, counts: { today: 0, upcoming: state.viewings.length, past: 0 } });
        if (path === '/api/dashboard/reports/operations') {
            const range = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! };
            return reply(buildOperationsReport({ range, now: new Date().toISOString(), contracts: [], transactions: null, targets: [],
                leads: state.lead ? [{ created_at: state.lead.created_at, status: state.lead.status, source: 'phone', sales_manager_name: 'Тест Менежер', last_contact_at: null, next_followup_at: null, viewing_scheduled_at: state.viewings[0]?.scheduled_at ?? null }] : [] }));
        }
        state.unhandled.push(`${request.method()} ${path}`);
        return reply({ error: `Missing workflow fixture: ${path}` }, 501);
    });
    return state;
}

async function login(page: Page) {
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}

test('protected pages reject missing and invalid sessions', async ({ page, context }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login\?redirect_url=/);
    await context.addCookies([{ name: 'vertmon-session', value: 'forged', domain: '127.0.0.1', path: '/' }]);
    await page.goto('/dashboard/leads');
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText('Имэйл эсвэл нууц үг буруу');
    await expect(page).toHaveURL(/\/auth\/login/);
});

for (const mobile of [false, true]) {
    test(`login → lead → schedule → report (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await fixtures(page);
        await login(page);
        await page.getByRole('button', { name: 'Шинэ лид', exact: true }).click();
        const form = page.getByRole('dialog', { name: 'Түргэн бүртгэл' });
        await form.getByPlaceholder('Ж: Г. Энхжин').fill('Туршилтын Харилцагч');
        await form.getByPlaceholder('9911 2233').fill('99112233');
        await form.getByRole('button', { name: 'Хадгалаад уулзалт товлох' }).click();
        // The page consumes the deep link; the dialog and submitted lead ID below are the durable contract.
        await expect(page).toHaveURL(/\/dashboard\/viewings(?:\?|$)/);
        await expect(page.getByRole('dialog', { name: 'Уулзалт товлох', exact: true })).toBeVisible();
        await expect(page.getByText('Туршилтын Харилцагч', { exact: true }).first()).toBeVisible();
        await page.locator('input[type="datetime-local"]').fill('2027-01-10T11:00');
        await page.getByRole('button', { name: 'Товлох', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Уулзалт товлох', exact: true })).not.toBeVisible();
        expect(state.requests).toHaveLength(2);
        expect(state.requests[0].body.client_request_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(state.requests[1].body).toMatchObject({ lead_id: leadId, property_id: null, scheduled_at: '2027-01-10T03:00:00.000Z', meeting_type: 'new_customer' });
        await page.goto('/dashboard/reports/operations?from=2026-09-01&to=2026-09-30');
        await expect(page.getByText('Гэрээний бүртгэлтэй дүн', { exact: true })).toBeVisible();
        await expect(page.getByText('Санхүүгийн эрх шаардлагатай', { exact: true }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(state.pageErrors).toEqual([]);
        expect(state.unhandled).toEqual([]);
    });
}

test('failed dashboard reads show retry and partial data stays visible', async ({ page }) => {
    const state = await fixtures(page);
    state.failStats = true;
    await login(page);
    await expect(page.locator('[data-slot="alert"]')).toBeVisible();
    await expect(page.getByText('Өнөөдөр төлөвлөсөн ажил алга')).not.toBeVisible();
    state.failStats = false;
    state.missingStats = true;
    await page.locator('[data-slot="alert"]').getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText('Зарим мэдээллийг ачаалж чадсангүй');
    state.missingStats = false;
    await page.locator('[data-slot="alert"]').getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await expect(page.locator('[data-slot="alert"]')).not.toBeVisible();
    await expect(page.getByText('Өнөөдөр төлөвлөсөн ажил алга')).toBeVisible();
    expect(state.pageErrors).toEqual([]);
    expect(state.unhandled).toEqual([]);
});
