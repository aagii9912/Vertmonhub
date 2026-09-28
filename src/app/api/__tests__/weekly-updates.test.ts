// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
    deny: null as NextResponse | null,
    permissions: { role: 'sales_manager', permissions: { modules: ['dashboard'], canWrite: true } },
    shop: { id: 'shop-1' } as { id: string } | null,
    user: 'user-1' as string | null,
    error: null as { code: string; message: string } | null,
    eq: vi.fn(), upsert: vi.fn(), from: vi.fn(),
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: vi.fn(async () => state.deny),
    requireModuleWrite: vi.fn(async () => state.deny),
    resolvePermissions: vi.fn(async () => state.permissions),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => state.shop, getUserId: async () => state.user }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: state.from }) }));
import { GET, PUT } from '../dashboard/weekly-updates/route';

const request = (body?: unknown) => new NextRequest('http://localhost/api/dashboard/weekly-updates?meetingDate=2026-09-30', body ? { method: 'PUT', body: JSON.stringify(body) } : undefined);
const input = { meetingDate: '2026-09-30', achievements: 'Уулзалт дууссан', blockers: '', nextSteps: 'Дахин холбогдох' };
beforeEach(() => {
    vi.clearAllMocks();
    state.deny = null; state.error = null; state.user = 'user-1'; state.shop = { id: 'shop-1' };
    state.permissions = { role: 'sales_manager', permissions: { modules: ['dashboard'], canWrite: true } };
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { state.eq(key, value); return query; },
        order: () => query,
        range: async () => ({ data: [], error: state.error }),
        maybeSingle: async () => ({ data: { full_name: 'Номин' }, error: state.error }),
        upsert: (...args: unknown[]) => { state.upsert(...args); return query; },
        single: async () => ({ data: { id: 'update-1' }, error: state.error }),
    };
    state.from.mockReturnValue(query);
});

describe('Хурлын шинэчлэлийн эрх ба өгөгдлийн хил', () => {
    it('модуль/бичих эрхгүй хүсэлт өгөгдөлд хүрэхгүй', async () => {
        state.deny = NextResponse.json({ error: 'Denied' }, { status: 403 });
        expect((await GET(request())).status).toBe(403);
        expect((await PUT(request(input))).status).toBe(403);
        expect(state.from).not.toHaveBeenCalled();
    });
    it('shop-д хамаарахгүй эсвэл нэвтрээгүй хэрэглэгчийг хаана', async () => {
        state.shop = null;
        expect((await GET(request())).status).toBe(403);
        expect((await PUT(request(input))).status).toBe(403);
        state.user = null;
        expect((await GET(request())).status).toBe(401);
        expect(state.from).not.toHaveBeenCalled();
    });
    it('менежер өөрийн, reports эрхтэй хүн зөвхөн сонгосон shop-ийн шинэчлэлийг уншина', async () => {
        const response = await GET(request());
        expect(state.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(state.eq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(state.eq).toHaveBeenCalledWith('meeting_date', '2026-09-30');
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        state.eq.mockClear();
        state.permissions.permissions.modules.push('reports');
        const team = await GET(request());
        expect((await team.json()).canViewTeam).toBe(true);
        expect(state.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(state.eq.mock.calls.some(([key]) => key === 'user_id')).toBe(false);
    });
    it('хадгалалтад эзэн, байгууллага, нэрийг сервер тогтооно; давтан хадгалалт шинэ мөр үүсгэхгүй', async () => {
        expect((await PUT(request({ ...input, user_id: 'other' }))).status).toBe(400);
        expect(state.upsert).not.toHaveBeenCalled();
        expect((await PUT(request(input))).status).toBe(200);
        expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1', user_id: 'user-1', author_name: 'Номин', meeting_date: '2026-09-30', next_steps: 'Дахин холбогдох' }), { onConflict: 'shop_id,user_id,meeting_date' });
    });
    it('миграци дутуу бол амжилт эсвэл хоосон шинэчлэл гэж харуулахгүй', async () => {
        state.error = { code: '42P01', message: 'missing weekly_updates' };
        const response = await GET(request());
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain('хараахан идэвхжээгүй');
    });
});
