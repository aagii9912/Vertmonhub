/**
 * Webhook idempotency unit tests
 * isDuplicateWebhookEvent — давхар event-ийг таних логик
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase insert-ийн үр дүнг тест бүрт удирдахын тулд mutable mock
const insertMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => ({
        from: vi.fn(() => ({
            insert: insertMock,
        })),
    })),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/monitoring/errorMonitoring', () => ({ captureException: vi.fn() }));

import { isDuplicateWebhookEvent } from '@/lib/webhook/retryService';

describe('isDuplicateWebhookEvent', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns false on first sighting (successful insert)', async () => {
        insertMock.mockResolvedValueOnce({ error: null });
        expect(await isDuplicateWebhookEvent('mid-123')).toBe(false);
    });

    it('returns true on unique violation (duplicate)', async () => {
        insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
        expect(await isDuplicateWebhookEvent('mid-123')).toBe(true);
    });

    it('fails open (returns false) on unexpected DB error', async () => {
        insertMock.mockResolvedValueOnce({ error: { code: '42P01', message: 'undefined_table' } });
        expect(await isDuplicateWebhookEvent('mid-123')).toBe(false);
    });

    it('returns false for empty event id without hitting DB', async () => {
        expect(await isDuplicateWebhookEvent('')).toBe(false);
        expect(insertMock).not.toHaveBeenCalled();
    });
});
