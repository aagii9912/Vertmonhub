// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const shopId = '20000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({
    userId: '10000000-0000-4000-8000-000000000001' as string | null,
    superAdmin: true, accessible: true,
    rpc: vi.fn(),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => mocks.userId,
    assertShopAccess: async (id: string) => mocks.accessible ? id : null,
    supabaseAdmin: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => mocks.superAdmin ? { id: mocks.userId, role: 'super_admin' } : null }));
import { POST } from '../sales-targets/merge/route';

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/sales-targets/merge', { method: 'POST', body: JSON.stringify(body) });
const body = { shopId, source: 'Nomin', target: 'Номин.Одончимэг' };

beforeEach(() => {
    mocks.userId = actor; mocks.superAdmin = true; mocks.accessible = true;
    mocks.rpc.mockReset().mockResolvedValue({ data: { source_name: 'Nomin', target_name: 'Номин.Одончимэг', user_linked: true, is_active: true,
        counts: { leads: 4, property_viewings: 5, property_contracts: 0, daily_report_counts: 4, sales_manager_projects: 1, sales_work_plan_items: 2 } }, error: null });
});

describe('POST /api/admin/sales-targets/merge', () => {
    it('merges through the audited RPC with the verified actor and summarises the moved rows', async () => {
        const response = await POST(request(body));
        expect(response.status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledWith('merge_sales_managers', { p_shop_id: shopId, p_source: 'Nomin', p_target: 'Номин.Одончимэг', p_actor: actor });
        expect(await response.json()).toEqual({ success: true, source: 'Nomin', target: 'Номин.Одончимэг', userLinked: true, isActive: true,
            counts: { leads: 4, property_viewings: 5, property_contracts: 0, daily_report_counts: 4, sales_manager_projects: 1, sales_work_plan_items: 2 },
            summary: '4 лид, 5 уулзалт, 4 өдрийн тайлангийн нүд, 1 төслийн харьяалал, 2 ажлын төлөвлөгөөний ажил' });
    });

    it('requires a signed-in super_admin with access to the project and two different names', async () => {
        mocks.userId = null;
        expect((await POST(request(body))).status).toBe(401);
        mocks.userId = actor; mocks.superAdmin = false;
        expect((await POST(request(body))).status).toBe(403);
        mocks.superAdmin = true; mocks.accessible = false;
        expect((await POST(request(body))).status).toBe(403);
        mocks.accessible = true;
        for (const bad of [{ ...body, target: 'Nomin' }, { ...body, source: '' }, { ...body, target: 'х'.repeat(121) },
            { ...body, extra: 1 }, { ...body, shopId: 'shop' }, null]) {
            expect((await POST(request(bad))).status).toBe(400);
        }
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('maps refused, unknown, invalid, forbidden and missing-function errors without leaking internals', async () => {
        const cases: Array<[{ code: string; message: string }, number]> = [
            [{ code: '23505', message: '«Nomin» ба «Номин.Одончимэг» өөр өөр акаунттай холбогдсон байна. Буруу холбоосыг эхлээд салгана уу. Юу ч өөрчлөгдсөнгүй.' }, 409],
            [{ code: '23514', message: 'Нэгтгэх боломжгүй: «харилцагч» бүртгэлийн шалгалт зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.' }, 409],
            [{ code: 'P0002', message: 'Менежерийн бүртгэлд «Nomin» олдсонгүй' }, 404],
            [{ code: '22023', message: 'x' }, 400],
            [{ code: '42501', message: 'denied' }, 403],
            [{ code: 'PGRST202', message: 'Could not find the function' }, 503],
            [{ code: 'XX000', message: 'internal detail' }, 500],
        ];
        for (const [error, status] of cases) {
            mocks.rpc.mockResolvedValueOnce({ data: null, error });
            const response = await POST(request(body));
            expect(response.status).toBe(status);
            const json = await response.json();
            if (status === 409 || status === 404) expect(json.error).toBe(error.message);
            if (status === 500) expect(json.error).not.toContain('internal detail');
        }
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "x"' } });
        expect((await (await POST(request(body))).json()).error).toBe('Хоёр бүртгэлийн өгөгдөл давхцаж байна. Юу ч өөрчлөгдсөнгүй.');
    });
});
