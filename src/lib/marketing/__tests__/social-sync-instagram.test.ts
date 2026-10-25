// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ daily: vi.fn(), account: vi.fn(), media: vi.fn(), mediaInsights: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value?.replace(/^enc:v1:/, '') ?? null }));
vi.mock('@/lib/facebook/marketing-api', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/facebook/marketing-api')>()),
    fetchInstagramDailyInsights: mocks.daily,
    getInstagramAccount: mocks.account,
    getInstagramMedia: mocks.media,
    fetchInstagramMediaInsights: mocks.mediaInsights,
}));

import { MetaApiError, metaDeadline } from '@/lib/facebook/daily-spend';
import { IG_MEDIA_METRICS } from '@/lib/marketing/social-metrics';
import { instagramPostRow, syncShopInstagram } from '../socialSync';

type Upsert = { table: string; rows: Record<string, unknown>[]; onConflict?: string };
let upserts: Upsert[];
let storedPosts: Record<string, unknown>[];
const filters: unknown[][] = [];
const supabase = {
    from: (table: string) => ({
        select: () => {
            const query = { eq: (...args: unknown[]) => { filters.push([table, 'eq', ...args]); return query; }, in: async () => ({ data: storedPosts, error: null }) };
            return query;
        },
        upsert: async (rows: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) => {
            upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows], onConflict: options?.onConflict });
            return { error: null };
        },
    }),
} as never;
const IG = '17841475771440904';
const shop = { id: 'shop-1', instagram_business_account_id: IG, instagram_access_token: 'enc:v1:ig-token', facebook_page_access_token: 'enc:v1:page-token' };
const written = (table: string) => upserts.filter(u => u.table === table).flatMap(u => u.rows);
const lastStatus = () => written('social_insights_sync').at(-1)!;
const media = (id: string, overrides: Record<string, unknown> = {}) => ({ id, caption: ` Пост ${id} `, media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-10-03T02:00:00+0000', like_count: 10, comments_count: 2, media_url: 'https://scontent.cdninstagram.com/x.jpg', ...overrides });

beforeEach(() => {
    vi.clearAllMocks();
    upserts = [];
    storedPosts = [];
    filters.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z')); // PT 2026-10-04, УБ 2026-10-05
    mocks.account.mockResolvedValue({ id: IG, username: 'elysiumbymoncon', followers_count: 812 });
    mocks.daily.mockResolvedValue({
        rows: [{ day: '2026-10-03', metric: 'views', value: 900 }, { day: '2026-10-03', metric: 'follows', value: 4 }, { day: '2026-10-02', metric: 'views', value: 700 }],
        unavailable: ['profile_links_taps'], days: 30, stopped: null,
    });
    mocks.media.mockResolvedValue([media('1790'), media('1791', { media_product_type: 'REELS', media_type: 'VIDEO', like_count: undefined }), media('bad/../id')]);
    mocks.mediaInsights.mockImplementation(async (id: string) => id === '1790'
        ? { values: { views: 400, reach: 250, shares: 3, saved: 7, likes: 10 }, unavailable: ['comments', 'total_interactions'], invalid: [] }
        : { values: { views: 1500, reach: 1100, likes: 31 }, unavailable: ['shares', 'saved'], invalid: ['shares'] });
});
afterEach(() => { vi.useRealTimers(); });

it('stores Instagram account days, a follower snapshot for the current Meta day and media with their lifetime insights', async () => {
    const result = await syncShopInstagram(supabase, shop);
    // IG токен (IG урсгалаар хадгалсан) Page токеноос түрүүлнэ; анхдагч 30 дууссан PT өдөр.
    expect(mocks.daily).toHaveBeenCalledWith(IG, 'ig-token', '2026-09-04', '2026-10-03', { deadline: null });
    expect(result).toMatchObject({
        status: 'partial', from: '2026-09-04', to: '2026-10-03', accountRows: 4, days: 30, followers: 812, postsStored: 2, postRows: 8,
        unavailable: ['profile_links_taps', 'media:shares'], errors: [],
    });

    const daily = written('social_insights_daily');
    const account = daily.filter(row => row.object_type === 'page');
    expect(account).toEqual([
        expect.objectContaining({ shop_id: 'shop-1', platform: 'instagram', page_id: IG, object_id: IG, day: '2026-10-04', metric: 'followers_count', value: 812, breakdown: null }),
        expect.objectContaining({ platform: 'instagram', object_id: IG, day: '2026-10-03', metric: 'views', value: 900 }),
        expect.objectContaining({ day: '2026-10-03', metric: 'follows', value: 4 }),
        expect.objectContaining({ day: '2026-10-02', metric: 'views', value: 700 }),
    ]);
    const posts = daily.filter(row => row.object_type === 'post');
    // Media-ийн мөр Улаанбаатарын өнөөдрөөр; Meta-гийн өгөөгүй метрик мөргүй (0 биш).
    expect(posts.filter(row => row.object_id === '1791').map(row => [row.metric, row.value])).toEqual([['views', 1500], ['reach', 1100], ['likes', 31]]);
    expect(posts.every(row => row.day === '2026-10-05' && row.platform === 'instagram' && row.page_id === IG)).toBe(true);
    expect(upserts.filter(u => u.table === 'social_insights_daily').every(u => u.onConflict === 'shop_id,platform,object_type,object_id,day,metric')).toBe(true);

    const stored = written('social_posts');
    expect(stored.map(row => row.external_post_id)).toEqual(['1790', '1791']);
    expect(stored[0]).toMatchObject({ platform: 'instagram', content: 'Пост 1790', likes: 10, comments: 2, shares: 3, reach: 250, status: 'published', media_urls: null, published_at: '2026-10-03T02:00:00+0000' });
    // like_count ирээгүй бол media insights-ийн likes; shares Meta өгөөгүй → null.
    expect(stored[1]).toMatchObject({ likes: 31, comments: 2, shares: null, reach: 1100 });
    expect(upserts.find(u => u.table === 'social_posts')!.onConflict).toBe('shop_id,platform,external_post_id');
    expect(filters).toContainEqual(['social_posts', 'eq', 'platform', 'instagram']);

    expect(written('social_insights_sync')[0]).toEqual({ shop_id: 'shop-1', platform: 'instagram', page_id: IG, last_attempt_at: expect.any(String) });
    expect(lastStatus()).toMatchObject({
        platform: 'instagram', page_id: IG, last_success_at: expect.any(String), last_from: '2026-09-04', last_to: '2026-10-03',
        unavailable_metrics: ['profile_links_taps', 'media:shares'], last_error: null, page_rows: 4, post_rows: 8,
    });
    expect(JSON.stringify(upserts)).not.toMatch(/ig-token|page-token|cdninstagram/);
});

it('does not ask a metric again for the same media type once Meta rejected it', async () => {
    mocks.media.mockResolvedValue([media('1791', { media_product_type: 'REELS' }), media('1792', { media_product_type: 'REELS' }), media('1793')]);
    mocks.mediaInsights.mockResolvedValue({ values: { views: 1 }, unavailable: [], invalid: ['shares'] });
    await syncShopInstagram(supabase, shop, 14);
    expect(mocks.daily).toHaveBeenCalledWith(IG, 'ig-token', '2026-09-20', '2026-10-03', { deadline: null });
    const asked = mocks.mediaInsights.mock.calls.map(([id, , metrics]) => [id, (metrics as string[]).includes('shares')]);
    expect(asked).toEqual([['1791', true], ['1792', false], ['1793', true]]);
});

it('falls back to the Page token and keeps previously known media counts', async () => {
    storedPosts = [{ external_post_id: '1791', likes: 30, comments: 5, shares: 2, reach: 900 }];
    mocks.media.mockResolvedValue([media('1791', { like_count: undefined, comments_count: undefined })]);
    mocks.mediaInsights.mockResolvedValue({ values: {}, unavailable: [...IG_MEDIA_METRICS], invalid: [] });
    await syncShopInstagram(supabase, { ...shop, instagram_access_token: null });
    expect(mocks.account).toHaveBeenCalledWith(IG, 'page-token', expect.anything());
    expect(written('social_posts')[0]).toMatchObject({ likes: 30, comments: 5, shares: 2, reach: 900 });
});

it('keeps the account days when media insights lose permission, and stops asking for the rest', async () => {
    mocks.mediaInsights.mockRejectedValue(new MetaApiError('Facebook-ийн эрх дутуу байна (read_insights, pages_read_engagement). Page-ээ дахин холбоно уу.', { code: 10 }));
    const result = await syncShopInstagram(supabase, shop);
    expect(mocks.mediaInsights).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'partial', postsStored: 2, postRows: 0 });
    expect(written('social_posts')[0]).toMatchObject({ likes: 10, comments: 2, shares: null, reach: null });
    // Аккаунтын өдрүүд бүрэн татагдсан тул амжилтын тэмдэг тавина.
    expect(lastStatus()).toMatchObject({ last_success_at: expect.any(String), last_error: expect.stringMatching(/эрх дутуу/) });
});

