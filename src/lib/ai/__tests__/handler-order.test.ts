/**
 * Order Handler Tests
 * Tests: create_order, cancel_order, update_order, check_order_status, checkout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext, createMockOrder, createMockCart } from './fixtures';

// ─── Mock Dependencies ──────────────────────────────────────────
const mockChain: any = {};
const mockSupabase = { from: vi.fn(), rpc: vi.fn() };

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => mockSupabase),
}));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/notifications', () => ({
    sendOrderNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
    sendPushNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
}));
vi.mock('@/lib/ai/helpers/stockHelpers', () => ({
    getProductFromDB: vi.fn().mockResolvedValue({
        id: 'prod-1', name: 'Ноутбүүк Pro 15', price: 2500000, stock: 10,
        discount_percent: null,
    }),
    getCartFromDB: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/payment/qpay', () => ({
    createQPayInvoice: vi.fn().mockResolvedValue({ qpay_shorturl: 'https://qpay.mn/test' }),
}));

import {
    executeCreateOrder,
    executeCancelOrder,
    executeCheckOrderStatus,
    executeCheckout,
    executeUpdateOrder,
} from '@/lib/ai/tools/handlers/OrderHandlers';
import { getCartFromDB } from '@/lib/ai/helpers/stockHelpers';

describe('OrderHandlers', () => {
    const ctx = createMockContext();

    beforeEach(() => {
        vi.clearAllMocks();
        setupDefaultChain();
    });

    function setupDefaultChain() {
        const singleFn = vi.fn().mockResolvedValue({
            data: { id: 'prod-1', stock: 10, reserved_stock: 0, price: 2500000 },
            error: null,
        });

        mockChain.select = vi.fn().mockReturnValue(mockChain);
        mockChain.eq = vi.fn().mockReturnValue(mockChain);
        mockChain.gt = vi.fn().mockReturnValue(mockChain);
        mockChain.order = vi.fn().mockReturnValue(mockChain);
        mockChain.limit = vi.fn().mockReturnValue(mockChain);
        mockChain.single = singleFn;
        mockChain.insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'order-new-001' }, error: null }),
            }),
        });
        mockChain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        });
        mockChain.delete = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        });

        mockSupabase.from.mockReturnValue(mockChain);
        mockSupabase.rpc.mockResolvedValue({ data: 'checkout-order-001', error: null });
    }

    // ─── create_order ────────────────────────────────────────────
    describe('executeCreateOrder', () => {
        it('should create order for valid product', async () => {
            // No duplicate order found
            mockChain.single
                .mockResolvedValueOnce({ data: { id: 'prod-1', stock: 10, reserved_stock: 0, price: 2500000 }, error: null }) // product query
                .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // no duplicate

            const result = await executeCreateOrder(
                { product_name: 'Ноутбүүк', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('Success');
            expect(result.data?.orderId).toBeDefined();
        });

        it('should fail for unknown product', async () => {
            const result = await executeCreateOrder(
                { product_name: 'Байхгүй бараа', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should fail when stock insufficient', async () => {
            mockChain.single.mockResolvedValueOnce({
                data: { id: 'prod-1', stock: 1, reserved_stock: 1, price: 2500000 },
                error: null,
            });

            const result = await executeCreateOrder(
                { product_name: 'Ноутбүүк', quantity: 5 },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('stock');
        });

        it('should fail without shopId or customerId', async () => {
            const noCustomerCtx = createMockContext({ customerId: undefined });

            const result = await executeCreateOrder(
                { product_name: 'Ноутбүүк', quantity: 1 },
                noCustomerCtx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing');
        });
    });

    // ─── cancel_order ────────────────────────────────────────────
    describe('executeCancelOrder', () => {
        it('should cancel pending order', async () => {
            const order = createMockOrder();
            mockChain.single.mockResolvedValueOnce({ data: order, error: null });

            const result = await executeCancelOrder({ reason: 'Эргэж бодлоо' }, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('cancelled');
        });

        it('should fail without customer context', async () => {
            const result = await executeCancelOrder(
                { reason: 'test' },
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('customer');
        });

        it('should fail when no pending order exists', async () => {
            mockChain.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

            const result = await executeCancelOrder({ reason: 'test' }, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No pending order');
        });
    });

    // ─── check_order_status ──────────────────────────────────────
    describe('executeCheckOrderStatus', () => {
        it('should return order status list', async () => {
            // Override the terminal call to return an array (not .single())
            // check_order_status doesn't use .single(), it uses the query result directly
            const ordersData = [
                {
                    id: 'order-001-full-uuid',
                    status: 'pending',
                    total: 2500000,
                    created_at: new Date().toISOString(),
                    order_items: [{ product_name: 'Ноутбүүк Pro 15', quantity: 1, unit_price: 2500000 }],
                },
            ];

            // Override chain to act as non-single query
            mockChain.eq = vi.fn().mockReturnValue(mockChain);
            mockChain.order = vi.fn().mockReturnValue(mockChain);
            mockChain.limit = vi.fn().mockResolvedValue({ data: ordersData, error: null });

            const result = await executeCheckOrderStatus({}, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('захиалгууд');
            expect(result.data?.orders).toBeDefined();
        });

        it('should return empty message when no orders', async () => {
            mockChain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
            mockChain.eq = vi.fn().mockReturnValue(mockChain);
            mockChain.order = vi.fn().mockReturnValue(mockChain);

            const result = await executeCheckOrderStatus({}, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('байхгүй');
        });
    });

    // ─── checkout ────────────────────────────────────────────────
    describe('executeCheckout', () => {
        it('should checkout with cart items', async () => {
            const cart = createMockCart();
            vi.mocked(getCartFromDB).mockResolvedValueOnce(cart);
            mockSupabase.rpc.mockResolvedValueOnce({ data: 'order-checkout-001', error: null });

            const result = await executeCheckout({ notes: 'Хурдан хүргээрэй' }, ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('амжилттай');
            expect(result.data?.order_id).toBeDefined();
        });

        it('should fail with empty cart', async () => {
            vi.mocked(getCartFromDB).mockResolvedValueOnce(null);

            const result = await executeCheckout({}, ctx);

            expect(result.success).toBe(false);
            expect(result.error).toContain('хоосон');
        });

        it('should fail without customer', async () => {
            const result = await executeCheckout(
                {},
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });
    });

    // ─── update_order ────────────────────────────────────────────
    describe('executeUpdateOrder', () => {
        it('should change quantity', async () => {
            const order = createMockOrder();
            mockChain.single.mockResolvedValueOnce({ data: order, error: null });

            const result = await executeUpdateOrder(
                { action: 'change_quantity', product_name: 'Ноутбүүк', new_quantity: 3 },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('өөрчиллөө');
            expect(result.data?.new_quantity).toBe(3);
        });

        it('should remove item from order', async () => {
            const order = createMockOrder({
                order_items: [
                    { id: 'oi-1', product_id: 'prod-1', product_name: 'Ноутбүүк Pro 15', quantity: 1, unit_price: 2500000 },
                    { id: 'oi-2', product_id: 'prod-2', product_name: 'Утасны гэр', quantity: 2, unit_price: 28000 },
                ],
            });
            mockChain.single.mockResolvedValueOnce({ data: order, error: null });

            const result = await executeUpdateOrder(
                { action: 'remove_item', product_name: 'Утасны гэр' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('хасагдлаа');
        });

        it('should update notes', async () => {
            const order = createMockOrder();
            mockChain.single.mockResolvedValueOnce({ data: order, error: null });

            const result = await executeUpdateOrder(
                { action: 'update_notes', notes: 'Шинэ тэмдэглэл' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('тэмдэглэл');
        });

        it('should fail when no pending order', async () => {
            mockChain.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

            const result = await executeUpdateOrder(
                { action: 'change_quantity', product_name: 'X', new_quantity: 1 },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('олдсонгүй');
        });
    });
});
