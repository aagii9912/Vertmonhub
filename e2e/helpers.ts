import { Page } from '@playwright/test';

/** Онбординг аяллыг алгасах (хуудас руу орохоос өмнө localStorage тохируулна). */
export async function skipOnboardingTour(page: Page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('smarthub_tour_completed', 'true');
            localStorage.setItem('vertmonhub_tour_completed', 'true');
        } catch {
            /* ignore */
        }
    });
}

/**
 * Хамгаалагдсан хуудас руу орох. Нэвтрэлт байхгүй (login руу шилжсэн) бол false.
 * Authenticated тестүүд үүгээр шалгаж `test.skip` хийдэг — E2E creds байхгүй үед
 * унахын оронд алгасна.
 */
export async function gotoAuthed(page: Page, path: string): Promise<boolean> {
    await skipOnboardingTour(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    return !/\/(auth\/)?login/.test(page.url());
}

export const SKIP_MSG =
    'Нэвтэрсэн session шаардлагатай — E2E_EMAIL/E2E_PASSWORD тохируулж auth setup-ийг ажиллуул.';
