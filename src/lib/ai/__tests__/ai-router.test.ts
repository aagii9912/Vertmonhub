/**
 * AIRouter critical-path tests
 * Gemini-г mock хийж токен авах, tool гүйцэтгэх, алдааны замыг шалгана.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gemini chat.sendMessage-ийг тест бүрт удирдах mock
const sendMessageMock = vi.fn();
const startChatMock = vi.fn(() => ({ sendMessage: sendMessageMock }));

vi.mock('@google/generative-ai', () => ({
    // `new GoogleGenerativeAI(...)`-аар дуудагддаг тул class байх ёстой
    GoogleGenerativeAI: class {
        getGenerativeModel() {
            return { startChat: startChatMock };
        }
    },
    SchemaType: {},
}));

// Tool гүйцэтгэлийг хянах mock
const executeToolMock = vi.fn();
vi.mock('@/lib/ai/services/ToolExecutor', () => ({
    executeTool: (...args: unknown[]) => executeToolMock(...args),
}));

vi.mock('@/lib/ai/services/PromptService', () => ({
    buildSystemPrompt: vi.fn(() => 'SYSTEM PROMPT'),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { routeToAI } from '@/lib/ai/AIRouter';
import type { RouterChatContext } from '@/lib/ai/AIRouter';

const baseContext: RouterChatContext = {
    shopId: 'shop-1',
    customerId: 'cust-1',
    shopName: 'Тест Хотхон',
    properties: [],
};

function geminiResponse(opts: { text?: string; functionCalls?: unknown[]; totalTokens?: number }) {
    return {
        response: {
            functionCalls: () => opts.functionCalls,
            text: () => opts.text ?? '',
            usageMetadata: { totalTokenCount: opts.totalTokens ?? 0 },
        },
    };
}

describe('routeToAI', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the Gemini text and captures token usage', async () => {
        sendMessageMock.mockResolvedValueOnce(geminiResponse({ text: 'Сайн байна уу!', totalTokens: 120 }));

        const res = await routeToAI('сайн уу', baseContext);

        expect(res.text).toBe('Сайн байна уу!');
        expect(res.usage?.tokensUsed).toBe(120);
        expect(executeToolMock).not.toHaveBeenCalled();
    });

    it('executes tool calls and sums tokens across both turns', async () => {
        // 1-р дуудлага: tool call буцаана
        sendMessageMock.mockResolvedValueOnce(geminiResponse({
            functionCalls: [{ name: 'calculate_loan', args: { amount: 100000000, years: 15 } }],
            totalTokens: 80,
        }));
        // 2-р дуудлага (synthesis): эцсийн текст
        sendMessageMock.mockResolvedValueOnce(geminiResponse({
            text: 'Сарын төлбөр 1.2 сая₮',
            totalTokens: 60,
        }));

        executeToolMock.mockResolvedValueOnce({ success: true, message: 'тооцоолов', data: { monthly_payment: 1200000 } });

        const res = await routeToAI('зээл тооцоолоod', baseContext);

        expect(executeToolMock).toHaveBeenCalledTimes(1);
        expect(executeToolMock).toHaveBeenCalledWith('calculate_loan', { amount: 100000000, years: 15 }, expect.any(Object));
        expect(res.text).toBe('Сарын төлбөр 1.2 сая₮');
        expect(res.usage?.tokensUsed).toBe(140); // 80 + 60
        expect(sendMessageMock).toHaveBeenCalledTimes(2);
    });

    it('propagates tool results back to Gemini for synthesis', async () => {
        sendMessageMock.mockResolvedValueOnce(geminiResponse({
            functionCalls: [{ name: 'search_properties', args: { rooms: 2 } }],
        }));
        sendMessageMock.mockResolvedValueOnce(geminiResponse({ text: '3 байр оллоо' }));
        executeToolMock.mockResolvedValueOnce({ success: true, message: 'found', data: { count: 3 } });

        const res = await routeToAI('2 өрөө байр', baseContext);

        // synthesis дуудлага functionResponse дамжуулсан эсэх
        const secondCallArg = sendMessageMock.mock.calls[1][0];
        expect(Array.isArray(secondCallArg)).toBe(true);
        expect(secondCallArg[0]).toHaveProperty('functionResponse');
        expect(res.text).toBe('3 байр оллоо');
    });

    it('rethrows when Gemini fails', async () => {
        sendMessageMock.mockRejectedValue(new Error('Gemini down'));
        await expect(routeToAI('сайн уу', baseContext)).rejects.toThrow('Gemini down');
    });
});
