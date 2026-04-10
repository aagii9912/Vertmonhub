/**
 * Syncly E2E Smoke Tests
 * 
 * Core user flows:
 * 1. Landing page loads
 * 2. Login page accessible
 * 3. Health API returns 200
 * 4. Dashboard redirects unauthenticated users
 */
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
    test('loads successfully with title', async ({ page }) => {
        await page.goto('/');

        // Page should have a title
        await expect(page).toHaveTitle(/Syncly/i);
    });

    test('has visible CTA button', async ({ page }) => {
        await page.goto('/');

        // Should have a call-to-action
        const cta = page.getByRole('link', { name: /эхлэх|бүртгүүлэх|нэвтрэх|start/i });
        await expect(cta).toBeVisible();
    });

    test('has proper meta description', async ({ page }) => {
        await page.goto('/');

        const metaDesc = page.locator('meta[name="description"]');
        await expect(metaDesc).toHaveAttribute('content', /.+/);
    });
});

test.describe('Health API', () => {
    test('returns healthy status', async ({ request }) => {
        const response = await request.get('/api/health');

        expect(response.ok()).toBe(true);

        const body = await response.json();
        expect(body.status).toMatch(/healthy|degraded/);
        expect(body.checks.api).toBe(true);
        expect(body.timestamp).toBeDefined();
    });
});

test.describe('Auth Flow', () => {
    test('login page loads', async ({ page }) => {
        await page.goto('/login');

        // Should see login form or auth UI
        await expect(page.locator('body')).toBeVisible();
        // Page should not show error
        await expect(page.locator('text=500')).not.toBeVisible();
        await expect(page.locator('text=Internal Server Error')).not.toBeVisible();
    });

    test('register page loads', async ({ page }) => {
        await page.goto('/register');

        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator('text=500')).not.toBeVisible();
    });

    test('dashboard redirects unauthenticated users', async ({ page }) => {
        await page.goto('/dashboard');

        // Should redirect to login
        await page.waitForURL(/\/(login|auth)/);
        expect(page.url()).toMatch(/\/(login|auth)/);
    });
});

test.describe('Accessibility', () => {
    test('landing page has lang attribute', async ({ page }) => {
        await page.goto('/');

        const html = page.locator('html');
        await expect(html).toHaveAttribute('lang', 'mn');
    });

    test('all images have alt text', async ({ page }) => {
        await page.goto('/');

        const images = page.locator('img');
        const count = await images.count();

        for (let i = 0; i < count; i++) {
            const alt = await images.nth(i).getAttribute('alt');
            expect(alt, `Image ${i} missing alt text`).toBeTruthy();
        }
    });
});

test.describe('Performance', () => {
    test('landing page loads under 5s', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        const loadTime = Date.now() - startTime;

        expect(loadTime).toBeLessThan(5000);
    });

    test('health API responds under 500ms', async ({ request }) => {
        const startTime = Date.now();
        await request.get('/api/health');
        const responseTime = Date.now() - startTime;

        expect(responseTime).toBeLessThan(500);
    });
});
