import { defineConfig } from '@playwright/test';
import workflow from './playwright.workflow.config';

export default defineConfig({ ...workflow, testMatch: 'marketing-performance.spec.ts', outputDir: 'test-results/marketing' });
