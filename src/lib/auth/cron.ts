import type { NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto/safe-equal';
import { logger } from '@/lib/utils/logger';

/**
 * Cron route-уудын auth.
 *
 * Vercel Cron нь `Authorization: Bearer ${CRON_SECRET}`-ийг **GET**-ээр илгээдэг
 * (`x-cron-secret` БИШ). Иймд хоёуланг нь зөвшөөрнө: Bearer header (Vercel) болон
 * `x-cron-secret` header (гар туршилт / бусад дуудагч).
 *
 * 2026-09 review (H11): `CRON_SECRET` тохируулаагүй бол өмнө нь бүх орчинд нээлттэй
 * байсан. Одоо зөвхөн `next dev` (NODE_ENV=development)-д нээлттэй, бусад орчинд
 * fail-closed. Харьцуулалт timing-safe.
 */
export function isAuthorizedCron(request: Request | NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            logger.warn('[cron] CRON_SECRET тохируулаагүй — зөвхөн dev горимд нээлттэй');
            return true;
        }
        logger.error('[cron] CRON_SECRET тохируулаагүй — cron хүсэлтийг татгалзлаа');
        return false;
    }
    if (safeEqual(request.headers.get('authorization'), `Bearer ${secret}`)) return true;
    if (safeEqual(request.headers.get('x-cron-secret'), secret)) return true;
    return false;
}
