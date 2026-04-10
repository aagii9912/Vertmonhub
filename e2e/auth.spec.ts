import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
        // Assuming /dashboard is a protected route
        await page.goto('/dashboard');

        // Next.js (especially with Clerk/NextAuth) usually redirects to /sign-in or /login
        await page.waitForTimeout(2000); // Wait for redirect

        const url = page.url();
        expect(url).toMatch(/sign-in|login|auth/);
    });
});
