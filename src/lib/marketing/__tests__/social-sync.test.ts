// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ daily: vi.fn(), posts: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value?.replace(/^enc:v1:/, '') ?? null }));
vi.mock('@/lib/facebook/marketing-api', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/facebook/marketing-api')>()),
    fetchPageDailyInsights: mocks.daily,
    getPagePosts: mocks.posts,
}));

import { MetaApiError } from '@/lib/facebook/daily-spend';
import { syncShopSocial } from '../socialSync';

type Upsert = { table: string; rows: Record<string, unknown>[]; onConflict?: string };
let upserts: Upsert[];
let failTable: string | null;
let storedPosts: Record<string, unknown>[];
const supabase = {
    from: (table: string) => ({
        select: () => {
            const query = { eq: () => query, in: async () => ({ data: storedPosts, error: null }) };
            return query;
        },
        upsert: async (rows: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) => {
            upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows], onConflict: options?.onConflict });
            return { error: failTable === table ? { message: 'db down' } : null };
        },
    }),
} as never;
const shop = { id: 'shop-1', facebook_page_id: '42', facebook_page_access_token: 'enc:v1:page-token' };
const written = (table: string) => upserts.filter(u => u.table === table).flatMap(u => u.rows);
const lastStatus = () => written('social_insights_sync').at(-1)!;

beforeEach(() => {
    vi.clearAllMocks();
    upserts = [];
    failTable = null;
    storedPosts = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z')); // PT 2026-10-04, УБ 2026-10-05
    mocks.daily.mockResolvedValue({
        rows: [
            { day: '2026-10-02', metric: 'page_media_view', value: 120, breakdown: null },
            { day: '2026-10-03', metric: 'page_follows', value: 12000, breakdown: null },
        ],
        unavailable: ['page_video_views'],
    });
    mocks.posts.mockResolvedValue({
        posts: [
            { post: { id: '42_1', message: 'Нээлт', created_time: '2026-10-01T02:00:00+0000', likes: { summary: { total_count: 5 } }, comments: { summary: { total_count: 2 } } },
              insights: { post_total_media_view_unique: { value: 800, breakdown: null }, post_reactions_by_type_total: { value: 6, breakdown: { like: 5, love: 1 } } } },
            { post: { id: '42_2', created_time: '2026-10-02T02:00:00+0000', shares: { count: 3 } }, insights: {} },
            { post: { id: '99_7', created_time: '2026-10-02T02:00:00+0000' }, insights: {} }, // өөр Page-ийн ID
        ],
        unavailable: ['post_clicks'],
    });
});
afterEach(() => { vi.useRealTimers(); });

it('stores date-keyed Page rows for the last 30 finished Meta days and lifetime post rows for today', async () => {
    const result = await syncShopSocial(supabase, shop);
    expect(mocks.daily).toHaveBeenCalledWith('42', 'page-token', '2026-09-04', '2026-10-03');
    expect(result).toMatchObject({ status: 'partial', from: '2026-09-04', to: '2026-10-03', pageRows: 2, postsStored: 2, postRows: 2, unavailable: ['page_video_views', 'post_clicks'], errors: [] });

    const daily = written('social_insights_daily');
    expect(daily.filter(r => r.object_type === 'page')).toEqual([
        expect.objectContaining({ shop_id: 'shop-1', platform: 'facebook', page_id: '42', object_id: '42', day: '2026-10-02', metric: 'page_media_view', value: 120 }),
        expect.objectContaining({ day: '2026-10-03', metric: 'page_follows', value: 12000 }),
    ]);
    expect(daily.filter(r => r.object_type === 'post')).toEqual([
        expect.objectContaining({ object_id: '42_1', page_id: '42', day: '2026-10-05', metric: 'post_total_media_view_unique', value: 800, breakdown: null }),
        expect.objectContaining({ object_id: '42_1', day: '2026-10-05', metric: 'post_reactions_by_type_total', value: 6, breakdown: { like: 5, love: 1 } }),
    ]);
    // Meta-гийн өгөөгүй метрик мөргүй — хэзээ ч 0 бичихгүй.
    expect(daily.some(r => r.metric === 'page_video_views' || r.metric === 'post_clicks')).toBe(false);
    expect(upserts.find(u => u.table === 'social_insights_daily')!.onConflict).toBe('shop_id,platform,object_type,object_id,day,metric');

    const posts = written('social_posts');
    expect(posts.map(p => p.external_post_id)).toEqual(['42_1', '42_2']);
    expect(posts[0]).toMatchObject({ likes: 5, comments: 2, shares: 0, reach: 800, status: 'published' });
    expect(posts[1]).toMatchObject({ likes: null, comments: null, shares: 3, reach: null });
    expect(upserts.find(u => u.table === 'social_posts')!.onConflict).toBe('shop_id,platform,external_post_id');

    expect(written('social_insights_sync')[0]).toEqual({ shop_id: 'shop-1', platform: 'facebook', page_id: '42', last_attempt_at: expect.any(String) });
    expect(lastStatus()).toMatchObject({
        last_success_at: expect.any(String), last_from: '2026-09-04', last_to: '2026-10-03',
        unavailable_metrics: ['page_video_views', 'post_clicks'], last_error: null, page_rows: 2, post_rows: 2,
    });
});

