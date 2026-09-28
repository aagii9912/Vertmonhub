// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), user: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: mocks.user }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { GET, POST } from '@/app/api/marketing/facebook/ads/spend-import/route';

const csv = 'Account ID,Campaign ID,Campaign name,Day,Amount spent (MNT)\n123,456,Test,2026-09-01,100';
function request(action = 'preview', { contents = csv, filename = 'meta.csv', fingerprint = 'a'.repeat(32) } = {}) {
    const form = new FormData();
    form.set('file', new File([contents], filename)); form.set('action', action);
    form.set('shopId', 'foreign'); form.set('requestId', '00000000-0000-4000-8000-000000000001');
    form.set('options', JSON.stringify({ accountId: '', currency: '', timezone: 'Asia/Ulaanbaatar', mntPerUnit: 1 }));
    form.set('fingerprint', fingerprint);
    return new NextRequest('http://localhost/api/marketing/facebook/ads/spend-import?shopId=foreign', { method: 'POST', body: form });
}
beforeEach(() => {
    vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: 'allowed' }); mocks.user.mockResolvedValue('user');
    mocks.rpc.mockResolvedValue({ data: { rows: 1, added: 1, fingerprint: 'a'.repeat(32) }, error: null });
});
it('requires read/write module access before database operations', async () => {
    mocks.read.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    mocks.write.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await GET()).status).toBe(403); expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledWith('marketing-roi');
});
it('rejects missing tenant or user and cannot take a tenant from the uploaded form', async () => {
    mocks.shop.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(403);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('import_meta_daily_spend', expect.objectContaining({ p_shop: 'allowed', p_user: 'user', p_account: 'act_123', p_commit: false }));
    mocks.user.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(403);
});
it('requires preview fingerprint and revalidates the actual file on commit', async () => {
    expect((await POST(request('commit', { fingerprint: '' }))).status).toBe(400);
    expect((await POST(request('commit', { contents: csv.replace(',100', ',-100') }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await POST(request('commit'))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('import_meta_daily_spend', expect.objectContaining({ p_commit: true, p_expected: 'a'.repeat(32) }));
});
it('rejects unsupported and empty files without touching the database', async () => {
    expect((await POST(request('preview', { filename: 'old.xls' }))).status).toBe(400);
    expect((await POST(request('preview', { contents: '' }))).status).toBe(400);
    expect((await POST(request('invalid'))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
});
it('surfaces stale previews and missing migrations without success or leaking database errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: '40001', message: 'private SQL' } });
    expect((await POST(request('commit'))).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ error: { code: '42883', message: 'private SQL' } });
    const response = await POST(request('commit'));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private SQL');
});
it('scopes the import history to the current shop and disables caching', async () => {
    const eq = vi.fn();
    const q = { select: () => q, eq: (key: string, value: string) => { eq(key, value); return q; }, order: () => q, limit: async () => ({ data: [], error: null }) };
    mocks.from.mockReturnValue(q);
    const response = await GET(); expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('shop_id', 'allowed'); expect(response.headers.get('cache-control')).toContain('no-store');
});
