// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyMonthlySales } from '@/lib/sales/monthly';

const mocks = vi.hoisted(() => ({
    userId: '10000000-0000-4000-8000-000000000001' as string | null,
    superAdmin: true, accessible: true,
    save: vi.fn(), load: vi.fn(), actuals: vi.fn(),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => mocks.userId,
    assertShopAccess: async (shopId: string) => mocks.accessible ? shopId : null,
    supabaseAdmin: () => ({ from: () => emptyQuery() }),
}));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => mocks.superAdmin ? { id: mocks.userId, role: 'super_admin' } : null }));
vi.mock('@/lib/sales/targets', () => ({
    getTeamMonthlySales: (...args: unknown[]) => mocks.load(...args),
    getMonthlyActualsByManager: (...args: unknown[]) => mocks.actuals(...args),
    saveTeamMonthlySales: (...args: unknown[]) => mocks.save(...args),
    sumYear: (months: number[]) => months.reduce((sum, value) => sum + value, 0),
}));

import { GET, POST } from '../admin/sales-targets/route';
const shopId = '20000000-0000-4000-8000-000000000001';
const payload = () => ({ shopId, year: 2026, months: [{ month: 10, expectedRevision: 7, manual_cashflow_actual_amount: 0 }] });
const request = (body: unknown) => new NextRequest('http://localhost/api/admin/sales-targets', { method: 'POST', body: JSON.stringify(body) });
function emptyQuery() {
    const query = { select: () => query, eq: () => query, order: () => query, range: () => query,
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })) };
    return query;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = '10000000-0000-4000-8000-000000000001'; mocks.superAdmin = true; mocks.accessible = true;
    mocks.load.mockResolvedValue(emptyMonthlySales());
    mocks.actuals.mockResolvedValue(new Map());
    mocks.save.mockResolvedValue({ data: [{ ...emptyMonthlySales()[9], revision: 8, manual_cashflow_actual_amount: 0 }], error: null });
});

describe('monthly sales API boundary', () => {
    it('passes only validated changed fields and the verified actor to the audited writer', async () => {
        const body = payload();
        const response = await POST(request(body));
        expect(response.status).toBe(200);
        expect(mocks.save).toHaveBeenCalledWith(expect.anything(), shopId, 2026, body.months, mocks.userId);
        expect(await response.json()).toMatchObject({ success: true, months: [{ revision: 8, manual_cashflow_actual_amount: 0 }] });
    });

    it('passes guarded block cell patches and maps invalid aggregate edits to a validation response', async () => {
        const body = { ...payload(), months: [{ month: 10, expectedRevision: 7, block_amounts: { parking: { manual_cashflow_actual_amount: 0 } } }] };
        expect((await POST(request(body))).status).toBe(200);
        expect(mocks.save).toHaveBeenCalledWith(expect.anything(), shopId, 2026, body.months, mocks.userId);
        mocks.save.mockResolvedValue({ data: null, error: { code: '22023' } });
        expect((await POST(request(payload()))).status).toBe(400);
    });

    it('rejects malformed years, monetary coercion, unguarded legacy arrays and unexpected fields before writing', async () => {
        for (const body of [
            { ...payload(), year: '2026' }, { ...payload(), year: 2200 },
            { ...payload(), months: Array(12).fill(1) },
            { ...payload(), months: [{ month: 10, expectedRevision: 0, target_amount: '10' }] },
            { ...payload(), months: [{ month: 10, expectedRevision: 0, target_amount: -1 }] },
            { ...payload(), months: [{ month: 10, expectedRevision: 0, paid_amount: 10 }] },
        ]) expect((await POST(request(body))).status).toBe(400);
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it('requires a verified super_admin and access to the requested project', async () => {
        mocks.userId = null;
        expect((await POST(request(payload()))).status).toBe(401);
        mocks.userId = '10000000-0000-4000-8000-000000000001'; mocks.superAdmin = false;
        expect((await POST(request(payload()))).status).toBe(403);
        mocks.superAdmin = true; mocks.accessible = false;
        expect((await POST(request(payload()))).status).toBe(403);
        expect((await GET(new NextRequest(`http://localhost/api/admin/sales-targets?shopId=${shopId}&year=2026`))).status).toBe(403);
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.load).not.toHaveBeenCalled();
    });

    it('returns conflict instead of pretending a stale save succeeded', async () => {
        mocks.save.mockResolvedValue({ data: null, error: { code: '40001', message: 'stale' } });
        const response = await POST(request(payload()));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'MONTHLY_SALES_CONFLICT' });
    });

    it('keeps manually entered performance separate from computed CRM figures and preserves unknown cells', async () => {
        const months = emptyMonthlySales();
        months[9] = { ...months[9], manual_contract_actual_amount: 100, manual_cashflow_actual_amount: 0 };
        mocks.load.mockResolvedValue(months);
        const response = await GET(new NextRequest(`http://localhost/api/admin/sales-targets?shopId=${shopId}&year=2026`));
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.months[0].manual_cashflow_actual_amount).toBeNull();
        expect(result.summary.totals.manual_contract_actual_amount.amount).toBe(100);
        expect(result.summary.totals.manual_cashflow_actual_amount.amount).toBe(0);
        expect(result.teamActual).toEqual(Array(12).fill(0));
        expect(result.computedActualSource).toContain('CRM');
    });

    it('fails the read if the new columns cannot be loaded, rather than claiming all-zero performance', async () => {
        mocks.load.mockRejectedValue(new Error('missing migration'));
        expect((await GET(new NextRequest(`http://localhost/api/admin/sales-targets?shopId=${shopId}&year=2026`))).status).toBe(503);
    });
});
