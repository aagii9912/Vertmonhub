import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';

const shopId = '00000000-0000-4000-8000-000000000110';
const elysiumId = '00000000-0000-4000-8000-000000000120';
const otherProjectId = '00000000-0000-4000-8000-000000000121';
const createdProjectId = '00000000-0000-4000-8000-000000000122';
const csv = 'Код,Бүтээгдэхүүний төрөл,Бүтээгдэхүүний төлөв,Давхар,Борлуулах талбай,Өрөөний тоо\nБ1-201,Орон сууц,Худалдаанд,2,95,3\n';

interface ImportRequest {
    preview: boolean;
    shopId: string;
    projectId: string;
    projectName: string;
    type: string;
    block: string;
    fileName: string;
    fileText: string;
}

// Real login, middleware and Next pages; only business APIs use disposable fixtures.
async function setup(page: Page) {
    const shop = { id: shopId, name: 'Тест байгууллага', setup_completed: true, is_active: true };
    const state = {
        imports: [] as ImportRequest[], commits: [] as ImportRequest[], errors: [] as string[], unhandled: [] as string[],
        failPreview: false, failCommit: false, failSummary: false, failUnits: false, existingOnly: false,
        summaryReads: 0, unitReads: 0,
        deferCreate: false, deferPreview: false, createRequests: 0,
        releaseCreate: null as null | (() => void), releasePreview: null as null | (() => void),
    };
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
        if (path === '/api/admin/settings') return reply({ admin: { email: 'onboarding-admin@example.invalid', role: 'super_admin' } });
        if (path === '/api/admin/shops') return reply({ shops: [shop] });
        if (path === '/api/admin/projects') {
            if (request.method() === 'POST') {
                state.createRequests++;
                if (state.deferCreate) await new Promise<void>(resolve => { state.releaseCreate = resolve; });
                return reply({ project: { id: createdProjectId, shop_id: shopId, name: request.postDataJSON().name } });
            }
            return reply({ projects: [
                { id: elysiumId, shop_id: shopId, name: 'Elysium Residence' },
                { id: otherProjectId, shop_id: shopId, name: 'Mandala Garden' },
            ] });
        }
        if (path === '/api/admin/import') {
            const form = await new Request(request.url(), {
                method: 'POST', headers: { 'content-type': request.headers()['content-type'] },
                body: new Uint8Array(request.postDataBuffer()!).buffer,
            }).formData();
            const file = form.get('file') as File;
            const body: ImportRequest = {
                preview: form.get('preview') === 'true', shopId: String(form.get('shopId')),
                projectId: String(form.get('projectId')), projectName: String(form.get('projectName')),
                type: String(form.get('type')), block: String(form.get('block')),
                fileName: file.name, fileText: await file.text(),
            };
            state.imports.push(body);
            if (body.preview) {
                if (state.deferPreview) await new Promise<void>(resolve => { state.releasePreview = resolve; });
                if (state.failPreview) return reply({ error: 'Файлын шалгалтын түр алдаа' }, 503);
                return reply({ success: true, imported: 0, skipped: state.existingOnly ? 1 : 0, message: 'Урьдчилсан шалгалт амжилттай',
                    preview: { total: 1, fresh: state.existingOnly ? 0 : 1, existing: state.existingOnly ? 1 : 0,
                        groups: [{ phase: body.projectName, block: body.block, category: 'residential', total: 1, statuses: { available: 1 } }] } });
            }
            state.commits.push(body);
            if (state.failCommit) return reply({ error: 'Нөөц хадгалах түр алдаа' }, 503);
            return reply({ success: true, imported: 1, skipped: 0, message: '1 шинэ байр нэмэгдлээ' });
        }
        if (path === '/api/dashboard/units') {
            if (url.searchParams.has('block')) {
                state.unitReads++;
                if (state.failUnits) return reply({ error: 'Байрны мэдээллийн түр алдаа' }, 503);
                return reply({ units: [{ id: 'fixture-unit', code: 'Б1-201', phase: 'Elysium Residence', block: 'Б1',
                    category: 'residential', floor: '2', rooms: 3, sale_area: 95, status: 'available' }] });
            }
            state.summaryReads++;
            if (state.failSummary) return reply({ error: 'Блокийн мэдээллийн түр алдаа' }, 503);
            return reply({ phases: ['Elysium Residence'], summary: [{ phase: 'Elysium Residence', block: 'Б1', category: 'residential',
                total_units: 1, available_units: 1, sold_units: 0, pending_units: 0, total_area: 95 }] });
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

async function upload(page: Page, name = 'elysium-b1.csv') {
    await page.getByLabel('Импортын файл', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
}

async function expectHealthy(page: Page, state: Awaited<ReturnType<typeof setup>>) {
    expect(state.errors).toEqual([]);
    expect(state.unhandled).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const mobile of [false, true]) {
    const viewport = mobile ? 'mobile' : 'desktop';
    test(`inventory preview requires scope and refreshes after changed inputs (${viewport})`, async ({ page }, info) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/admin/import');
        const project = page.getByLabel('Төсөл сонгох', { exact: true });
        const block = page.getByLabel('Файлд «Блок» багана байхгүй бол блокийн нэр', { exact: true });
        const check = page.getByRole('button', { name: 'Байрны файлыг шалгах', exact: true });
        const preview = page.getByLabel('Блокийн импортын урьдчилсан шалгалт', { exact: true });
        await expect(project).toHaveValue('');
        await upload(page);
        await expect(check).toBeDisabled();
        await project.selectOption(elysiumId);
        await block.fill('Б1');
        await check.click();
        await expect(preview).toContainText('Elysium Residence / Б1 / Орон сууц: 1');
        expect(state.commits).toEqual([]);
        expect(state.imports[0]).toEqual({ preview: true, shopId, projectId: elysiumId, projectName: 'Elysium Residence', type: 'units', block: 'Б1', fileName: 'elysium-b1.csv', fileText: csv });

        await project.selectOption(otherProjectId);
        await expect(preview).not.toBeVisible();
        await expect(check).toBeVisible();
        await check.click();
        await expect(preview).toContainText('Mandala Garden');
        await block.fill('Б2');
        await expect(preview).not.toBeVisible();
        await check.click();
        await expect(preview).toContainText('Б2');
        await upload(page, 'replacement.csv');
        await expect(preview).not.toBeVisible();
        await project.selectOption(elysiumId);
        await block.fill('Б1');
        await check.click();
        await expect(preview).toBeVisible();
        expect(state.commits).toEqual([]);
        await page.screenshot({ path: info.outputPath('inventory-preview.png'), fullPage: true });

        state.failCommit = true;
        await page.getByRole('button', { name: '1 байр нэмэх', exact: true }).click();
        await expect(page.getByText('Нөөц хадгалах түр алдаа', { exact: true })).toBeVisible();
        await expect(check).toBeVisible();
        state.failCommit = false;
        await check.click();
        await expect(preview).toBeVisible();
        await page.getByRole('button', { name: '1 байр нэмэх', exact: true }).click();
        await expect(page.getByText('1 шинэ байр нэмэгдлээ', { exact: true })).toBeVisible();
        expect(state.commits).toHaveLength(2);
        expect(state.commits[1]).toMatchObject({ preview: false, projectId: elysiumId, projectName: 'Elysium Residence', block: 'Б1', fileName: 'replacement.csv' });
        await page.getByRole('link', { name: 'Блокуудыг нээх', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Блокийн харагдац', exact: true })).toBeVisible();
        await page.getByRole('button', { name: /Б1.*1 нэгж/ }).click();
        await expect(page.getByRole('button', { name: /Б1-201 · Чөлөөтэй/ })).toBeVisible();
        await expectHealthy(page, state);
        await page.screenshot({ path: info.outputPath('elysium-block.png'), fullPage: true });
    });

    test(`inventory preview errors are visible and existing rows cannot commit (${viewport})`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/admin/import');
        await page.getByLabel('Төсөл сонгох', { exact: true }).selectOption(elysiumId);
        await page.getByLabel('Файлд «Блок» багана байхгүй бол блокийн нэр', { exact: true }).fill('Б1');
        await upload(page);
        state.failPreview = true;
        await page.getByRole('button', { name: 'Байрны файлыг шалгах', exact: true }).click();
        await expect(page.getByText('Файлын шалгалтын түр алдаа', { exact: true })).toBeVisible();
        state.failPreview = false; state.existingOnly = true;
        await page.getByRole('button', { name: 'Байрны файлыг шалгах', exact: true }).click();
        await expect(page.getByLabel('Блокийн импортын урьдчилсан шалгалт', { exact: true })).toContainText('1 бүртгэлтэй байр хадгалагдана');
        await expect(page.getByRole('button', { name: '0 байр нэмэх', exact: true })).toBeDisabled();
        expect(state.commits).toEqual([]);
        await expectHealthy(page, state);
    });

    test(`project creation and inventory preview cannot overlap (${viewport})`, async ({ page }) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/admin/import');
        const project = page.getByLabel('Төсөл сонгох', { exact: true });
        const check = page.getByRole('button', { name: 'Байрны файлыг шалгах', exact: true });
        await project.selectOption(elysiumId);
        await page.getByLabel('Файлд «Блок» багана байхгүй бол блокийн нэр', { exact: true }).fill('Б1');
        await upload(page);
        await page.getByRole('button', { name: '+ Шинэ төсөл нэмэх', exact: true }).click();
        await page.getByPlaceholder('Төслийн нэр *', { exact: true }).fill('Шинэ тест төсөл');
        state.deferCreate = true;
        await page.getByRole('button', { name: '+ Төсөл үүсгэх', exact: true }).click();
        await expect.poll(() => state.releaseCreate !== null).toBe(true);
        await expect(check).toBeDisabled();
        expect(state.imports).toEqual([]);
        state.releaseCreate!();
        await expect(project).toHaveValue(createdProjectId);
        await expect(check).toBeEnabled();

        await page.getByRole('button', { name: '+ Шинэ төсөл нэмэх', exact: true }).click();
        await page.getByPlaceholder('Төслийн нэр *', { exact: true }).fill('Дараагийн тест төсөл');
        state.deferPreview = true;
        await check.click();
        await expect.poll(() => state.releasePreview !== null).toBe(true);
        await expect(page.getByRole('button', { name: '+ Төсөл үүсгэх', exact: true })).toBeDisabled();
        await expect(page.getByPlaceholder('Төслийн нэр *', { exact: true })).toBeDisabled();
        await expect(page.getByPlaceholder('Байршил (заавал биш)', { exact: true })).toBeDisabled();
        await expect(project).toBeDisabled();
        expect(state.createRequests).toBe(1);
        state.releasePreview!();
        await expect(page.getByLabel('Блокийн импортын урьдчилсан шалгалт', { exact: true })).toContainText('Шинэ тест төсөл');
        expect(state.commits).toEqual([]);
        await expectHealthy(page, state);
    });

    test(`blocks summary and unit failures expose retries (${viewport})`, async ({ page }, info) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page); state.failSummary = true;
        await page.goto('/dashboard/properties/blocks');
        await expect(page.getByRole('alert').filter({ hasText: 'Блокийн мэдээллийн түр алдаа' })).toBeVisible();
        await expect(page.getByText('Блок алга', { exact: true })).not.toBeVisible();
        state.failSummary = false;
        await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
        await expect(page.getByRole('button', { name: /Elysium Residence/ })).toBeVisible();
        state.failUnits = true;
        await page.getByRole('button', { name: /Б1.*1 нэгж/ }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Байрны мэдээллийн түр алдаа' })).toBeVisible();
        await expect(page.getByText('Нэгж алга', { exact: true })).not.toBeVisible();
        await page.screenshot({ path: info.outputPath('units-retry.png'), fullPage: true });
        state.failUnits = false;
        await page.getByRole('button', { name: 'Дахин оролдох', exact: true }).click();
        await expect(page.getByRole('button', { name: /Б1-201 · Чөлөөтэй/ })).toBeVisible();
        expect(state.summaryReads).toBeGreaterThanOrEqual(2); expect(state.unitReads).toBe(2);
        await expectHealthy(page, state);
    });
}
