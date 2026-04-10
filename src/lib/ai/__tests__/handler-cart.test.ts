/**
 * Cart Handler Tests
 * Tests: add_to_cart, view_cart, remove_from_cart
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext, createMockCart } from './fixtures';

// ─── Mock Dependencies ──────────────────────────────────────────
const mockSupabase = {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: 'cart-id', error: null }),
};

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => mockSupabase),
}));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/ai/helpers/stockHelpers', () => ({
    checkProductStock: vi.fn().mockResolvedValue({ available: true, currentStock: 10 }),
    getProductFromDB: vi.fn().mockResolvedValue({
        id: 'prod-1', name: 'Ноутбүүк Pro 15', price: 2500000, stock: 10,
        discount_percent: null,
    }),
    addItemToCart: vi.fn().mockResolvedValue({ success: true, newQuantity: 1 }),
    getCartFromDB: vi.fn().mockResolvedValue(null),
}));

import {
    executeAddToCart,
    executeViewCart,
    executeRemoveFromCart,
} from '@/lib/ai/tools/handlers/CartHandlers';
import { checkProductStock, getProductFromDB, addItemToCart, getCartFromDB } from '@/lib/ai/helpers/stockHelpers';

describe('CartHandlers', () => {
    const ctx = createMockContext();

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset defaults
        vi.mocked(getProductFromDB).mockResolvedValue({
            id: 'prod-1', name: 'Ноутбүүк Pro 15', price: 2500000, stock: 10,
            discount_percent: null,
        } as any);
        vi.mocked(checkProductStock).mockResolvedValue({ available: true, currentStock: 10 } as any);
        vi.mocked(addItemToCart).mockResolvedValue({ success: true, newQuantity: 1 } as any);
        vi.mocked(getCartFromDB).mockResolvedValue(null);
        mockSupabase.rpc.mockResolvedValue({ data: 100000, error: null });
    });

    // ─── add_to_cart ─────────────────────────────────────────────
    describe('executeAddToCart', () => {
        it('should add product to cart', async () => {
            const result = await executeAddToCart(
                { product_name: 'Ноутбүүк Pro 15', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('сагсанд нэмэгдлээ');
            expect(result.quickReplies).toBeDefined();
            expect(result.quickReplies!.length).toBeGreaterThan(0);
        });

        it('should add with variants', async () => {
            const result = await executeAddToCart(
                { product_name: 'Ноутбүүк', quantity: 1, color: 'Silver', size: 'Pro' },
                ctx
            );

            expect(result.success).toBe(true);
        });

        it('should fail without customer', async () => {
            const result = await executeAddToCart(
                { product_name: 'Ноутбүүк', quantity: 1 },
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('customer');
        });

        it('should fail for unknown product', async () => {
            vi.mocked(getProductFromDB).mockResolvedValueOnce(null);

            const result = await executeAddToCart(
                { product_name: 'Байхгүй', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('олдсонгүй');
        });

        it('should fail when stock insufficient', async () => {
            vi.mocked(checkProductStock).mockResolvedValueOnce({ available: false, currentStock: 0 } as any);

            const result = await executeAddToCart(
                { product_name: 'Ноутбүүк', quantity: 99 },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Үлдэгдэл');
        });

        it('should show urgency hint for low stock', async () => {
            vi.mocked(checkProductStock).mockResolvedValueOnce({ available: true, currentStock: 2 } as any);

            const result = await executeAddToCart(
                { product_name: 'Ноутбүүк', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('үлдлээ');
        });

        it('should apply discount price', async () => {
            vi.mocked(getProductFromDB).mockResolvedValueOnce({
                id: 'prod-2', name: 'Утасны гэр', price: 35000, stock: 50,
                discount_percent: 20,
            } as any);

            const result = await executeAddToCart(
                { product_name: 'Утасны гэр', quantity: 1 },
                ctx
            );

            expect(result.success).toBe(true);
            // Discount: 35000 * 0.8 = 28000
            expect(vi.mocked(addItemToCart)).toHaveBeenCalledWith(
                expect.anything(), 'prod-2', expect.anything(), 1, 28000
            );
        });
    });

    // ─── view_cart ───────────────────────────────────────────────
    describe('executeViewCart', () => {
        it('should display cart with items', async () => {
            const cart = createMockCart();
            vi.mocked(getCartFromDB).mockResolvedValueOnce(cart);

            const result = await executeViewCart(ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('сагс');
            expect(result.message).toContain('Ноутбүүк');
            expect(result.data?.total).toBe(cart.total_amount);
            expect(result.quickReplies).toBeDefined();
        });

        it('should handle empty cart', async () => {
            vi.mocked(getCartFromDB).mockResolvedValueOnce(null);

            const result = await executeViewCart(ctx);

            expect(result.success).toBe(true);
            expect(result.message).toContain('хоосон');
        });

        it('should fail without customer', async () => {
            const result = await executeViewCart(
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });
    });

    // ─── remove_from_cart ────────────────────────────────────────
    describe('executeRemoveFromCart', () => {
        it('should remove product from cart', async () => {
            const cart = createMockCart();
            vi.mocked(getCartFromDB).mockResolvedValueOnce(cart);
            mockSupabase.from.mockReturnValue({
                delete: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await executeRemoveFromCart(
                { product_name: 'Ноутбүүк' },
                ctx
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('хасагдлаа');
        });

        it('should fail for item not in cart', async () => {
            const cart = createMockCart();
            vi.mocked(getCartFromDB).mockResolvedValueOnce(cart);

            const result = await executeRemoveFromCart(
                { product_name: 'Байхгүй бараа' },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('олдсонгүй');
        });

        it('should fail with empty cart', async () => {
            vi.mocked(getCartFromDB).mockResolvedValueOnce(null);

            const result = await executeRemoveFromCart(
                { product_name: 'X' },
                ctx
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('хоосон');
        });

        it('should fail without customer', async () => {
            const result = await executeRemoveFromCart(
                { product_name: 'X' },
                createMockContext({ customerId: undefined })
            );

            expect(result.success).toBe(false);
        });
    });
});
