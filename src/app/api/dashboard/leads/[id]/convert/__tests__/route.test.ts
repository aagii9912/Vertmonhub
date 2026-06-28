/**
 * POST /api/dashboard/leads/[id]/convert — lead-ийг closed_won болгож хөрвүүлэх.
 * Эргэшгүй (won) үйлдэл тул shop-scoping, lead оршихуй, update алдаа, attribution/scoring-ийг шалгана.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    getUserShop: vi.fn(),
    recomputeCustomerScore: vi.fn(),
    logAttributionEvent: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: h.recomputeCustomerScore }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: h.logAttributionEvent }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { POST } from '@/app/api/dashboard/leads/[id]/convert/route';

const URL = 'http://localhost:3001/api/dashboard/leads/lead-1/convert';
const ctx = (id = 'lead-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.recomputeCustomerScore.mockResolvedValue(undefined);
    h.logAttributionEvent.mockResolvedValue(undefined);
    // lead select-д data, update-д error: null (өөр өөр destructure тул нэг тохиргоо хангалттай)
    h.adminClient = makeSupabaseMock({
        leads: { data: { id: 'lead-1', customer_id: 'cust-1', status: 'new' }, error: null },
        property_contracts: { data: { id: 'ct-1', total_price: 250 } },
    });
});

describe('POST leads/[id]/convert', () => {
    it('нэвтрээгүй (shop байхгүй) бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await POST(nextPost(URL, {}), ctx());
        expect(res.status).toBe(401);
    });

    it('lead олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ leads: { data: null } });
        const res = await POST(nextPost(URL, {}), ctx());
        expect(res.status).toBe(404);
        expect(h.logAttributionEvent).not.toHaveBeenCalled();
    });

    it('update амжилтгүй бол 500', async () => {
        h.adminClient = makeSupabaseMock({
            leads: { data: { id: 'lead-1', customer_id: 'cust-1' }, error: { message: 'boom' } },
        });
        const res = await POST(nextPost(URL, {}), ctx());
        expect(res.status).toBe(500);
    });

    it('амжилттай хөрвүүлээд гэрээ буцаана, attribution + scoring дуудна', async () => {
        const res = await POST(nextPost(URL, { conversion_value: 999 }), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.contract).toEqual({ id: 'ct-1', total_price: 250 });
        expect(h.logAttributionEvent).toHaveBeenCalledWith(expect.objectContaining({
            shopId: 'shop-1', leadId: 'lead-1', eventType: 'won', value: 999,
        }));
        expect(h.recomputeCustomerScore).toHaveBeenCalledWith('cust-1');
    });

    it('scoring алдаа гарсан ч 200 (best-effort)', async () => {
        h.recomputeCustomerScore.mockRejectedValue(new Error('score fail'));
        const res = await POST(nextPost(URL, {}), ctx());
        expect(res.status).toBe(200);
    });
});
