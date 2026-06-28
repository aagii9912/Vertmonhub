/**
 * /api/dashboard/contracts/[id]/payments — төлбөрийн хуваарь GET/POST/PATCH.
 * Тестлэх: contracts модулийн эрх (унших vs бичих), shop-scoping, валидаци, статус тооцоолол.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextGet, nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireModule: vi.fn(),
    requireModuleWrite: vi.fn(),
    getUserShop: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: h.requireModule,
    requireModuleWrite: h.requireModuleWrite,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { GET, POST, PATCH } from '@/app/api/dashboard/contracts/[id]/payments/route';

const URL = 'http://localhost:3001/api/dashboard/contracts/ct-1/payments';
const ctx = (id = 'ct-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    h.requireModule.mockResolvedValue(null);
    h.requireModuleWrite.mockResolvedValue(null);
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.adminClient = makeSupabaseMock({});
});

describe('GET payments', () => {
    it('contracts эрхгүй бол denied', async () => {
        h.requireModule.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await GET(nextGet(URL), ctx());
        expect(res.status).toBe(403);
    });

    it('shop байхгүй бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await GET(nextGet(URL), ctx());
        expect(res.status).toBe(401);
    });

    it('хуваарийг буцаана', async () => {
        h.adminClient = makeSupabaseMock({ payment_schedules: { data: [{ id: 'ps-1' }], error: null } });
        const res = await GET(nextGet(URL), ctx());
        const body = await res.json();
        expect(body.payments).toEqual([{ id: 'ps-1' }]);
    });

    it('query алдаа → 500', async () => {
        h.adminClient = makeSupabaseMock({ payment_schedules: { data: null, error: { message: 'boom' } } });
        const res = await GET(nextGet(URL), ctx());
        expect(res.status).toBe(500);
    });
});

describe('POST payments', () => {
    it('бичих эрхгүй бол denied', async () => {
        h.requireModuleWrite.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await POST(nextPost(URL, { due_date: '2026-01-01', amount: 100 }), ctx());
        expect(res.status).toBe(403);
    });

    it('буруу body (due_date дутуу) → 400', async () => {
        const res = await POST(nextPost(URL, { amount: 100 }), ctx());
        expect(res.status).toBe(400);
    });

    it('гэрээ олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ property_contracts: { data: null } });
        const res = await POST(nextPost(URL, { due_date: '2026-01-01', amount: 100 }), ctx());
        expect(res.status).toBe(404);
    });

    it('амжилттай бүртгээд 201 + payment буцаана', async () => {
        h.adminClient = makeSupabaseMock({
            property_contracts: { data: { id: 'ct-1' } },
            payment_schedules: { data: { id: 'ps-1' }, error: null },
            finance_transactions: { error: null },
        });
        const res = await POST(nextPost(URL, { due_date: '2026-01-01', amount: 1000, paid_amount: 1000 }), ctx());
        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.payment).toEqual({ id: 'ps-1' });
    });
});

describe('PATCH payments', () => {
    it('payment_id дутуу бол 400', async () => {
        const res = await PATCH(nextPost(URL, { amount: 100 }), ctx());
        expect(res.status).toBe(400);
    });

    it('амжилттай шинэчилнэ', async () => {
        h.adminClient = makeSupabaseMock({ payment_schedules: { data: { id: 'ps-1', status: 'paid' }, error: null } });
        const res = await PATCH(nextPost(URL, { payment_id: 'ps-1', paid_amount: 100, amount: 100 }), ctx());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.payment).toEqual({ id: 'ps-1', status: 'paid' });
    });
});
