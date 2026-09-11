/**
 * Орчны хувьсагчийн шалгалт (Wave 3, docs/REVIEW-2026-09-11.md).
 *
 * Production-д заавал байх ёстой нууцууд. Байхгүй бол `src/instrumentation.ts` серверийн
 * эхлэлд алдаа лог + Sentry мессеж бичнэ (build/deploy-г унагахгүй — гэхдээ ил харагдана).
 * Жишээ: CRON_SECRET байхгүй бол cron-ууд 401 (fail-closed), FACEBOOK_VERIFY_TOKEN байхгүй
 * бол webhook verify 500.
 */
export const REQUIRED_PROD_ENV = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'FACEBOOK_APP_SECRET',
    'FACEBOOK_VERIFY_TOKEN',
    'CRON_SECRET',
    'TOKEN_ENCRYPTION_KEY',
] as const;

/** Зөвлөмжтэй (байхгүй бол тухайн боломж унтарна, гэхдээ систем ажиллана). */
export const RECOMMENDED_PROD_ENV = [
    'NEXT_PUBLIC_SENTRY_DSN',
    'TURNSTILE_SECRET_KEY',
    'RESEND_API_KEY',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
] as const;

export function missingEnv(names: readonly string[], env: NodeJS.ProcessEnv = process.env): string[] {
    return names.filter((n) => !env[n] || !String(env[n]).trim());
}

export function missingProdEnv(env: NodeJS.ProcessEnv = process.env): { required: string[]; recommended: string[] } {
    return {
        required: missingEnv(REQUIRED_PROD_ENV, env),
        recommended: missingEnv(RECOMMENDED_PROD_ENV, env),
    };
}
