import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { buildMetaAdsReport, type MetaInsightDayRow, type MetaLedgerRow } from '../src/lib/marketing/meta-ads-report';
import { buildMarketingRoi } from '../src/lib/marketing/roi';
import { buildMarketingTimeline, timelineMonths } from '../src/lib/marketing/timeline';

// ROI ба «Зар сурталчилгаа» хуудас огноотой Meta хүснэгтээс (meta_daily_spend + meta_ad_insights_daily) уншина:
// ханшгүй USD-г төгрөгтэй нэмэхгүй, үр дүнг төрлөөр, хуучин ad_campaigns snapshot-ийг дуудахгүй.
const shop = '00000000-0000-4000-8000-000000000002';
const day = { account_id: 'act_456', currency: 'USD', timezone: 'Asia/Ulaanbaatar' };
const ledger: MetaLedgerRow[] = [
    { ...day, campaign_id: '120001', campaign_name: 'Elysium дуудлага', spent_at: '2026-09-10', native_amount: '100', amount_mnt: '350000', mnt_per_unit: '3500' },
    { ...day, campaign_id: '120001', campaign_name: 'Elysium дуудлага', spent_at: '2026-09-11', native_amount: '50', amount_mnt: '175000', mnt_per_unit: '3500' },
    { ...day, campaign_id: '120002', campaign_name: 'Elysium мессеж', spent_at: '2026-09-11', native_amount: '40', amount_mnt: null, mnt_per_unit: null },
];
const insight = (patch: Partial<MetaInsightDayRow>): MetaInsightDayRow => ({ ...day, day: '2026-09-10', campaign_id: '120001', campaign_name: 'Elysium дуудлага', adset_id: '9001',
    spend: '100', impressions: '20000', reach: '15000', clicks: '400', inline_link_clicks: '300', landing_page_views: '0', result_type: 'calls', results: '30', result_source: 'results', ...patch });
const insights = [
    insight({}),
    insight({ day: '2026-09-11', spend: '50', impressions: '9000', inline_link_clicks: '120', results: '12' }),
    insight({ day: '2026-09-11', campaign_id: '120002', campaign_name: 'Elysium мессеж', adset_id: '9002', spend: '40', impressions: '12000', inline_link_clicks: '200', result_type: 'messages', results: '25' }),
];
const reportFor = (url: URL) => {
    const range = { from: url.searchParams.get('from')!, to: url.searchParams.get('to')! };
    return { range, report: buildMetaAdsReport({ range, ledger, insights }) };
};

