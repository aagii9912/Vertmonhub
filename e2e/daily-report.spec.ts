import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildDailyReport, DailyReportConfigSchema, type BuildDailyReportInput } from '../src/lib/dashboard/daily-report';
import { ubDateStr } from '../src/lib/utils/date';

// «Өдрийн тайлан»: багийн харагдац (Elysium-ийн загвар) — тоо оруулж хадгалах, загвар засах;
// менежер өөрийн баганаа шууд оруулах горимоор нээнэ. API-г бодит builder-ээр mock хийнэ.
const shopId = '00000000-0000-4000-8000-000000000002';
const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const config = DailyReportConfigSchema.parse({
    title: '"Элизиум Ресиденс" баг',
    lines: [{ key: 'l1', label: '7786-2222', categories: ['new', 'other'] }, { key: 'l2', label: '8888/9008', categories: ['new', 'repeat', 'other'] }],
    chats: [{ key: 'page', label: 'Пэйж Fb' }, { key: 'personal', label: 'Хувь чат' }],
    managers: [{ name: 'Ариунбилэг.Нямхүү', short: 'Ари' }, { name: CHAN, short: 'Чан' }, { name: KHON, short: 'Хон' }],
});
const roster = [{ name: 'Ариунбилэг.Нямхүү', is_active: true }, { name: CHAN, is_active: true }, { name: KHON, is_active: true }];

