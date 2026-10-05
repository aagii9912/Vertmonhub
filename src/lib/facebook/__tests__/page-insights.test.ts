// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

import {
    fetchPageDailyInsights, getInstagramInsights, getInstagramMediaInsights, getPageInfo, getPagePosts,
    metaInsightDay, metaInsightToday, parseInsightValue, shiftDay,
} from '../marketing-api';
import { PAGE_DAILY_METRICS, POST_LIFETIME_METRICS, summarizeDaily } from '@/lib/marketing/social-metrics';

const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const invalidMetric = () => reply({ error: { code: 100, message: '(#100) The value must be a valid insights metric' } }, 400);
const urls = () => http.mock.calls.map(([url]) => url as URL);
/** Хасагдсан (Graph v21-ийн) метрик ба талбарууд — шинэ хүсэлтэд хэзээ ч орохгүй. */
const REMOVED = ['page_impressions', 'page_impressions_unique', 'post_impressions', 'post_impressions_unique', 'page_fans', 'page_engaged_users', 'impressions', 'plays', 'profile_views'];
const requested = () => urls().flatMap(url => [
    ...(url.searchParams.get('metric') ?? '').split(','),
    ...((url.searchParams.get('fields') ?? '').match(/insights\.metric\(([^)]*)\)/)?.[1] ?? '').split(','),
]).filter(Boolean);

/** Өдөр D-ийн утгын end_time = D+1-ийн 00:00 PT (зун PDT = 07:00Z). */
const endOf = (day: string) => `${shiftDay(day, 1)}T07:00:00+0000`;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', http);
    vi.stubEnv('FACEBOOK_APP_SECRET', 'page-app-secret');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z')); // УБ 11:00, PT 2026-10-04 20:00
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

it('keys Meta insights by the Pacific-time day that ends at end_time, regardless of the server time zone', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
        expect(metaInsightDay('2026-10-04T07:00:00+0000')).toBe('2026-10-03'); // PDT
        expect(metaInsightDay('2026-12-02T08:00:00+0000')).toBe('2026-12-01'); // PST
        expect(metaInsightDay('2026-11-01T07:00:00+0000')).toBe('2026-10-31'); // DST шилжилтийн өдөр
        expect(metaInsightDay(undefined)).toBeNull();
        expect(metaInsightDay('not a date')).toBeNull();
        expect(metaInsightToday()).toBe('2026-10-04');
        expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    } finally { process.env.TZ = tz; }
});

it('parses numbers and breakdowns and never turns a missing value into zero', () => {
    expect(parseInsightValue(12)).toEqual({ value: 12, breakdown: null });
    expect(parseInsightValue({ like: 3, love: 1, junk: 'x' })).toEqual({ value: 4, breakdown: { like: 3, love: 1 } });
    expect(parseInsightValue({})).toEqual({ value: 0, breakdown: {} }); // Meta: reaction алга
    for (const raw of [null, undefined, 'x', Number.NaN, [1]]) expect(parseInsightValue(raw)).toBeNull();
});

it('summarizes days without adding unique viewers and returns null when Meta gave nothing', () => {
    const values = [{ day: '2026-10-02', value: 5 }, { day: '2026-10-03', value: 7 }, { day: '2026-10-01', value: null }];
    expect(summarizeDaily(values, 'sum')).toEqual({ value: 12, day: '2026-10-03', days: 2 });
    expect(summarizeDaily(values, 'unique')).toEqual({ value: 7, day: '2026-10-03', days: 2 });
    expect(summarizeDaily(values, 'latest')).toEqual({ value: 7, day: '2026-10-03', days: 2 });
    expect(summarizeDaily([], 'sum')).toEqual({ value: null, day: null, days: 0 });
});

