// @vitest-environment node
// Cron /api/cron/social-insights-sync: Page эсвэл Instagram-тэй shop, IG-ийн 14/30 өдрийн цонх, нэг хугацааны хязгаар.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ page: vi.fn(), instagram: vi.fn(), filters: [] as unknown[][] }));
const SHOPS = [
    { id: 'elysium', facebook_page_id: '676357242225387', facebook_page_access_token: 'enc:v1:p', instagram_business_account_id: '17841475771440904', instagram_access_token: 'enc:v1:i' },
    { id: 'tower', facebook_page_id: null, facebook_page_access_token: null, instagram_business_account_id: '17841400000000001', instagram_access_token: null },
    { id: 'garden', facebook_page_id: '42', facebook_page_access_token: 'enc:v1:g', instagram_business_account_id: null, instagram_access_token: null },
];
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/facebook/page-connect', () => ({ purgeExpiredPageConnections: vi.fn() }));
vi.mock('@/lib/marketing/socialSync', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/marketing/socialSync')>()),
    syncShopSocial: mocks.page,
    syncShopInstagram: mocks.instagram,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const q: Record<string, unknown> = {};
            for (const method of ['select', 'not', 'order', 'eq', 'or']) q[method] = (...args: unknown[]) => { mocks.filters.push([table, method, ...args]); return q; };
            q.range = async () => ({ data: table === 'shops' ? SHOPS : [{ shop_id: 'elysium', page_id: '17841475771440904' }], error: null });
            return q;
        },
    }),
}));
import { maxDuration, POST } from '@/app/api/cron/social-insights-sync/route';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    mocks.page.mockResolvedValue({ status: 'ok', postsStored: 25, pageRows: 240 });
    mocks.instagram.mockResolvedValue({ status: 'partial', postsStored: 25, accountRows: 120 });
});
afterEach(() => { vi.useRealTimers(); });

it('syncs Page and Instagram shops under one deadline, with 14 days after a successful Instagram sync and 30 before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:30:00Z'));
    const response = await POST(new NextRequest('http://localhost/api/cron/social-insights-sync'));
    expect(maxDuration).toBe(300);
    expect(mocks.filters).toContainEqual(['shops', 'or', 'facebook_page_id.not.is.null,instagram_business_account_id.not.is.null']);
    expect(mocks.filters).toContainEqual(['social_insights_sync', 'eq', 'platform', 'instagram']);
    expect(mocks.page.mock.calls.map(call => call[1].id).sort()).toEqual(['elysium', 'garden']);
    const ig = Object.fromEntries(mocks.instagram.mock.calls.map(call => [call[1].id, call[2]]));
    expect(ig).toEqual({ elysium: 14, tower: 30 });
    const deadline = mocks.instagram.mock.calls[0][3].deadline;
    expect(deadline.at - Date.parse('2026-10-25T12:30:00Z')).toBe(270_000);
    expect(await response.json()).toEqual({
        success: true, statuses: { ok: 2 }, instagram: { partial: 2 }, totalPosts: 100, pageRows: 480, instagramRows: 240,
    });
});

it('keeps going when one shop fails', async () => {
    mocks.instagram.mockRejectedValueOnce(new Error('db down'));
    const response = await POST(new NextRequest('http://localhost/api/cron/social-insights-sync'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.instagram).toEqual({ error: 1, partial: 1 });
    expect(mocks.page).toHaveBeenCalledTimes(2);
});
