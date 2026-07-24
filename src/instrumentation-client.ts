import * as Sentry from "@sentry/nextjs";

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
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',

    // Release tracking (optional)
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Filter out non-critical errors
    ignoreErrors: [
        // Browser/network errors
        'ResizeObserver loop limit exceeded',
        'Network request failed',
        'Load failed',
        // Facebook API errors (handled separately)
        'Facebook API Error',
    ],

    // Before sending to Sentry
    beforeSend(event, hint) {
        // Don't send events in development
        if (process.env.NODE_ENV === 'development') {
            console.error('[Sentry Debug]', hint.originalException);
            return null;
        }
        return event;
    },
});

/**
 * Next.js 15+ / Sentry v9+ дээр клиентийн Sentry-г ЭНЭ файлаас ачаалдаг
 * (`sentry.client.config.ts` дангаараа ачаалагддаггүй).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