async function setup(page: Page) {
    const state = { requests: [] as string[], pageErrors: [] as string[] };
    page.on('pageerror', e => state.pageErrors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        state.requests.push(`${path}${url.search}`);
        if (path === '/api/me') return reply({ user: { fullName: 'Маркетинг тест' }, role: 'marketing', permissions: ROLE_PERMISSIONS.marketing, shops: [{ id: shop, name: 'Тест байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/meta-ads') return reply({ report: reportFor(url).report });
        if (path === '/api/dashboard/marketing-roi') {
            const { range, report } = reportFor(url);
            const leads = [
                { id: 'l1', created_at: '2026-09-12T02:00:00Z', source: 'facebook_ads', facebook_campaign_id: '120001', marketing_campaign_id: null },
                { id: 'l2', created_at: '2026-09-13T02:00:00Z', source: 'facebook_ads', facebook_campaign_id: '120001', marketing_campaign_id: null },
                { id: 'l3', created_at: '2026-09-14T02:00:00Z', source: 'facebook_ads', facebook_campaign_id: null, marketing_campaign_id: null },
            ];
            const contracts = [{ lead_id: 'l1', total_price: 450_000_000, contract_number: 'E-101', contract_status: 'active' }];
            return reply({ roi: buildMarketingRoi({ range, leads, activities: [], contracts, meta: report }) });
        }
        if (path === '/api/dashboard/marketing-roi/timeline') {
            return reply({ months: buildMarketingTimeline(timelineMonths(new Date('2026-09-20T00:00:00Z')), { leads: [], viewings: [], posts: [], activities: [], spend: ledger }) });
        }
        if (path === '/api/dashboard/leads') return reply({ leads: [{ source: 'facebook_ads', status: 'closed_won', created_at: '2026-09-12T02:00:00Z' }, { source: 'website', status: 'new', created_at: '2026-09-14T02:00:00Z' }] });
        if (path === '/api/dashboard/marketing/social-history') return reply({ posts: [], insights: [] });
        if (path === '/api/marketing/facebook/ads/spend-sync') return reply({ accountId: 'act_456', connected: true, tokenSource: 'system', expiresAt: null, insightsReady: true, insights: null,
            status: { account_id: 'act_456', currency: 'USD', timezone: 'Asia/Ulaanbaatar', mnt_per_unit: 3500, last_success_at: '2026-09-20T00:00:00Z', last_error: null, last_from: '2026-09-01', last_to: '2026-09-20' } });
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

for (const mobile of [false, true]) {
    test(`Meta ads page reads dated spend and typed results (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/marketing/ads?from=2026-09-01&to=2026-09-30');
        await expect(page.getByText('+ 40 USD ханшгүй — төгрөгт ороогүй')).toBeVisible();
        await expect(page.getByText(/Ханшгүй зардал 40 USD/)).toBeVisible();
        const results = page.getByRole('region', { name: 'Meta-гийн үр дүн төрлөөр' });
        await expect(results.getByRole('row').filter({ hasText: 'Дуудлага (Meta)' })).toContainText('12,500₮');
        await expect(results.getByRole('row').filter({ hasText: 'Мессеж эхлүүлсэн' })).toContainText('1.6 USD');
        await expect(page.getByText('Elysium мессеж').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Шинэ зар/ })).toHaveCount(0);
        expect(state.requests.some(r => r.includes('ad_campaigns'))).toBe(false);
        expect(state.requests).toContain('/api/marketing/meta-ads?from=2026-09-01&to=2026-09-30');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.pageErrors).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath('meta-ads.png'), fullPage: true, animations: 'disabled' });
    });

    test(`marketing ROI pairs dated Meta spend with period leads and contracts (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
        if (mobile) await page.setViewportSize({ width: 390, height: 844 });
        const state = await setup(page);
        await page.goto('/dashboard/marketing-roi');
        await page.getByLabel('Эхлэх өдөр', { exact: true }).fill('2026-09-01');
        await page.getByLabel('Дуусах өдөр', { exact: true }).fill('2026-09-30');
        const row = page.getByRole('row').filter({ hasText: 'Elysium дуудлага' });
        await expect(row).toContainText('525,000₮');
        await expect(row).toContainText('Дуудлага (Meta):');
        // 2 лид, 1 гэрээ: CPL 262,500₮; ханшгүй USD-тэй нийт дүнгээр CPL тооцохгүй.
        await expect(row).toContainText('262,500₮');
        await expect(page.getByText('CPL тооцоогүй')).toBeVisible();
        await expect(page.getByText('+ 40 USD ханшгүй — төгрөгт ороогүй')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Эх үүсвэрийн шинжилгээ' })).toHaveCount(1);
        await expect(page.getByText(/Кампанит ажилгүй Meta лид:/)).toContainText('1');
        await expect(page.getByText(/Ханшгүй Meta зардал төгрөгийн шугамд ороогүй: 9-р сар 40 USD/)).toBeVisible();
        expect(state.requests).toContain('/api/dashboard/marketing-roi?from=2026-09-01&to=2026-09-30');
        expect(state.requests.some(r => r.includes('ad_campaigns') || r.includes('/ads/campaigns') || r.includes('/ads/insights'))).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.pageErrors).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath('marketing-roi.png'), fullPage: true, animations: 'disabled' });
    });
}
