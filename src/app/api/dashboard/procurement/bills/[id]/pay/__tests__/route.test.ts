/**
 * POST /api/dashboard/procurement/bills/[id]/pay — нэхэмжлэхийн төлбөр.
 * Тестлэх: procurement бичих эрх, shop-scoping, валидаци, оршихуй, paid/partial статус, audit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { nextPost, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    requireModuleWrite: vi.fn(),
    getUserShop: vi.fn(),
    logFinanceAudit: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: h.requireModuleWrite }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: h.getUserShop }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/erp/audit', () => ({ logFinanceAudit: h.logFinanceAudit }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { POST } from '@/app/api/dashboard/procurement/bills/[id]/pay/route';

const URL = 'http://localhost:3001/api/dashboard/procurement/bills/bill-1/pay';
const ctx = (id = 'bill-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    h.requireModuleWrite.mockResolvedValue(null);
    h.getUserShop.mockResolvedValue({ id: 'shop-1' });
    h.logFinanceAudit.mockResolvedValue(undefined);
    h.adminClient = makeSupabaseMock({
        vendor_bills: { data: { id: 'bill-1', total_amount: 1000, paid_amount: 0, project_id: 'p1' }, error: null },
        finance_transactions: { error: null },
    });
});

describe('POST bills/[id]/pay', () => {
    it('procurement бичих эрхгүй бол denied', async () => {
        h.requireModuleWrite.mockResolvedValue(NextResponse.json({ error: 'no' }, { status: 403 }));
        const res = await POST(nextPost(URL, { amount: 100 }), ctx());
        expect(res.status).toBe(403);
        expect(h.getUserShop).not.toHaveBeenCalled();
    });

    it('shop байхгүй бол 401', async () => {
        h.getUserShop.mockResolvedValue(null);
        const res = await POST(nextPost(URL, { amount: 100 }), ctx());
        expect(res.status).toBe(401);
    });

    it('буруу body (amount <= 0) → 400', async () => {
        const res = await POST(nextPost(URL, { amount: 0 }), ctx());
        expect(res.status).toBe(400);
    });

    it('нэхэмжлэх олдохгүй бол 404', async () => {
        h.adminClient = makeSupabaseMock({ vendor_bills: { data: null } });
        const res = await POST(nextPost(URL, { amount: 100 }), ctx());
        expect(res.status).toBe(404);
    });

    it('хэсэгчилсэн төлбөр → status partial + audit', async () => {
        const res = await POST(nextPost(URL, { amount: 400 }), ctx());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.paid_amount).toBe(400);
        expect(body.status).toBe('partial');
        expect(h.logFinanceAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'bill.pay', entityId: 'bill-1', amount: 400, meta: { status: 'partial' },
        }));
    });

    it('бүрэн төлөгдвөл → status paid', async () => {
        h.adminClient = makeSupabaseMock({
            vendor_bills: { data: { id: 'bill-1', total_amount: 1000, paid_amount: 600 }, error: null },
            finance_transactions: { error: null },
        });
        const res = await POST(nextPost(URL, { amount: 400 }), ctx());
        const body = await res.json();
        expect(body.paid_amount).toBe(1000);
        expect(body.status).toBe('paid');
    });
});
