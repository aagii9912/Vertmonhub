import { defineConfig, devices } from '@playwright/test';

// Mandatory, isolated UI contracts: no production credentials and no auth skips.
export default defineConfig({
    testDir: './e2e',
    testMatch: 'workflow.spec.ts',
    outputDir: 'test-results/workflow',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    webServer: {
        command: 'node e2e/support/workflow-server.mjs',
        url: 'http://127.0.0.1:3101/auth/login',
        reuseExistingServer: false,
        timeout: 180_000,
    },
    use: {
        ...devices['Desktop Chrome'],
        channel: process.env.E2E_BROWSER_CHANNEL || undefined,
        baseURL: 'http://127.0.0.1:3101',
        timezoneId: 'Asia/Ulaanbaatar',
        // The auth fixture is loopback HTTP. The app's production CSP is unchanged.
        bypassCSP: true,
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
});
