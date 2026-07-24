import crypto from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Cron route-уудын auth.
 *
 * Vercel Cron нь `Authorization: Bearer ${CRON_SECRET}`-ийг **GET**-ээр илгээдэг
 * (`x-cron-secret` БИШ). Иймд хоёуланг нь зөвшөөрнө: Bearer header (Vercel) болон
 * `x-cron-secret` header (гар туршилт / бусад дуудагч).
 *
 * `CRON_SECRET` тохируулаагүй үед:
 *   - production → ТАТГАЛЗАНА (өмнө нь нээлттэй болдог байсан нь орчны тохиргооны
 *     алдааг шууд аюулгүй байдлын нүх болгож хувиргадаг fail-open байв)
 *   - бусад орчин → нээлттэй (dev тохь тух)
 */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

export function isAuthorizedCron(request: Request | NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return process.env.NODE_ENV !== 'production';

    const auth = request.headers.get('authorization');
    if (auth && safeEqual(auth, `Bearer ${secret}`)) return true;

    const headerSecret = request.headers.get('x-cron-secret');
    if (headerSecret && safeEqual(headerSecret, secret)) return true;

    return false;
}
