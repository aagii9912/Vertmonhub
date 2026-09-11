/**
 * Next.js instrumentation — Sentry-г server/edge runtime-д ачаална.
 *
 * 2026-09 review (H8): root-ийн sentry.*.config.ts файлууд Next 15+/Sentry v8+-д
 * автоматаар ачаалагддаггүй тул production-д Sentry огт ажиллахгүй байсан.
 * Энэ файл + src/instrumentation-client.ts + next.config.ts-ийн withSentryConfig
 * гурав хамт байж л Sentry асна.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}

/** Server component / route handler-ийн барьж аваагүй алдааг Sentry рүү. */
export const onRequestError = Sentry.captureRequestError;
