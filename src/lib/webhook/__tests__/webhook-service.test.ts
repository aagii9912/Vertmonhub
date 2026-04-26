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
                notify_on_lead: null,
                notify_on_viewing: null,
                notify_on_contact: null,
                notify_on_support: null,
            };

            const settings = buildNotifySettings(shop);

            expect(settings).toEqual({
                lead: true,
                viewing: true,
                contact: true,
                support: true,
            });
        });

        it('should respect explicit false values', () => {
            const shop = {
                id: 'shop-1',
                name: 'Test Shop',
                facebook_page_id: '123',
                products: [],
                notify_on_lead: false,
                notify_on_viewing: true,
                notify_on_contact: false,
                notify_on_support: true,
            };

            const settings = buildNotifySettings(shop);

            expect(settings).toEqual({
                lead: false,
                viewing: true,
                contact: false,
                support: true,
            });
        });
    });

    describe('generateFallbackResponse', () => {
        const shopName = 'Test Shop';
        const properties = [
            { id: '1', name: 'Property A', price: 10000, stock: 5 },
            { id: '2', name: 'Property B', price: 20000, stock: 10 },
            { id: '3', name: 'Property C', price: 30000, stock: 0 },
        ];

        it('should generate greeting response', () => {
            const intent: IntentResult = {
                intent: 'GREETING',
                confidence: 0.9,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('Сайн байна уу');
            expect(response).toContain(shopName);
        });

        it('should list properties for product inquiry', () => {
            const intent: IntentResult = {
                intent: 'PRODUCT_INQUIRY',
                confidence: 0.85,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('Property A');
            expect(response).toContain('10,000₮');
        });

        it('should list properties for stock check', () => {
            const intent: IntentResult = {
                intent: 'STOCK_CHECK',
                confidence: 0.8,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('байрууд');
        });

        it('should generate price check response', () => {
            const intent: IntentResult = {
                intent: 'PRICE_CHECK',
                confidence: 0.9,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('үнийг');
        });

        it('should ask for contact info on viewing request', () => {
            const intent: IntentResult = {
                intent: 'ORDER_CREATE',
                confidence: 0.95,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('Байр үзэх');
        });

        it('should ask for phone on status check', () => {
            const intent: IntentResult = {
                intent: 'ORDER_STATUS',
                confidence: 0.88,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('утас');
        });

        it('should generate thank you response', () => {
            const intent: IntentResult = {
                intent: 'THANK_YOU',
                confidence: 0.92,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('Баярлалаа');
        });

        it('should generate complaint response', () => {
            const intent: IntentResult = {
                intent: 'COMPLAINT',
                confidence: 0.87,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('Уучлаарай');
        });

        it('should generate general chat fallback response', () => {
            const intent: IntentResult = {
                intent: 'GENERAL_CHAT',
                confidence: 0.5,
                entities: {},
            };

            const response = generateFallbackResponse(intent, shopName, properties);

            expect(response).toContain('алдаа');
        });

        it('should handle empty property list', () => {
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
