/**
 * GET /api/dashboard/contracts — гэрээний жагсаалт + статистик.
 *
 * Тестлэх: модулийн эрхийн хаалт, shop-scoping (shop байхгүй үед хоосон),
 * статистик тооцоолол (computeStats — active/closed/cancelled, нийт дүн, овердуэй).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextGet, makeSupabaseMock } from '@/test/api-harness';

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

import { GET } from '@/app/api/dashboard/contracts/route';

const URL = 'http://localhost:3001/api/dashboard/contracts';

beforeEach(() => {
    vi.clearAllMocks();
    h.requireModule.mockResolvedValue(null); // default: эрхтэй
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.adminClient = makeSupabaseMock({ property_contracts: { data: [] } });
});

describe('GET /api/dashboard/contracts', () => {
    it('contracts модулийн эрхгүй бол denied хариуг шууд буцаана', async () => {
        h.requireModule.mockResolvedValue(NextResponse.json({ error: 'denied' }, { status: 403 }));
        const res = await GET(nextGet(URL));
        expect(res.status).toBe(403);
        // эрх шалгасны дараа shop-д ч хүрэхгүй
        expect(h.getUserShop).not.toHaveBeenCalled();
    });

    it('shop байхгүй бол хоосон жагсаалт + хоосон статистик', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await GET(nextGet(URL));
        const body = await res.json();
        expect(body.contracts).toEqual([]);
        expect(body.stats).toEqual({
            total: 0, closed: 0, active: 0,
            total_sales: 0, total_paid: 0, total_balance: 0, overdue_count: 0,
        });
    });

    it('статистикийг зөв тооцоолно (active/closed/cancelled, дүн, овердуэй)', async () => {
        h.adminClient = makeSupabaseMock({
            property_contracts: {
                data: [
                    { contract_status: 'active', total_price: 100, paid_amount: 40, balance: 60, overdue_days: 5 },
                    { contract_status: 'closed', total_price: 200, paid_amount: 200, balance: 0, overdue_days: 0 },
                    { contract_status: 'cancelled', total_price: 50, paid_amount: 0, balance: 50, overdue_days: 10 },
                ],
            },
        });
        const res = await GET(nextGet(URL));
        const body = await res.json();

        expect(body.contracts).toHaveLength(3);
        expect(body.stats).toEqual({
            total: 3,
            closed: 1,
            active: 1, // cancelled нь active-д орохгүй
            total_sales: 350,
            total_paid: 240,
            total_balance: 110,
            overdue_count: 2, // overdue_days > 0 (5 ба 10)
        });
    });

    it('query алдаа гарвал 500 + хоосон бүтэц', async () => {
        h.adminClient = makeSupabaseMock({
            property_contracts: { data: null, error: { message: 'boom' } },
        });
        const res = await GET(nextGet(URL));
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.contracts).toEqual([]);
        expect(body.error).toBeTruthy();
    });
});
