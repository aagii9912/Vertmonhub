/**
 * Retry Service Unit Tests
 * Tests for webhook retry mechanism
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateBackoffDelay } from '@/lib/webhook/retryService';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
                })),
            })),
        })),
    })),
}));

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('RetryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateBackoffDelay', () => {
        it('should return initial delay for first attempt', () => {
            const delay = calculateBackoffDelay(1, { initialDelayMs: 1000, backoffMultiplier: 2 });
            // With jitter, should be around 1000 ± 100
            expect(delay).toBeGreaterThanOrEqual(900);
            expect(delay).toBeLessThanOrEqual(1100);
        });

        it('should double delay for each subsequent attempt', () => {
            const config = { initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 100000 };

            const delay1 = calculateBackoffDelay(1, config);
            const delay2 = calculateBackoffDelay(2, config);
            const delay3 = calculateBackoffDelay(3, config);

            // delay2 should be roughly 2x delay1, delay3 roughly 4x delay1
            expect(delay2).toBeGreaterThan(delay1 * 1.5);
            expect(delay3).toBeGreaterThan(delay2 * 1.5);
        });

        it('should cap delay at maxDelayMs', () => {
            const delay = calculateBackoffDelay(10, {
                initialDelayMs: 1000,
                backoffMultiplier: 2,
                maxDelayMs: 5000
            });

            expect(delay).toBeLessThanOrEqual(5000);
        });

        it('should use default config when not provided', () => {
            const delay = calculateBackoffDelay(1);
            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(2000);
        });
    });
});
