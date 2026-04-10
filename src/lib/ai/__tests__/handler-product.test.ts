/**
 * Product & Analytics Handler Tests
 * Tests: show_product_image, suggest_related_products, check_payment_status, log_complaint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext } from './fixtures';

// ─── Mock Dependencies ──────────────────────────────────────────
const mockChain: any = {};
const mockSupabase = { from: vi.fn(() => mockChain) };

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => mockSupabase),
}));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/notifications', () => ({
    sendPushNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
}));
vi.mock('@/lib/payment/qpay', () => ({
    checkPaymentStatus: vi.fn(),
    isPaymentCompleted: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/services/StockService', () => ({
    deductStockForOrder: vi.fn().mockResolvedValue(undefined),
}));

import {
    executeShowProductImage,
    executeSuggestRelatedProducts,
    executeCheckPaymentStatus,
    executeLogComplaint,
} from '@/lib/ai/tools/handlers/ProductHandlers';
import { sendPushNotification } from '@/lib/notifications';
import { checkPaymentStatus, isPaymentCompleted } from '@/lib/payment/qpay';

describe('ProductHandlers', () => {
    const ctx = createMockContext();

    beforeEach(() => {
        vi.clearAllMocks();
        setupDefaultChain();
    });

    function setupDefaultChain() {
        mockChain.select = vi.fn().mockReturnValue(mockChain);
        mockChain.eq = vi.fn().mockReturnValue(mockChain);
        mockChain.order = vi.fn().mockReturnValue(mockChain);
        mockChain.limit = vi.fn().mockReturnValue(mockChain);
        mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        mockChain.insert = vi.fn().mockResolvedValue({ error: null });
        mockChain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        });
    }

    // ─── show_product_image ──────────────────────────────────────
    describe('executeShowProductImage', () => {
        it('should return single product image', () => {
            const result = executeShowProductImage(
                { product_names: ['Ноутбүүк'], mode: 'single' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.imageAction?.type).toBe('single');
            expect(result.imageAction?.products).toHaveLength(1);
            expect(result.imageAction?.products[0].name).toBe('Ноутбүүк Pro 15');
        });

        it('should return multiple products in confirm mode', () => {
            const result = executeShowProductImage(
                { product_names: ['Ноутбүүк', 'Утасны гэр'], mode: 'confirm' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.imageAction?.products).toHaveLength(2);
            expect(result.imageAction?.type).toBe('confirm');
        });

        it('should use placeholder for products without images', () => {
            const result = executeShowProductImage(
                { product_names: ['USB-C кабель'], mode: 'single' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.imageAction?.products[0].imageUrl).toContain('placehold');
        });

        it('should fail for non-existent products', () => {
            const result = executeShowProductImage(
                { product_names: ['Байхгүй бараа'], mode: 'single' },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should include price and description', () => {
            const result = executeShowProductImage(
                { product_names: ['Ноутбүүк'], mode: 'single' },
                ctx
            );

            expect(result.imageAction?.products[0].price).toBe(2500000);
            expect(result.imageAction?.products[0].description).toContain('M3');
        });
    });

    // ─── suggest_related_products ────────────────────────────────
    describe('executeSuggestRelatedProducts', () => {
        it('should suggest similar type products', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Ноутбүүк', suggestion_type: 'similar' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.data?.suggestions).toBeDefined();
        });

        it('should suggest complementary (different type)', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Ноутбүүк', suggestion_type: 'complementary' },
                ctx
            );

            expect(result.success).toBe(true);
            const suggestions = result.data?.suggestions as any[];
            if (suggestions && suggestions.length > 0) {
                expect(suggestions.some((s: any) => s.name !== 'Ноутбүүк Pro 15')).toBe(true);
            }
        });

        it('should suggest bundle (cheaper items)', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Ноутбүүк', suggestion_type: 'bundle' },
                ctx
            );

            expect(result.success).toBe(true);
            const suggestions = result.data?.suggestions as any[];
            if (suggestions) {
                for (const s of suggestions) {
                    expect(s.price).toBeLessThan(2500000);
                }
            }
        });

        it('should return empty for unknown product', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Байхгүй' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.data?.suggestions).toEqual([]);
        });

        it('should exclude out-of-stock products', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Ноутбүүк', suggestion_type: 'similar' },
                ctx
            );

            const suggestions = result.data?.suggestions as any[];
            if (suggestions) {
                expect(suggestions.every((s: any) => s.name !== 'Bluetooth чихэвч')).toBe(true);
            }
        });

        it('should show discount price for discounted items', async () => {
            const result = await executeSuggestRelatedProducts(
                { current_product_name: 'Ноутбүүк', suggestion_type: 'complementary' },
                ctx
            );

            const suggestions = result.data?.suggestions as any[];
            const discountedItem = suggestions?.find((s: any) => s.original_price);
            if (discountedItem) {
                expect(discountedItem.price).toBeLessThan(discountedItem.original_price);
            }
        });
    });

    // ─── check_payment_status ────────────────────────────────────
    describe('executeCheckPaymentStatus', () => {
        it('should return no orders when none pending', async () => {
            mockChain.eq = vi.fn().mockReturnValue(mockChain);
            mockChain.order = vi.fn().mockReturnValue(mockChain);
            mockChain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

            const result = await executeCheckPaymentStatus({}, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('олдсонгүй');
        });

        it('should check and verify payment', async () => {
            mockChain.eq = vi.fn().mockReturnValue(mockChain);
            mockChain.order = vi.fn().mockReturnValue(mockChain);
            mockChain.limit = vi.fn().mockResolvedValue({
                data: [{ id: 'order-001', status: 'pending' }],
                error: null,
            });

            mockChain.single = vi.fn().mockResolvedValueOnce({
                data: { qpay_invoice_id: 'txn-001', id: 'pay-001' },
                error: null,
            });

            vi.mocked(checkPaymentStatus).mockResolvedValueOnce({
                count: 1,
                paid_amount: 100000,
                rows: [{ payment_id: 'qpay-txn-001', payment_status: 'PAID', payment_amount: 100000, payment_currency: 'MNT', payment_wallet: 'qpay', payment_date: '2026-04-06' }]
            } as any);
            vi.mocked(isPaymentCompleted).mockReturnValueOnce(true);

            mockChain.select = vi.fn().mockReturnValue(mockChain);

            const result = await executeCheckPaymentStatus({}, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('баталгаажлаа');
        });

        it('should report pending when not yet paid', async () => {
            mockChain.eq = vi.fn().mockReturnValue(mockChain);
            mockChain.order = vi.fn().mockReturnValue(mockChain);
            mockChain.limit = vi.fn().mockResolvedValue({
                data: [{ id: 'order-001', status: 'pending' }],
                error: null,
            });
            mockChain.single = vi.fn().mockResolvedValueOnce({
                data: { qpay_invoice_id: 'txn-001', id: 'pay-001' },
                error: null,
            });

            vi.mocked(checkPaymentStatus).mockResolvedValueOnce({ status: 'PENDING' } as any);
            vi.mocked(isPaymentCompleted).mockReturnValueOnce(false);

            const result = await executeCheckPaymentStatus({}, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('хараахан');
        });

        it('should fail without customer', async () => {
            const result = await executeCheckPaymentStatus(
                {},
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });
    });

    // ─── log_complaint ───────────────────────────────────────────
    describe('executeLogComplaint', () => {
        it('should log complaint and notify', async () => {
            const result = await executeLogComplaint(
                {
                    complaint_type: 'delivery',
                    description: 'Хүргэлт удааширсан',
                    severity: 'high',
                },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('хүлээн авлаа');
            expect(result.data?.logged).toBe(true);
            expect(vi.mocked(sendPushNotification)).toHaveBeenCalledWith(
                'shop-test-001',
                expect.objectContaining({
                    title: expect.stringContaining('гомдол'),
                })
            );
        });

        it('should handle missing complaints table gracefully', async () => {
            mockChain.insert = vi.fn().mockResolvedValue({
                error: { code: '42P01', message: 'relation does not exist' },
            });

            const result = await executeLogComplaint(
                { complaint_type: 'product_quality', description: 'Чанар муутай' },
                ctx
            );

            expect(result.success).toBe(true);
        });

        it('should use default severity', async () => {
            const result = await executeLogComplaint(
                { complaint_type: 'service', description: 'Харилцаа муу' },
                ctx
            );

            expect(result.success).toBe(true);
        });
    });
});
