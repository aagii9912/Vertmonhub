import { test, expect } from '@playwright/test';
import { gotoAuthed, SKIP_MSG } from './helpers';

/**
 * Нэгдсэн shell-ийн 3 талт workspace switcher:
 * [ Борлуулалт ] [ ✦ AI Туслах ] [ Маркетинг ].
 */
test.describe('Workspace switcher', () => {
    test('гурван талбарыг харуулна', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard');
        test.skip(!authed, SKIP_MSG);

        const tablist = page.getByRole('tablist', { name: 'Ажлын талбар' });
        await expect(tablist).toBeVisible();
        await expect(tablist.getByRole('tab', { name: 'Борлуулалт' })).toBeVisible();
        await expect(tablist.getByRole('tab', { name: 'AI Туслах' })).toBeVisible();
        await expect(tablist.getByRole('tab', { name: 'Маркетинг' })).toBeVisible();
        await expect(tablist.getByRole('tab', { name: 'Борлуулалт' })).toHaveAttribute('aria-selected', 'true');
    });

    test('Маркетинг руу сольж дарвал /marketing руу шилжиж sidebar солигдоно', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard');
        test.skip(!authed, SKIP_MSG);

        await page.getByRole('tab', { name: 'Маркетинг' }).click();
        await page.waitForURL(/\/marketing/);
        await expect(page.getByRole('tab', { name: 'Маркетинг' })).toHaveAttribute('aria-selected', 'true');
        // Sidebar нь зөвхөн маркетингийн цэс харуулна
        await expect(page.getByRole('link', { name: 'Кампейнүүд' })).toBeVisible();
    });

    test('AI төв нь /dashboard/ai-assistant руу шилжүүлнэ', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard');
        test.skip(!authed, SKIP_MSG);

        const aiTab = page.getByRole('tab', { name: 'AI Туслах' });
        test.skip(await aiTab.isDisabled(), 'Энэ ролд AI workspace хаалттай');
        await aiTab.click();
        await page.waitForURL(/\/dashboard\/ai-assistant/);
        await expect(aiTab).toHaveAttribute('aria-selected', 'true');
    });

    test('гүн холбоос идэвхтэй workspace-ийг зөв тодруулна', async ({ page }) => {
        const authed = await gotoAuthed(page, '/dashboard/marketing-roi');
        test.skip(!authed, SKIP_MSG);
        await expect(page.getByRole('tab', { name: 'Маркетинг' })).toHaveAttribute('aria-selected', 'true');
    });
});
