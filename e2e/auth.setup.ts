import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

/**
 * Нэвтрэлтийн setup project. E2E_EMAIL/E2E_PASSWORD байвал нэвтэрч session-ийг
 * хадгална. Байхгүй бол хоосон storageState үлдээх ба authenticated тестүүд
 * login руу шилжихийг мэдэрч алгасна.
 */
setup('authenticate', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;

    if (!email || !password) {
        fs.mkdirSync(path.dirname(authFile), { recursive: true });
        if (!fs.existsSync(authFile)) {
            fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
        }
        console.warn(
            '[auth.setup] E2E_EMAIL/E2E_PASSWORD тохируулаагүй — нэвтрэлтгүй ажиллана; authed тестүүд алгасагдана.',
        );
        return;
    }

    await page.goto('/auth/login');
    await page
        .locator('input[type="email"]')
        .or(page.getByRole('textbox', { name: /имэйл|email/i }))
        .first()
        .fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page
        .getByRole('button', { name: /нэвтрэх|login|sign in/i })
        .first()
        .click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.context().storageState({ path: authFile });
});
