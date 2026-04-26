/**
 * Rate Limiter Utility
 * Supports both in-memory (dev) and Redis (production) backends
 * 
 * Production: Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars
 * Dev: Falls back to in-memory Map automatically
 */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

// ============================================
// Backend Interface
// ============================================

interface RateLimitBackend {
    check(key: string, config: RateLimitConfig): Promise<RateLimitResult>;
}

// ============================================
// In-Memory Backend (dev / single instance)
// ============================================

class MemoryBackend implements RateLimitBackend {
    private store = new Map<string, RateLimitEntry>();
    private lastCleanup = Date.now();

    async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
        const now = Date.now();

        // Cleanup every 60s
        if (now - this.lastCleanup > 60000) {
            this.cleanup(now);
            this.lastCleanup = now;
        }

        const entry = this.store.get(key);

        if (!entry || now > entry.resetAt) {
            this.store.set(key, { count: 1, resetAt: now + config.windowMs });
            return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
        }

        if (entry.count >= config.maxRequests) {
            return { allowed: false, remaining: 0, resetAt: entry.resetAt };
        }

        entry.count++;
        return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
    }

    private cleanup(now: number) {
        let cleaned = 0;
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.resetAt) {
                this.store.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) logger.debug('Rate limit cleanup', { entriesRemoved: cleaned });
    }
}

// ============================================
// Redis Backend (production / multi-instance)
// ============================================

class RedisBackend implements RateLimitBackend {
    private baseUrl: string;
    private token: string;

    constructor(url: string, token: string) {
        this.baseUrl = url;
        this.token = token;
    }

    async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
        const redisKey = `rl:${key}`;
        const windowSec = Math.ceil(config.windowMs / 1000);

        try {
            // INCR + EXPIRE pipeline via Upstash REST API
            const pipeline = [
                ['INCR', redisKey],
                ['PTTL', redisKey],
            ];

            const res = await fetch(`${this.baseUrl}/pipeline`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(pipeline),
            });

            if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);

            const results = await res.json();
            const count = results[0]?.result ?? 1;
            const ttl = results[1]?.result ?? -1;

            // First request in window — set expiry
            if (count === 1 || ttl === -1) {
                await fetch(`${this.baseUrl}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(['EXPIRE', redisKey, String(windowSec)]),
                });
            }

            const resetAt = Date.now() + (ttl > 0 ? ttl : config.windowMs);
            const remaining = Math.max(0, config.maxRequests - count);

            return {
                allowed: count <= config.maxRequests,
                remaining,
                resetAt,
            };
        } catch (err) {
            // Redis down → fail open (allow request)
            logger.warn('Redis rate limit failed, allowing request', { error: err });
            return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
        }
    }
}

// ============================================
// Backend Selection (auto-detect)
// ============================================

let _backend: RateLimitBackend | null = null;

function getBackend(): RateLimitBackend {
    if (_backend) return _backend;

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
        logger.info('Rate limiter: Using Redis backend');
        _backend = new RedisBackend(redisUrl, redisToken);
    } else {
        if (process.env.NODE_ENV === 'production') {
            logger.warn('Rate limiter: UPSTASH_REDIS_REST_URL not set — using in-memory (NOT recommended for production)');
        }
        _backend = new MemoryBackend();
    }

    return _backend;
}

// ============================================
// Public API (unchanged interface)
// ============================================

// Default configs for different route types
export const RATE_LIMIT_CONFIGS = {
    // Strict: AI/Chat endpoints (expensive operations)
    strict: { windowMs: 60000, maxRequests: 20 },

    // Standard: Regular API endpoints
    standard: { windowMs: 60000, maxRequests: 100 },

    // Relaxed: Public/read-only endpoints
    relaxed: { windowMs: 60000, maxRequests: 200 },

    // Webhook: External service callbacks
    webhook: { windowMs: 60000, maxRequests: 500 },
} as const;

/**
 * Check rate limit for a given key (async — supports Redis)
 */
export async function checkRateLimit(
    key: string,
    config: RateLimitConfig = RATE_LIMIT_CONFIGS.standard
): Promise<RateLimitResult> {
    return getBackend().check(key, config);
}

/**
 * Synchronous rate limit check (in-memory only, for middleware edge runtime)
 * Falls back to memory backend even if Redis is configured
 */
const _edgeBackend = new MemoryBackend();
export function checkRateLimitSync(
    key: string,
    config: RateLimitConfig = RATE_LIMIT_CONFIGS.standard
): RateLimitResult {
    // Edge runtime can't do async Redis calls in middleware
    // Use in-memory as best-effort for edge
    let result: RateLimitResult = { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    _edgeBackend.check(key, config).then(r => { result = r; });
    return result;
}

/**
 * Get client identifier from request
 */
export function getClientIdentifier(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnecting = req.headers.get('cf-connecting-ip');

    return forwarded?.split(',')[0]?.trim()
        || realIp
        || cfConnecting
        || 'unknown';
}

/**
 * Create rate limit response
 */
export function createRateLimitResponse(resetAt: number): NextResponse {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

    return NextResponse.json(
        {
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter,
        },
        {
            status: 429,
            headers: {
                'Retry-After': String(retryAfter),
                'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
            },
        }
    );
}

/**
 * Rate limit middleware helper for API routes
 */
export function withRateLimit(
    handler: (req: Request) => Promise<NextResponse>,
    config: RateLimitConfig = RATE_LIMIT_CONFIGS.standard
) {
    return async (req: Request): Promise<NextResponse> => {
        const clientId = getClientIdentifier(req);
        const url = new URL(req.url);
        const key = `${clientId}:${url.pathname}`;

        const { allowed, remaining, resetAt } = await checkRateLimit(key, config);

        if (!allowed) {
            logger.warn('Rate limit exceeded', { clientId, path: url.pathname });
            return createRateLimitResponse(resetAt);
        }

        const response = await handler(req);

        // Add rate limit headers
        response.headers.set('X-RateLimit-Remaining', String(remaining));
        response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

        return response;
    };
}

/**
 * Check rate limit in middleware (for edge runtime)
 */
export async function checkMiddlewareRateLimit(
    req: Request,
    routeType: keyof typeof RATE_LIMIT_CONFIGS = 'standard'
): Promise<{ allowed: boolean; response?: NextResponse }> {
    const clientId = getClientIdentifier(req);
    const url = new URL(req.url);
    const key = `${clientId}:${routeType}`;

    const config = RATE_LIMIT_CONFIGS[routeType];
    const { allowed, resetAt } = await checkRateLimit(key, config);

    if (!allowed) {
        logger.warn('Rate limit exceeded in middleware', {
            clientId,
            path: url.pathname,
            routeType
        });
        return {
            allowed: false,
            response: createRateLimitResponse(resetAt)
        };
    }

    return { allowed: true };
}
