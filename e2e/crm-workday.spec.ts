import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildMarketingPerformance, type MarketingSpend } from '../src/lib/marketing/performance';
import { nextMeetingDate, weeklyReviewRange } from '../src/lib/dashboard/weekly-review';
import { ubDateStr } from '../src/lib/utils/date';

const shopId = '00000000-0000-4000-8000-000000000002';
const leadId = '00000000-0000-4000-8000-000000000010';
const projectId = '00000000-0000-4000-8000-000000000030';
const today = ubDateStr();
const tomorrow = ubDateStr(new Date(Date.now() + 86_400_000));

async function setup(page: Page, readonly = false) {
    const leads = ['Б. Энхжин', 'Г. Тэмүүлэн', 'Д. Болормаа'].map((name, i) => ({
        id: i === 0 ? leadId : `${leadId.slice(0, -1)}${i + 1}`, customer_name: name, customer_phone: `9911223${i}`,
        customer_email: null, status: i === 0 ? 'contacted' : 'new', source: i === 2 ? 'website' : 'facebook',
        sales_manager_name: i === 2 ? null : 'Номин', notes: null, interest_type: 'apartment', interest_rooms: 3,
        created_at: `${today}T01:00:00Z`, updated_at: `${today}T01:00:00Z`,
        last_contact_at: i === 0 ? `${today}T02:00:00Z` : null,
        next_followup_at: i === 0 ? '2026-01-01T01:00:00Z' : null,
    }));
    const viewings = leads.slice(0, 2).map((lead, i) => ({
        id: `viewing-${i}`, scheduled_at: `${tomorrow}T${i ? '15' : '11'}:00:00+08:00`, status: 'scheduled',
        lead, lead_id: lead.id, sales_manager_name: 'Номин', meeting_type: 'new_customer', agent_notes: i ? null : '3 өрөө байрны зохион байгуулалт танилцуулах',
        property: { id: 'property-1', name: 'Мандала · B блок · 1204', district: 'Хан-Уул' }, interest_level: null,
    }));
    const contracts = leads.map((lead, i) => ({
        id: `contract-${i}`, contract_number: `VM-2026-00${i + 1}`, contract_date: today,
        customer_name: lead.customer_name, customer_phone: lead.customer_phone, contract_status: 'active',
        total_price: 286000000 + i * 52000000, paid_amount: 80000000, balance: 206000000 + i * 52000000,
        sales_manager: 'Номин', block_name: 'B', unit_number: `120${i + 1}`, rooms: 3, overdue_days: i === 0 ? 4 : 0,
    }));
    const state = { failContracts: false, failExport: false, missingFx: false, viewings,
        requests: [] as { path: string; search: string; method: string; shop: string | undefined; body?: Record<string, unknown> }[], errors: [] as string[], unhandled: [] as string[] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        state.requests.push({ path, search: url.search, method: request.method(), shop: request.headers()['x-shop-id'], ...(request.method() === 'PATCH' ? { body: request.postDataJSON() } : {}) });
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        if (path === '/api/me') return reply({ user: { fullName: 'Номин' }, role: 'sales_manager',
            permissions: { ...ROLE_PERMISSIONS.sales_manager, canWrite: !readonly, modules: [...ROLE_PERMISSIONS.sales_manager.modules, 'reports', 'marketing-roi', 'ai-assistant'] },
            shops: [{ id: shopId, name: 'Vertmon · Туршилтын өгөгдөл', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: 'Номин', isManager: true, canViewTeam: true });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 3, inbox: 0, meetings: 2 });
        if (path === '/api/dashboard/my-stats') return reply({ manager: { name: 'Номин', isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, missing: [], period: 'today',
            kpis: { activeLeads: 3, newLeads: 2, viewingsToday: 0, viewingsThisWeek: 2, activeContracts: 3, salesThisMonth: 860000000 }, target: null, tasks: [], recentLeads: [], upcomingViewings: [], revenueTrend: [] });
        if (path === '/api/dashboard/managers') return reply({ managers: [{ id: 'manager-1', name: 'Номин' }], mineName: 'Номин' });
        if (path === '/api/dashboard/projects') return reply({ projects: [{ id: projectId, name: 'Мандала Гарден' }] });
        if (path === '/api/dashboard/leads/summary') return reply({ all: 3, mine: 2, new: 2, meetings: 2, active: 1, mineName: 'Номин', canClaim: true, queues: { unassigned: 1, uncontacted: 2, no_followup: 2, overdue: 1 } });
        if (path === '/api/dashboard/leads') {
            const matches = leads.filter(lead => (!url.searchParams.get('q') || lead.customer_name.includes(url.searchParams.get('q')!))
                && (!url.searchParams.get('status') || lead.status === url.searchParams.get('status'))
                && (url.searchParams.get('queue') !== 'overdue' || !!lead.next_followup_at));
            return reply({ leads: matches, pagination: { page: 1, pageSize: 25, total: matches.length, totalPages: 1, hasMore: false } });
        }
        if (path.startsWith('/api/dashboard/leads/')) return reply({ lead: leads.find(lead => path.endsWith(lead.id)), viewings: [], contracts: [], activities: [], property: null });
        if (path.startsWith('/api/dashboard/viewings/') && request.method() === 'PATCH') {
            const item = state.viewings.find(item => path.endsWith(item.id));
            Object.assign(item!, request.postDataJSON());
            return reply({ viewing: item });
        }
        if (path === '/api/dashboard/viewings') return reply({ viewings: state.viewings, counts: { today: 0, upcoming: 2, past: 0 } });
        if (path === '/api/dashboard/contracts') {
            if (state.failContracts) return reply({ error: 'Туршилтын түр алдаа' }, 503);
            const matches = contracts.filter(c => (!url.searchParams.get('search') || c.customer_name.includes(url.searchParams.get('search')!)) && (url.searchParams.get('overdue') !== '1' || c.overdue_days > 0));
            return reply({ contracts: matches, stats: { total: 3, active: 3, closed: 0, total_sales: 1014000000, total_paid: 240000000, total_balance: 774000000, overdue_count: 1 }, pagination: { page: 1, pageSize: 25, total: matches.length, totalPages: 1, hasMore: false } });
        }
        if (path === '/api/dashboard/export/excel') {
            if (state.failExport) return reply({ error: 'Экспорт түр боломжгүй' }, 503);
            // Transport and active-shop header only; workbook integrity has its own tests.
            return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'fixture-download' });
        }
        if (path === '/api/marketing/performance') {
            const range = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! };
            const projects = [{ id: projectId, name: 'Мандала Гарден' }];
            const spend: MarketingSpend[] = [
                { id: 'facebook-spend', spent_at: range.from, amount: 2000, channel: 'facebook', project_id: projectId, marketing_owner_name: 'Номин', marketing_campaign_id: null, note: null },
                { id: 'google-spend', spent_at: range.from, amount: 180000, channel: 'google_ads', project_id: projectId, marketing_owner_name: 'Номин', marketing_campaign_id: null, note: null },
            ];
            if (state.missingFx) spend.push({ id: 'missing-fx', spent_at: range.from, amount: 0, channel: 'facebook', source: 'meta', exclusion: 'missing_fx', native_amount: 100, currency: 'USD', project_id: projectId, marketing_owner_name: 'Номин', marketing_campaign_id: null, note: null });
            return reply({ report: buildMarketingPerformance({ projects, activities: [], targets: [], spend, contracts: [],
                leads: leads.map(lead => ({ id: lead.id, created_at: `${range.from}T02:00:00Z`, project_id: projectId, source: lead.source, marketing_campaign_id: null, marketing_owner_name: 'Номин', marketing_channel: null, sales_manager_name: lead.sales_manager_name, sales_handoff_at: lead.sales_manager_name ? `${range.from}T03:00:00Z` : null })) }, range), projects, activities: [], spend });
        }
        if (path === '/api/marketing/facebook/ads/spend-sync') return reply({ accountId: null, status: null });
        if (path === '/api/ai-assistant/conversations') return reply({ conversations: [] });
        state.unhandled.push(path);
        return reply({ error: `Missing fixture: ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

for (const mobile of [false, true]) {
    test(`CRM ажлын урсгал (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 });
        const state = await setup(page);
        mkdirSync('output/workday', { recursive: true });
        const shot = async (name: string) => {
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-${name}.png`, fullPage: true, animations: 'disabled' });
        };
        await page.goto('/dashboard/leads');
        await expect(page.getByRole('heading', { name: 'Лидүүд', exact: true })).toBeVisible();
        await expect(page.getByText('Б. Энхжин', { exact: true })).toBeVisible();
        await shot('leads');
        await page.getByRole('searchbox', { name: 'Лидийг нэр, утсаар хайх' }).fill('Энхжин');
        await expect(page.getByText('Г. Тэмүүлэн', { exact: true })).not.toBeVisible();
        await page.getByRole('button', { name: 'Цэвэрлэх', exact: true }).click();
        await expect(page.getByText('Г. Тэмүүлэн', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: /Хугацаа хэтэрсэн/ }).click();
        await expect.poll(() => state.requests.some(r => r.path === '/api/dashboard/leads' && r.search.includes('queue=overdue') && r.search.includes('sort=next_followup_at') && r.search.includes('dir=asc'))).toBe(true);
        await page.getByRole('button', { name: 'Цэвэрлэх', exact: true }).click();
        await page.getByText('Б. Энхжин', { exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Лидийн дэлгэрэнгүй' })).toBeVisible();
        await page.getByRole('dialog', { name: 'Лидийн дэлгэрэнгүй' }).getByRole('button', { name: 'Хаах', exact: true }).click();
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Excel · бүгд', exact: true }).click();
        expect((await download).suggestedFilename()).toBe('Vertmon-leads.xlsx');
        expect(state.requests.find(r => r.path === '/api/dashboard/export/excel')?.shop).toBe(shopId);

        await page.goto('/dashboard/viewings');
        await expect(page.getByRole('heading', { name: 'Уулзалтууд', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ирсэн', exact: true }).first()).toBeVisible();
        await shot('viewings');
        const scheduled = state.viewings[0].scheduled_at;
        await page.getByRole('button', { name: 'Б. Энхжин: уулзалтын бусад үйлдэл' }).click();
        await page.getByRole('menuitem', { name: 'Маргааш руу хойшлуулах' }).click();
        await expect.poll(() => state.viewings[0].scheduled_at).toBe(new Date(Date.parse(scheduled) + 86_400_000).toISOString());
        await page.getByRole('button', { name: 'Ирсэн', exact: true }).first().click();
        await expect(page.getByRole('dialog', { name: 'Уулзалтын үр дүн' })).toBeVisible();

        await page.goto('/dashboard/contracts');
        await expect(page.getByRole('heading', { name: 'Гэрээнүүд', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Гэрээ үүсгэх' })).toBeVisible();
        await expect(page.getByText('VM-2026-001', { exact: true })).toBeVisible();
        await shot('contracts');
        await page.getByRole('button', { name: 'Хоцролттой', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Хоцролттой', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('VM-2026-002', { exact: true })).not.toBeVisible();

        await page.goto('/marketing');
        await expect(page.getByRole('heading', { name: 'Маркетинг', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Төсөл бүрийн үр дүн' })).toBeVisible();
        const channels = page.getByRole('region', { name: 'Маркетингийн сувгийн KPI' });
        const google = channels.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Google Ads', exact: true }) });
        await expect(google).toBeVisible();
        await expect(google.getByRole('cell').first()).toHaveText('0');
        await expect(google.getByRole('cell').nth(4)).toHaveText('180,000 ₮');
        await expect(google.getByRole('cell').last()).toHaveText('—');
        const facebook = channels.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Facebook', exact: true }) });
        await expect(facebook.getByRole('cell').last()).toHaveText('1,000 ₮');
        await expect(page.getByText('Нэг гэрээтэй лидийн өртөг', { exact: true }).locator('..').locator('dd').first()).toHaveText('—');
        await expect(channels.getByRole('rowheader', { name: 'TikTok', exact: true })).not.toBeVisible();
        await page.getByRole('checkbox', { name: 'Бүртгэлгүй сувгуудыг харуулах' }).check();
        await expect(channels.getByRole('rowheader', { name: 'TikTok', exact: true })).toBeVisible();
        await page.getByRole('checkbox', { name: 'Бүртгэлгүй сувгуудыг харуулах' }).uncheck();
        await expect(google).toBeVisible();
        await shot('marketing');
        await page.getByRole('button', { name: 'Хурлын долоо хоног', exact: true }).click();
        const range = weeklyReviewRange(nextMeetingDate());
        await expect(page.getByLabel('Эхлэх өдөр', { exact: true })).toHaveValue(range.from);
        await expect(page.getByLabel('Дуусах өдөр', { exact: true })).toHaveValue(range.to);
        await page.getByRole('button', { name: 'Бүртгэл', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Зардлын эх үүсвэр' })).toBeVisible();
        await page.getByRole('button', { name: 'Нэгдсэн самбар', exact: true }).click();
        await page.getByLabel('Эхлэх өдөр', { exact: true }).fill('2027-12-31');
        await expect(page.getByText('Эхлэх, дуусах өдрөө зөв дарааллаар сонгоно уу.', { exact: false })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeDisabled();
        expect(state.errors).toEqual([]);
        expect(state.unhandled).toEqual([]);
    });
}

test('гэрээний ачааллын алдаа болон экспортын алдаанаас сэргээнэ', async ({ page }) => {
    const state = await setup(page);
    state.failContracts = true;
    await page.goto('/dashboard/contracts');
    await expect(page.getByText('Гэрээнүүдийг уншиж чадсангүй.', { exact: true })).toBeVisible();
    await expect(page.getByText('Гэрээ олдсонгүй', { exact: true })).not.toBeVisible();
    state.failContracts = false;
    await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
    await expect(page.getByText('VM-2026-001', { exact: true })).toBeVisible();
    state.failExport = true;
    await page.getByRole('button', { name: 'Excel · бүгд', exact: true }).click();
    await expect(page.getByText('Экспорт түр боломжгүй', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
});

test('маркетингийн ханш дутуу үед өртөг тэг гэж харагдахгүй', async ({ page }) => {
    const state = await setup(page);
    state.missingFx = true;
    await page.goto('/marketing');
    const cost = page.getByText('Нэг лидийн өртөг', { exact: true }).locator('..');
    await expect(cost.locator('dd').first()).toHaveText('—');
    await expect(cost).toContainText('Ханш дутуу · өртөг тооцоогүй');
    const channels = page.getByRole('region', { name: 'Маркетингийн сувгийн KPI' });
    const facebook = channels.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Facebook', exact: true }) });
    await expect(facebook).toContainText('Ханш дутуу');
    await expect(facebook.getByRole('cell').last()).toHaveText('—');
    expect(state.errors).toEqual([]);
    expect(state.unhandled).toEqual([]);
});

test('унших эрхтэй хэрэглэгчид шинээр үүсгэх болон уулзалт өөрчлөх товч харагдахгүй', async ({ page }) => {
    await setup(page, true);
    await page.goto('/dashboard/contracts');
    await expect(page.getByText('VM-2026-001', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Гэрээ үүсгэх' })).toHaveCount(0);
    await page.goto('/dashboard/viewings');
    await expect(page.getByText('Б. Энхжин', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ирсэн', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Уулзалт товлох', exact: true })).toHaveCount(0);
});
