import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

export default defineConfig({
    ...workflow,
    testMatch: 'onboarding-flow.spec.ts',
    outputDir: 'test-results/onboarding',
    webServer: {
        command: 'node e2e/support/onboarding-server.mjs',
        url: 'http://127.0.0.1:3111/auth/login',
        reuseExistingServer: false,
        timeout: 180_000,
    },
    use: { ...workflow.use, baseURL: 'http://localhost:3111' },
});
