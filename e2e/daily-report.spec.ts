import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildDailyReport, readDailyReportConfig, type BuildDailyReportInput, type DailyReportNotes, type SaveDailyReportInput } from '../src/lib/dashboard/daily-report';
import { ubDateStr } from '../src/lib/utils/date';

// «Өдрийн тайлан»: багийн харагдац (Elysium-ийн загвар) — тоо оруулж хадгалах, загвар засах;
// менежер өөрийн баганаа шууд оруулах горимоор нээнэ. API-г бодит builder-ээр mock хийнэ.
const shopId = '00000000-0000-4000-8000-000000000002';
const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const config = {
    ...readDailyReportConfig(null, 'Elysium Residence').config,
    title: '"Элизиум Ресиденс" баг',
    managers: [{ name: 'Ариунбилэг.Нямхүү', short: 'Ари' }, { name: CHAN, short: 'Чан' }, { name: KHON, short: 'Хон' }],
};
const roster = [{ name: 'Ариунбилэг.Нямхүү', is_active: true }, { name: CHAN, is_active: true }, { name: KHON, is_active: true }];

async function setup(page: Page, mode: 'team' | 'personal') {
    const today = ubDateStr();
    const state = {
        puts: [] as unknown[], settings: [] as unknown[], errors: [] as string[],
        counts: [
            { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.l1.total', value: 1 }, { manager_name: CHAN, metric: 'call.l1.total', value: 2 },
            { manager_name: KHON, metric: 'call.l1.total', value: 1 }, { manager_name: 'Ариунбилэг.Нямхүү', metric: 'call.personal.total', value: 2 },
            { manager_name: CHAN, metric: 'call.personal.total', value: 4 }, { manager_name: KHON, metric: 'call.personal.total', value: 5 },
            { manager_name: CHAN, metric: 'chat.personal', value: 2 }, { manager_name: KHON, metric: 'chat.personal', value: 2 },
        ].filter(row => mode === 'team' || row.manager_name !== KHON),
        notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан' } } as DailyReportNotes,
        completed: null as BuildDailyReportInput['completed'],
    };
    const input = (date: string): BuildDailyReportInput => ({
        date, title: config.title!, config, roster,
        counts: state.counts,
        meetings: [
            { id: 'm1', manager: CHAN, type: 'new_customer', customer: 'Бат', property: null, notes: 'Б2-58м2 10-30%', feedback: 'үлдэгдэл банк', scheduled_at: `${date}T02:00:00Z` },
            { id: 'm2', manager: KHON, type: 'new_customer', customer: 'Сараа', property: null, notes: 'Б1-89м2 бартер эсвэл УХН', feedback: null, scheduled_at: `${date}T03:00:00Z` },
            { id: 'm3', manager: KHON, type: 'new_customer', customer: 'Дорж', property: null, notes: 'Эмийн сан үйлчилгээний талбай Б2 блокоос 60 орчим мкв', feedback: null, scheduled_at: `${date}T04:00:00Z` },
        ],
        pendingMeetings: 1,
        notes: state.notes,
        completed: state.completed,
        only: null,
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
                    ? { personal: false, onboarding: false, canEditTeam: true, editable: ['Ариунбилэг.Нямхүү', CHAN, KHON] }
                    : { personal: true, onboarding: false, canEditTeam: true, editable: [KHON] },
            });
        }
        if (path === '/api/dashboard/daily-report' && request.method() === 'PUT') {
            const data = request.postDataJSON() as SaveDailyReportInput;
            state.puts.push(data);
            for (const cell of data.cells) {
                state.counts = state.counts.filter(row => row.manager_name !== cell.manager || row.metric !== cell.metric);
                if (cell.value !== null) state.counts.push({ manager_name: cell.manager, metric: cell.metric, value: cell.value });
            }
            if (data.notes !== undefined) state.notes = data.notes;
            if (data.complete !== undefined) state.completed = data.complete ? { by: mode === 'team' ? 'Захирал' : 'М. Хонгорзул', at: new Date().toISOString() } : null;
            return reply({ ok: true });
        }
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
    await page.getByRole('spinbutton', { name: `Төслийн утас · 77862222 · Нийт · ${CHAN}` }).fill('3');
    await page.getByRole('spinbutton', { name: `Менежерийн дуудлага · Нийт · ${KHON}` }).fill('');
    await page.getByRole('textbox', { name: 'Менежерийн чат — тайлбар' }).fill('Ихэнх нь үнийн мэдээлэл асуусан');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(page.getByText('Хадгалагдлаа', { exact: true })).toBeVisible();
    expect(state.puts).toEqual([{
        date: today,
        cells: [{ manager: CHAN, metric: 'call.l1.total', value: 3 }, { manager: KHON, metric: 'call.personal.total', value: null }],
        notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан', personal: '' }, chats: 'Ихэнх нь үнийн мэдээлэл асуусан', general: '' },
    }]);

    await page.getByRole('button', { name: 'Баталгаажуулах', exact: true }).click();
    await expect.poll(() => state.puts.at(-1)).toEqual({ date: today, cells: [], complete: true });

    await page.getByRole('button', { name: 'Загвар', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Өдрийн тайлангийн загвар' })).toBeVisible();
    await page.getByRole('button', { name: 'Шугам нэмэх', exact: true }).click();
    await page.getByRole('textbox', { name: 'Шугамын дугаар' }).last().fill('7575-8000');
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.settings.length).toBe(1);
    expect((state.settings[0] as { config: { lines: Array<{ key: string; label: string }> } }).config.lines.at(-1)).toEqual({ key: 'l2', label: '7575-8000', categories: [] });
    expect(state.errors).toEqual([]);
});

