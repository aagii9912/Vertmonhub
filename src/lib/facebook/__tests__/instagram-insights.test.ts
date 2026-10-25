// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));

import {
    fetchInstagramDailyInsights, fetchInstagramMediaInsights, instagramFollowRows, metaDayStart, metaInsightDay, shiftDay,
} from '../marketing-api';
import { metaDeadline } from '../daily-spend';
import {
    IG_ACCOUNT_METRICS, IG_ACCOUNT_METRIC_INFO, IG_DAILY_METRICS, IG_DAILY_METRIC_INFO, IG_MEDIA_METRICS, IG_MEDIA_METRIC_INFO,
} from '@/lib/marketing/social-metrics';

const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const invalidMetric = () => reply({ error: { code: 100, message: '(#100) metric is not supported' } }, 400);
const urls = () => http.mock.calls.map(([url]) => url as URL);
const iso = (unix: string | null) => new Date(Number(unix) * 1000).toISOString();
const follows = (follower?: number, nonFollower?: number) => ({
    name: 'follows_and_unfollows', period: 'day', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [
        ...(follower === undefined ? [] : [{ dimension_values: ['FOLLOWER'], value: follower }]),
        ...(nonFollower === undefined ? [] : [{ dimension_values: ['NON_FOLLOWER'], value: nonFollower }]),
    ] }] },
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', http);
    vi.stubEnv('FACEBOOK_APP_SECRET', 'page-app-secret');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z')); // УБ 11:00, PT 2026-10-04 20:00
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

