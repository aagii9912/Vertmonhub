/**
 * Shop API Route Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth module
const mockGetClerkUser = vi.fn();
const mockSupabaseAdmin = vi.fn();

vi.mock('@/lib/auth/auth', () => ({
    getAuthUser: () => mockGetClerkUser(),
    supabaseAdmin: () => mockSupabaseAdmin(),
}));

vi.mock('@/lib/ai/AIRouter', () => ({
    getPlanTypeFromSubscription: ({ plan }: { plan: string }) => {
        if (plan === 'enterprise') return 'enterprise';
        if (plan === 'pro') return 'pro';
        return 'starter';
    },
}));

vi.mock('@/lib/ai/config/plans', () => ({
    checkShopLimit: (plan: string, count: number) => {
        const limits: Record<string, number> = { starter: 1, pro: 3, enterprise: 10 };
        const limit = limits[plan] || 1;
        return { allowed: count < limit, limit };
    },
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock NextResponse
vi.mock('next/server', async () => {
    const actual = await vi.importActual('next/server');
    return {
        ...actual,
        NextResponse: {
            json: (body: unknown, init?: { status?: number }) => ({
                body,
                status: init?.status || 200,
                async json() { return body; },
            }),
        },
    };
});

import { GET, POST, PATCH } from '@/app/api/shop/route';

// Helper to create NextRequest
function createRequest(method: string, body?: unknown, headers?: Record<string, string>) {
    const url = 'http://localhost:3000/api/shop';
    const init: any = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) {
        init.body = JSON.stringify(body);
    }
    return new NextRequest(url, init);
}

// Mock Supabase chain builder
function createMockChain(data: unknown = null, error: unknown = null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data, error });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data, error });
    return chain;
}

describe('Shop API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/shop', () => {
        it('returns 401 when not authenticated', async () => {
            mockGetClerkUser.mockResolvedValue(null);

            const request = createRequest('GET');
            const response = await GET(request);

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.error).toBe('Unauthorized');
        });

        it('returns shop data when authenticated', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const mockShop = { id: 'shop-1', name: 'My Shop', is_active: true };
            const chain = createMockChain(mockShop);
            mockSupabaseAdmin.mockReturnValue({ from: () => chain });

            const request = createRequest('GET');
            const response = await GET(request);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.shop).toEqual(mockShop);
        });

        it('returns null shop when no shop exists', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const chain = createMockChain(null);
            mockSupabaseAdmin.mockReturnValue({ from: () => chain });

            const request = createRequest('GET');
            const response = await GET(request);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.shop).toBeNull();
        });

        it('filters by x-shop-id header when provided', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const chain = createMockChain({ id: 'shop-specific', name: 'Specific Shop' });
            mockSupabaseAdmin.mockReturnValue({ from: () => chain });

            const request = createRequest('GET', undefined, { 'x-shop-id': 'shop-specific' });
            const response = await GET(request);

            expect(response.status).toBe(200);
            expect(chain.eq).toHaveBeenCalledWith('id', 'shop-specific');
        });
    });

    describe('POST /api/shop', () => {
        it('returns 401 when not authenticated', async () => {
            mockGetClerkUser.mockResolvedValue(null);

            const request = createRequest('POST', { name: 'Shop' });
            const response = await POST(request);

            expect(response.status).toBe(401);
        });

        it('returns 400 when name is missing', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');

            const request = createRequest('POST', {});
            const response = await POST(request);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error).toBe('Shop name required');
        });

        it('updates existing shop when found (not forceCreate)', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const existingShop = { id: 'shop-1', name: 'Old Name', owner_name: 'Old Owner' };
            const updatedShop = { id: 'shop-1', name: 'New Name', owner_name: 'New Owner' };

            // First call: check existing → returns shop
            // Second call: update → returns updated shop
            const selectChain = createMockChain(existingShop);
            const updateChain = createMockChain(updatedShop);

            let callCount = 0;
            mockSupabaseAdmin.mockReturnValue({
                from: () => {
                    callCount++;
                    return callCount === 1 ? selectChain : updateChain;
                },
            });

            const request = createRequest('POST', { name: 'New Name', owner_name: 'New Owner' });
            const response = await POST(request);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.shop).toEqual(updatedShop);
        });
    });

    describe('PATCH /api/shop', () => {
        it('returns 401 when not authenticated', async () => {
            mockGetClerkUser.mockResolvedValue(null);

            const request = createRequest('PATCH', { name: 'Updated' });
            const response = await PATCH(request);

            expect(response.status).toBe(401);
        });

        it('returns 404 when shop not found', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const chain = createMockChain(null);
            mockSupabaseAdmin.mockReturnValue({ from: () => chain });

            const request = createRequest('PATCH', { name: 'Updated' });
            const response = await PATCH(request);

            expect(response.status).toBe(404);
            const body = await response.json();
            expect(body.error).toBe('Shop not found');
        });

        it('returns 400 when no valid fields provided', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const shop = { id: 'shop-1' };
            const chain = createMockChain(shop);
            mockSupabaseAdmin.mockReturnValue({ from: () => chain });

            const request = createRequest('PATCH', { invalid_field: 'value' });
            const response = await PATCH(request);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error).toBe('No valid fields to update');
        });

        it('sanitizes input fields (SEC-5)', async () => {
            mockGetClerkUser.mockResolvedValue('user-123');
            const shop = { id: 'shop-1' };
            const updatedShop = { id: 'shop-1', name: 'Updated' };

            const selectChain = createMockChain(shop);
            const updateChain = createMockChain(updatedShop);

            let callCount = 0;
            mockSupabaseAdmin.mockReturnValue({
                from: () => {
                    callCount++;
                    return callCount === 1 ? selectChain : updateChain;
                },
            });

            // Try to inject disallowed fields
            const request = createRequest('PATCH', {
                name: 'Updated',
                user_id: 'hacked-user', // should be filtered out
                subscription_plan: 'enterprise', // should be filtered out
            });
            const response = await PATCH(request);

            expect(response.status).toBe(200);
            // The update chain should only include "name", not user_id or subscription_plan
            expect(updateChain.update).toHaveBeenCalledWith({ name: 'Updated' });
        });
    });
});
