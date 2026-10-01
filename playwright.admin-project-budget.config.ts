import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

export default defineConfig({
    ...workflow,
    testMatch: 'admin-project-budget.spec.ts',
    outputDir: 'test-results/admin-project-budget',
    webServer: {
        command: 'node e2e/support/admin-project-budget-server.mjs',
        url: 'http://127.0.0.1:3121/auth/login',
        reuseExistingServer: false,
        timeout: 180_000,
    },
    use: { ...workflow.use, baseURL: 'http://localhost:3121' },
});
