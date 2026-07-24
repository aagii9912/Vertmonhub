import * as Sentry from '@sentry/nextjs';

/**
 * Next.js instrumentation hook.
 *
 * Энэ файл БАЙХГҮЙ байсан тул `sentry.server.config.ts` / `sentry.edge.config.ts`
 * хэзээ ч ачаалагдаагүй — өөрөөр хэлбэл бүх `captureException` хоосон руу явж,
 * production дээр юу эвдэрснийг мэдэх арга байхгүй байв.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}

/** App Router дахь server component / route handler-ийн алдааг Sentry рүү дамжуулна. */
export const onRequestError = Sentry.captureRequestError;
