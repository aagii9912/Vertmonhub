import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { newsletterPreviewHtml, defaultNewsletterDesign } from '../src/lib/marketing/newsletter';
import { COMPACT_VIEWPORT } from './support/viewports';

// Playwright's SW-blocking init script reads navigator.serviceWorker in every
// frame and throws in an opaque sandbox. Keep the email sandbox fully locked.
test.use({ serviceWorkers: 'allow' });

const shop = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
async function setup(page: Page) {
    const newsletters: Array<{ id: string; subject: string; body: string; status: string; broadcast_id: string | null }> = [];
    const contacts: Array<{ id: string; email: string; unsubscribed: boolean }> = [];
    const state = { sends: 0, pageErrors: [] as string[], commits: 0 };
    page.on('pageerror', e => state.pageErrors.push(e.message));
    await page.route('https://newsletter-assets.example.invalid/project.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="#DCE7F5"/><text x="32" y="130" font-family="Arial" font-size="24" fill="#16345B">Зургийн туршилт</text></svg>' }));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Тест менежер' }, role: 'admin', permissions: ROLE_PERMISSIONS.admin, shops: [{ id: shop, name: 'Тест байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/newsletter') {
            if (request.method() === 'GET' && !url.searchParams.has('projectId')) return reply({ projects: [{ id: shop, name: 'Elysium' }] });
            if (request.method() === 'GET') return url.searchParams.get('contacts') === '1' ? reply({ data: contacts, has_more: false }) : reply({ newsletters, total: newsletters.length, configured: true, connected: true, from: 'newsletter@example.invalid' });
            const body = request.postDataJSON();
            if (body.action === 'save') newsletters.unshift({ ...body, status: 'draft', broadcast_id: null });
            if (body.action === 'subscribe') contacts.push({ id, email: body.email, unsubscribed: false });
            if (body.action === 'prepare') newsletters.find(n => n.id === body.id)!.broadcast_id = id;
            if (body.action === 'send') { state.sends++; newsletters.find(n => n.id === body.id)!.status = 'queued'; }
            return reply({ success: true });
        }
        return reply({});
    });
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

for (const compact of [false, true]) {
    test(`Newsletter templates and confirmation (${compact ? 'compact' : 'desktop'})`, async ({ page }, testInfo) => {
        if (compact) await page.setViewportSize(COMPACT_VIEWPORT);
        const state = await setup(page);
        await page.goto('/marketing/newsletter');
        await page.getByLabel('Гарчиг', { exact: true }).fill('Есдүгээр сарын мэдээ');
        await page.getByLabel('Агуулга', { exact: true }).fill('Төслийн явцын мэдээлэл.\nНээлттэй өдөрлөгт урьж байна.');
        await page.getByLabel('Байгууллага / төслийн нэр', { exact: true }).fill('Тест төсөл');
        await page.getByLabel('Үндсэн зургийн холбоос', { exact: true }).fill('https://newsletter-assets.example.invalid/project.svg');
        await page.getByLabel('Зургийн тайлбар', { exact: true }).fill('Төслийн зураг');
        await page.getByLabel('Товчны нэр', { exact: true }).fill('Дэлгэрэнгүй');
        await page.getByLabel('Товчны холбоос', { exact: true }).fill('https://example.com/project');
        await page.getByRole('button', { name: 'Зарлал', exact: true }).click();
        const preview = page.frameLocator('iframe[title="Имэйлийн урьдчилсан харагдац"]');
        await expect(preview.getByRole('heading', { name: 'Есдүгээр сарын мэдээ' })).toBeVisible();
        await expect(preview.getByText('Тест төсөл', { exact: true })).toBeVisible();
        await expect(preview.getByRole('link', { name: 'Дэлгэрэнгүй' })).toBeVisible();
        await expect.poll(() => preview.getByRole('img', { name: 'Төслийн зураг' }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(640);
        await page.getByRole('button', { name: 'Утас', exact: true }).click();
        expect((await page.locator('iframe').first().boundingBox())!.width).toBeLessThanOrEqual(375);
        await page.getByRole('button', { name: 'Ноорог хадгалах', exact: true }).click();
        await page.getByRole('button', { name: 'Шинэ ноорог', exact: true }).click();
        await page.getByRole('button', { name: 'Засах', exact: true }).click();
        await expect(page.getByLabel('Байгууллага / төслийн нэр', { exact: true })).toHaveValue('Тест төсөл');
        await expect(page.getByRole('button', { name: 'Зарлал', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.getByLabel('Имэйл', { exact: true }).fill('subscriber@example.invalid');
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Захиалагч нэмэх', exact: true }).click();
        await expect(page.getByRole('listitem').filter({ hasText: 'subscriber@example.invalid' })).toBeVisible();
        await page.getByRole('button', { name: 'Resend ноорог бэлтгэх', exact: true }).click();
        expect(state.sends).toBe(0);
        await page.getByRole('button', { name: 'Шалгаж илгээх', exact: true }).click();
        await expect(page.frameLocator('iframe[title="Илгээх имэйлийн харагдац"]').getByText('Нээлттэй өдөрлөгт урьж байна.', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: 'Болих', exact: true }).click();
        expect(state.sends).toBe(0);
        await page.getByRole('button', { name: 'Шалгаж илгээх', exact: true }).click();
        await page.getByRole('button', { name: 'Захиалагчдад илгээх', exact: true }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
        expect(state.sends).toBe(1);
        await expect(page.getByText('Resend хүлээн авсан', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(state.pageErrors).toEqual([]);
        await expect(page.getByText('Resend илгээлтийн төлөв шинэчлэгдлээ', { exact: true })).not.toBeVisible({ timeout: 10000 });
        await page.locator('iframe').first().scrollIntoViewIfNeeded();
        await expect(preview.getByRole('heading', { name: 'Есдүгээр сарын мэдээ' })).toBeVisible();
        await page.locator('iframe').first().screenshot({ path: testInfo.outputPath('email-preview.png') });
        await page.screenshot({ path: testInfo.outputPath('newsletter.png'), fullPage: true });
    });
}

test('external email images render under the deployed page CSP without enabling scripts', async ({ page, browser }) => {
    await setup(page);
    const response = await page.goto('/marketing/newsletter');
    const csp = response!.headers()['content-security-policy'];
    expect(csp).toContain("img-src 'self' data: blob: https:");
    const html = newsletterPreviewHtml('Мэдээ', 'Агуулга', { ...defaultNewsletterDesign('Vertmon'), imageUrl: 'https://www.vertmon.mn/logo.png', imageAlt: 'Төслийн зураг' });
    const context = await browser.newContext({ bypassCSP: false, serviceWorkers: 'allow' });
    try {
        const previewPage = await context.newPage();
        await previewPage.route('https://preview.example.invalid/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': csp }, body: `<iframe title="preview" sandbox="" srcdoc="${html.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>` }));
        await previewPage.goto('https://preview.example.invalid/');
        await expect.poll(() => previewPage.frameLocator('iframe').getByRole('img', { name: 'Төслийн зураг' }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        await expect(previewPage.locator('iframe')).toHaveAttribute('sandbox', '');
    } finally { await context.close(); }
});
