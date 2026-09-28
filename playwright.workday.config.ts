import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

export default defineConfig({
    ...workflow,
    testMatch: ['workday.spec.ts', 'workflow.spec.ts', 'crm-workday.spec.ts'],
    outputDir: 'test-results/workday',
    webServer: {
        command: 'WORKFLOW_APP_PORT=3107 WORKFLOW_AUTH_PORT=4327 WORKFLOW_BUILD_DIR=output/workday/dev node e2e/support/workflow-server.mjs',
        url: 'http://127.0.0.1:3107/auth/login',
        reuseExistingServer: false,
        timeout: 180_000,
    },
    use: { ...workflow.use, baseURL: 'http://127.0.0.1:3107' },
});
