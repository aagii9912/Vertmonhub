/**
 * Sentry client init (Next.js `instrumentation-client` convention).
 * Хуучин root-ийн sentry.client.config.ts-ийг орлоно — тэр файл ачаалагддаггүй байв.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions

    // Session Replay (optional, for debugging)
    replaysSessionSampleRate: 0.05, // 5% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% on error

    // Environment
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',

    // Filter out non-critical errors
    ignoreErrors: [
        // Browser/network errors
        'ResizeObserver loop limit exceeded',
        'Network request failed',
        'Load failed',
        // Facebook API errors (handled separately)
        'Facebook API Error',
    ],
});

/** App Router навигацийн trace. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
