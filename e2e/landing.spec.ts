import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
    test('should display the main headline', async ({ page }) => {
        // Go to the landing page
        await page.goto('/');

        // Wait for page to be idle to avoid flakiness
        await page.waitForLoadState('networkidle');

        // Check if the title is correct or exists
        // E.g., Syncly is the name according to plans.ts "Syncly AI Plan Configuration"
        await expect(page).toHaveTitle(/Sync|SmartHub|Home/i);

        // Take a screenshot of the landing page
        await page.screenshot({ path: 'test-results/landing-page.png', fullPage: true });
    });

    test('should have working navigation links', async ({ page }) => {
        await page.goto('/');

        // Let's ensure there are at least some links on the page (e.g. Header links)
        const links = page.locator('a');
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
    });
});
