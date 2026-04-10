/**
 * ToolExecutor Unit Tests
 * Tests for AI tool execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    executeShowProductImage,
    ToolExecutionContext,
} from '@/lib/ai/services/ToolExecutor';

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    })),
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            insert: vi.fn(() => Promise.resolve({ error: null })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
            rpc: vi.fn(() => Promise.resolve({ data: 'cart-id', error: null })),
        })),
        rpc: vi.fn(() => Promise.resolve({ data: 100000, error: null })),
    })),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@/lib/notifications', () => ({
    sendOrderNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
    sendPushNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
}));

describe('ToolExecutor', () => {
    const mockContext: ToolExecutionContext = {
        shopId: 'shop-123',
        customerId: 'customer-456',
        customerName: 'Test Customer',
        products: [
            {
                id: 'prod-1',
                name: 'Test Product',
                price: 50000,
                stock: 10,
                description: 'A test product',
                image_url: 'https://example.com/image.jpg',
            },
            {
                id: 'prod-2',
                name: 'Another Product',
                price: 30000,
                stock: 5,
                image_url: 'https://example.com/image2.jpg',
            },
            {
                id: 'prod-3',
                name: 'No Image Product',
                price: 20000,
                stock: 8,
            },
        ],
        notifySettings: {
            order: true,
            contact: true,
            support: true,
            cancel: true,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('executeShowProductImage', () => {
        it('should return matched products with images', () => {
            const result = executeShowProductImage(
                { product_names: ['Test Product'], mode: 'single' },
                mockContext
            );

            expect(result.success).toBe(true);
            expect(result.imageAction).toBeDefined();
            expect(result.imageAction?.products).toHaveLength(1);
            expect(result.imageAction?.products[0].name).toBe('Test Product');
            expect(result.imageAction?.type).toBe('single');
        });

        it('should return multiple products for gallery mode', () => {
            const result = executeShowProductImage(
                { product_names: ['Test Product', 'Another Product'], mode: 'confirm' },
                mockContext
            );

            expect(result.success).toBe(true);
            expect(result.imageAction?.products).toHaveLength(2);
            expect(result.imageAction?.type).toBe('confirm');
        });

        it('should use placeholder for products without images', () => {
            const result = executeShowProductImage(
                { product_names: ['No Image Product'], mode: 'single' },
                mockContext
            );

            // Now uses placeholder fallback instead of error
            expect(result.success).toBe(true);
            expect(result.imageAction?.products[0].imageUrl).toContain('placehold');
        });

        it('should handle partial name matching', () => {
            const result = executeShowProductImage(
                { product_names: ['Test'], mode: 'single' },
                mockContext
            );

            expect(result.success).toBe(true);
            expect(result.imageAction?.products).toHaveLength(1);
        });

        it('should return error for non-existent products', () => {
            const result = executeShowProductImage(
                { product_names: ['Nonexistent Product'], mode: 'single' },
                mockContext
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should include price and description in result', () => {
            const result = executeShowProductImage(
                { product_names: ['Test Product'], mode: 'single' },
                mockContext
            );

            expect(result.imageAction?.products[0].price).toBe(50000);
            expect(result.imageAction?.products[0].description).toBe('A test product');
        });
    });
});
