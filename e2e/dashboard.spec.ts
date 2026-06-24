import { test, expect } from '@playwright/test';
import { gotoAuthed, SKIP_MSG } from './helpers';

// storageState-ийг playwright.config.ts-аас ашиглана (setup project нэвтрэлт бэлдэнэ).
// Хуучин e-commerce хуудсууд (/dashboard/products, /dashboard/orders) устсан тул энд байхгүй.

test.describe('Dashboard Audit', () => {
    test('AI Settings: Check Controls', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard/ai-settings');
        test.skip(!authed, SKIP_MSG);

        // AI toggle нь custom button (w-14 h-8 rounded-full)
        await expect(page.locator('button.rounded-full.w-14.h-8')).toBeVisible({ timeout: 15000 });
        await page.screenshot({ path: 'e2e-screenshots/dashboard_ai_settings.png' });
    });

    test('AI Assistant: full-height chat layout renders', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard/ai-assistant');
        test.skip(!authed, SKIP_MSG);

        // AI workspace switcher tab идэвхтэй байх ёстой
        await expect(page.getByRole('tab', { name: 'AI Туслах' })).toHaveAttribute('aria-selected', 'true');
        await page.screenshot({ path: 'e2e-screenshots/dashboard_ai_assistant.png' });
    });
});
