import type { NextRequest } from 'next/server';

/**
 * Cron route-уудын auth.
 *
 * Vercel Cron нь `Authorization: Bearer ${CRON_SECRET}`-ийг **GET**-ээр илгээдэг
 * (`x-cron-secret` БИШ). Иймд хоёуланг нь зөвшөөрнө: Bearer header (Vercel) болон
 * `x-cron-secret` header (гар туршилт / бусад дуудагч). `CRON_SECRET` тохируулаагүй
 * бол (dev орчин) нээлттэй.
 */
export function isAuthorizedCron(request: Request | NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true; // dev — нээлттэй
    const auth = request.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
    if (request.headers.get('x-cron-secret') === secret) return true;
    return false;
}