it('reads the v26 Page metrics per day, keeps only finished days inside the window and dedupes', async () => {
    http.mockResolvedValueOnce(reply({ data: [
        { name: 'page_media_view', period: 'day', values: [
            { value: 1, end_time: endOf('2026-09-30') }, // хүрээнээс өмнө
            { value: 10, end_time: endOf('2026-10-01') },
            { value: 11, end_time: endOf('2026-10-03') },
            { value: 11, end_time: endOf('2026-10-03') }, // давхардал
            { value: 99, end_time: endOf('2026-10-04') }, // дуусаагүй өнөөдөр (PT)
        ] },
        { name: 'page_follows', period: 'day', values: [{ value: 12000, end_time: endOf('2026-10-03') }, { value: null, end_time: endOf('2026-10-02') }] },
        { name: 'page_media_view', period: 'week', values: [{ value: 500, end_time: endOf('2026-10-03') }] },
    ] }));
    const { rows, unavailable } = await fetchPageDailyInsights('42', 'page-token', '2026-10-01', '2026-10-04');
    expect(rows).toEqual([
        { day: '2026-10-01', metric: 'page_media_view', value: 10, breakdown: null },
        { day: '2026-10-03', metric: 'page_media_view', value: 11, breakdown: null },
        { day: '2026-10-03', metric: 'page_follows', value: 12000, breakdown: null },
    ]);
    // Хариунд ирээгүй метрикийг «байхгүй» гэнэ — 0 мөр үүсгэхгүй.
    expect(unavailable).toEqual(PAGE_DAILY_METRICS.filter(m => m !== 'page_media_view' && m !== 'page_follows'));
    const url = urls()[0];
    expect(url.pathname).toBe('/v26.0/42/insights');
    expect(url.searchParams.get('metric')).toBe(PAGE_DAILY_METRICS.join(','));
    expect(url.searchParams.get('period')).toBe('day');
    expect(url.searchParams.get('since')).toBe(String(Date.parse('2026-09-30T00:00:00Z') / 1000));
    expect(url.searchParams.get('until')).toBe(String(Date.parse('2026-10-05T03:00:00Z') / 1000)); // одоо, ирээдүй биш
});

it('isolates one removed metric (code 100) and keeps the rest', async () => {
    http.mockImplementation(async (url: URL) => {
        const metric = url.searchParams.get('metric')!;
        if (metric.includes('page_video_views')) return invalidMetric();
        return reply({ data: [{ name: metric, period: 'day', values: [{ value: 3, end_time: endOf('2026-10-02') }] }] });
    });
    const { rows, unavailable } = await fetchPageDailyInsights('42', 'page-token', '2026-10-01', '2026-10-03');
    expect(unavailable).toEqual(['page_video_views']);
    expect(rows.map(r => r.metric)).toEqual(PAGE_DAILY_METRICS.filter(m => m !== 'page_video_views'));
    expect(http).toHaveBeenCalledTimes(1 + PAGE_DAILY_METRICS.length);
    expect(requested().some(m => REMOVED.includes(m))).toBe(false);
});

it('does not fan out per metric on permission or token errors', async () => {
    http.mockResolvedValue(reply({ error: { code: 10, message: 'requires read_insights' } }, 403));
    await expect(fetchPageDailyInsights('42', 'page-token', '2026-10-01', '2026-10-03')).rejects.toThrow(/read_insights/);
    expect(http).toHaveBeenCalledTimes(1);
});

it('loads posts with lifetime insights in one call; reactions keep their breakdown', async () => {
    http.mockResolvedValueOnce(reply({ data: [{
        id: '42_1', created_time: '2026-10-01T00:00:00+0000', likes: { summary: { total_count: 4 } },
        insights: { data: [
            { name: 'post_media_view', values: [{ value: 900 }] },
            { name: 'post_reactions_by_type_total', values: [{ value: { like: 3, love: 1 } }] },
        ] },
    }] }));
    const { posts, unavailable } = await getPagePosts('42', 'page-token', 25);
    expect(unavailable).toEqual([]);
    expect(posts[0].insights).toEqual({
        post_media_view: { value: 900, breakdown: null },
        post_reactions_by_type_total: { value: 4, breakdown: { like: 3, love: 1 } },
    });
    expect(posts[0].insights.post_total_media_view_unique).toBeUndefined();
    expect(urls()[0].searchParams.get('fields')).toContain(`insights.metric(${POST_LIFETIME_METRICS.join(',')})`);
});

