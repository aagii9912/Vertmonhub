import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildMarketingPerformance, type PerformanceData } from '../src/lib/marketing/performance';
import { exportMarketingPerformance } from '../src/lib/marketing/performance-export';
import { COMPACT_VIEWPORT } from './support/viewports';

const shop = '00000000-0000-4000-8000-000000000002';
const csv = 'Account ID,Campaign ID,Campaign name,Day,Amount spent (USD)\n123456789012345678,987654321098765432,Elysium import,2026-09-01,12.50';
async function setup(page: Page, readonly = false) {
    const source: PerformanceData = { projects: [], activities: [], targets: [], spend: [], contracts: [], leads: [] };
    const state = { fail: false, stale: false, unchanged: false, requests: [] as { action: string; id: string }[], errors: [] as string[] };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Импорт тест' }, role: readonly ? 'viewer' : 'marketing', permissions: { ...ROLE_PERMISSIONS.marketing, canWrite: !readonly }, shops: [{ id: shop, name: 'Тест байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/facebook/ads/spend-sync') return reply({ accountId: null, status: null });
        if (path === '/api/marketing/facebook/ads/spend-import') {
            if (request.method() === 'GET') return reply({ imports: [] });
            const form = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!) }).formData();
            expect((form.get('file') as File).name).toBe('meta.csv');
            expect(JSON.parse(String(form.get('options')))).toMatchObject({ timezone: 'Asia/Ulaanbaatar', mntPerUnit: 3500 });
            const action = String(form.get('action'));
            state.requests.push({ action, id: String(form.get('requestId')) });
            if (action === 'commit') {
                expect(form.get('fingerprint')).toBe('a'.repeat(32));
                if (state.stale) return reply({ error: 'Зардлын мэдээлэл өөрчлөгдсөн байна. Файлыг дахин шалгана уу.' }, 409);
                if (state.fail) return reply({ error: 'Импорт хадгалж чадсангүй. Дахин оролдоно уу.' }, 503);
                source.spend = [{ id: 'meta:file', source: 'meta', ingestionSource: 'file', spent_at: '2026-09-01', amount: 43750, channel: 'meta_ads', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, native_amount: 12.5, currency: 'USD', note: 'Файл импорт · Elysium import' }];
            }
            return reply({ accountId: 'act_123456789012345678', currency: 'USD', timezone: 'Asia/Ulaanbaatar', from: '2026-09-01', to: '2026-09-01', rows: 1,
                added: state.unchanged ? 0 : 1, updated: 0, unchanged: state.unchanged ? 1 : 0, skippedApi: 0, nativeTotal: '12.50', savedMnt: '43750', manualOverlap: 0, ignoredSummary: 0, fingerprint: 'a'.repeat(32),
                sample: [{ campaign_id: '987654321098765432', campaign_name: 'Elysium import', spent_at: '2026-09-01', native_amount: '12.50' }] });
        }
        if (path.startsWith('/api/marketing/performance')) {
            const report = buildMarketingPerformance(source, { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! });
            if (path.endsWith('/export')) return route.fulfill({ body: await exportMarketingPerformance(report), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': 'attachment; filename="Marketing-test.xlsx"' } });
            return reply({ report, projects: source.projects, activities: source.activities, spend: source.spend });
        }
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // The Meta import lives on the «Бүртгэл» tab.
    await page.goto('/marketing?tab=records');
    return state;
}
async function preview(page: Page) {
    await page.getByRole('button', { name: 'Meta файл импортлох', exact: true }).click();
    const form = page.getByRole('dialog');
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await form.getByLabel('Meta тайлангийн файл').setInputFiles({ name: 'meta.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await form.getByLabel('Зарын дансны цагийн бүс').fill('Asia/Ulaanbaatar');
    await form.getByLabel('1 валютын нэгжийн төгрөгийн ханш').fill('3500');
    await form.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(form.getByLabel('Импортын урьдчилсан дүн')).toBeVisible();
    await expect(form).toContainText('987654321098765432');
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    return form;
}
for (const compact of [false, true]) test(`Meta file preview, failed save, retry and report (${compact ? 'compact' : 'desktop'})`, async ({ page }, testInfo) => {
    if (compact) await page.setViewportSize(COMPACT_VIEWPORT);
    const state = await setup(page);
    const form = await preview(page);
    expect(state.requests.map(r => r.action)).toEqual(['preview']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('preview.png'), animations: 'disabled' });
    state.fail = true;
    await form.getByRole('button', { name: 'Баталгаажуулж импортлох', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('хадгалж чадсангүй');
    state.fail = false;
    await form.getByRole('button', { name: 'Баталгаажуулж импортлох', exact: true }).click();
    await expect(form).not.toBeVisible();
    expect(new Set(state.requests.map(r => r.id)).size).toBe(1);
    await expect(page.getByLabel('Эхлэх өдөр', { exact: true })).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Дуусах өдөр', { exact: true })).toHaveValue('2026-09-01');
    await page.getByRole('button', { name: 'Бүртгэл', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Elysium import' });
    await expect(row).toContainText('файл импорт');
    await expect(row.getByRole('button', { name: 'Засах' })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    expect((await download).suggestedFilename()).toContain('Marketing');
    await page.screenshot({ path: testInfo.outputPath('saved-report.png'), fullPage: true, animations: 'disabled' });
    expect(state.errors).toEqual([]);
    expect(await page.locator('[data-nextjs-dialog]').count()).toBe(0);
});
test('stale preview requires a fresh check; unchanged file cannot be committed', async ({ page }) => {
    const state = await setup(page), form = await preview(page);
    state.stale = true;
    await form.getByRole('button', { name: 'Баталгаажуулж импортлох', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Файл шалгах', exact: true })).toBeVisible();
    await expect(form.getByLabel('Зарын дансны цагийн бүс')).toBeEnabled();
    state.stale = false; state.unchanged = true;
    await form.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Баталгаажуулж импортлох', exact: true })).toBeDisabled();
    await expect(form.getByRole('status')).toContainText('Дахин импортлох шаардлагагүй');
});
test('read-only marketing access has no import action', async ({ page }) => {
    await setup(page, true);
    await expect(page.getByRole('heading', { name: 'Маркетинг', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Meta файл импортлох', exact: true })).toHaveCount(0);
});