it('marks a partial day window without a success stamp and reports errors without tokens', async () => {
    mocks.daily.mockResolvedValue({ rows: [{ day: '2026-10-03', metric: 'views', value: 900 }], unavailable: [], days: 1, stopped: 'Instagram-ийн өдрийн үзүүлэлтийг татах хугацаа дууслаа — дараагийн синк үргэлжлүүлнэ.' });
    const result = await syncShopInstagram(supabase, shop);
    expect(result.status).toBe('partial');
    expect(written('social_insights_daily').some(row => row.metric === 'views')).toBe(true);
    expect(lastStatus().last_success_at).toBeUndefined();
    expect(lastStatus().last_error).toMatch(/хугацаа дууслаа/);

    upserts = [];
    mocks.account.mockRejectedValue(new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', { code: 190 }));
    mocks.daily.mockRejectedValue(new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', { code: 190 }));
    mocks.media.mockRejectedValue(new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', { code: 190 }));
    const failed = await syncShopInstagram(supabase, shop);
    expect(failed.status).toBe('error');
    expect(written('social_insights_daily')).toEqual([]);
    expect(written('social_posts')).toEqual([]);
    expect(lastStatus()).toMatchObject({ last_error: 'Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.' });
    expect(JSON.stringify(upserts)).not.toContain('token');
});

it('skips media once the run deadline has passed', async () => {
    const result = await syncShopInstagram(supabase, shop, 30, { deadline: metaDeadline(0) });
    expect(mocks.media).not.toHaveBeenCalled();
    expect(result.errors.join(' ')).toMatch(/хугацаа дууслаа/);
});

it('does nothing without an Instagram account or token and refuses a malformed id', async () => {
    expect((await syncShopInstagram(supabase, { id: 'shop-1', instagram_business_account_id: null })).status).toBe('not_connected');
    expect((await syncShopInstagram(supabase, { id: 'shop-1', instagram_business_account_id: IG, instagram_access_token: null, facebook_page_access_token: null })).status).toBe('not_connected');
    expect((await syncShopInstagram(supabase, { ...shop, instagram_business_account_id: '17/../me' })).status).toBe('error');
    expect(mocks.daily).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
});

it('builds a post row with null, never zero, for counts Meta did not return', () => {
    const row = instagramPostRow('shop-1', { id: '1', caption: '   ' });
    expect(row).toMatchObject({ content: null, likes: null, comments: null, shares: null, reach: null, published_at: null, media_urls: null });
});
