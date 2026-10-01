import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildOperationsReport } from '../src/lib/dashboard/operations-report';
import { buildMarketingPerformance, previousRange, type MarketingActivity, type MarketingSpend } from '../src/lib/marketing/performance';
import { nextMeetingDate, weeklyReviewRange } from '../src/lib/dashboard/weekly-review';

const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000002';
const meetingDate = nextMeetingDate();
const range = weeklyReviewRange(meetingDate);

async function setup(page: Page, restricted = false) {
    const state = { updates: [] as Record<string, unknown>[], failure: false, failSave: false, missingFx: false, requests: [] as string[], errors: [] as string[], writes: 0 };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        state.requests.push(path);
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        if (path === '/api/me') return reply({ user: { fullName: 'Номин' }, role: 'sales_manager', permissions: { ...ROLE_PERMISSIONS.sales_manager, modules: restricted ? ['dashboard'] : [...ROLE_PERMISSIONS.sales_manager.modules, 'reports', 'marketing-roi', 'ai-assistant'] }, shops: [{ id: shopId, name: 'Vertmon · Туршилтын өгөгдөл', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: 'Номин', isManager: true, canViewTeam: !restricted });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 8, inbox: 3, meetings: 2 });
        if (path === '/api/dashboard/my-stats') return reply({ manager: { name: 'Номин', isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, period: 'today', missing: [],
            kpis: { activeLeads: 24, newLeads: 8, leadsByStatus: {}, viewingsToday: 2, viewingsThisWeek: 6, activeContracts: 4, overdueContracts: 0, salesThisMonth: 680000000, salesThisYear: 2300000000, contractCountThisYear: 12 },
            target: { periods: { month: { target: 900000000, actual: 680000000 } } },
            tasks: [{ type: 'followup', id: 'lead-1', title: 'Б. Энхжинтэй дахин холбогдох', subtitle: '99112233 · 3 өрөө байр сонирхсон', dueAt: new Date().toISOString(), overdue: false, href: '/dashboard/leads?lead=lead-1' },
                { type: 'personal', id: 'task-1', title: 'Үнийн санал бэлтгэх', subtitle: 'Уулзалтын дараах материал', dueAt: new Date().toISOString(), overdue: false, href: '/dashboard/tasks' }],
            recentLeads: [{ id: 'lead-2', customer_name: 'Г. Тэмүүлэн', customer_phone: '88112233', source: 'facebook', status: 'new', created_at: new Date().toISOString() }], upcomingViewings: [], revenueTrend: [] });
        if (path === '/api/dashboard/tasks') return reply({ available: true, tasks: [{ id: 'done-1', title: 'Харилцагчид үнийн санал хүргүүлсэн', note: null, status: 'done', completed_at: `${range.from}T03:00:00Z` }] });
        if (path === '/api/dashboard/weekly-updates') {
            if (request.method() === 'PUT') {
                state.writes++;
                if (state.failSave) return reply({ error: 'Хадгалалт түр боломжгүй. Дахин оролдоно уу.' }, 503);
                const body = request.postDataJSON();
                const update = { id: 'update-1', user_id: userId, author_name: 'Номин', meeting_date: body.meetingDate, achievements: body.achievements, blockers: body.blockers, next_steps: body.nextSteps, updated_at: new Date().toISOString() };
                state.updates = [update];
                return reply({ update });
            }
            return reply({ updates: state.updates.filter(update => update.meeting_date === url.searchParams.get('meetingDate')), canViewTeam: !restricted });
        }
        if (path === '/api/dashboard/reports/operations') {
            if (state.failure) return reply({ error: 'Борлуулалтын эх үүсвэр түр боломжгүй.' }, 503);
            const selected = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! };
            return reply({ ...buildOperationsReport({ range: selected, now: new Date().toISOString(), contracts: [{ id: 'contract-1', contract_date: selected.from, product_type: 'residential', total_price: 286000000, contract_status: 'active', prepayment_paid_cash: 80000000 }], transactions: null, targets: [],
                viewings: (selected.from === range.from ? ['new_customer', 'repeat_customer', 'existing_buyer'] : ['new_customer']).map(meeting_type => ({ scheduled_at: `${selected.from}T03:00:00Z`, status: 'completed', meeting_type })),
                leads: Array.from({ length: 18 }, (_, index) => ({ created_at: `${selected.from}T03:00:00Z`, status: 'new', source: index < 12 ? 'facebook' : 'website', sales_manager_name: index < 15 ? 'Номин' : null, last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null })) }), shopName: 'Vertmon · Туршилтын өгөгдөл' });
        }
        if (path === '/api/marketing/performance') {
            const selected = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! };
            const prior = previousRange(selected);
            const activities: MarketingActivity[] = [
                { id: 'campaign', name: 'Open Day кампанит ажил', activity_kind: 'campaign', completed_on: selected.to, start_date: selected.from, status: 'completed', channel: 'event', project_id: null, marketing_owner_name: null },
                { id: 'content', name: 'Төслийн контент', activity_kind: 'content', completed_on: selected.to, start_date: selected.from, status: 'completed', channel: 'facebook', project_id: null, marketing_owner_name: null },
                { id: 'prior-campaign', name: 'Өмнөх кампанит ажил', activity_kind: 'campaign', completed_on: prior.to, start_date: prior.from, status: 'completed', channel: 'event', project_id: null, marketing_owner_name: null },
            ];
            const spend: MarketingSpend[] = [
                { id: 'facebook-spend', spent_at: selected.from, amount: 120000, channel: 'facebook', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null },
                { id: 'google-spend', spent_at: selected.from, amount: 180000, channel: 'google_ads', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null },
                { id: 'prior-spend', spent_at: prior.from, amount: 90000, channel: 'facebook', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null },
            ];
            if (state.missingFx) spend.push({ id: 'missing-fx', spent_at: selected.from, amount: 0, channel: 'facebook', source: 'meta', exclusion: 'missing_fx', native_amount: 100, currency: 'USD', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null });
            const marketingLeads = [
                ...Array.from({ length: 18 }, (_, index) => ({ id: `marketing-${index}`, created_at: `${selected.from}T03:00:00Z`, project_id: null, source: index < 12 ? 'facebook' : 'website', marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: index < 9 ? `${selected.to}T03:00:00Z` : null, sales_manager_name: index < 9 ? 'Номин' : null })),
                ...Array.from({ length: 9 }, (_, index) => ({ id: `prior-marketing-${index}`, created_at: `${prior.from}T03:00:00Z`, project_id: null, source: 'facebook', marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: index < 3 ? `${prior.to}T03:00:00Z` : null, sales_manager_name: index < 3 ? 'Номин' : null })),
            ];
            return reply({ report: buildMarketingPerformance({ projects: [], activities, targets: [], spend, leads: marketingLeads,
                contracts: [{ lead_id: 'marketing-0', contract_date: selected.to, contract_number: 'VM-1', total_price: 286000000, contract_status: 'active' }, { lead_id: 'marketing-1', contract_date: selected.to, contract_number: 'VM-2', total_price: 286000000, contract_status: 'active' }] }, selected), projects: [], activities, spend: spend.filter(item => item.spent_at >= selected.from) });
        }
        if (path === '/api/ai-assistant/conversations') return reply({ conversations: [] });
        return reply({ error: `Unimplemented fixture: ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

for (const mobile of [false, true]) {
    test(`ажлын самбар → хурлын шинэчлэл → экспорт (${mobile ? 'mobile' : 'desktop'})`, async ({ page, context }) => {
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 });
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const state = await setup(page);
        await expect(page.getByRole('heading', { name: 'Сайн байна уу, Номин.' })).toBeVisible();
        await expect(page.getByText('Б. Энхжинтэй дахин холбогдох', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        mkdirSync('output/workday', { recursive: true });
        await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-today.png`, fullPage: true });
        await page.getByLabel('AI туслахад өгөх даалгавар', { exact: true }).fill('Өнөөдрийн ажлыг эрэмбэлэхэд туслаач.');
        await page.getByRole('button', { name: 'AI туслахад нээх', exact: true }).click();
        const panel = page.getByRole('complementary', { name: 'AI туслах', exact: true });
        await expect(panel.getByRole('textbox', { name: 'AI туслахад бичих' })).toHaveValue('Өнөөдрийн ажлыг эрэмбэлэхэд туслаач.');
        await panel.getByRole('button', { name: 'Хаах', exact: true }).click();
        await page.getByRole('link', { name: 'Хурлын бэлтгэл нээх', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Лхагва гарагийн хурал' })).toBeVisible();
        await page.getByRole('button', { name: 'Дууссан ажлаас оруулах (1)' }).click();
        await page.getByLabel('Саад, шийдэх зүйл', { exact: true }).fill('Төлбөрийн нөхцөлийг батлуулах шаардлагатай.');
        await page.getByLabel('Дараагийн алхам', { exact: true }).fill('Пүрэв гарагт саналаа илгээх.');
        await expect(page.getByRole('button', { name: 'Дараагийн хурал', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Хуулах', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Тайланд оруулах', exact: true }).click();
        await expect(page.getByText('Таны шинэчлэл хадгалагдсан.')).toBeVisible();
        await expect(page.locator('article')).toContainText('Харилцагчид үнийн санал хүргүүлсэн');
        await page.reload();
        await expect(page.getByLabel('Саад, шийдэх зүйл', { exact: true })).toHaveValue('Төлбөрийн нөхцөлийг батлуулах шаардлагатай.');
        await page.getByRole('button', { name: 'Хуулах', exact: true }).click();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain('Лхагва гарагийн хурал');
        expect(copied).toContain('Пүрэв гарагт саналаа илгээх.');
        expect(copied).toContain('Санхүүгийн эрх шаардлагатай'.toLowerCase());
        expect(copied).toContain('Өмнөх 9 · +9 (+100%)');
        expect(copied).toContain('Шилжилт: 50% (өмнөх 33.3%)');
        expect(copied).toContain('Гэрээлэлт: 11.1% (өмнөх 0%)');
        expect(copied).toContain('Нэг лидийн өртөг: 16,667₮');
        expect(copied).toContain('Google Ads: 0 лид');
        expect(copied).toContain('Болсон уулзалт: Өмнөх 1 · +2 (+200%)');
        expect(copied).toContain('Орон сууц: 1 гэрээ');
        expect(copied).toContain('Дууссан кампанит ажил: Өмнөх 1 · 0 (0%)');
        expect(copied).toContain('Дууссан контент: Өмнөх 0 · +1');
        await expect(page.getByRole('heading', { name: 'Болсон уулзалтын төрөл', exact: true })).toBeVisible();
        const products = page.getByRole('region', { name: 'Гэрээний бүтээгдэхүүний задаргаа' });
        await expect(products.getByRole('rowheader', { name: 'Орон сууц', exact: true })).toBeVisible();
        const agenda = copied.split('1. Борлуулалт')[0];
        expect(agenda).toContain('Хурлаар шийдэх');
        expect(agenda).toContain('Эзэнгүй 3 лид');
        expect(agenda).toContain('Номин: Төлбөрийн нөхцөлийг батлуулах шаардлагатай.');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (!mobile) {
            await page.getByRole('button', { name: 'Танилцуулах', exact: true }).click();
            await expect(page.locator('article:fullscreen')).toBeVisible();
            await page.getByRole('button', { name: 'Танилцуулгыг хаах', exact: true }).click();
            await expect(page.locator('article:fullscreen')).toHaveCount(0);
        }
        await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-weekly.png`, fullPage: true });
        expect(state.writes).toBe(1);
        expect(state.errors).toEqual([]);
        if (!mobile) {
            await page.emulateMedia({ media: 'print' });
            await page.setViewportSize({ width: 688, height: 1050 });
            await expect(page.locator('[data-sonner-toaster]')).toBeHidden();
            const printedChannels = page.getByRole('region', { name: 'Маркетингийн сувгийн KPI' });
            await expect.poll(() => printedChannels.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
            await expect.poll(() => printedChannels.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return [...element.querySelectorAll('th, td')].every(cell => {
                    const rect = cell.getBoundingClientRect();
                    return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
                });
            })).toBe(true);
            await page.pdf({ path: 'output/workday/weekly-review.pdf', format: 'A4', printBackground: true });
            await page.emulateMedia({ media: 'screen' });
            await page.setViewportSize({ width: 1440, height: 1050 });
        }
        await page.getByRole('link', { name: 'Маркетингийн үр дүн дэлгэрэнгүй', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/marketing\\?from=${range.from}&to=${range.to}$`));
        await expect(page.getByLabel('Эхлэх өдөр', { exact: true })).toHaveValue(range.from);
        await expect(page.getByLabel('Дуусах өдөр', { exact: true })).toHaveValue(range.to);
        const channels = page.getByRole('region', { name: 'Маркетингийн сувгийн KPI' });
        const facebook = channels.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Facebook', exact: true }) });
        await expect(facebook.getByRole('cell').last()).toHaveText('10,000 ₮');
        const google = channels.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Google Ads', exact: true }) });
        await expect(google).toBeVisible();
        await expect(google.getByRole('cell').first()).toHaveText('0');
        await expect(google.getByRole('cell').nth(4)).toHaveText('180,000 ₮');
        await expect(google.getByRole('cell').last()).toHaveText('—');
        await page.goto(`/marketing?from=${range.from}&to=${range.to}&tab=department`);
        await expect(page.getByRole('button', { name: 'Албаны KPI', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const department = page.getByRole('region', { name: 'Маркетингийн албаны KPI', exact: true });
        await expect(department.getByRole('heading', { name: 'Албаны KPI · 6 шалгуур', exact: true })).toBeVisible();
        await expect(department.getByText('Жин 40%', { exact: true })).toBeVisible();
        await expect(department.getByText('Жин 25%', { exact: true })).toBeVisible();
        await expect(department.getByText('Жин 5%', { exact: true })).toHaveCount(2);
        await expect(page.getByLabel('Эхлэх өдөр', { exact: true })).toHaveValue(range.from);
        await department.getByText('Тохируулах шалгуур', { exact: false }).first().click();
        await expect(department.getByText('Qualified Lead-ийн шалгуур ба баталгаажуулах бүртгэл тодорхойгүй.', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-department-kpi.png`, fullPage: true });
        await page.goto('/dashboard/ai-assistant');
        await expect(page.getByRole('heading', { name: 'Өнөөдөр юуг хамт хийх вэ?' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'AI туслахад бичих', exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'AI туслахад бичих', exact: true })).toHaveCSS('outline-style', 'none');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-ai.png`, fullPage: true });
        await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
        await expect(page.getByRole('button', { name: 'Нэгдсэн тайлан', exact: true })).toHaveCSS('color', 'rgb(197, 197, 192)');
        await page.screenshot({ path: `output/workday/${mobile ? 'mobile' : 'desktop'}-ai-dark.png`, fullPage: true, animations: 'disabled' });
    });
}

test('алдаатай эх үүсвэрийг тэг гэж үзүүлэхгүй, шинэчлээд сэргээнэ', async ({ page }) => {
    const state = await setup(page);
    state.failure = true;
    await page.goto('/dashboard/weekly');
    await expect(page.getByText('Борлуулалтын мэдээлэл түр боломжгүй. Шинэчлэх товчоор дахин оролдоно уу.')).toBeVisible();
    state.failure = false;
    await page.getByRole('button', { name: 'Шинэчлэх', exact: true }).click();
    await expect(page.getByText('Гэрээний бүртгэлтэй дүн', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
});

test('ханшгүй зардалтай хурлын тайлан өртгийг таамаглахгүй', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const state = await setup(page);
    state.missingFx = true;
    await page.goto('/dashboard/weekly');
    const cost = page.getByText('Нэг лидийн өртөг', { exact: true }).locator('..');
    await expect(cost.locator('dd').first()).toHaveText('—');
    await expect(cost).toContainText('Ханш дутуу · өртөг тооцоогүй');
    const agenda = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Энэ хурлаар шийдэх', exact: true }) });
    await expect(agenda).toContainText('Ханшгүй 1 зардал');
    await page.getByRole('button', { name: 'Хуулах', exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Нэг лидийн өртөг: тооцох боломжгүй');
    expect(copied).not.toContain('Нэг лидийн өртөг: 0₮');
    expect(copied.split('1. Борлуулалт')[0]).toContain('Ханшгүй 1 зардал');
    expect(state.errors).toEqual([]);
});

test('хувийн эрхтэй хэрэглэгч нэгдсэн тайлан дуудахгүй', async ({ page }) => {
    const state = await setup(page, true);
    await page.goto('/dashboard/weekly');
    await expect(page.getByRole('heading', { name: 'Миний явц, хэлэлцэх зүйл' })).toBeVisible();
    expect(state.requests).not.toContain('/api/dashboard/reports/operations');
    expect(state.requests).not.toContain('/api/marketing/performance');
    expect(state.errors).toEqual([]);
});

test('хадгалалт бүтэлгүйтвэл бичвэр үлдэж, дахин хадгалж болно', async ({ page }) => {
    const state = await setup(page);
    state.failSave = true;
    await page.goto('/dashboard/weekly');
    await page.getByLabel('Хийсэн ажил', { exact: true }).fill('Харилцагчтай уулзсан.');
    await page.getByRole('button', { name: 'Тайланд оруулах', exact: true }).click();
    await expect(page.getByText('Хадгалалт түр боломжгүй. Дахин оролдоно уу.')).toBeVisible();
    await expect(page.getByLabel('Хийсэн ажил', { exact: true })).toHaveValue('Харилцагчтай уулзсан.');
    expect(state.updates).toEqual([]);
    state.failSave = false;
    await page.getByRole('button', { name: 'Тайланд оруулах', exact: true }).click();
    await expect(page.getByText('Таны шинэчлэл хадгалагдсан.')).toBeVisible();
    expect(state.updates).toHaveLength(1);
});
