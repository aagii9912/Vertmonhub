import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { compareErp, normalizeErpSheets } from '../src/lib/erp/import';
import { buildBudgetOverview } from '../src/lib/marketing/budget';

const adminId = '00000000-0000-4000-8000-000000000101';
const delegateId = '00000000-0000-4000-8000-000000000102';
const shopId = '00000000-0000-4000-8000-000000000110';
const projectId = '00000000-0000-4000-8000-000000000120';
const snapshotId = '00000000-0000-4000-8000-000000000140';

// Real Next pages/login/cookies; business API fixtures never contact production.
async function setup(page: Page) {
    const shop = { id: shopId, name: 'Тест байгууллага', setup_completed: true, is_active: true };
    const baseline = compareErp(null, normalizeErpSheets([{ name: 'Sheet1', columns: ['Код', 'Дүн'],
        rows: [{ Код: 'E-101', Дүн: 100 }] }], { Sheet1: ['Код'] }));
    const snapshot = { id: snapshotId, source: 'Elysium ERP', report_date: '2026-09-26',
        file_name: 'Elysium ERP.xlsx', previous_id: null, summary: baseline, created_at: '2026-10-01T02:49:40Z' };
    const users = [
        { id: adminId, email: 'onboarding-admin@example.invalid', full_name: 'Тест Админ', role: 'super_admin',
            created_at: '2026-01-01', shops: [{ ...shop, is_owner: true }], email_confirmed: true },
        { id: delegateId, email: 'delegate@example.invalid', full_name: 'Шинэ Админ', role: 'viewer',
            created_at: '2026-01-01', shops: [{ ...shop, is_owner: false }], email_confirmed: true },
    ];
    const budgets: Record<string, number[]> = { organization: Array(12).fill(1200), [projectId]: Array(12).fill(0) };
    const state = { writes: [] as { path: string; body: any; shop: string | undefined }[],
        errors: [] as string[], unhandled: [] as string[], failBudget: false };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Тест Админ' }, role: 'super_admin', permissions: ROLE_PERMISSIONS.super_admin, shops: [shop] });
        if (path === '/api/user/shops') return reply({ shops: [shop] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/dashboard/director') return reply({ available: false });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 0, inbox: 0, meetings: 0 });
        if (path === '/api/admin/settings') return reply({ admin: { email: users[0].email, role: 'super_admin' } });
        if (path === '/api/admin/shops') return reply({ shops: [shop] });
        if (path === '/api/admin/roles') return reply({ roles: [{ name: 'viewer', display_name_mn: 'Харах эрх' }] });
        if (path === '/api/admin/users') {
            if (request.method() === 'PATCH') {
                const body = request.postDataJSON(); state.writes.push({ path, body, shop: request.headers()['x-shop-id'] });
                Object.assign(users.find(user => user.id === body.userId)!, { role: body.role });
                return reply({ success: true });
            }
            return reply({ actor_id: adminId, users });
        }
        if (path === '/api/dashboard/erp-imports') {
            if (url.searchParams.get('sources') === '1') return reply({ sources: ['Elysium ERP'] });
            if (url.searchParams.get('id')) return reply({ import: snapshot, ...baseline,
                changes: url.searchParams.get('changesOnly') === '1' ? [] : baseline.changes,
                totalChanges: url.searchParams.get('changesOnly') === '1' ? 0 : 1, previousDate: null });
            return reply({ imports: url.searchParams.get('source') === 'Elysium ERP' ? [snapshot] : [], total: 1 });
        }
        if (path === '/api/marketing/budget') {
            if (request.method() === 'PUT') {
                const body = request.postDataJSON(); state.writes.push({ path, body, shop: request.headers()['x-shop-id'] });
                if (state.failBudget) return reply({ error: 'Төсөв хадгалах түр алдаа' }, 503);
                budgets[body.project_id || 'organization'] = body.months.map((month: { amount: number }) => month.amount);
                return reply({ success: true });
            }
            const project = url.searchParams.get('project');
            return reply({ year: Number(url.searchParams.get('year')), available: true, project_id: project,
                projects: [{ id: projectId, name: 'Elysium Residence' }],
                overview: buildBudgetOverview(budgets[project || 'organization'], Array(12).fill(0), Array(12).fill(0)),
                byChannel: [], entries: [], metaAdsTotalSpend: 0 });
        }
        state.unhandled.push(`${request.method()} ${path}`);
        return reply({ error: `Missing fixture ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('onboarding-admin@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('onboarding-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

for (const mobile of [false, true]) {
    const viewport = mobile ? 'mobile' : 'desktop';
    test(`Elysium saved source and baseline visible (${viewport})`, async ({ page }, info) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/dashboard/reports/erp');
        await expect(page.getByLabel('Эх үүсвэр / тайлангийн багц', { exact: true })).toHaveValue('Elysium ERP');
        await expect(page.getByRole('combobox', { name: 'Импорт', exact: true })).toHaveValue(snapshotId);
        await expect(page.getByRole('row').filter({ hasText: 'E-101' })).toContainText('Анхны суурь');
        await expect(page.getByRole('checkbox', { name: 'Зөвхөн өөрчлөлт' })).not.toBeChecked();
        expect(state.writes).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
        await page.screenshot({ path: info.outputPath('elysium-erp.png'), fullPage: true });
    });
    test(`annual project budget preview and failed-save retry (${viewport})`, async ({ page }, info) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/marketing/budget');
        // Shop = төсөл: ганц төсөлтэй ажлын орчинд хамрах хүрээ сонгохгүй — төслийн жилийн үндсэн төсөв.
        await expect(page.getByRole('combobox', { name: /Төсвийн хамрах хүрээ/ })).toHaveCount(0);
        await page.getByRole('button', { name: 'Төсөв засах', exact: true }).click();
        await page.getByLabel('Жилийн төсөв (₮)', { exact: true }).fill('120001');
        await page.getByRole('button', { name: '12 сард тэнцүү хуваарилах', exact: true }).click();
        expect(state.writes).toEqual([]);
        state.failBudget = true;
        await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(page.getByText('Төсөв хадгалах түр алдаа', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Жилийн төсөв (₮)', { exact: true })).toHaveValue('120001');
        state.failBudget = false;
        await page.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Төсөв засах', exact: true })).toBeVisible();
        expect(state.writes).toHaveLength(2);
        const saved = state.writes[1];
        expect(saved.body.project_id).toBeNull(); expect(saved.shop).toBe(shopId);
        expect(saved.body.months).toHaveLength(12);
        expect(saved.body.months.reduce((total: number, month: { amount: number }) => total + month.amount, 0)).toBe(120001);
        expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath('annual-project-budget.png'), fullPage: true });
    });
    test(`Super Admin delegation has explicit confirmation (${viewport})`, async ({ page }, info) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/admin/users');
        await page.getByRole('button', { name: 'Super Admin эрх өгөх', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByLabel('Шинэ дүр', { exact: true })).toHaveValue('super_admin');
        await expect(dialog.getByText(/Таны Super Admin эрх хадгалагдана/)).toBeVisible();
        expect(state.writes).toEqual([]);
        await dialog.getByRole('button', { name: 'Super Admin эрх олгох', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        expect(state.writes).toEqual([{ path: '/api/admin/users', body: { userId: delegateId, role: 'super_admin' }, shop: undefined }]);
        expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
        await page.screenshot({ path: info.outputPath('super-admin-delegation.png'), fullPage: true });
    });
}
