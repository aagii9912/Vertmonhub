import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { aggregateChannelReport, compareWithPrevious, suggestMapping, type ChannelMapping } from '../src/lib/marketing/channel-reports';

const shop = '00000000-0000-4000-8000-000000000002';
const csv = [
    'Огноо,Дугаар,Төлөв,Ярианы хугацаа,Бүлэг',
    '2026-09-23 09:05:00,99112233,Хариулсан,00:02:00,Борлуулалт',
    '2026-09-23 09:40:00,88112233,Алдсан,00:00:00,Борлуулалт',
    '2026-09-24 13:10:00,88001122,Тасалсан,,Үйлчилгээ',
    '2026-09-24 13:20:00,88001123,Алдсан,,Үйлчилгээ',
].join('\n');
const empty = { report: null, exact: false, previous: null, comparison: null };

async function setup(page: Page) {
    const state = { reports: [] as Array<Record<string, unknown>>, latest: empty as Record<string, unknown>, modes: [] as string[], errors: [] as string[] };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Экспорт тест' }, role: 'marketing', permissions: { ...ROLE_PERMISSIONS.marketing, canWrite: true, canDelete: true }, shops: [{ id: shop, name: 'Mandala Garden', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/channel-reports' && request.method() === 'GET') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            return reply({ reports: state.reports, latest: { meta_ads: empty, facebook_page: empty, callpro: state.latest, sms: empty } });
        }
        if (path === '/api/marketing/channel-reports' && request.method() === 'POST') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            const form = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!) }).formData();
            const [header, ...lines] = (await (form.get('file') as File).text()).split('\n');
            const headers = header.split(',');
            const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [headers[i], value])));
            const mapping: ChannelMapping = form.get('mapping') ? JSON.parse(String(form.get('mapping'))) : suggestMapping(headers, 'callpro');
            const period = { from: String(form.get('period_from')), to: String(form.get('period_to')) };
            const result = aggregateChannelReport(rows, mapping, 'callpro', { period });
            const mode = String(form.get('mode'));
            state.modes.push(mode);
            if (mode === 'save') {
                const report = { id: 'r1', source: 'callpro', period_from: period.from, period_to: period.to, file_name: 'callpro.csv', totals: result.totals, warnings: result.warnings, row_count: result.rowCount, note: null, imported_by: null, created_at: '2026-10-04T02:00:00Z', updated_at: '2026-10-04T02:00:00Z' };
                state.reports = [report];
                state.latest = { report: { ...report, breakdown: result.breakdown, mapping }, exact: false, previous: null, comparison: compareWithPrevious(result.totals, null, 'callpro') };
                return reply({ mode, report, mappingSaved: true });
            }
            return reply({ mode, storageReady: true, file: { name: 'callpro.csv', size: csv.length }, sheets: ['Sheet1'], sheet: 'Sheet1', headerRow: 1, headers,
                sample: Object.fromEntries(headers.map(h => [h, rows.slice(0, 3).map(r => r[h])])), mapping, suggested: suggestMapping(headers, 'callpro'),
                mappingOrigin: form.get('mapping') ? 'client' : 'suggested', result, existing: null, duplicate: null });
        }
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/marketing/channel-reports');
    return state;
}

test('imports a CallPro call list with a confirmed mapping and shows missed calls by hour', async ({ page }) => {
    const state = await setup(page);
    await expect(page.getByRole('heading', { name: 'Сувгийн экспорт импорт' })).toBeVisible();
    await expect(page.getByText('Хадгалсан тайлан алга')).toBeVisible();

    await page.getByRole('combobox', { name: 'Эх үүсвэр', exact: true }).selectOption('callpro');
    await page.getByLabel('Эхлэх өдөр').fill('2026-09-23');
    await page.getByLabel('Дуусах өдөр').fill('2026-09-29');
    await page.getByLabel('Экспорт файл').setInputFiles({ name: 'callpro.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();

    const preview = page.getByRole('region', { name: 'Импортын урьдчилсан дүн' });
    await expect(preview).toBeVisible();
    await expect(preview.getByLabel('«Төлөв» баганын үзүүлэлт')).toHaveValue('status');
    await expect(preview.getByRole('img', { name: /Оргил цаг: 13:00 \(2\)/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await preview.getByLabel('«Дугаар» баганын үзүүлэлт').selectOption('');
    await expect(preview.getByRole('button', { name: 'Хадгалах', exact: true })).toBeDisabled();
    await preview.getByRole('button', { name: 'Дахин тооцоолох', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'Хадгалах', exact: true })).toBeEnabled();
    // Дугаарын баганыг салгасан тул давхардаагүй залгагчийг 0 биш «Тооцоогүй» гэж харуулна.
    await expect(preview.getByText('Давхардаагүй залгагч', { exact: true }).locator('..')).toContainText('Тооцоогүй');
    await preview.getByRole('button', { name: 'Хадгалах', exact: true }).click();

    await expect(page.getByText(/CallPro дуудлага: 2026-09-23 – 2026-09-29 тайлан хадгалагдлаа/)).toBeVisible();
    const latest = page.getByRole('article', { name: 'CallPro дуудлага сүүлийн тайлан' });
    await expect(latest).toBeVisible();
    await expect(latest.getByText(/харьцуулах өмнөх тайлан алга/)).toBeVisible();
    await expect(latest.getByText('Хариулсан хувь', { exact: true }).locator('..')).toContainText('25%');
    await expect(page.getByRole('region', { name: 'Хадгалсан тайлангууд' }).getByText('2026-09-23 – 2026-09-29')).toBeVisible();
    expect(state.modes).toEqual(['preview', 'preview', 'save']);
    expect(state.errors).toEqual([]);
});

test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const state = await setup(page);
    await expect(page.getByRole('heading', { name: 'Сувгийн экспорт импорт' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Эх үүсвэр', exact: true }).selectOption('callpro');
    await page.getByLabel('Экспорт файл').setInputFiles({ name: 'callpro.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByLabel('Эхлэх өдөр').fill('2026-09-23');
    await page.getByLabel('Дуусах өдөр').fill('2026-09-29');
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Импортын урьдчилсан дүн' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(state.errors).toEqual([]);
});
