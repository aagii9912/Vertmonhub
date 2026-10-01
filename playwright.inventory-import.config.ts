import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

export default defineConfig({
    ...workflow,
    testMatch: 'inventory-import.spec.ts',
    outputDir: 'test-results/inventory-import',
    webServer: {
        command: 'node e2e/support/admin-project-budget-server.mjs',
        url: 'http://127.0.0.1:3121/auth/login',
        reuseExistingServer: process.env.E2E_INVENTORY_REUSE_SERVER === '1',
        timeout: 180_000,
    },
    use: {
        ...workflow.use,
        baseURL: 'http://localhost:3121',
        launchOptions: process.env.E2E_BROWSER_EXECUTABLE
            ? { executablePath: process.env.E2E_BROWSER_EXECUTABLE }
            : undefined,
    },
});
