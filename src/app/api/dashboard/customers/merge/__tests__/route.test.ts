/**
 * POST /api/dashboard/customers/merge — давхардсан хоёр харилцагчийг нэгтгэх.
 * Эргэшгүй (delete) үйлдэл тул бичих эрх, shop-scoping, валидаци, оршихуй, алдааны зам шалгана.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireWrite: vi.fn(),
    getUserShop: vi.fn(),
    recomputeCustomerScore: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireWrite: h.requireWrite }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: h.recomputeCustomerScore }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { POST } from '@/app/api/dashboard/customers/merge/route';

const URL = 'http://localhost:3001/api/dashboard/customers/merge';
const PRIMARY = '11111111-1111-4111-8111-111111111111';
const DUP = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
    vi.clearAllMocks();
    h.requireWrite.mockResolvedValue(null); // default: бичих эрхтэй
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.recomputeCustomerScore.mockResolvedValue(undefined);
    h.adminClient = makeSupabaseMock({
        customers: {
            data: [
                { id: PRIMARY, name: 'Болд', tags: ['a'], message_count: 2 },
                { id: DUP, name: '', tags: ['b'], message_count: 3 },
            ],
            error: null,
        },
    });
});

describe('POST customers/merge', () => {
    it('бичих эрхгүй бол denied хариуг шууд буцаана', async () => {
        h.requireWrite.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: DUP }));
        expect(res.status).toBe(403);
        expect(h.getUserShop).not.toHaveBeenCalled();
    });

    it('shop байхгүй бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: DUP }));
        expect(res.status).toBe(401);
    });

    it('буруу body (ижил id) → 400', async () => {
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: PRIMARY }));
        expect(res.status).toBe(400);
    });

    it('буруу body (uuid биш) → 400', async () => {
        const res = await POST(nextPost(URL, { primaryId: 'x', duplicateId: 'y' }));
        expect(res.status).toBe(400);
    });

    it('хоёр харилцагчийн нэг нь олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ customers: { data: [{ id: PRIMARY }] } });
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: DUP }));
        expect(res.status).toBe(404);
    });

    it('амжилттай нэгтгээд primary оноог дахин тооцоолно', async () => {
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: DUP }));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.message).toContain('нэгтгэлээ');
        expect(h.recomputeCustomerScore).toHaveBeenCalledWith(PRIMARY);
    });

    it('primary update алдаа гарвал 500', async () => {
        h.adminClient = makeSupabaseMock({
            customers: {
                data: [{ id: PRIMARY, name: 'Болд' }, { id: DUP, name: 'Дор' }],
                error: { message: 'boom' },
            },
        });
        const res = await POST(nextPost(URL, { primaryId: PRIMARY, duplicateId: DUP }));
        expect(res.status).toBe(500);
    });
});
