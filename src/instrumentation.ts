/**
 * Next.js instrumentation — Sentry-г server/edge runtime-д ачаална.
 *
 * 2026-09 review (H8): root-ийн sentry.*.config.ts файлууд Next 15+/Sentry v8+-д
 * автоматаар ачаалагддаггүй тул production-д Sentry огт ажиллахгүй байсан.
 * Энэ файл + src/instrumentation-client.ts + next.config.ts-ийн withSentryConfig
 * гурав хамт байж л Sentry асна. Server ба edge тохиргоо ижил тул энд нэг удаа тодорхойлно.
 */
import * as Sentry from '@sentry/nextjs';

function initSentry() {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        // Зөвхөн production-д
        enabled: process.env.NODE_ENV === 'production',
        tracesSampleRate: 0.1,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
        release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
}

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        initSentry();

        // Production env шалгалт — дутуу нууцыг серверийн эхлэлд ил гаргана (deploy-г унагахгүй)
        if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
            const { missingProdEnv } = await import('./lib/env');
            const { required, recommended } = missingProdEnv();
            if (required.length) {
                const msg = `[env] PRODUCTION-д ЗААВАЛ байх ёстой env дутуу: ${required.join(', ')}`;
                console.error(msg);
                Sentry.captureMessage(msg, 'error');
            }
            if (recommended.length) {
                console.warn(`[env] Зөвлөмжтэй env дутуу (тухайн боломж унтарсан): ${recommended.join(', ')}`);
            }
        }
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        initSentry();
    }
}

/** Server component / route handler-ийн барьж аваагүй алдааг Sentry рүү. */
export const onRequestError = Sentry.captureRequestError;
