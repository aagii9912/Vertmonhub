import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';

const shop = '00000000-0000-4000-8000-000000000002';
const metric = (label: string, kind: 'sum' | 'unique' | 'latest', value: number | null, days = value === null ? 0 : 28) =>
    ({ label, kind, value, day: value === null ? null : '2026-10-03', days });

/** Page сонголт ба insights-ийн API-г дуурайна; браузер токен илгээж, хүлээж авахгүйг шалгана. */
async function setup(page: Page) {
    const state = { connected: false, selections: [] as unknown[], shopPatches: 0, errors: [] as string[], bodies: [] as string[] };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        const reply = (json: unknown, status = 200) => { state.bodies.push(JSON.stringify(json)); return route.fulfill({ json, status }); };
        if (path === '/api/auth/facebook/pages') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            if (request.method() === 'GET') {
                return reply({ pages: [{ id: '101', name: 'Mandala Garden', category: 'Real Estate' }, { id: '102', name: 'Elysium Residence' }], missing_permissions: ['read_insights'] });
            }
            state.selections.push(request.postDataJSON());
            state.connected = true;
            return reply({ success: true, page: { id: '102', name: 'Elysium Residence' }, webhookSubscribed: true });
        }
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/shop' && request.method() === 'PATCH') { state.shopPatches++; return reply({ error: 'unexpected' }, 400); }
        if (path === '/api/me') return reply({ user: { fullName: 'Сошиал тест' }, role: 'marketing', permissions: { ...ROLE_PERMISSIONS.marketing, canWrite: true }, shops: [{ id: shop, name: 'Elysium Residence', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/facebook') {
            return reply(state.connected
                ? { connected: true, page: { id: '102', name: 'Elysium Residence', category: 'Real Estate', followers_count: 12500, stored_name: 'Elysium Residence' } }
                : { connected: false, page: null });
        }
        if (path === '/api/marketing/facebook/posts') {
            return reply({ posts: [{ id: '102_1', message: 'Нээлтийн өдөр', image: null, permalink: null, created_time: '2026-10-02T02:00:00+0000', likes: 14, comments: null, shares: 0, insights: { views: 900, viewers: null, clicks: 12, reactions: null } }], unavailable: [] });
        }
        if (path === '/api/marketing/facebook/insights') {
            expect(url.searchParams.get('days')).toBe('28');
            return reply({ insights: { from: '2026-09-06', to: '2026-10-03', days: 28, unavailable: ['page_video_views'], metrics: {
                page_media_view: metric('Үзэлт', 'sum', 48210),
                page_total_media_view_unique: metric('Үзсэн хүн', 'unique', 3120, 28),
                page_post_engagements: metric('Нийтлэлийн оролцоо', 'sum', 1540),
                page_daily_follows_unique: metric('Шинэ дагагч', 'sum', 87),
                page_views_total: metric('Хуудас үзсэн', 'sum', 640),
                page_total_actions: metric('Товч, холбоос дарсан', 'sum', 95),
                page_video_views: metric('Видео үзэлт', 'sum', null),
                page_follows: metric('Дагагч', 'latest', 12500, 28),
            } } });
        }
        if (path === '/api/marketing/instagram') return reply({ connected: false, account: null, posts: [] });
        if (path === '/api/marketing/data/social_posts') return reply({ rows: [] });
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

test('connects a Facebook Page server-side after OAuth and shows v26 insights with unavailable values as «—»', async ({ page }) => {
    const state = await setup(page);
    await page.goto('/marketing/social');
    const connect = page.getByRole('button', { name: 'Facebook-ээр холбох' });
    await expect(connect).toBeVisible();

    // OAuth-оос буцсан мэт: сонголтыг серверээс (токенгүй) татна.
    await page.goto('/marketing/social?fb_success=true&page_count=2');
    const dialog = page.getByRole('dialog', { name: 'Facebook Page сонгох' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Page insights \(read_insights\)/)).toBeVisible();
    await dialog.getByText('Elysium Residence').click();
    await dialog.getByRole('button', { name: 'Холбох' }).click();

    await expect(page.getByText('✅ "Elysium Residence" амжилттай холбогдлоо')).toBeVisible();
    expect(state.selections).toEqual([{ pageId: '102' }]);
    expect(state.shopPatches).toBe(0);
    expect(state.bodies.join('\n')).not.toMatch(/access_token|EAAB/);

    const insights = page.locator('div.bg-surface-2', { hasText: 'Үзэлт' }).first();
    await expect(insights).toContainText('48.2K');
    await expect(insights).toContainText('28 өдрийн нийлбэр');
    const video = page.locator('div.bg-surface-2', { hasText: 'Видео үзэлт' });
    await expect(video).toContainText('—');
    await expect(video).toContainText('өгөгдөлгүй');
    await expect(page.locator('div.bg-surface-2', { hasText: 'Үзсэн хүн' })).toContainText('2026-10-03-ны байдлаар');
    await expect(page.getByText(/2026-09-06 – 2026-10-03 \(28 өдөр/)).toBeVisible();
    await expect(page.getByTitle('Үзсэн хүн (нийтлэлийн насан туршид)')).toContainText('—');
    // Meta fan_count-ийг өгөөгүй (Page like хасагдаж байгаа) — 0 биш «—».
    await expect(page.getByText('Like тоо').locator('xpath=ancestor::div[2]')).toContainText('—');
    expect(state.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('starts Facebook OAuth for the active project', async ({ page }) => {
    await setup(page);
    await page.goto('/marketing/social');
    const navigation = page.waitForRequest(request => new URL(request.url()).pathname === '/api/auth/facebook');
    await page.getByRole('button', { name: 'Facebook-ээр холбох' }).click();
    expect(new URL((await navigation).url()).searchParams.get('shop_id')).toBe(shop);
});
