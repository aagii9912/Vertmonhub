// @vitest-environment node
// Cron /api/cron/social-insights-sync: Page эсвэл Instagram-тэй shop, IG-ийн цонх (last_to-оос), нэг хугацааны хязгаар.
process.env.TZ = 'UTC';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ page: vi.fn(), instagram: vi.fn(), filters: [] as unknown[][], igSync: [] as Array<{ shop_id: string; page_id: string; last_to: string | null }> }));
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
            q.range = async () => ({ data: table === 'shops' ? SHOPS : mocks.igSync, error: null });
            return q;
        },
    }),
}));
import { maxDuration, POST } from '@/app/api/cron/social-insights-sync/route';
import { instagramCronDays } from '@/lib/marketing/socialSync';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    mocks.igSync = [{ shop_id: 'elysium', page_id: '17841475771440904', last_to: '2026-10-24' }];
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
    expect(mocks.filters).toContainEqual(['social_insights_sync', 'select', 'shop_id, page_id, last_to']);
    expect(mocks.page.mock.calls.map(call => call[1].id).sort()).toEqual(['elysium', 'garden']);
    const ig = Object.fromEntries(mocks.instagram.mock.calls.map(call => [call[1].id, call[2]]));
    expect(ig).toEqual({ elysium: 14, tower: 30 });
    const deadline = mocks.instagram.mock.calls[0][3].deadline;
    expect(deadline.at - Date.parse('2026-10-25T12:30:00Z')).toBe(270_000);
    // Page-ийн синк ч мөн хязгаартай (Graph-ийн дуудлага бүр түүгээр тасарна).
    expect(mocks.page.mock.calls.map(call => [call[2], call[3].deadline])).toEqual([[30, deadline], [30, deadline]]);
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

it('re-reads every Instagram day since the last stored one after an outage longer than 14 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:30:00Z')); // PT 10.20 → өчигдөр 10.19
    mocks.igSync = [{ shop_id: 'elysium', page_id: '17841475771440904', last_to: '2026-09-30' }];
    await POST(new NextRequest('http://localhost/api/cron/social-insights-sync'));
    const days = mocks.instagram.mock.calls.find(call => call[1].id === 'elysium')![2];
    expect(days).toBe(33); // 10.01–10.19 (19 өдөр) + 14 засвар → 09.17–10.19
});

it('derives the Instagram window from last_to on the Meta (Pacific) day, also on a UTC server', () => {
    expect(instagramCronDays(null, '2026-10-25')).toBe(30);
    expect(instagramCronDays('not a day', '2026-10-25')).toBe(30);
    expect(instagramCronDays('2026-10-24', '2026-10-25')).toBe(14);
    expect(instagramCronDays('2026-10-25', '2026-10-25')).toBe(14); // ирээдүй/өнөөдөр — доод хязгаар
    expect(instagramCronDays('2026-10-10', '2026-10-25')).toBe(28);
    expect(instagramCronDays('2026-01-01', '2026-10-25')).toBe(90);
    // Огноо цагтай ирсэн ч өдрөөр нь.
    expect(instagramCronDays('2026-10-20T00:00:00+00:00', '2026-10-25')).toBe(18);
    // Default `today` = Meta-гийн PT өнөөдөр: 2026-10-25T05:00Z = PT 10.24 22:00 → өчигдөр 10.23.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T05:00:00Z'));
    expect(instagramCronDays('2026-10-23')).toBe(14);
    expect(instagramCronDays('2026-10-22')).toBe(15);
});
