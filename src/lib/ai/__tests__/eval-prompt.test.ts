/**
 * Prompt Quality Eval Tests
 * Tests: buildSystemPrompt output quality
 */

import { describe, it, expect, vi } from 'vitest';

// Mock memory module
vi.mock('@/lib/ai/tools/memory', () => ({
    formatMemoryForPrompt: vi.fn().mockReturnValue(''),
}));

import { buildSystemPrompt } from '@/lib/ai/services/PromptService';
import type { ChatContext } from '@/types/ai';

function createTestContext(overrides?: Partial<ChatContext>): ChatContext {
    return {
        shopName: 'ТехноМарт',
        aiName: 'Сүнс',
        shopId: 'shop-001',
        products: [
            {
                id: 'p1',
                name: 'iPhone 15 Pro',
                price: 4500000,
                stock: 5,
                reserved_stock: 0,
                description: '256GB, Natural Titanium',
                image_url: 'https://example.com/iphone.jpg',
            },
            {
                id: 'p2',
                name: 'AirPods Pro',
                price: 850000,
                stock: 20,
                reserved_stock: 0,
                description: 'Active Noise Cancellation',
            },
        ] as any,
        aiEmotion: 'friendly',
        ...overrides,
    } as ChatContext;
}

describe('Prompt Quality Eval', () => {
    // ─── Product Context ─────────────────────────────────────────
    describe('Product context in prompt', () => {
        it('should include product names', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt).toContain('iPhone 15 Pro');
            expect(prompt).toContain('AirPods Pro');
        });

        it('should include prices', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt).toContain('4,500,000');
        });

        it('should include stock info', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt.toLowerCase()).toMatch(/stock|үлдэгдэл|ширхэг|байна/);
        });
    });

    // ─── Shop Identity ───────────────────────────────────────────
    describe('Shop identity', () => {
        it('should include shop name', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt).toContain('ТехноМарт');
        });
    });

    // ─── Emotion Modes ───────────────────────────────────────────
    describe('Emotion-based prompting', () => {
        it('should have different instructions for friendly vs calm', () => {
            const friendlyPrompt = buildSystemPrompt(createTestContext({ aiEmotion: 'friendly' }));
            const calmPrompt = buildSystemPrompt(createTestContext({ aiEmotion: 'calm' }));

            expect(friendlyPrompt).not.toBe(calmPrompt);
        });

        it('should have different instructions for enthusiastic', () => {
            const friendlyPrompt = buildSystemPrompt(createTestContext({ aiEmotion: 'friendly' }));
            const enthusiasticPrompt = buildSystemPrompt(createTestContext({ aiEmotion: 'enthusiastic' }));

            expect(friendlyPrompt).not.toBe(enthusiasticPrompt);
        });
    });

    // ─── Custom Knowledge ────────────────────────────────────────
    describe('Custom knowledge', () => {
        it('should include custom knowledge when provided', () => {
            const prompt = buildSystemPrompt(createTestContext({
                customKnowledge: {
                    warranty: '2 жилийн баталгаат хугацаа',
                    delivery: 'УБ хот дотор 24 цагт хүргэнэ',
                },
            }));

            expect(prompt).toContain('баталгаат');
            expect(prompt).toContain('хүргэнэ');
        });

        it('should work without custom knowledge', () => {
            const prompt = buildSystemPrompt(createTestContext({ customKnowledge: undefined }));

            expect(prompt.length).toBeGreaterThan(100);
        });
    });

    // ─── Cart Context ────────────────────────────────────────────
    describe('Active cart context', () => {
        it('should include active cart when present', () => {
            const prompt = buildSystemPrompt(createTestContext({
                activeCart: {
                    id: 'cart-1',
                    items: [
                        { id: 'ci-1', product_id: 'p1', name: 'iPhone 15 Pro', quantity: 1, unit_price: 4500000, variant_specs: {} },
                    ],
                    total_amount: 4500000,
                },
            }));

            expect(prompt).toContain('iPhone 15 Pro');
            expect(prompt.toLowerCase()).toMatch(/сагс/);
        });
    });

    // ─── FAQs ────────────────────────────────────────────────────
    describe('FAQ integration', () => {
        it('should include FAQs when provided', () => {
            const prompt = buildSystemPrompt(createTestContext({
                faqs: [
                    { question: 'Хүргэлт хэд хоногт вэ?', answer: '1-2 хоногт' },
                    { question: 'Буцаалт хийж болох уу?', answer: '7 хоногийн дотор' },
                ],
            }));

            expect(prompt).toContain('Хүргэлт');
            expect(prompt).toContain('Буцаалт');
        });
    });

    // ─── Plan Features ──────────────────────────────────────────
    describe('Plan features in prompt', () => {
        it('should reference memory when enabled', () => {
            const prompt = buildSystemPrompt(createTestContext({
                planFeatures: {
                    ai_model: 'gemini-3.1-flash-lite-preview',
                    sales_intelligence: true,
                    ai_memory: true,
                    max_tokens: 800,
                },
            }));

            expect(prompt.length).toBeGreaterThan(100);
        });
    });

    // ─── Prompt Quality ──────────────────────────────────────────
    describe('Overall quality', () => {
        it('should contain Mongolian instructions', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt).toMatch(/[\u0410-\u044F\u04E8\u04E9\u04AE\u04AF]/);
        });

        it('should be reasonable length', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt.length).toBeGreaterThan(500);
            expect(prompt.length).toBeLessThan(20000);
        });

        it('should not contain undefined or null', () => {
            const prompt = buildSystemPrompt(createTestContext());

            expect(prompt).not.toContain('undefined');
            expect(prompt).not.toContain('null');
        });
    });
});
