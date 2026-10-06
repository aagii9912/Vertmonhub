import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import {
    aggregateByReviewWeeks, aggregateChannelReport, channelSplitWeeks, splitWeekSummary, suggestMapping,
    type ChannelAggregate, type ChannelMapping, type ChannelSource,
} from '../src/lib/marketing/channel-reports';
import { readChannelFile, sampleValues } from '../src/lib/marketing/channel-reports-file';
import { compareReports, type ChannelReportSummary } from '../src/lib/marketing/channel-reports-load';
import { META_ADS_DAILY_CSV } from './fixtures/meta-ads-daily';
import { COMPACT_VIEWPORT } from './support/viewports';

const shop = '00000000-0000-4000-8000-000000000002';
const csv = [
    'Огноо,Дугаар,Төлөв,Ярианы хугацаа,Бүлэг',
    '2026-09-23 09:05:00,99112233,Хариулсан,00:02:00,Борлуулалт',
    '2026-09-23 09:40:00,88112233,Алдсан,00:00:00,Борлуулалт',
    '2026-09-24 13:10:00,88001122,Тасалсан,,Үйлчилгээ',
    '2026-09-24 13:20:00,88001123,Алдсан,,Үйлчилгээ',
].join('\n');
const empty = { report: null, exact: false, longer: false, previous: null, comparison: null };

/** API route-ын адил: файлыг уншиж, нэгтгэж, өдрөөр задалсан Meta файлыг хурлын долоо хоногоор хуваана. */
async function setup(page: Page) {
    const state = {
        reports: [] as ChannelReportSummary[], latest: {} as Record<string, unknown>, modes: [] as string[], splits: [] as Array<string | null>,
        weeks: [] as Array<string | null>, errors: [] as string[],
    };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Экспорт тест' }, role: 'marketing', permissions: { ...ROLE_PERMISSIONS.marketing, canWrite: true, canDelete: true }, shops: [{ id: shop, name: 'Mandala Garden', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/channel-reports' && request.method() === 'GET') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            return reply({ reports: state.reports, latest: { meta_ads: empty, facebook_page: empty, callpro: empty, sms: empty, ...state.latest } });
        }
        if (path === '/api/marketing/channel-reports' && request.method() === 'POST') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            const form = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!) }).formData();
            const file = form.get('file') as File;
            const source = String(form.get('source')) as ChannelSource;
            const table = await readChannelFile(new Uint8Array(await file.arrayBuffer()), source);
            const mapping: ChannelMapping = form.get('mapping') ? JSON.parse(String(form.get('mapping'))) : suggestMapping(table.headers, source);
            const period = { from: String(form.get('period_from')), to: String(form.get('period_to')) };
            const options = { firstLine: table.firstLine };
            const result = aggregateChannelReport(table.rows, mapping, source, { ...options, period });
            const weeks = aggregateByReviewWeeks(table.rows, mapping, source, channelSplitWeeks(result), options);
            const mode = String(form.get('mode'));
            state.modes.push(mode);
            state.splits.push(form.get('split') as string | null);
            state.weeks.push(form.get('weeks') as string | null);
            if (mode === 'save') {
                const chosen = form.get('weeks') ? String(form.get('weeks')).split(',') : null;
                const targets: Array<{ week: { from: string; to: string }; result: ChannelAggregate }> = form.get('split') === '1'
                    ? weeks.filter(({ week }) => !chosen || chosen.includes(week.from)) : [{ week: period, result }];
                const saved = targets.map(({ week, result: r }, i) => ({
                    id: `${source}-${i}`, source, period_from: week.from, period_to: week.to, file_name: file.name, origin: 'file' as const,
                    data_from: r.dataPeriod?.from ?? null, data_to: r.dataPeriod?.to ?? null, totals: r.totals, warnings: r.warnings, row_count: r.rowCount,
                    note: null, imported_by: null, created_at: '2026-10-04T02:00:00Z', updated_at: '2026-10-04T02:00:00Z',
                }));
                state.reports = [...saved].reverse();
                const last = saved[saved.length - 1], previous = saved.length > 1 ? saved[saved.length - 2] : null;
                state.latest[source] = { report: { ...last, breakdown: targets[targets.length - 1].result.breakdown, mapping }, exact: false, longer: false, previous, comparison: compareReports(last, previous) };
                return reply(form.get('split') === '1' ? { mode, reports: saved, skipped: [], mappingSaved: true } : { mode, report: saved[0], mappingSaved: true });
            }
            const detected = result.detectedPeriod;
            return reply({ mode, storageReady: true, file: { name: file.name, size: file.size }, sheets: table.sheets, sheet: table.sheet, headerRow: table.headerRow, headers: table.headers,
                sample: sampleValues(table), mapping, suggested: suggestMapping(table.headers, source),
                mappingOrigin: form.get('mapping') ? 'client' : 'suggested', result, existing: null, duplicate: null,
                split: weeks.length && detected ? { period: detected, weeks: weeks.map(({ week, result: r }) => splitWeekSummary(week, r)), result: aggregateChannelReport(table.rows, mapping, source, { ...options, period: detected }) } : null });
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

