/**
 * Customer Handler Tests
 * Tests: collect_contact_info, request_human_support, remember_preference
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext } from './fixtures';

// ─── Mock Dependencies ──────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => ({
        from: vi.fn().mockReturnValue({
            update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
            }),
        }),
    })),
}));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/notifications', () => ({
    sendPushNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
}));
vi.mock('@/lib/ai/tools/memory', () => ({
    saveCustomerPreference: vi.fn().mockResolvedValue({ success: true }),
}));

import {
    executeCollectContact,
    executeRequestSupport,
    executeRememberPreference,
} from '@/lib/ai/tools/handlers/CustomerHandlers';
import { sendPushNotification } from '@/lib/notifications';
import { saveCustomerPreference } from '@/lib/ai/tools/memory';

describe('CustomerHandlers', () => {
    const ctx = createMockContext();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(saveCustomerPreference).mockResolvedValue({ success: true } as any);
    });

    // ─── collect_contact_info ────────────────────────────────────
    describe('executeCollectContact', () => {
        it('should save phone number', async () => {
            const result = await executeCollectContact(
                { phone: '99001122' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('phone');
        });

        it('should save all contact info', async () => {
            const result = await executeCollectContact(
                { phone: '99001122', name: 'Болд', address: 'УБ, ХУД 3-р хороо' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('phone');
            expect(result.message).toContain('address');
            expect(result.message).toContain('name');
        });

        it('should send push notification', async () => {
            await executeCollectContact({ phone: '99001122', name: 'Болд' }, ctx);

            expect(vi.mocked(sendPushNotification)).toHaveBeenCalledWith(
                'shop-test-001',
                expect.objectContaining({
                    title: expect.stringContaining('Хаяг'),
                })
            );
        });

        it('should skip notification when disabled', async () => {
            const noNotify = createMockContext({
                notifySettings: { order: true, contact: false, support: true, cancel: true },
            });

            await executeCollectContact({ phone: '99001122' }, noNotify);

            expect(vi.mocked(sendPushNotification)).not.toHaveBeenCalled();
        });

        it('should fail without customer context', async () => {
            const result = await executeCollectContact(
                { phone: '99001122' },
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });

        it('should handle empty contact info', async () => {
            const result = await executeCollectContact({}, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('No info');
        });
    });

    // ─── request_human_support ───────────────────────────────────
    describe('executeRequestSupport', () => {
        it('should send support notification', async () => {
            const result = await executeRequestSupport(
                { reason: 'Нарийн захиалга хийх хэрэгтэй' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(vi.mocked(sendPushNotification)).toHaveBeenCalledWith(
                'shop-test-001',
                expect.objectContaining({
                    title: expect.stringContaining('Холбогдох'),
                    body: expect.stringContaining('Нарийн захиалга'),
                })
            );
        });

        it('should work without reason', async () => {
            const result = await executeRequestSupport({ reason: '' }, ctx);

            expect(result.success).toBe(true);
        });

        it('should skip notification when disabled', async () => {
            const noNotify = createMockContext({
                notifySettings: { order: true, contact: true, support: false, cancel: true },
            });

            await executeRequestSupport({ reason: 'test' }, noNotify);

            expect(vi.mocked(sendPushNotification)).not.toHaveBeenCalled();
        });
    });

    // ─── remember_preference ─────────────────────────────────────
    describe('executeRememberPreference', () => {
        it('should save preference', async () => {
            const result = await executeRememberPreference(
                { key: 'favorite_color', value: 'blue' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('Санах ойд');
            expect(result.data).toEqual({ key: 'favorite_color', value: 'blue' });
            expect(vi.mocked(saveCustomerPreference)).toHaveBeenCalledWith('cust-test-001', 'favorite_color', 'blue');
        });

        it('should fail without customer', async () => {
            const result = await executeRememberPreference(
                { key: 'test', value: 'val' },
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });

        it('should handle save failure', async () => {
            vi.mocked(saveCustomerPreference).mockResolvedValueOnce({ success: false, error: 'DB error' } as any);

            const result = await executeRememberPreference(
                { key: 'test', value: 'val' },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('DB error');
        });
    });
});
