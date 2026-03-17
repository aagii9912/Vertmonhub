/**
 * Request Logging Middleware
 * Logs API request details server-side for debugging and monitoring.
 * 
 * Usage in middleware.ts:
 *   logApiRequest(request);
 */

import { logger } from '@/lib/utils/logger';

export interface RequestLogEntry {
    method: string;
    path: string;
    ip: string;
    userAgent: string;
    timestamp: string;
    duration?: number;
}

/**
 * Log API request details
 */
export function logApiRequest(req: Request): void {
    const url = new URL(req.url);
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';

    const entry: RequestLogEntry = {
        method: req.method,
        path: url.pathname,
        ip,
        userAgent: req.headers.get('user-agent')?.substring(0, 100) || 'unknown',
        timestamp: new Date().toISOString(),
    };

    // Only log API requests, skip static assets
    if (url.pathname.startsWith('/api/')) {
        logger.info(`[API] ${entry.method} ${entry.path}`, { ip: entry.ip });
    }
}

/**
 * Create a request timer for measuring response duration
 */
export function createRequestTimer() {
    const startTime = Date.now();
    return {
        /** Get elapsed duration in ms */
        getDuration: () => Date.now() - startTime,
        /** Log completion with duration */
        logCompletion: (path: string, status: number) => {
            const duration = Date.now() - startTime;
            const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            logger[level](`[API] ${path} → ${status} (${duration}ms)`);
        },
    };
}
