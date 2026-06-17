/**
 * Gemini дуудалтын түр зуурын алдаа (429/503/overloaded) дээр exponential backoff-оор
 * дахин оролдоно. Бусад алдаа дээр шууд шиднэ.
 */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < tries; attempt++) {
        try {
            return await fn();
        } catch (e: unknown) {
            lastErr = e;
            const msg = String((e as { message?: string })?.message || e);
            const retryable = /429|503|overloaded|rate.?limit|unavailable|timeout/i.test(msg);
            if (!retryable || attempt === tries - 1) throw e;
            await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
        }
    }
    throw lastErr;
}
