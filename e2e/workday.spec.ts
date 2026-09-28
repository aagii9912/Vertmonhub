import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildOperationsReport } from '../src/lib/dashboard/operations-report';
import { buildMarketingPerformance } from '../src/lib/marketing/performance';
import { nextMeetingDate, weeklyReviewRange } from '../src/lib/dashboard/weekly-review';

const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000002';
const meetingDate = nextMeetingDate();
const range = weeklyReviewRange(meetingDate);

async function setup(page: Page, restricted = false) {
    const state = { updates: [] as Record<string, unknown>[], failure: false, failSave: false, requests: [] as string[], errors: [] as string[], writes: 0 };
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
            return reply({ ...buildOperationsReport({ range: selected, now: new Date().toISOString(), contracts: [{ id: 'contract-1', contract_date: selected.from, total_price: 286000000, contract_status: 'active', prepayment_paid_cash: 80000000 }], transactions: null, targets: [],
                leads: Array.from({ length: 18 }, (_, index) => ({ created_at: `${selected.from}T03:00:00Z`, status: 'new', source: index < 12 ? 'facebook' : 'website', sales_manager_name: index < 15 ? 'Номин' : null, last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null })) }), shopName: 'Vertmon · Туршилтын өгөгдөл' });
        }
        if (path === '/api/marketing/performance') return reply({ report: buildMarketingPerformance({ projects: [], contracts: [], activities: [], targets: [], spend: [], leads: Array.from({ length: 18 }, (_, index) => ({ id: `marketing-${index}`, created_at: `${range.from}T03:00:00Z`, project_id: null, source: index < 12 ? 'facebook' : 'website', marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: index < 9 ? `${range.to}T03:00:00Z` : null, sales_manager_name: index < 9 ? 'Номин' : null })) }, range), projects: [], activities: [], spend: [] });
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
            await expect(page.locator('[data-sonner-toaster]')).toBeHidden();
            await page.pdf({ path: 'output/workday/weekly-review.pdf', format: 'A4', printBackground: true });
            await page.emulateMedia({ media: 'screen' });
        }
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
