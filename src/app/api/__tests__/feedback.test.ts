/**
 * Feedback API Route Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth module
const mockGetAuthUser = vi.fn();
const mockSupabaseAdmin = vi.fn();

vi.mock('@/lib/auth/auth', () => ({
    getAuthUser: () => mockGetAuthUser(),
    supabaseAdmin: () => mockSupabaseAdmin(),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
            body,
            status: init?.status || 200,
            async json() { return body; },
        }),
    },
}));

import { POST } from '@/app/api/feedback/route';

// Helper to create a Request
function createFeedbackRequest(body: unknown) {
    return new Request('http://localhost:3000/api/feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-agent': 'test-agent',
            'referer': 'http://localhost:3000/dashboard',
        },
        body: JSON.stringify(body),
    });
}

function createMockChain(data: unknown = null, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data, error });
    return chain;
}

describe('Feedback API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 400 when message is empty', async () => {
        const request = createFeedbackRequest({ type: 'bug' });
        const response = await POST(request);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Message is required');
    });

    it('saves feedback successfully for anonymous users', async () => {
        mockGetAuthUser.mockResolvedValue(null);
        const insertChain = createMockChain(null, null);
        mockSupabaseAdmin.mockReturnValue({ from: () => insertChain });

        const request = createFeedbackRequest({
            type: 'suggestion',
            message: 'Add dark mode',
            email: 'test@example.com',
        });
        const response = await POST(request);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
    });

    it('includes shop info when user is authenticated', async () => {
        mockGetAuthUser.mockResolvedValue('user-123');
        const shopData = { id: 'shop-1', name: 'My Shop' };

        // First from() call: shops select → returns shop
        // Second from() call: feedback insert → returns null
        const selectChain = createMockChain(shopData);
        const insertChain = createMockChain(null, null);

        let callCount = 0;
        mockSupabaseAdmin.mockReturnValue({
            from: (table: string) => {
                callCount++;
                return table === 'shops' ? selectChain : insertChain;
            },
        });

        const request = createFeedbackRequest({
            type: 'bug',
            message: 'Button does not work',
        });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(insertChain.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'bug',
                message: 'Button does not work',
                shop_id: 'shop-1',
                metadata: expect.objectContaining({
                    shop_name: 'My Shop',
                }),
            })
        );
    });

    it('succeeds even if feedback table does not exist', async () => {
        mockGetAuthUser.mockResolvedValue(null);
        const insertChain = createMockChain(null, { message: 'relation does not exist' });
        mockSupabaseAdmin.mockReturnValue({ from: () => insertChain });

        const request = createFeedbackRequest({
            type: 'feature',
            message: 'Please add export',
        });
        const response = await POST(request);

        // Should still return success
        expect(response.status).toBe(200);
    });

    it('handles email as optional', async () => {
        mockGetAuthUser.mockResolvedValue(null);
        const insertChain = createMockChain(null, null);
        mockSupabaseAdmin.mockReturnValue({ from: () => insertChain });

        const request = createFeedbackRequest({
            type: 'bug',
            message: 'Something broke',
        });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(insertChain.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                email: null,
            })
        );
    });
});
