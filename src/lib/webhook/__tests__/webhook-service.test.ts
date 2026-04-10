/**
 * WebhookService Unit Tests
 * Tests for webhook message processing logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    buildNotifySettings,
    generateFallbackResponse,
} from '@/lib/webhook/WebhookService';
import type { IntentResult } from '@/lib/ai/intent-detector';

// Mock Supabase
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
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
                })),
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
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

describe('WebhookService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('buildNotifySettings', () => {
        it('should return default settings when all are null', () => {
            const shop = {
                id: 'shop-1',
                name: 'Test Shop',
                facebook_page_id: '123',
                products: [],
                notify_on_order: null,
                notify_on_contact: null,
                notify_on_support: null,
                notify_on_cancel: null,
            };

            const settings = buildNotifySettings(shop);

            expect(settings).toEqual({
                order: true,
                contact: true,
                support: true,
                cancel: true,
            });
        });

        it('should respect explicit false values', () => {
            const shop = {
                id: 'shop-1',
                name: 'Test Shop',
                facebook_page_id: '123',
                products: [],
                notify_on_order: false,
                notify_on_contact: true,
                notify_on_support: false,
                notify_on_cancel: true,
            };

            const settings = buildNotifySettings(shop);

            expect(settings).toEqual({
                order: false,
                contact: true,
                support: false,
                cancel: true,
            });
        });
    });

    describe('generateFallbackResponse', () => {
        const shopName = 'Test Shop';
        const products = [
            { id: '1', name: 'Product A', price: 10000, stock: 5 },
            { id: '2', name: 'Product B', price: 20000, stock: 10 },
            { id: '3', name: 'Product C', price: 30000, stock: 0 },
        ];

        it('should generate greeting response', () => {
            const intent: IntentResult = {
                intent: 'GREETING',
                confidence: 0.9,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Сайн байна уу');
            expect(response).toContain(shopName);
        });

        it('should generate product inquiry response with product list', () => {
            const intent: IntentResult = {
                intent: 'PRODUCT_INQUIRY',
                confidence: 0.85,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Product A');
            expect(response).toContain('10,000₮');
        });

        it('should generate stock check response', () => {
            const intent: IntentResult = {
                intent: 'STOCK_CHECK',
                confidence: 0.8,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('бүтээгдэхүүн');
        });

        it('should generate price check response', () => {
            const intent: IntentResult = {
                intent: 'PRICE_CHECK',
                confidence: 0.9,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('үнийг');
        });

        it('should generate order create response', () => {
            const intent: IntentResult = {
                intent: 'ORDER_CREATE',
                confidence: 0.95,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Захиалга');
        });

        it('should generate order status response', () => {
            const intent: IntentResult = {
                intent: 'ORDER_STATUS',
                confidence: 0.88,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Захиалгын дугаар');
        });

        it('should generate thank you response', () => {
            const intent: IntentResult = {
                intent: 'THANK_YOU',
                confidence: 0.92,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Баярлалаа');
        });

        it('should generate complaint response', () => {
            const intent: IntentResult = {
                intent: 'COMPLAINT',
                confidence: 0.87,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('Уучлаарай');
        });

        it('should generate general chat fallback response', () => {
            const intent: IntentResult = {
                intent: 'GENERAL_CHAT',
                confidence: 0.5,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, products);

            expect(response).toContain('алдаа');
        });

        it('should handle empty product list', () => {
            const intent: IntentResult = {
                intent: 'PRODUCT_INQUIRY',
                confidence: 0.85,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, []);

            expect(response).toContain('удахгүй');
        });
    });
});
