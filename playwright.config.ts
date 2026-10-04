import { defineConfig, devices } from '@playwright/test';

/**
 * Isolated browser specs. One loopback fixture (e2e/support/fixture-server.mjs) serves
 * every project: fake GoTrue + `next dev` with all .env keys blanked, so no production
 * credentials are used and specs never skip on missing auth.
 *
 *   npm run test:e2e                         # every project
 *   npm run test:workflow                    # CI's mandatory login → lead → report flow
 *   npx playwright test --project=onboarding
 *   E2E_BROWSER_CHANNEL=chrome …             # use installed Chrome instead of bundled Chromium
 */
const appPort = Number(process.env.E2E_APP_PORT || 3101);
const baseURL = `http://localhost:${appPort}`;

export default defineConfig({
    testDir: './e2e',
    outputDir: 'test-results/e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    webServer: {
        command: 'node e2e/support/fixture-server.mjs',
        url: `http://127.0.0.1:${appPort}/auth/login`,
        reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
        timeout: 180_000,
    },
    use: {
        ...devices['Desktop Chrome'],
        channel: process.env.E2E_BROWSER_CHANNEL || undefined,
        baseURL,
        timezoneId: 'Asia/Ulaanbaatar',
        // The auth fixture is loopback HTTP. The app's production CSP is unchanged.
        bypassCSP: true,
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'public', testMatch: 'smoke.spec.ts' },
        { name: 'workflow', testMatch: 'workflow.spec.ts' },
        { name: 'workday', testMatch: ['workday.spec.ts', 'crm-workday.spec.ts'] },
        { name: 'onboarding', testMatch: 'onboarding-flow.spec.ts' },
        { name: 'admin', testMatch: ['admin-project-budget.spec.ts', 'inventory-import.spec.ts'] },
        { name: 'marketing', testMatch: ['marketing-performance.spec.ts', 'meta-spend-import.spec.ts', 'newsletter.spec.ts'] },
    ],
});
