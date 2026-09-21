import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildMarketingPerformance, type PerformanceData, type MarketingActivity, type MarketingTarget } from '../src/lib/marketing/performance';
import { exportMarketingPerformance } from '../src/lib/marketing/performance-export';

const shop = '00000000-0000-4000-8000-000000000002';
const project = '00000000-0000-4000-8000-000000000003';
const lead = '00000000-0000-4000-8000-000000000004';
async function setup(page: Page) {
    const source: PerformanceData = { projects: [{ id: project, name: 'Elysium Residence' }], activities: [], targets: [], spend: [], contracts: [],
        leads: [{ id: lead, created_at: '2026-09-05T00:00:00+08:00', project_id: null, marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: null, sales_manager_name: 'Борлуулагч', source: 'facebook_ads' }] };
    const state = { source, writes: [] as Record<string, unknown>[], failSave: false, failRead: false, pageErrors: [] as string[],
        metaRate: null as number | null, metaSynced: false, metaFailure: false, metaWrites: [] as Record<string, unknown>[] };
    page.on('pageerror', e => state.pageErrors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Маркетинг тест' }, role: 'marketing', permissions: ROLE_PERMISSIONS.marketing, shops: [{ id: shop, name: 'Тест байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/dashboard/nav-counts') return reply({});
        if (path === '/api/marketing/facebook/ads/spend-sync') {
            if (request.method() === 'POST') {
                const input = request.postDataJSON(); state.metaWrites.push(input);
                if (state.metaFailure) return reply({ error: 'Meta холболт тасарлаа' }, 500);
                state.metaSynced = true;
                if (input.mntPerUnit) state.metaRate = input.mntPerUnit;
                source.spend = [{ id: 'meta:test', source: 'meta', spent_at: '2026-09-10', amount: state.metaRate ? state.metaRate * 100 : 0,
                    channel: 'meta_ads', marketing_campaign_id: null, project_id: null, marketing_owner_name: null,
                    native_amount: 100, currency: 'USD', exclusion: state.metaRate ? null : 'missing_fx', note: 'Meta campaign 123 · act_456' }];
                return reply({ success: true, rows: 1, needsRate: !state.metaRate });
            }
            return reply({ accountId: 'act_456', status: { account_id: 'act_456', currency: 'USD', timezone: 'Asia/Ulaanbaatar', mnt_per_unit: state.metaRate,
                last_success_at: state.metaSynced ? '2026-09-21T00:00:00Z' : null, last_error: state.metaFailure ? 'Meta холболт тасарлаа' : null,
                last_from: state.metaSynced ? '2026-09-01' : null, last_to: state.metaSynced ? '2026-09-21' : null } });
        }
        if (path === '/api/marketing/performance') {
            if (state.failRead) return reply({ error: 'Тайлангийн эх үүсвэр уншигдсангүй' }, 500);
            const range = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')!, project: url.searchParams.get('project') || undefined };
            return reply({ report: buildMarketingPerformance(source, range), projects: source.projects, activities: source.activities, spend: source.spend });
        }
        if (path === '/api/marketing/performance/export') return route.fulfill({ body: await exportMarketingPerformance(buildMarketingPerformance(source, { from: '2026-09-01', to: '2026-09-30' })), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': 'attachment; filename="Marketing.xlsx"' } });
        if (path === '/api/marketing/performance/records' && request.method() === 'GET') return reply({ leads: source.leads.map(l => ({ ...l, customer_name: 'Тест Харилцагч' })) });
        if (path === '/api/marketing/performance/records') {
            if (state.failSave) return reply({ error: 'Туршилтын хадгалалтын алдаа' }, 500);
            const input = request.postDataJSON(); state.writes.push(input);
            if (input.kind === 'activity') {
                const index = source.activities.findIndex(a => a.id === input.id);
                if (index < 0) source.activities.push(input as MarketingActivity); else source.activities[index] = input;
            } else if (input.kind === 'target') {
                source.targets = [input as MarketingTarget];
            } else if (input.kind === 'attribution') {
                Object.assign(source.leads[0], input);
            } else if (input.kind === 'spend') {
                const campaign = source.activities.find(a => a.id === input.marketing_campaign_id)!;
                source.spend.push({ ...input, project_id: campaign.project_id, marketing_owner_name: campaign.marketing_owner_name, channel: campaign.channel });
            } else if (input.kind === 'handoff') source.leads[0].sales_handoff_at = '2026-09-21T00:00:00+08:00';
            return reply({ success: true, id: input.id });
        }
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/marketing');
    await page.getByLabel('Эхлэх өдөр', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Дуусах өдөр', { exact: true }).fill('2026-09-30');
    await expect(page.getByText('Төсөл бүрийн маркетингийн гүйцэтгэл', { exact: true })).toBeVisible();
    return state;
}
for (const mobile of [false, true]) {
    test(`Meta daily spend → FX → failed sync preserves report (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.getByRole('button', { name: 'Meta зардал татах', exact: true }).click();
        await page.getByRole('button', { name: 'Бүртгэл', exact: true }).click();
        const row = page.getByRole('row').filter({ hasText: 'Meta campaign 123' });
        await expect(row).toContainText('100 USD');
        await expect(row).toContainText('Нийтэд ороогүй');
        await expect(row.getByRole('button', { name: 'Засах' })).toHaveCount(0);
        await page.getByLabel('Meta төгрөгийн ханш', { exact: true }).fill('3500');
        await page.getByRole('button', { name: 'Ханшаар дахин тооцож татах', exact: true }).click();
        await expect(row).not.toContainText('Нийтэд ороогүй');
        expect(state.metaWrites[1]).toMatchObject({ from: '2026-09-01', to: '2026-09-30', currency: 'USD', mntPerUnit: 3500 });
        expect(state.source.spend[0].amount).toBe(350000);
        state.metaFailure = true;
        await page.getByRole('button', { name: 'Meta зардал татах', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Өмнө хадгалсан зардал хэвээр' })).toBeVisible();
        await expect(row).toContainText('100 USD');
        expect(state.source.spend[0].amount).toBe(350000);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.pageErrors).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath('meta-spend.png'), fullPage: true, animations: 'disabled' });
    });
    test(`marketing capture → attribution → targets → spend → export (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.getByRole('button', { name: 'Акц / контент нэмэх', exact: true }).click();
        let form = page.getByRole('dialog');
        await form.getByLabel('Маркетингийн хариуцагч', { exact: true }).fill('Номин');
        await form.getByLabel('Ажлын нэр', { exact: true }).fill('Нээлттэй өдөрлөг');
        await form.getByLabel('Төлөв', { exact: true }).selectOption('completed');
        await form.getByLabel('Эхлэх огноо').fill('2026-09-01');
        await form.getByLabel('Дууссан огноо').fill('2026-09-10');
        state.failSave = true;
        await form.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(form.getByRole('alert')).toContainText('хадгалалтын алдаа');
        state.failSave = false;
        await form.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(form).not.toBeVisible();
        await page.getByRole('button', { name: 'Лидийн холбоос нөхөх', exact: true }).click();
        form = page.getByRole('dialog');
        await form.getByLabel('Лид', { exact: true }).selectOption(lead);
        await form.getByLabel('Акц / контент', { exact: true }).selectOption(state.source.activities[0].id);
        await form.getByRole('button', { name: 'Sales хүлээн авсныг өнөөдрөөр батлах' }).click();
        await expect(form.getByRole('button', { name: 'Sales хүлээн авсныг өнөөдрөөр батлах' })).not.toBeVisible();
        await form.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(form).not.toBeVisible();
        await page.getByRole('button', { name: 'Багийн гүйцэтгэл', exact: true }).click();
        await page.getByRole('button', { name: 'Зорилт / төсөв тохируулах', exact: true }).click();
        form = page.getByRole('dialog');
        await form.getByLabel('Маркетингийн хариуцагч', { exact: true }).fill('Номин');
        await form.getByLabel('Lead зорилт', { exact: true }).fill('10');
        await form.getByLabel('Deal зорилт', { exact: true }).fill('2');
        await form.getByLabel('Төлөвлөсөн төсөв (₮)', { exact: true }).fill('1000000');
        await form.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(form).not.toBeVisible();
        await expect(page.getByRole('row').filter({ hasText: 'Номин' })).toContainText('10%');
        await page.getByRole('button', { name: 'Бүртгэл', exact: true }).click();
        await page.getByRole('button', { name: 'Зардал нэмэх', exact: true }).click();
        form = page.getByRole('dialog');
        await form.getByLabel('Акц / контент', { exact: true }).selectOption(state.source.activities[0].id);
        await form.getByLabel('Зарцуулсан огноо').fill('2026-09-10');
        await form.getByLabel('Зарцуулсан дүн (₮)', { exact: true }).fill('1200000');
        await form.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(form).not.toBeVisible();
        await page.getByRole('button', { name: 'Багийн гүйцэтгэл', exact: true }).click();
        await expect(page.getByRole('row').filter({ hasText: 'Номин' })).toContainText('20%');
        await expect(page.getByText('Хадгаллаа', { exact: true }).first()).not.toBeVisible({ timeout: 10_000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath('team.png'), fullPage: true, animations: 'disabled' });
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Excel', exact: true }).click();
        expect((await download).suggestedFilename()).toContain('Marketing');
        await page.getByRole('button', { name: 'Нэгдсэн самбар', exact: true }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true, animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.writes.map(w => w.kind)).toEqual(['activity', 'handoff', 'attribution', 'target', 'spend']);
        expect(state.pageErrors).toEqual([]);
        state.failRead = true;
        await page.getByRole('button', { name: 'Сүүлийн 7 хоног', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'эх үүсвэр' })).toBeVisible();
        state.failRead = false;
        await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
        await expect(page.getByText('Төсөл бүрийн маркетингийн гүйцэтгэл', { exact: true })).toBeVisible();
    });
}
