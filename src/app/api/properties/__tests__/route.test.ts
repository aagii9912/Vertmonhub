/**
 * /api/properties — GET (жагсаалт) + POST (үүсгэх).
 * Тестлэх: shop-scoping, бичих эрх, Zod валидаци, амжилт/алдааны зам.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextGet, nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireWrite: vi.fn(),
    getUserShop: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireWrite: h.requireWrite }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { GET, POST } from '@/app/api/properties/route';

const URL = 'http://localhost:3001/api/properties';

beforeEach(() => {
    vi.clearAllMocks();
    h.requireWrite.mockResolvedValue(null);
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.adminClient = makeSupabaseMock({ properties: { data: [], error: null } });
});

describe('GET /api/properties', () => {
    it('shop байхгүй бол хоосон жагсаалт', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await GET(nextGet(URL));
        const body = await res.json();
        expect(body.properties).toEqual([]);
    });

    it('байрны жагсаалтыг буцаана', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: [{ id: 'pr-1' }], error: null } });
        const res = await GET(nextGet(URL));
        const body = await res.json();
        expect(body.properties).toEqual([{ id: 'pr-1' }]);
    });

    it('query алдаа → 500', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: null, error: { message: 'boom' } } });
        const res = await GET(nextGet(URL));
        expect(res.status).toBe(500);
    });
});

describe('POST /api/properties', () => {
    it('бичих эрхгүй бол denied', async () => {
        h.requireWrite.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await POST(nextPost(URL, { name: 'A', type: 'apartment', price: 100 }));
        expect(res.status).toBe(403);
        expect(h.getUserShop).not.toHaveBeenCalled();
    });

    it('shop байхгүй бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await POST(nextPost(URL, { name: 'A', type: 'apartment', price: 100 }));
        expect(res.status).toBe(401);
    });

    it('буруу body (type дутуу) → 400', async () => {
        const res = await POST(nextPost(URL, { name: 'A', price: 100 }));
        expect(res.status).toBe(400);
    });

    it('амжилттай үүсгээд 201', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: { id: 'pr-1' }, error: null } });
        const res = await POST(nextPost(URL, { name: 'A', type: 'apartment', price: 100 }));
        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.property).toEqual({ id: 'pr-1' });
    });

    it('insert алдаа → 500', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: null, error: { message: 'boom' } } });
        const res = await POST(nextPost(URL, { name: 'A', type: 'apartment', price: 100 }));
        expect(res.status).toBe(500);
    });
});
