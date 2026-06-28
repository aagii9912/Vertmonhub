/**
 * /api/properties/[id] — GET (нэг) / PATCH (засах) / DELETE (soft delete).
 * Тестлэх: shop-scoping, бичих/устгах эрх, валидаци, оршихуй, амжилт/алдаа.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextGet, nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireWrite: vi.fn(),
    requireDelete: vi.fn(),
    getUserShop: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireWrite: h.requireWrite,
    requireDelete: h.requireDelete,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { GET, PATCH, DELETE } from '@/app/api/properties/[id]/route';

const URL = 'http://localhost:3001/api/properties/pr-1';
const ctx = (id = 'pr-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    h.requireWrite.mockResolvedValue(null);
    h.requireDelete.mockResolvedValue(null);
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.adminClient = makeSupabaseMock({ properties: { data: { id: 'pr-1' }, error: null } });
});

describe('GET /api/properties/[id]', () => {
    it('shop байхгүй бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await GET(nextGet(URL), ctx());
        expect(res.status).toBe(401);
    });

    it('олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: null, error: { message: 'x' } } });
        const res = await GET(nextGet(URL), ctx());
        expect(res.status).toBe(404);
    });

    it('байрыг буцаана', async () => {
        const res = await GET(nextGet(URL), ctx());
        const body = await res.json();
        expect(body.property).toEqual({ id: 'pr-1' });
    });
});

describe('PATCH /api/properties/[id]', () => {
    it('бичих эрхгүй бол denied', async () => {
        h.requireWrite.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await PATCH(nextPost(URL, { price: 200 }), ctx());
        expect(res.status).toBe(403);
    });

    it('буруу body (price тоо биш) → 400', async () => {
        const res = await PATCH(nextPost(URL, { price: 'abc' }), ctx());
        expect(res.status).toBe(400);
    });

    it('олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: null } });
        const res = await PATCH(nextPost(URL, { price: 200 }), ctx());
        expect(res.status).toBe(404);
    });

    it('амжилттай шинэчилнэ', async () => {
        const res = await PATCH(nextPost(URL, { price: 200 }), ctx());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.property).toEqual({ id: 'pr-1' });
    });

    it('update алдаа → 500', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: { id: 'pr-1' }, error: { message: 'boom' } } });
        const res = await PATCH(nextPost(URL, { price: 200 }), ctx());
        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/properties/[id]', () => {
    it('устгах эрхгүй бол denied', async () => {
        h.requireDelete.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await DELETE(nextGet(URL), ctx());
        expect(res.status).toBe(403);
    });

    it('олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: null } });
        const res = await DELETE(nextGet(URL), ctx());
        expect(res.status).toBe(404);
    });

    it('амжилттай soft delete', async () => {
        const res = await DELETE(nextGet(URL), ctx());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.message).toBe('Property deleted');
    });

    it('update алдаа → 500', async () => {
        h.adminClient = makeSupabaseMock({ properties: { data: { id: 'pr-1' }, error: { message: 'boom' } } });
        const res = await DELETE(nextGet(URL), ctx());
        expect(res.status).toBe(500);
    });
});