test('ээлжийн менежер багийн мэдээллийг харж, өөрийн тоогоо хадгалаад төслийн тайланг баталгаажуулна', async ({ page }) => {
    const { state, today } = await setup(page, 'personal');
    await page.goto('/dashboard/daily-report');
    const report = page.locator('article.daily-report');
    await expect(report.getByRole('columnheader', { name: 'Хон' }).first()).toBeVisible();
    await expect(report.getByRole('columnheader', { name: 'Чан' }).first()).toBeVisible();
    await expect(report.getByText('Бат — Б2-58м2 10-30%; үлдэгдэл банк')).toBeVisible();
    await expect(report.getByRole('spinbutton', { name: new RegExp(CHAN) })).toHaveCount(0);
    await expect(report.getByRole('region', { name: 'Төслийн утас · 77862222', exact: true }).getByRole('cell').nth(1)).toHaveText('2');
    await expect(page.getByRole('button', { name: 'Загвар', exact: true })).toHaveCount(0);
    await page.getByRole('spinbutton', { name: `Төслийн утас · 77862222 · Нийт · ${KHON}` }).fill('2');
    await page.getByRole('spinbutton', { name: `Менежерийн дуудлага · Нийт · ${KHON}` }).fill('3');
    await page.getByRole('spinbutton', { name: `Чат · Хувь чат · ${KHON}` }).fill('4');
    await page.getByRole('textbox', { name: 'Нэмэлт тэмдэглэл', exact: true }).fill('Багийн өдрийн нэгтгэл');
    await page.screenshot({ path: 'test-results/e2e/daily-report-personal.png', fullPage: true });
    await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect.poll(() => state.puts).toEqual([{ date: today, cells: [
        { manager: KHON, metric: 'call.l1.total', value: 2 }, { manager: KHON, metric: 'call.personal.total', value: 3 }, { manager: KHON, metric: 'chat.personal', value: 4 },
    ], notes: { lines: { l1: 'Төслийн ерөнхий мэдээлэл авсан', personal: '' }, chats: '', general: 'Багийн өдрийн нэгтгэл' } }]);
    await expect(report.getByText('Нийт 9 дуудлага ирсэн.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Баталгаажуулах', exact: true }).click();
    await expect.poll(() => state.puts.at(-1)).toEqual({ date: today, cells: [], complete: true });
    await expect(report.locator('footer')).toContainText('Тайлан хийж гүйцэтгэсэн: М. Хонгорзул');
    await page.reload();
    await expect(report.locator('footer')).toContainText('М. Хонгорзул');
    await expect(report.getByText('Багийн өдрийн нэгтгэл', { exact: true })).toBeVisible();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Хуулах', exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Төслийн утас · 77862222: Нийт 5 дуудлага ирсэн');
    expect(copied).toContain('Менежерийн дуудлага: Нийт 9 дуудлага ирсэн');
    expect(copied).toContain('Бат — Б2-58м2 10-30%; үлдэгдэл банк');
    expect(copied).toContain('Тайлан хийж гүйцэтгэсэн: М. Хонгорзул');
    await page.emulateMedia({ media: 'print' });
    await expect(report.getByRole('region', { name: 'Менежерийн дуудлага', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/e2e/daily-report-print.png', fullPage: true });
    expect(state.errors).toEqual([]);
});
