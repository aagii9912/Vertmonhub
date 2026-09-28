import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

const webServer = Array.isArray(workflow.webServer) ? workflow.webServer[0] : workflow.webServer!;
export default defineConfig({ ...workflow, testMatch: 'meta-spend-import.spec.ts', outputDir: 'test-results/meta-import',
    // Reuse only the task-owned loopback fixture when doing a separate visual check.
    webServer: { ...webServer, reuseExistingServer: process.env.META_IMPORT_REUSE_SERVER === '1' },
});
