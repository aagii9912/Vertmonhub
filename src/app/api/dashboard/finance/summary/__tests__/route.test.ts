/**
 * GET /api/dashboard/finance/summary — санхүүгийн ерөнхий үзүүлэлт.
 * Тестлэх: finance модулийн эрх, shop-scoping, KPI тооцоолол (орлого/цуглуулалт/авлага/cash).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireModule: vi.fn(),
    getUserShop: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: h.requireModule }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { GET } from '@/app/api/dashboard/finance/summary/route';

beforeEach(() => {
    vi.clearAllMocks();
    h.requireModule.mockResolvedValue(null);
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.adminClient = makeSupabaseMock({ property_contracts: { data: [] }, finance_transactions: { data: [] } });
});

describe('GET finance/summary', () => {
    it('finance эрхгүй бол denied буцаана', async () => {
        h.requireModule.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await GET();
        expect(res.status).toBe(403);
        expect(h.getUserShop).not.toHaveBeenCalled();
    });

    it('shop байхгүй бол summary: null', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await GET();
        const body = await res.json();
        expect(body.summary).toBeNull();
    });

    it('KPI-г зөв тооцоолно (cancelled хасна, цуглуулалтын %, cash net)', async () => {
        h.adminClient = makeSupabaseMock({
            property_contracts: {
                data: [
                    { total_price: 1000, paid_amount: 400, balance: 600, vat_amount: 100, contract_status: 'active' },
                    { total_price: 500, paid_amount: 500, balance: 0, vat_amount: 50, contract_status: 'closed' },
                    { total_price: 9999, paid_amount: 0, balance: 9999, vat_amount: 0, contract_status: 'cancelled' },
                ],
            },
            finance_transactions: {
                data: [
                    { type: 'receipt', amount: 300 },
                    { type: 'disbursement', amount: 100 },
                ],
            },
        });
        const res = await GET();
        const { summary } = await res.json();

        expect(summary).toEqual({
            totalRevenue: 1500,     // cancelled (9999) хасагдсан
            totalCollected: 900,
            totalReceivable: 600,
            totalVat: 150,
            collectionRate: 60,     // round(900/1500*100)
            monthReceipts: 300,
            monthDisbursements: 100,
            monthNetCash: 200,
            contractCount: 2,
        });
    });
});
