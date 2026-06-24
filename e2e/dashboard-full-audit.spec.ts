import { test, expect } from '@playwright/test';
import { gotoAuthed, SKIP_MSG } from './helpers';

/**
 * Deep audit — одоо идэвхтэй БҮХ модулийг алхаж, JS алдаагүй ачаалж буйг,
 * мөн нэгдсэн shell-ийн workspace switcher хаа сайгүй гарч буйг шалгана.
 *
 * (Хуучин e-commerce хуудсууд — /dashboard/subscription, идэвхтэй сагс,
 * захиалгын түүх — устсан тул энд байхгүй.)
 */
const MODULES: { path: string; name: string }[] = [
    { path: '/dashboard', name: 'Хянах самбар' },
    { path: '/dashboard/properties', name: 'Үл хөдлөх' },
    { path: '/dashboard/leads', name: 'Лийд' },
    { path: '/dashboard/leads/pipeline', name: 'Pipeline' },
    { path: '/dashboard/viewings', name: 'Үзлэг' },
    { path: '/dashboard/contracts', name: 'Гэрээ' },
    { path: '/dashboard/customers', name: 'Харилцагч' },
    { path: '/dashboard/customer-service', name: 'Үйлчилгээ' },
    { path: '/dashboard/finance', name: 'Санхүү' },
    { path: '/dashboard/procurement', name: 'Худалдан авалт' },
    { path: '/dashboard/reports', name: 'Тайлан' },
    { path: '/dashboard/marketing-roi', name: 'Маркетинг ROI' },
    { path: '/dashboard/surveys', name: 'Судалгаа' },
    { path: '/dashboard/ai-assistant', name: 'AI Туслах' },
    { path: '/dashboard/inbox', name: 'Мессеж' },
    { path: '/dashboard/ai-settings', name: 'AI Тохиргоо' },
    { path: '/dashboard/settings', name: 'Тохиргоо' },
    { path: '/marketing', name: 'Маркетинг Hub' },
];

test.describe('Dashboard deep audit — бүх модуль ачаалагдана', () => {
    for (const mod of MODULES) {
        test(`loads ${mod.name} (${mod.path})`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(e.message));

            const authed = await gotoAuthed(page, mod.path);
            test.skip(!authed, SKIP_MSG);

            // Нэгдсэн shell-ийн workspace switcher бүх хуудсанд харагдах ёстой
            await expect(
                page.getByRole('tablist', { name: 'Ажлын талбар' }),
            ).toBeVisible({ timeout: 10000 });

            expect(errors, `JS алдаа: ${mod.path}\n${errors.join('\n')}`).toHaveLength(0);

            await page.screenshot({
                path: `e2e-screenshots/audit_${mod.path.replace(/[/]/g, '_') || 'root'}.png`,
            });
        });
    }
});
