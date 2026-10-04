import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildMarketingPerformance, type MarketingSpend } from '../src/lib/marketing/performance';
import { nextMeetingDate, weeklyReviewRange } from '../src/lib/dashboard/weekly-review';
import { ubDateStr } from '../src/lib/utils/date';
import { buildLeadTimeline } from '../src/lib/leads/timeline';
import { managerActivityFixture } from './support/manager-activity';

const shopId = '00000000-0000-4000-8000-000000000002';
const leadId = '00000000-0000-4000-8000-000000000010';
const projectId = '00000000-0000-4000-8000-000000000030';
const elysiumId = '00000000-0000-4000-8000-000000000031';
const today = ubDateStr();
const tomorrow = ubDateStr(new Date(Date.now() + 86_400_000));

async function setup(page: Page, readonly = false, role: 'sales_manager' | 'admin' = 'sales_manager') {
    const leads = ['Б. Энхжин', 'Г. Тэмүүлэн', 'Д. Болормаа'].map((name, i) => ({
        id: i === 0 ? leadId : `${leadId.slice(0, -1)}${i + 1}`, customer_name: name, customer_phone: `9911223${i}`,
        customer_email: null, status: i === 0 ? 'contacted' : 'new', source: i === 2 ? 'website' : 'facebook',
        sales_manager_name: i === 2 ? null : 'Номин', notes: null, interest_type: 'apartment', interest_rooms: 3,
        project_id: i === 2 ? null : projectId,
        created_at: `${today}T01:00:00Z`, updated_at: `${today}T01:00:00Z`,
        last_contact_at: i === 0 ? `${today}T02:00:00Z` : null,
        next_followup_at: i === 0 ? '2026-01-01T01:00:00Z' : null,
    }));
    const privateLeads = [
        { ...leads[0], id: '00000000-0000-4000-8000-000000000014', customer_name: 'Өөр менежерийн лид', sales_manager_name: 'Сараа' },
        { ...leads[0], id: '00000000-0000-4000-8000-000000000015', customer_name: 'Өөр төслийн лид', project_id: elysiumId },
    ];
    const visibleLeads = () => role === 'admin' ? [...leads, ...privateLeads] : leads.filter(lead => lead.sales_manager_name === 'Номин' && lead.project_id === projectId);
    // Менежерүүдийн Time-line: Сараа хариуцаж байхад үнэ хэлээд, Номинд шилжсэний дараа өөр үнэ хэлсэн.
    const timeline = buildLeadTimeline({
        lead: leads[0],
        roster: [{ name: 'Номин', user_id: 'user-nomin', is_active: true }, { name: 'Сараа', user_id: 'user-saraa', is_active: true }],
        activities: [
            { id: 'activity-1', type: 'quote', content: 'Үнийн санал', meta: { amount: 280000000, unit_label: 'B-1201' }, created_by: 'user-saraa', created_by_name: 'Сараа', created_at: `${today}T01:10:00Z` },
            { id: 'activity-2', type: 'manager', content: 'Сараа → Номин', meta: { from: 'Сараа', to: 'Номин' }, created_by: 'user-admin', created_by_name: 'Админ', created_at: `${today}T01:20:00Z` },
            { id: 'activity-3', type: 'call', content: 'Үнийн нөхцөл ярилаа', meta: {}, created_by: 'user-nomin', created_by_name: 'Номин', created_at: `${today}T02:00:00Z` },
            { id: 'activity-4', type: 'quote', content: 'Үнийн санал', meta: { amount: 286000000, unit_label: 'B-1201' }, created_by: 'user-nomin', created_by_name: 'Номин', created_at: `${today}T02:05:00Z` },
        ],
    });
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
        transfers: [] as Record<string, unknown>[], transferBodies: [] as Record<string, unknown>[],
        requests: [] as { path: string; search: string; method: string; shop: string | undefined; body?: Record<string, unknown> }[], errors: [] as string[], unhandled: [] as string[] };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        state.requests.push({ path, search: url.search, method: request.method(), shop: request.headers()['x-shop-id'], ...(request.method() === 'PATCH' ? { body: request.postDataJSON() } : {}) });
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        if (path === '/api/me') return reply({ user: { fullName: 'Номин' }, role,
            permissions: { ...ROLE_PERMISSIONS[role], canWrite: !readonly, modules: [...ROLE_PERMISSIONS[role].modules, 'reports', 'marketing-roi', 'ai-assistant'] },
            shops: [{ id: shopId, name: 'Vertmon · Туршилтын өгөгдөл', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: 'Номин', isManager: true, canViewTeam: true });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 3, inbox: 0, meetings: 2 });
        if (path === '/api/dashboard/my-stats') return reply({ manager: { name: 'Номин', isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, missing: [], period: 'today',
            kpis: { activeLeads: 3, newLeads: 2, viewingsToday: 0, viewingsThisWeek: 2, activeContracts: 3, salesThisMonth: 860000000 }, target: null, tasks: [], recentLeads: [], upcomingViewings: [], revenueTrend: [] });
        if (path === '/api/dashboard/reports/manager-activity') return reply(managerActivityFixture(url, 'Номин'));
        if (path === '/api/dashboard/leads/projects') return reply({ projects: [{ id: projectId, name: 'Мандала Гарден' }, ...(role === 'admin' ? [{ id: elysiumId, name: 'Элизиум' }] : [])] });
        if (path === '/api/dashboard/managers') {
            const managers = [
                { id: 'manager-1', name: 'Номин', is_active: true, project_ids: [projectId], assignable: role === 'admin' },
                { id: 'manager-2', name: 'Сараа', is_active: true, project_ids: [projectId], assignable: role === 'admin' },
                { id: 'manager-3', name: 'Элизиум Менежер', is_active: true, project_ids: [elysiumId], assignable: role === 'admin' },
            ].filter(manager => (!url.searchParams.has('project') || manager.project_ids.includes(url.searchParams.get('project')!)) && (role === 'admin' || manager.project_ids.includes(projectId)));
            return reply({ managers, mineName: 'Номин' });
        }
        if (path === '/api/dashboard/leads/summary') return reply({ all: visibleLeads().length, mine: 2, new: 1, meetings: 2, active: 1, mineName: 'Номин', canClaim: false, queues: { unassigned: role === 'admin' ? 1 : 0, uncontacted: 1, no_followup: 1, overdue: 1 } });
        if (path === '/api/dashboard/leads') {
            const matches = visibleLeads().filter(lead => (!url.searchParams.get('q') || lead.customer_name.includes(url.searchParams.get('q')!))
                && (!url.searchParams.get('project') || lead.project_id === url.searchParams.get('project'))
                && (!url.searchParams.get('status') || lead.status === url.searchParams.get('status'))
                && (url.searchParams.get('queue') !== 'overdue' || !!lead.next_followup_at));
            return reply({ leads: matches, pagination: { page: 1, pageSize: 25, total: matches.length, totalPages: 1, hasMore: false } });
        }
        if (path.startsWith('/api/dashboard/leads/')) {
            const lead = visibleLeads().find(lead => path.endsWith(lead.id));
            if (!lead) return reply({ error: 'Лид олдсонгүй' }, 404);
            if (request.method() === 'PATCH') {
                const body = request.postDataJSON();
                if (role !== 'admin' && ('project_id' in body || 'sales_manager_name' in body)) return reply({ error: 'Хуваарилах эрхгүй' }, 403);
                Object.assign(lead, body);
            }
            return reply({ lead, viewings: [], contracts: [], activities: [], property: null, timeline: lead.id === leadId ? timeline : null });
        }
        if (path.startsWith('/api/dashboard/viewings/') && request.method() === 'PATCH') {
            const item = state.viewings.find(item => path.endsWith(item.id));
            Object.assign(item!, request.postDataJSON());
            return reply({ viewing: item });
        }
        if (path === '/api/dashboard/viewings') return reply({ viewings: state.viewings, counts: { today: 0, upcoming: 2, past: 0 } });
        const contractPath = path.match(/^\/api\/dashboard\/contracts\/([^/]+)(?:\/(payments|transfer))?$/);
        if (contractPath && contractPath[1] !== 'stats') {
            const contract = contracts.find(c => c.id === contractPath[1]);
            if (!contract) return reply({ error: 'Гэрээ олдсонгүй' }, 404);
            if (contractPath[2] === 'payments') return reply({ payments: [] });
            if (contractPath[2] === 'transfer' && request.method() === 'POST') {
                if (readonly) return reply({ error: 'Бичих эрхгүй' }, 403);
                const body = request.postDataJSON() as Record<string, string>;
                state.transferBodies.push(body);
                state.transfers.unshift({ id: `transfer-${state.transfers.length + 1}`, contract_id: contract.id, kind: body.kind, effective_date: body.effective_date,
                    from_customer_name: contract.customer_name, to_customer_name: body.customer_name, to_registration: String(body.customer_registration || '').toUpperCase(),
                    reason: body.reason, created_by_name: 'Номин', created_at: new Date().toISOString() });
                contract.customer_name = body.customer_name;
                return reply({ transfer: state.transfers[0], replayed: false, message: 'Гэрээ шилжүүлэгдлээ' }, 201);
            }
            if (contractPath[2] === 'transfer') return reply({ transfers: state.transfers.filter(t => t.contract_id === contract.id), available: true });
            return reply({ contract });
        }
        if (path === '/api/dashboard/ai-attachments') return reply({ attachments: [] });
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
        const leadPanel = page.getByRole('dialog', { name: 'Лидийн дэлгэрэнгүй' });
        await expect(leadPanel.getByRole('region', { name: 'Холбогдсон менежерүүд' })).toBeVisible();
        await expect(leadPanel.getByText('Үнийн санал зөрүүтэй (B-1201): Сараа 280,000,000₮ · Номин 286,000,000₮', { exact: true })).toBeVisible();
        await expect(leadPanel.getByRole('button', { name: 'Үнийн санал', exact: true })).toBeVisible();
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
        await expect(page.locator('#workspace-content').getByText('VM-2026-001', { exact: true })).toBeVisible();
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
    await expect(page.locator('#workspace-content').getByText('VM-2026-001', { exact: true })).toBeVisible();
    state.failExport = true;
    await page.getByRole('button', { name: 'Excel · бүгд', exact: true }).click();
    await expect(page.getByText('Экспорт түр боломжгүй', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
});

test('гэрээг өөр хүнд шилжүүлж эзэмшигчийн түүхийг харна', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard/contracts/contract-0');
    await expect(page.locator('#workspace-content').getByText('VM-2026-001', { exact: true })).toBeVisible();
    await expect(page.getByText('Эзэмшигчийн түүх', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Гэрээ шилжүүлэх', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Гэрээ шилжүүлэх' });
    await expect(dialog).toContainText('Б. Энхжин');
    await dialog.getByRole('button', { name: 'Шилжүүлэх', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Шинэ эзэмшигчийн нэрийг оруулна уу');
    await dialog.getByLabel('Овог', { exact: true }).fill('Дорж');
    await dialog.getByLabel('Нэр', { exact: true }).fill('Сараа');
    await expect(dialog.getByLabel('Шинэ эзэмшигчийн нэр')).toHaveValue('Дорж Сараа');
    await dialog.getByLabel('Регистр / паспорт').fill('чб88020202');
    await dialog.getByLabel('Шалтгаан / тэмдэглэл').fill('Гэр бүлийн гишүүнд шилжүүлэв');
    await dialog.getByRole('button', { name: 'Шилжүүлэх', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.transferBodies).toEqual([expect.objectContaining({ kind: 'transfer', customer_name: 'Дорж Сараа', customer_last_name: 'Дорж', customer_first_name: 'Сараа',
        customer_registration: 'чб88020202', effective_date: today, expected_customer_name: 'Б. Энхжин', reason: 'Гэр бүлийн гишүүнд шилжүүлэв' })]);
    expect(state.transferBodies[0].client_request_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText('Эзэмшигчийн түүх', { exact: true })).toBeVisible();
    await expect(page.getByText('Анхны худалдан авагч', { exact: true })).toBeVisible();
    await expect(page.getByText('Б. Энхжин → Дорж Сараа').first()).toBeVisible();
    await expect(page.getByText('ЧБ88020202', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
    expect(state.unhandled).toEqual([]);
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
    await expect(page.locator('#workspace-content').getByText('VM-2026-001', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Гэрээ үүсгэх' })).toHaveCount(0);
    await page.goto('/dashboard/contracts/contract-0');
    await expect(page.locator('#workspace-content').getByText('VM-2026-001', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Гэрээ шилжүүлэх' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Төлбөр бүртгэх' })).toHaveCount(0);
    await page.goto('/dashboard/viewings');
    await expect(page.getByText('Б. Энхжин', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ирсэн', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Уулзалт товлох', exact: true })).toHaveCount(0);
});

test('менежер өөрийн төслийн зөвхөн өөрт оноосон лидийг ажиллуулна', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/dashboard/leads');
    await expect(page.getByText('Б. Энхжин', { exact: true })).toBeVisible();
    await expect(page.getByText('Г. Тэмүүлэн', { exact: true })).toBeVisible();
    for (const name of ['Д. Болормаа', 'Өөр менежерийн лид', 'Өөр төслийн лид']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    // Ганц төсөлтэй ажлын орчинд төслийн шүүлтүүр шаардлагагүй.
    await expect(page.getByLabel('Төсөл', { exact: true })).toHaveCount(0);
    await page.getByText('Б. Энхжин', { exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Лидийн дэлгэрэнгүй' });
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel('Лидийн төсөл')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Менежер солих', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Хариуцаж аваад товлох', exact: true })).toHaveCount(0);
    await expect.poll(() => state.requests.some(r => r.path === '/api/dashboard/managers' && r.search.includes(`project=${projectId}`))).toBe(true);
    expect(state.errors).toEqual([]);
    expect(state.unhandled).toEqual([]);
});

test('админ төслийг ил тод сонгоод зөв төслийн менежерт хуваарилна', async ({ page }) => {
    const state = await setup(page, false, 'admin');
    await page.goto('/dashboard/leads');
    await page.getByText('Д. Болормаа', { exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Лидийн дэлгэрэнгүй' });
    await expect(panel.getByLabel('Лидийн төсөл')).toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Менежер солих', exact: true })).toHaveCount(0);
    await panel.getByLabel('Лидийн төсөл').selectOption(elysiumId);
    await expect.poll(() => state.requests.some(r => r.method === 'PATCH' && r.body?.project_id === elysiumId && r.body.sales_manager_name === null)).toBe(true);
    await expect.poll(() => state.requests.some(r => r.path === '/api/dashboard/managers' && r.search.includes(`project=${elysiumId}`))).toBe(true);
    await panel.getByRole('button', { name: 'Менежер солих', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Номин', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сараа', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Элизиум Менежер', exact: true }).click();
    await expect.poll(() => state.requests.some(r => r.method === 'PATCH' && r.body?.sales_manager_name === 'Элизиум Менежер')).toBe(true);
    await expect(panel.getByText('Элизиум Менежер', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
    expect(state.unhandled).toEqual([]);
});