it('probes post metrics once when one is removed, and reloads with the valid ones', async () => {
    http.mockImplementation(async (url: URL) => {
        const fields = url.searchParams.get('fields') ?? '';
        const metric = url.searchParams.get('metric');
        if (fields.includes('post_clicks')) return invalidMetric();
        if (metric?.split(',').includes('post_clicks')) return invalidMetric();
        if (metric) return reply({ data: [{ name: metric, values: [{ value: 1 }] }] });
        if (fields.includes('insights.metric(')) return reply({ data: [{ id: '42_1', created_time: 'x', insights: { data: [{ name: 'post_media_view', values: [{ value: 5 }] }] } }] });
        return reply({ data: [{ id: '42_1', created_time: 'x' }] });
    });
    const { posts, unavailable } = await getPagePosts('42', 'page-token');
    expect(unavailable).toEqual(['post_clicks']);
    expect(posts[0].insights.post_media_view).toEqual({ value: 5, breakdown: null });
    expect(urls().at(-1)!.searchParams.get('fields')).toContain('insights.metric(post_media_view,post_total_media_view_unique,post_reactions_by_type_total)');
});

it('returns posts without insights when insights permission is missing, marking every post metric unavailable', async () => {
    http.mockImplementation(async (url: URL) => (url.searchParams.get('fields') ?? '').includes('insights.metric(')
        ? reply({ error: { code: 10, message: 'read_insights' } }, 403)
        : reply({ data: [{ id: '42_1', created_time: 'x' }] }));
    const { posts, unavailable } = await getPagePosts('42', 'page-token');
    expect(posts).toEqual([{ post: { id: '42_1', created_time: 'x' }, insights: {} }]);
    expect(unavailable).toEqual([...POST_LIFETIME_METRICS]);
    expect(http).toHaveBeenCalledTimes(2);
});

it('drops fan_count from Page info when Graph rejects the field', async () => {
    http.mockResolvedValueOnce(invalidMetric()).mockResolvedValueOnce(reply({ id: '42', name: 'Page', followers_count: 10 }));
    expect(await getPageInfo('42', 'page-token')).toEqual({ id: '42', name: 'Page', followers_count: 10 });
    expect(urls()[0].searchParams.get('fields')).toContain('fan_count');
    expect(urls()[1].searchParams.get('fields')).not.toContain('fan_count');
});

it('reads Instagram account totals with the v26 metrics and follow breakdown; missing values stay null', async () => {
    http.mockImplementation(async (url: URL) => {
        const metric = url.searchParams.get('metric')!;
        if (metric === 'follows_and_unfollows') {
            return reply({ data: [{ name: metric, total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [
                { dimension_values: ['FOLLOWER'], value: 12 }, { dimension_values: ['NON_FOLLOWER'], value: 3 },
            ] }] } }] });
        }
        return reply({ data: [{ name: 'views', total_value: { value: 5000 } }, { name: 'reach', total_value: { value: 1200 } }] });
    });
    const insights = await getInstagramInsights('1789', 'page-token', 7);
    expect(insights.metrics).toMatchObject({ views: 5000, reach: 1200, accounts_engaged: null, saves: null });
    expect(insights.follows).toBe(12);
    expect(insights.unfollows).toBe(3);
    expect(insights.unavailable).toContain('accounts_engaged');
    const [first, second] = urls();
    expect(first.searchParams.get('metric_type')).toBe('total_value');
    expect(first.searchParams.get('period')).toBe('day');
    expect(Number(first.searchParams.get('until')) - Number(first.searchParams.get('since'))).toBe(7 * 86400);
    expect(second.searchParams.get('breakdown')).toBe('follow_type');
    expect(requested().some(m => REMOVED.includes(m))).toBe(false);
});

it('reads Instagram media views (not plays/impressions) and degrades to null on failure', async () => {
    http.mockResolvedValueOnce(reply({ data: [{ name: 'views', values: [{ value: 40 }] }, { name: 'reach', values: [{ value: 30 }] }] }));
    const { metrics } = await getInstagramMediaInsights('1790', 'page-token');
    expect(metrics).toMatchObject({ views: 40, reach: 30, saved: null });
    expect(urls()[0].searchParams.get('metric')).toBe('views,reach,likes,comments,shares,saved,total_interactions');

    http.mockReset();
    http.mockResolvedValue(reply({ error: { code: 10, message: 'x' } }, 403));
    const failed = await getInstagramMediaInsights('1790', 'page-token');
    expect(Object.values(failed.metrics).every(v => v === null)).toBe(true);
});
