import { describe, it, expect } from 'vitest';
import {
    buildProductsInfo,
    buildCustomInstructions,
    buildDynamicKnowledge,
    buildPoliciesInfo,
    buildCartContext,
    buildFAQSection,
    buildSloganSection,
    buildSystemPrompt,
} from '../services/PromptService';
import type { ChatContext } from '@/types/ai';

describe('PromptService', () => {
    describe('buildProductsInfo', () => {
        it('returns empty message for no products', () => {
            const result = buildProductsInfo([]);
            expect(result).toContain('бүртгэгдээгүй');
        });

        it('formats physical product correctly', () => {
            const products = [{
                id: '1',
                name: 'Test Product',
                price: 50000,
                stock: 10,
                type: 'product' as const,
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('[БАРАА]');
            expect(result).toContain('Test Product');
            expect(result).toContain('50,000₮');
            expect(result).toContain('10');
        });

        it('formats service correctly', () => {
            const products = [{
                id: '1',
                name: 'Haircut',
                price: 20000,
                stock: 5,
                type: 'service' as const,
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('[ҮЙЛЧИЛГЭЭ]');
            expect(result).toContain('Haircut');
        });

        it('shows discount price correctly', () => {
            const products = [{
                id: '1',
                name: 'Sale Item',
                price: 100000,
                stock: 5,
                discount_percent: 20,
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('🔥');
            expect(result).toContain('80,000₮');
            expect(result).toContain('-20%');
            expect(result).toContain('ХЯМДРАЛ');
        });

        it('shows out of stock status', () => {
            const products = [{
                id: '1',
                name: 'Empty Item',
                price: 50000,
                stock: 0,
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('Дууссан');
        });

        it('calculates available stock with reserved', () => {
            const products = [{
                id: '1',
                name: 'Reserved Item',
                price: 50000,
                stock: 10,
                reserved_stock: 7,
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('3'); // 10 - 7 = 3 available
        });

        it('includes variants info', () => {
            const products = [{
                id: '1',
                name: 'Shirt',
                price: 50000,
                stock: 10,
                variants: [
                    { color: 'Хар', size: 'M', stock: 5 },
                    { color: 'Цагаан', size: 'L', stock: 3 },
                ],
            }];
            const result = buildProductsInfo(products);
            expect(result).toContain('Хувилбарууд');
            expect(result).toContain('Хар');
            expect(result).toContain('Цагаан');
        });
    });

    describe('buildCustomInstructions', () => {
        it('returns empty for no instructions', () => {
            expect(buildCustomInstructions()).toBe('');
            expect(buildCustomInstructions('')).toBe('');
        });

        it('formats instructions correctly', () => {
            const result = buildCustomInstructions('Be very friendly');
            expect(result).toContain('ДЭЛГҮҮРИЙН ЭЗНИЙ ЗААВАР');
            expect(result).toContain('Be very friendly');
        });
    });

    describe('buildDynamicKnowledge', () => {
        it('returns empty for no knowledge', () => {
            expect(buildDynamicKnowledge()).toBe('');
            expect(buildDynamicKnowledge({})).toBe('');
        });

        it('formats knowledge correctly', () => {
            const knowledge = {
                'Ажлын цаг': '09:00-18:00',
                'Утас': '99001122',
            };
            const result = buildDynamicKnowledge(knowledge);
            expect(result).toContain('ТУСГАЙ МЭДЭЭЛЭЛ');
            expect(result).toContain('Ажлын цаг');
            expect(result).toContain('09:00-18:00');
        });
    });

    describe('buildPoliciesInfo', () => {
        it('returns empty for no policies', () => {
            expect(buildPoliciesInfo()).toBe('');
        });

        it('formats policies correctly', () => {
            const policies = {
                shipping_threshold: 50000,
                payment_methods: ['Cash', 'QPay'],
                delivery_areas: ['UB', 'Darkhan'],
            };
            const result = buildPoliciesInfo(policies);
            expect(result).toContain('БОДЛОГО');
            expect(result).toContain('50,000');
            expect(result).toContain('Cash, QPay');
            expect(result).toContain('UB, Darkhan');
        });
    });

    describe('buildCartContext', () => {
        it('shows empty cart message', () => {
            const result = buildCartContext();
            expect(result).toContain('Хоосон');
        });

        it('formats cart items correctly', () => {
            const cart = {
                id: 'cart1',
                items: [
                    { id: '1', product_id: 'p1', name: 'Product A', variant_specs: {}, quantity: 2, unit_price: 10000 },
                ],
                total_amount: 20000,
            };
            const result = buildCartContext(cart, 50000);
            expect(result).toContain('Product A');
            expect(result).toContain('x2');
            expect(result).toContain('20,000₮');
        });

        it('shows free shipping eligibility', () => {
            const cart = {
                id: 'cart1',
                items: [{ id: '1', product_id: 'p1', name: 'Expensive', variant_specs: {}, quantity: 1, unit_price: 100000 }],
                total_amount: 100000,
            };
            const result = buildCartContext(cart, 50000);
            expect(result).toContain('✅');
            expect(result).toContain('үнэгүй');
        });
    });

    describe('buildFAQSection', () => {
        it('returns empty for no FAQs', () => {
            expect(buildFAQSection()).toBe('');
            expect(buildFAQSection([])).toBe('');
        });

        it('formats FAQs correctly', () => {
            const faqs = [
                { question: 'How to order?', answer: 'Just message us' },
            ];
            const result = buildFAQSection(faqs);
            expect(result).toContain('FAQ');
            expect(result).toContain('Q: How to order?');
            expect(result).toContain('A: Just message us');
        });
    });

    describe('buildSloganSection', () => {
        it('returns empty for no slogans', () => {
            expect(buildSloganSection()).toBe('');
            expect(buildSloganSection([])).toBe('');
        });

        it('formats slogan correctly', () => {
            const slogans = [{ slogan: 'Best prices!', usage_context: 'greeting' }];
            const result = buildSloganSection(slogans);
            expect(result).toContain('БРЭНД ХЭЛЛЭГ');
            expect(result).toContain('Best prices!');
        });
    });

    describe('buildSystemPrompt', () => {
        it('builds complete system prompt', () => {
            const context: ChatContext = {
                shopId: 'shop1',
                shopName: 'Test Shop',
                products: [],
            };
            const result = buildSystemPrompt(context);

            expect(result).toContain('Test Shop');
            expect(result).toContain('борлуулалтын мэргэжилтэн');
            expect(result).toContain('ЧУХАЛ ДҮРЭМ');
            expect(result).toContain('ХЯЗГААРЛАЛТ');
        });

        it('includes customer info when provided', () => {
            const context: ChatContext = {
                shopId: 'shop1',
                shopName: 'Test Shop',
                products: [],
                customerName: 'Bat',
                orderHistory: 5,
            };
            const result = buildSystemPrompt(context);

            expect(result).toContain('Bat');
            // Customer info format matches PromptService output
            expect(result).toContain('ХЭРЭГЛЭГЧ: Bat');
        });

        it('applies emotion style', () => {
            const context: ChatContext = {
                shopId: 'shop1',
                shopName: 'Test Shop',
                products: [],
                aiEmotion: 'enthusiastic',
            };
            const result = buildSystemPrompt(context);

            expect(result).toContain('урам зоригтой');
        });
    });
});
