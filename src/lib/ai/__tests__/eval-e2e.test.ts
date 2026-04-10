/**
 * End-to-End AI Eval Tests
 * Tests real Gemini API responses (only runs when GEMINI_API_KEY is set)
 *
 * Run: GEMINI_API_KEY=xxx npx vitest run src/lib/ai/__tests__/eval-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { assertMongolian } from './eval-scorer';

const HAS_API_KEY = !!process.env.GEMINI_API_KEY;

// Conditional describe — skip all tests if no API key
const describeE2E = HAS_API_KEY ? describe : describe.skip;

describeE2E('End-to-End AI Eval', () => {
    // Import dynamically to avoid errors when API key is missing
    let routeToAI: any;

    beforeAll(async () => {
        const mod = await import('@/lib/ai/AIRouter');
        routeToAI = mod.routeToAI;
    });

    const baseContext = {
        shopName: 'ТестМарт',
        aiName: 'Тест AI',
        shopId: 'shop-eval-001',
        products: [
            {
                id: 'eval-prod-1',
                name: 'Тест бараа',
                price: 50000,
                stock: 10,
                description: 'Тест бараа тайлбар',
            },
        ],
        emotion: 'friendly' as const,
        subscription: { plan: 'pro', status: 'active' },
    };

    it('should respond in Mongolian', async () => {
        const response = await routeToAI(
            'Сайн байна уу, ямар бараанууд байгаа вэ?',
            baseContext,
            []
        );

        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(10);
        assertMongolian(response.text);
    }, 30000);

    it('should mention product when asked about price', async () => {
        const response = await routeToAI(
            'Тест бараа хэдтэй вэ?',
            baseContext,
            []
        );

        expect(response.text).toBeDefined();
        // Should reference either the product name or price
        const text = response.text.toLowerCase();
        expect(
            text.includes('тест бараа') || text.includes('50,000') || text.includes('50000')
        ).toBe(true);
    }, 30000);

    it('should handle greeting naturally', async () => {
        const response = await routeToAI(
            'Сайн байна уу!',
            baseContext,
            []
        );

        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(5);
        // Should not contain error messages
        expect(response.text.toLowerCase()).not.toContain('error');
    }, 30000);

    it('should include usage info', async () => {
        const response = await routeToAI(
            'Юу байна?',
            { ...baseContext, messageCount: 5 },
            []
        );

        expect(response.usage).toBeDefined();
        expect(response.usage?.plan).toBe('pro');
        expect(response.usage?.model).toBeDefined();
    }, 30000);
});