test('splits a daily Meta Ads export into meeting weeks and shows results per type', async ({ page }) => {
    const state = await setup(page);
    await expect(page.getByRole('heading', { name: 'Сувгийн экспорт импорт' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Эх үүсвэр', exact: true })).toHaveValue('meta_ads');
    await page.getByLabel('Экспорт файл').setInputFiles({ name: 'meta-campaigns-daily.csv', mimeType: 'text/csv', buffer: Buffer.from(META_ADS_DAILY_CSV) });
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();

    const preview = page.getByRole('region', { name: 'Импортын урьдчилсан дүн' });
    await expect(preview.getByRole('checkbox', { name: 'Хурлын долоо хоногоор хуваах' })).toBeChecked();
    await expect(preview.getByText(/36 мөр тооцсон · 81 хоосон мөр/)).toBeVisible();
    const weeks = preview.getByRole('region', { name: 'Хурлын долоо хоногууд' });
    await expect(weeks.getByRole('row')).toHaveCount(4);
    await expect(weeks.getByRole('row', { name: /2026-09-09 – 2026-09-15/ })).toContainText('4/7 өдөр');
    await expect(weeks.getByRole('row', { name: /2026-09-23 – 2026-09-29/ })).toContainText('2/7 өдөр');
    await expect(weeks.getByRole('checkbox', { name: '2026-09-16 – 2026-09-22 долоо хоногийг хадгалах' })).toBeChecked();
    await expect(preview.getByText(/3\/3 долоо хоногийг хадгална/)).toBeVisible();
    const types = preview.getByRole('region', { name: 'Үр дүн төрлөөр' });
    await expect(types.getByRole('row', { name: /Дуудлага \(Meta\)/ })).toContainText('28');
    await expect(types.getByRole('row', { name: /Постын оролцоо/ })).toContainText('0.0027 USD');
    await expect(preview.getByRole('region', { name: 'Задаргаа: Кампанит ажил' }).getByRole('columnheader', { name: 'Үр дүнгийн төрөл' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await preview.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(page.getByText(/Meta Ads Manager: 3 хурлын долоо хоногийн \(2026-09-09 – 2026-09-29\) тайлан хадгалагдлаа/)).toBeVisible();
    expect(state.modes).toEqual(['preview', 'save']);
    expect(state.splits).toEqual([null, '1']);
    expect(state.weeks).toEqual([null, '2026-09-09,2026-09-16,2026-09-23']);
    const saved = page.getByRole('region', { name: 'Хадгалсан тайлангууд' });
    await expect(saved.getByRole('row')).toHaveCount(4);
    await expect(saved.getByRole('row', { name: /2026-09-23 – 2026-09-29/ })).toContainText('2/7 өдөр');
    const latest = page.getByRole('article', { name: 'Meta Ads Manager сүүлийн тайлан' });
    await expect(latest.getByText(/2026-09-23 – 2026-09-29 · 2\/7 өдөр · meta-campaigns-daily\.csv · өмнөх 2026-09-16 – 2026-09-22/)).toBeVisible();
    // Хамралт дутуу долоо хоногийг бүтэн долоо хоногтой харьцуулахгүй.
    await expect(latest.getByText('Аль нэг долоо хоногийн өдрийн хамралт дутуу тул өмнөх тайлантай харьцуулаагүй.')).toBeVisible();
    await expect(latest.getByText(/% өмнөхөөс/)).toHaveCount(0);
    await expect(latest.getByRole('region', { name: 'Үр дүн төрлөөр' }).getByRole('row', { name: /Дуудлага \(Meta\)/ })).toContainText('4');
    expect(state.errors).toEqual([]);
});

test('fits the narrowest supported laptop (1024px)', async ({ page }) => {
    await page.setViewportSize(COMPACT_VIEWPORT);
    const state = await setup(page);
    await expect(page.getByRole('heading', { name: 'Сувгийн экспорт импорт' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Эх үүсвэр', exact: true }).selectOption('callpro');
    await page.getByLabel('Экспорт файл').setInputFiles({ name: 'callpro.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByLabel('Эхлэх өдөр').fill('2026-09-23');
    await page.getByLabel('Дуусах өдөр').fill('2026-09-29');
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Импортын урьдчилсан дүн' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Meta-гийн өдрийн файл: долоо хоногийн хүснэгт, үр дүнгийн төрөл 1024px-д багтана.
    await page.getByRole('combobox', { name: 'Эх үүсвэр', exact: true }).selectOption('meta_ads');
    await page.getByLabel('Экспорт файл').setInputFiles({ name: 'meta-campaigns-daily.csv', mimeType: 'text/csv', buffer: Buffer.from(META_ADS_DAILY_CSV) });
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Хурлын долоо хоногууд' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Үр дүн төрлөөр' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(state.errors).toEqual([]);
});