it('keeps previously known post counts when Meta stops returning them', async () => {
    storedPosts = [{ external_post_id: '42_2', likes: 9, comments: 4, shares: 1, reach: 700 }];
    await syncShopSocial(supabase, shop);
    const posts = written('social_posts');
    // 42_2: Meta likes/comments/reach өгөөгүй → өмнөх утга; shares шинэ утга (3).
    expect(posts[1]).toMatchObject({ external_post_id: '42_2', likes: 9, comments: 4, shares: 3, reach: 700 });
    // 42_1: шинэ утгууд хэвээр.
    expect(posts[0]).toMatchObject({ likes: 5, comments: 2, reach: 800 });
});

it('keeps earlier data when Meta fails: no rows, no success stamp, Mongolian error without the token', async () => {
    mocks.daily.mockRejectedValue(new MetaApiError('Facebook-ийн эрх дутуу байна (read_insights, pages_read_engagement). Page-ээ дахин холбоно уу.', { code: 10 }));
    mocks.posts.mockRejectedValue(new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', { code: 190 }));
    const result = await syncShopSocial(supabase, shop);
    expect(result.status).toBe('error');
    expect(written('social_insights_daily')).toEqual([]);
    expect(written('social_posts')).toEqual([]);
    const status = lastStatus();
    expect(status.last_success_at).toBeUndefined();
    expect(status.last_error).toMatch(/read_insights/);
    expect(JSON.stringify(upserts)).not.toContain('page-token');
});

it('stores posts even when Page insights are unavailable, and reports partial', async () => {
    mocks.daily.mockRejectedValue(new MetaApiError('Facebook-ийн эрх дутуу байна', { code: 200 }));
    const result = await syncShopSocial(supabase, shop);
    expect(result.status).toBe('partial');
    expect(written('social_posts')).toHaveLength(2);
    expect(lastStatus().last_success_at).toBeUndefined();
});

it('does nothing for an unconnected shop and refuses a malformed page id', async () => {
    expect((await syncShopSocial(supabase, { id: 'shop-1', facebook_page_id: null, facebook_page_access_token: null })).status).toBe('not_connected');
    expect((await syncShopSocial(supabase, { ...shop, facebook_page_id: '42/../me' })).status).toBe('error');
    expect(mocks.daily).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
});

it('surfaces database write failures instead of reporting success', async () => {
    failTable = 'social_insights_daily';
    const result = await syncShopSocial(supabase, shop);
    expect(result.status).toBe('error');
    expect(result.errors).toEqual(['Хадгалах үед алдаа гарлаа.', 'Хадгалах үед алдаа гарлаа.']);
    expect(lastStatus().last_success_at).toBeUndefined();
});
