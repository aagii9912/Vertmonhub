import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';

/** /marketing/social — холбосон Facebook Page-ийн Lead Ads төлөв, идэвхжүүлэх, 90 хоногийн нөхөлт. */
const shop = '00000000-0000-4000-8000-000000000002';

async function setup(page: Page, { readonly = false, subscribed = false } = {}) {
    const state = { posts: [] as unknown[], errors: [] as string[], subscribed };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Lead Ads тест' }, role: readonly ? 'viewer' : 'marketing', permissions: { ...ROLE_PERMISSIONS.marketing, canWrite: !readonly }, shops: [{ id: shop, name: 'Тест байгууллага', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/marketing/facebook') return reply({ connected: true, page: { id: '1111', name: 'Mandala Garden', followers_count: 1200, fan_count: 1100 } });
        if (path === '/api/marketing/facebook/posts') return reply({ posts: [] });
        if (path === '/api/marketing/facebook/lead-ads') {
            if (request.method() === 'GET') return reply({
                connected: true, pageName: 'Mandala Garden', subscribed: state.subscribed, eventsAvailable: true,
                counts: { saved: 3, skipped: 1, failed: 0 }, lastSavedAt: '2026-10-04T02:00:00Z',
                problems: [{ leadgen_id: '9002', status: 'skipped', reason: 'permission_missing', origin: 'webhook', updated_at: '2026-10-04T01:00:00Z' }],
            });
            const body = request.postDataJSON();
            state.posts.push(body);
            if (body.action === 'subscribe') { state.subscribed = true; return reply({ success: true, leadgen: true }); }
            return reply({ forms: 2, received: 4, ingested: 2, duplicate: 2, skipped: 0, failed: 0, reasons: {}, complete: true });
        }
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/marketing/social');
    return state;
}

test('connected page shows Lead Ads health, re-subscribes and backfills 90 days', async ({ page }) => {
    const state = await setup(page);
    const card = page.getByRole('region', { name: 'Facebook Lead Ads' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Webhook идэвхгүй')).toBeVisible();
    await expect(card.getByText(/3 хадгалсан · 1 алгассан · 0 түр алдаатай/)).toBeVisible();
    await expect(card.getByText('leads_retrieval / pages_manage_ads эрх дутуу — дахин холбоно уу')).toBeVisible();

    await card.getByRole('button', { name: 'Lead Ads идэвхжүүлэх' }).click();
    await expect(page.getByText('Lead Ads webhook идэвхжлээ.')).toBeVisible();
    await expect(card.getByText('Webhook идэвхтэй')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Lead Ads идэвхжүүлэх' })).toHaveCount(0);

    await card.getByRole('button', { name: 'Сүүлийн 90 хоногийн лид татах' }).click();
    await expect(page.getByText(/2 форм, 4 лид шалгав: 2 шинэ, 2 аль хэдийн байсан/)).toBeVisible();
    expect(state.posts).toEqual([{ action: 'subscribe' }, { action: 'backfill' }]);
    expect(state.errors).toEqual([]);
});

test('read-only users see the status without actions and the card fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const state = await setup(page, { readonly: true, subscribed: true });
    const card = page.getByRole('region', { name: 'Facebook Lead Ads' });
    await expect(card.getByText('Webhook идэвхтэй')).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(state.errors).toEqual([]);
});
