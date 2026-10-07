// @vitest-environment node
// Cron /api/cron/ads-insights-sync: нийт хугацааны хязгаар; хуучин ad_campaigns snapshot-ийг татахаа больсон.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ spend: vi.fn(), insights: vi.fn(), tables: [] as string[] }));
const SHOPS = [{ id: 'shop-a' }, { id: 'shop-b' }];
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/marketing/meta-spend', () => ({ syncMetaSpend: mocks.spend }));
vi.mock('@/lib/marketing/meta-insights', () => ({ syncMetaInsights: mocks.insights }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            mocks.tables.push(table);
            const q: Record<string, unknown> = {};
            for (const method of ['select', 'not', 'order', 'eq', 'update']) q[method] = () => q;
            q.range = async () => ({ data: table === 'shops' ? SHOPS : [], error: null });
            return q;
        },
    }),
}));
import { POST } from '@/app/api/cron/ads-insights-sync/route';

const http = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables.length = 0;
    vi.stubGlobal('fetch', http);
    mocks.spend.mockResolvedValue({ rows: 1 });
    mocks.insights.mockResolvedValue({ rows: 1, weeks: [{ from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-04' }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('runs the spend and detailed syncs under one deadline below maxDuration and never refreshes the retired ad_campaigns snapshot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    const response = await POST(new NextRequest('http://localhost/api/cron/ads-insights-sync'));
    const body = await response.json();
    const deadline = mocks.spend.mock.calls[0][3];
    // maxDuration 300 сек − 30 сек аюулгүйн зай.
    expect(deadline.at - Date.parse('2026-10-05T00:00:00Z')).toBe(270_000);
    expect(mocks.spend.mock.calls.map(call => [call[1], call[3]])).toEqual([['shop-a', deadline], ['shop-b', deadline]]);
    expect(mocks.insights.mock.calls.map(call => [call[1], call[3]])).toEqual([['shop-a', { deadline }], ['shop-b', { deadline }]]);
    // ROI/зарын хуудас огноотой хүснэгтээс уншдаг: кампанит ажил бүрийн Graph дуудлага, ad_campaigns бичилт байхгүй.
    expect(http).not.toHaveBeenCalled();
    expect(mocks.tables).toEqual(['shops']);
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, dailyResults: [{ shopId: 'shop-a', success: true, rows: 1 }, { shopId: 'shop-b', success: true, rows: 1 }],
        insightResults: [{ shopId: 'shop-a', success: true, rows: 1, weeks: 1 }, { shopId: 'shop-b', success: true, rows: 1, weeks: 1 }] });
});

it('reports a partial detailed sync as not fully successful', async () => {
    mocks.insights.mockResolvedValueOnce({ rows: 5, weeks: [{ from: '2026-09-30' }], partial: 'Синкийн хугацаа хүрэлцээгүй…' });
    const response = await POST(new NextRequest('http://localhost/api/cron/ads-insights-sync'));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ insightResults: [{ shopId: 'shop-a', success: false, partial: true, weeks: 1 }, { shopId: 'shop-b', success: true }] });
});
