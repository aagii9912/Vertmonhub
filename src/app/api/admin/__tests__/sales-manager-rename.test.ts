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
import { POST } from '../sales-targets/rename/route';
import { renameCountsText } from '@/lib/sales/manager-rename';

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/sales-targets/rename', { method: 'POST', body: JSON.stringify(body) });
const body = { shopId, oldName: 'Khongoroo', newName: ' Хонгорзул.Мөнхгэрэл ' };

beforeEach(() => {
    mocks.userId = actor; mocks.superAdmin = true; mocks.accessible = true;
    mocks.rpc.mockReset().mockResolvedValue({ data: { old_name: 'Khongoroo', new_name: 'Хонгорзул.Мөнхгэрэл',
        counts: { leads: 57, property_viewings: 9, property_contracts: 0, daily_report_counts: 41, sales_manager_projects: 1 } }, error: null });
});

describe('POST /api/admin/sales-targets/rename', () => {
    it('renames through the audited RPC with the trimmed name and the verified actor, and summarises the moved rows', async () => {
        const response = await POST(request(body));
        expect(response.status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledWith('rename_sales_manager', { p_shop_id: shopId, p_old: 'Khongoroo', p_new: 'Хонгорзул.Мөнхгэрэл', p_actor: actor });
        expect(await response.json()).toEqual({ success: true, oldName: 'Khongoroo', newName: 'Хонгорзул.Мөнхгэрэл',
            counts: { leads: 57, property_viewings: 9, property_contracts: 0, daily_report_counts: 41, sales_manager_projects: 1 },
            summary: '57 лид, 9 уулзалт, 41 өдрийн тайлангийн нүд, 1 төслийн харьяалал' });
    });

    it('requires a signed-in super_admin with access to the project and a strict, changed name', async () => {
        mocks.userId = null;
        expect((await POST(request(body))).status).toBe(401);
        mocks.userId = actor; mocks.superAdmin = false;
        expect((await POST(request(body))).status).toBe(403);
        mocks.superAdmin = true; mocks.accessible = false;
        expect((await POST(request(body))).status).toBe(403);
        mocks.accessible = true;
        for (const bad of [{ ...body, newName: '  ' }, { ...body, newName: 'Khongoroo' }, { ...body, newName: 'х'.repeat(121) },
            { ...body, extra: 1 }, { ...body, shopId: 'shop' }, null]) {
            expect((await POST(request(bad))).status).toBe(400);
        }
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('maps duplicate, refused-by-check, unknown, invalid, forbidden and missing-function errors', async () => {
        const cases: Array<[{ code: string; message: string }, number]> = [
            [{ code: '23505', message: 'Бүртгэлд «Ариунбилэг» нэртэй менежер аль хэдийн байна' }, 409],
            [{ code: '23514', message: 'Нэр солих боломжгүй: «харилцагч» бүртгэлийн шалгалт шинэ нэрийг зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.' }, 409],
            [{ code: 'P0002', message: 'Менежерийн бүртгэлд «Khongoroo» олдсонгүй' }, 404],
            [{ code: '22023', message: 'Шинэ нэр буруу' }, 400],
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
    });

    it('never forwards a raw English constraint message for a refused check', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'new row for relation "customers" violates check constraint "x"' } });
        const response = await POST(request(body));
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('Нэр солих боломжгүй: холбогдох бүртгэлийн шалгалт шинэ нэрийг зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.');
    });

    it('describes an empty rename plainly', () => {
        expect(renameCountsText({ leads: 0 })).toBe('бусад бүртгэлд энэ нэр байгаагүй');
    });
});