async function setup(page: Page, mode: 'team' | 'personal') {
    const today = ubDateStr();
    const state = {
        puts: [] as unknown[], settings: [] as unknown[], errors: [] as string[],
        counts: [
            { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.l1.new', value: 1 }, { manager_name: CHAN, metric: 'call.l1.new', value: 2 },
            { manager_name: KHON, metric: 'call.l1.new', value: 1 }, { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.l2.new', value: 2 },
            { manager_name: CHAN, metric: 'call.l2.new', value: 4 }, { manager_name: KHON, metric: 'call.l2.new', value: 5 },
            { manager_name: CHAN, metric: 'chat.personal', value: 2 }, { manager_name: KHON, metric: 'chat.personal', value: 2 },
        ],
    };
    const input = (date: string): BuildDailyReportInput => ({
        date, title: config.title!, config, roster,
        counts: mode === 'personal' ? [] : state.counts,
        meetings: [
            { id: 'm1', manager: CHAN, type: 'new_customer', customer: 'Бат', property: null, notes: 'Б2-58м2 10-30%', feedback: 'үлдэгдэл банк', scheduled_at: `${date}T02:00:00Z` },
            { id: 'm2', manager: KHON, type: 'new_customer', customer: 'Сараа', property: null, notes: 'Б1-89м2 бартер эсвэл УХН', feedback: null, scheduled_at: `${date}T03:00:00Z` },
            { id: 'm3', manager: KHON, type: 'new_customer', customer: 'Дорж', property: null, notes: 'Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв', feedback: null, scheduled_at: `${date}T04:00:00Z` },
        ],
        pendingMeetings: 1,
        notes: mode === 'personal' ? {} : { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан' } },
        completed: null,
        only: mode === 'personal' ? KHON : null,
    });
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/auth/')) return route.continue();
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        const role = mode === 'team' ? 'admin' : 'sales_manager';
        if (path === '/api/me') return reply({ user: { fullName: mode === 'team' ? 'Захирал' : 'Хонгорзул' }, role,
            permissions: { ...ROLE_PERMISSIONS[role], canWrite: true, modules: mode === 'team' ? [...ROLE_PERMISSIONS.admin.modules, 'settings'] : ['dashboard', 'leads', 'viewings'] },
            shops: [{ id: shopId, name: 'Elysium Residence', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: mode === 'team' ? 'org' : 'personal', managerName: mode === 'team' ? null : KHON, isManager: mode === 'personal', canViewTeam: mode === 'team' });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 0, inbox: 0, meetings: 0 });
        if (path === '/api/dashboard/daily-report' && request.method() === 'GET') {
            const date = url.searchParams.get('date') ?? today;
            return reply({
                date, today, report: buildDailyReport(input(date)), config, configSaved: true, configInvalid: false,
                roster: mode === 'team' ? roster : [],
                viewer: mode === 'team'
                    ? { personal: false, onboarding: false, canEditTeam: true, editable: [ 'Ариунбилэг.Нямхүү', CHAN, KHON] }
                    : { personal: true, onboarding: false, canEditTeam: false, editable: [KHON] },
            });
        }
        if (path === '/api/dashboard/daily-report' && request.method() === 'PUT') { state.puts.push(request.postDataJSON()); return reply({ ok: true }); }
        if (path === '/api/dashboard/daily-report/settings') { state.settings.push(request.postDataJSON()); return reply({ config }); }
        return reply({ error: `Missing fixture: ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return { state, today };
}

test('багийн өдрийн тайлан: хүснэгт, уулзалтын жагсаалт, тоо засаж хадгалах, загвар', async ({ page }) => {
    const { state, today } = await setup(page, 'team');
    await page.goto('/dashboard/daily-report');
    const report = page.locator('article.daily-report');
    await expect(report.getByText('"Элизиум Ресиденс" баг', { exact: true })).toBeVisible();
    await expect(report.getByText('Менежер — Р. Чанцалдулам', { exact: true })).toBeVisible();
    await expect(report.getByText('Нийт 11 дуудлага ирсэн.', { exact: true })).toBeVisible();
    await expect(report.getByText('Бат — Б2-58м2 10-30%; үлдэгдэл банк')).toBeVisible();
    await expect(page.getByText(/товлосон 1 уулзалтын үр дүн бүртгэгдээгүй/)).toBeVisible();
    await page.screenshot({ path: 'test-results/e2e/daily-report-team.png', fullPage: true });

    await page.getByRole('button', { name: 'Засах', exact: true }).click();
    await page.getByRole('spinbutton', { name: `7786-2222 · Бусад · ${CHAN}` }).fill('3');
    await page.getByRole('spinbutton', { name: `8888/9008 · Шинэ · ${KHON}` }).fill('');
    await page.getByRole('textbox', { name: 'Менежерийн чат — тайлбар' }).fill('Ихэнх нь үнийн мэдээлэл асуусан');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(page.getByText('Хадгалагдлаа', { exact: true })).toBeVisible();
    expect(state.puts).toEqual([{
        date: today,
        cells: [{ manager: CHAN, metric: 'call.l1.other', value: 3 }, { manager: KHON, metric: 'call.l2.new', value: null }],
        notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан', l2: '' }, chats: 'Ихэнх нь үнийн мэдээлэл асуусан', general: '' },
    }]);

    await page.getByRole('button', { name: 'Баталгаажуулах', exact: true }).click();
    await expect.poll(() => state.puts.at(-1)).toEqual({ date: today, cells: [], complete: true });

    await page.getByRole('button', { name: 'Загвар', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Өдрийн тайлангийн загвар' })).toBeVisible();
    await page.getByRole('button', { name: 'Шугам нэмэх', exact: true }).click();
    await page.getByRole('textbox', { name: 'Шугамын дугаар' }).last().fill('7575-8000');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.settings.length).toBe(1);
    expect((state.settings[0] as { config: { lines: Array<{ key: string; label: string }> } }).config.lines.at(-1)).toEqual({ key: 'l3', label: '7575-8000', categories: [] });
    expect(state.errors).toEqual([]);
});

test('менежер өөрийн баганаа шууд оруулах горимоор нээж, зөвхөн өөрийн нүдийг хадгална', async ({ page }) => {
    const { state, today } = await setup(page, 'personal');
    await page.goto('/dashboard/daily-report');
    const report = page.locator('article.daily-report');
    await expect(report.getByRole('columnheader', { name: 'Хон' }).first()).toBeVisible();
    await expect(report.getByRole('columnheader', { name: 'Чан' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Загвар', exact: true })).toHaveCount(0);
    await page.getByRole('spinbutton', { name: `7786-2222 · Шинэ · ${KHON}` }).fill('2');
    await page.getByRole('spinbutton', { name: `Чат · Хувь чат · ${KHON}` }).fill('4');
    await page.screenshot({ path: 'test-results/e2e/daily-report-personal.png', fullPage: true });
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.puts).toEqual([{ date: today, cells: [
        { manager: KHON, metric: 'call.l1.new', value: 2 }, { manager: KHON, metric: 'chat.personal', value: 4 },
    ] }]);
    expect(state.errors).toEqual([]);
});