describe('Instagram metric catalog', () => {
    it('stores every account total_value metric plus follows, unfollows and the follower count', () => {
        expect(IG_DAILY_METRICS).toEqual([...IG_ACCOUNT_METRICS, 'follows', 'unfollows', 'followers_count']);
        for (const metric of IG_DAILY_METRICS) expect(IG_DAILY_METRIC_INFO[metric].label).toBeTruthy();
        // Давхардалгүй хүнийг өдрүүдээр нэмэхгүй; дагагчийн тоо = сүүлийн өдрийн төлөв.
        expect(IG_DAILY_METRIC_INFO.reach.kind).toBe('unique');
        expect(IG_DAILY_METRIC_INFO.accounts_engaged.kind).toBe('unique');
        expect(IG_DAILY_METRIC_INFO.followers_count.kind).toBe('latest');
        const summed = IG_DAILY_METRICS.filter(metric => IG_DAILY_METRIC_INFO[metric].kind === 'sum');
        expect(summed).toEqual(['views', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps', 'follows', 'unfollows']);
        expect(IG_DAILY_METRIC_INFO.views).toEqual(IG_ACCOUNT_METRIC_INFO.views);
        expect(Object.keys(IG_MEDIA_METRIC_INFO)).toEqual([...IG_MEDIA_METRICS]);
        expect(Object.values(IG_MEDIA_METRIC_INFO).every(info => info.kind === 'latest')).toBe(true);
        // social_insights_daily.metric CHECK '^[a-z_]{1,64}$'.
        for (const metric of [...IG_DAILY_METRICS, ...IG_MEDIA_METRICS]) expect(metric).toMatch(/^[a-z_]{1,64}$/);
    });
});

describe('metaDayStart', () => {
    it('finds 00:00 Pacific time through Intl, including both DST changes, on a UTC server', () => {
        const tz = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
            const at = (day: string) => new Date(metaDayStart(day) * 1000).toISOString();
            expect(at('2026-10-04')).toBe('2026-10-04T07:00:00.000Z'); // PDT
            expect(at('2026-12-01')).toBe('2026-12-01T08:00:00.000Z'); // PST
            // 2026-11-01: 02:00 PDT → 01:00 PST — өдөр 25 цаг.
            expect(at('2026-11-01')).toBe('2026-11-01T07:00:00.000Z');
            expect(at('2026-11-02')).toBe('2026-11-02T08:00:00.000Z');
            expect(metaDayStart('2026-11-02') - metaDayStart('2026-11-01')).toBe(25 * 3600);
            // 2027-03-14: 02:00 PST → 03:00 PDT — өдөр 23 цаг.
            expect(at('2027-03-14')).toBe('2027-03-14T08:00:00.000Z');
            expect(metaDayStart('2027-03-15') - metaDayStart('2027-03-14')).toBe(23 * 3600);
            // Page-ийн `end_time` (= дараагийн өдрийн эхлэл)-ээр өдрийг тооцоход ижил өдөр гарна.
            for (const day of ['2026-10-31', '2026-11-01', '2026-11-02', '2027-03-13', '2027-03-14', '2027-03-15']) {
                expect(metaInsightDay(new Date(metaDayStart(shiftDay(day, 1)) * 1000).toISOString())).toBe(day);
            }
        } finally { process.env.TZ = tz; }
    });
});

describe('fetchInstagramDailyInsights', () => {
    it('asks one total_value window per finished Pacific day, newest first, and never writes 0 for what Meta omitted', async () => {
        http.mockImplementation(async (url: URL) => {
            const day = metaInsightDay(new Date(Number(url.searchParams.get('until')) * 1000).toISOString());
            if (url.searchParams.get('metric') === 'follows_and_unfollows') return reply({ data: day === '2026-10-03' ? [follows(4, 1)] : [follows(2)] });
            // 10.02-нд Meta `saves`-ийг огт буцаагаагүй.
            return reply({ data: [
                { name: 'views', period: 'day', total_value: { value: day === '2026-10-03' ? 900 : 700 } },
                { name: 'reach', period: 'day', total_value: { value: 300 } },
                ...(day === '2026-10-03' ? [{ name: 'saves', period: 'day', total_value: { value: 6 } }] : []),
                { name: 'likes', period: 'day', total_value: { value: 'x' } },
            ] });
        });
        // `to` нь PT-ийн өнөөдөр (10.04, дуусаагүй) — татахгүй.
        const { rows, unavailable, days, stopped } = await fetchInstagramDailyInsights('1789', 'ig-token', '2026-10-02', '2026-10-04');
        expect(days).toBe(2);
        expect(stopped).toBeNull();
        expect(rows).toEqual([
            { day: '2026-10-03', metric: 'views', value: 900 }, { day: '2026-10-03', metric: 'reach', value: 300 }, { day: '2026-10-03', metric: 'saves', value: 6 },
            { day: '2026-10-03', metric: 'follows', value: 4 }, { day: '2026-10-03', metric: 'unfollows', value: 1 },
            { day: '2026-10-02', metric: 'views', value: 700 }, { day: '2026-10-02', metric: 'reach', value: 300 },
            // Задаргаа ирсэн, NON_FOLLOWER алга = Meta-гийн 0 (тэг утгатай төрлийг орхидог).
            { day: '2026-10-02', metric: 'follows', value: 2 }, { day: '2026-10-02', metric: 'unfollows', value: 0 },
        ]);
        expect(rows.some(row => row.metric === 'likes')).toBe(false);
        expect(unavailable).toEqual(['accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'profile_links_taps']);
        const calls = urls();
        expect(calls).toHaveLength(4);
        expect(calls[0].pathname).toBe('/v26.0/1789/insights');
        expect(calls[0].searchParams.get('metric')).toBe(IG_ACCOUNT_METRICS.join(','));
        expect(calls[0].searchParams.get('metric_type')).toBe('total_value');
        expect(calls[0].searchParams.get('period')).toBe('day');
        expect(iso(calls[0].searchParams.get('since'))).toBe('2026-10-03T07:00:00.000Z');
        expect(iso(calls[0].searchParams.get('until'))).toBe('2026-10-04T07:00:00.000Z');
        expect(calls[1].searchParams.get('breakdown')).toBe('follow_type');
        expect(iso(calls[2].searchParams.get('since'))).toBe('2026-10-02T07:00:00.000Z');
        // Токен URL-д орохгүй.
        expect(calls.every(url => !url.search.includes('ig-token') && url.searchParams.has('appsecret_proof'))).toBe(true);
    });

    it('drops a metric Graph v26 rejects (code 100) for the remaining days and keeps the rest', async () => {
        http.mockImplementation(async (url: URL) => {
            const metric = url.searchParams.get('metric')!;
            if (metric === 'follows_and_unfollows') return invalidMetric(); // < 100 дагагчтай аккаунт
            if (metric.split(',').includes('profile_links_taps')) return invalidMetric();
            return reply({ data: metric.split(',').map(name => ({ name, period: 'day', total_value: { value: 1 } })) });
        });
        const { rows, unavailable, days } = await fetchInstagramDailyInsights('1789', 'ig-token', '2026-10-01', '2026-10-03');
        expect(days).toBe(3);
        expect(unavailable).toEqual(['profile_links_taps', 'follows', 'unfollows']);
        expect(new Set(rows.map(row => row.metric))).toEqual(new Set(IG_ACCOUNT_METRICS.filter(metric => metric !== 'profile_links_taps')));
        // Эхний өдөр: багц + метрик бүр (9) + дагалт; дараагийн өдрүүд: 8 метрикийн нэг багц л.
        expect(http).toHaveBeenCalledTimes(1 + IG_ACCOUNT_METRICS.length + 1 + 2);
        expect(urls().at(-1)!.searchParams.get('metric')).toBe(IG_ACCOUNT_METRICS.filter(metric => metric !== 'profile_links_taps').join(','));
    });

    it('fails on the first day, but keeps the finished days when a later day fails or time runs out', async () => {
        http.mockResolvedValue(reply({ error: { code: 10, message: 'instagram_manage_insights' } }, 403));
        await expect(fetchInstagramDailyInsights('1789', 'ig-token', '2026-10-01', '2026-10-03')).rejects.toThrow(/эрх дутуу/);
        expect(http).toHaveBeenCalledTimes(1);

        http.mockReset();
        let call = 0;
        http.mockImplementation(async (url: URL) => {
            call++;
            if (call > 2) return reply({ error: { code: 190, message: 'expired' } }, 400);
            return reply({ data: url.searchParams.get('metric') === 'follows_and_unfollows' ? [follows(1, 0)] : [{ name: 'views', total_value: { value: 5 } }] });
        });
        const partial = await fetchInstagramDailyInsights('1789', 'ig-token', '2026-10-01', '2026-10-03');
        expect(partial).toMatchObject({ days: 1, stopped: expect.stringMatching(/дахин холбоно уу/) });
        expect(partial.rows.map(row => row.day)).toEqual(['2026-10-03', '2026-10-03', '2026-10-03']);

        http.mockReset();
        const expired = metaDeadline(0);
        const none = await fetchInstagramDailyInsights('1789', 'ig-token', '2026-10-01', '2026-10-03', { deadline: expired });
        expect(none).toMatchObject({ rows: [], days: 0, stopped: expect.stringMatching(/хугацаа дууслаа/) });
        expect(http).not.toHaveBeenCalled();
    });
});

describe('instagramFollowRows', () => {
    it('maps the follow_type breakdown and stores nothing when Meta sent no breakdown', () => {
        expect(instagramFollowRows('2026-10-03', follows(3, 2))).toEqual([{ day: '2026-10-03', metric: 'follows', value: 3 }, { day: '2026-10-03', metric: 'unfollows', value: 2 }]);
        expect(instagramFollowRows('2026-10-03', follows())).toEqual([{ day: '2026-10-03', metric: 'follows', value: 0 }, { day: '2026-10-03', metric: 'unfollows', value: 0 }]);
        expect(instagramFollowRows('2026-10-03', undefined)).toEqual([]);
        expect(instagramFollowRows('2026-10-03', { name: 'follows_and_unfollows', total_value: { value: 5 } })).toEqual([]);
        // Тоо биш утга — тэр төрөл мөргүй.
        expect(instagramFollowRows('2026-10-03', { name: 'follows_and_unfollows', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [{ dimension_values: ['FOLLOWER'], value: 'x' }] }] } }))
            .toEqual([{ day: '2026-10-03', metric: 'unfollows', value: 0 }]);
    });
});

describe('fetchInstagramMediaInsights', () => {
    it('returns only numbers Meta gave and stops at media posted before the business conversion without probing each metric', async () => {
        http.mockResolvedValueOnce(reply({ data: [{ name: 'views', values: [{ value: 40 }] }, { name: 'reach', values: [{ value: 30 }] }, { name: 'saved', values: [{ value: null }] }] }));
        expect(await fetchInstagramMediaInsights('1790', 'ig-token')).toEqual({ values: { views: 40, reach: 30 }, unavailable: ['likes', 'comments', 'shares', 'saved', 'total_interactions'], invalid: [] });

        http.mockReset();
        http.mockResolvedValue(reply({ error: { code: 100, error_subcode: 2108006, message: 'Media posted before business account conversion' } }, 400));
        await expect(fetchInstagramMediaInsights('1790', 'ig-token')).rejects.toThrow(/code 100/);
        expect(http).toHaveBeenCalledTimes(1);
    });
});
