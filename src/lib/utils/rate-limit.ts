/**
 * Simple in-memory rate limiter for API endpoints
 * Production-д Redis ашиглах нь илүү тохиромжтой
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory store (resets on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

interface RateLimitOptions {
    windowMs?: number;      // Time window in milliseconds
    maxRequests?: number;   // Max requests per window
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;        // Seconds until reset
}

/**
 * Check if request is within rate limit
 * @param identifier - Unique identifier (e.g., userId, IP)
 * @param options - Rate limit configuration
 */
export function checkRateLimit(
    identifier: string,
    options: RateLimitOptions = {}
): RateLimitResult {
    const { windowMs = 60000, maxRequests = 60 } = options; // Default: 60 requests per minute

    const now = Date.now();
    const key = identifier;

    let entry = rateLimitStore.get(key);

    // Initialize or reset if window expired
    if (!entry || entry.resetTime < now) {
        entry = {
            count: 0,
            resetTime: now + windowMs,
        };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);

    return {
        allowed: entry.count <= maxRequests,
        remaining,
        resetIn,
    };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult, maxRequests: number): Record<string, string> {
    return {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetIn),
    };
}

/**
 * Standard rate limit configurations
 */
export const RATE_LIMITS = {
    // Standard API: 60 requests per minute
    standard: { windowMs: 60000, maxRequests: 60 },

    // Dashboard stats: 30 requests per minute (frequently polled)
    dashboard: { windowMs: 60000, maxRequests: 30 },

    // Heavy operations: 10 per minute
    heavy: { windowMs: 60000, maxRequests: 10 },

    // Auth operations: 5 per minute
    auth: { windowMs: 60000, maxRequests: 5 },

    // Webhook: 100 per minute (external services)
    webhook: { windowMs: 60000, maxRequests: 100 },
};
