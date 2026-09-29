import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';
export default defineConfig({ ...workflow, testMatch: 'newsletter.spec.ts', outputDir: 'test-results/newsletter' });
