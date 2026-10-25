import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    IG_WEEK_METRICS, SOCIAL_WEEK_METRICS, latestSocialRanges, loadInstagramWeek, loadLatestInstagramWeek, loadLatestSocialWeek, loadSocialWeek,
    summarizeInstagramWeek, summarizeSocialWeek, summarizeWeekMetrics, type SocialDailyRow,
} from '../social-week';
import { PAGE_METRIC_INFO, previousCoverageNote, weekCoverageDays } from '../social-metrics';

const range = { from: '2026-10-07', to: '2026-10-13' };
const previousRange = { from: '2026-09-30', to: '2026-10-06' };
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
const metric = (rows: SocialDailyRow[], name: string) => summarizeSocialWeek(rows, range, previousRange).find(item => item.metric === name)!;

describe('summarizeSocialWeek', () => {
    it('sums additive metrics, keeps the last day for follower totals and compares only complete weeks', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 7).map(day => ({ day, metric: 'page_media_view', value: 100 })),
            ...days(previousRange.from, 7).map(day => ({ day, metric: 'page_media_view', value: 50 })),
            ...days(range.from, 7).map((day, i) => ({ day, metric: 'page_follows', value: 1000 + i })),
            ...days(previousRange.from, 6).map(day => ({ day, metric: 'page_follows', value: 990 })),
        ];
        expect(metric(rows, 'page_media_view')).toMatchObject({ value: 700, previous: 350, comparison: 'week', days: 7, delta: 350, deltaPct: 100 });
        // Дагагчийг 7 хоногийн өмнөх өдөртэй (10.06) харьцуулна — тэр өдөр алга бол харьцуулахгүй.
        expect(metric(rows, 'page_follows')).toMatchObject({ value: 1006, day: '2026-10-13', comparison: 'week-ago', previous: null, delta: null });
        expect(metric([...rows, { day: '2026-10-06', metric: 'page_follows', value: 996 }], 'page_follows')).toMatchObject({ previous: 996, delta: 10, deltaPct: 1 });
    });

    it('compares an unfinished week with the same days of the previous week', () => {
        // Хурлын өглөө Meta-гийн Мягмар дуусаагүй: 10.07–10.12 (6 өдөр) ↔ 09.30–10.05.
        const rows: SocialDailyRow[] = [
            ...days(range.from, 6).map(day => ({ day, metric: 'page_media_view', value: 100 })),
            ...days(previousRange.from, 7).map((day, i) => ({ day, metric: 'page_media_view', value: i === 6 ? 1000 : 80 })),
        ];
        expect(metric(rows, 'page_media_view')).toMatchObject({ value: 600, days: 6, comparison: 'same-days', previous: 480, delta: 120, deltaPct: 25 });
    });

    it('reports how many days the previous sum covers, so a partial base is never shown as a full week', () => {
        // Instagram-ийн анхны синк хурдны хязгаарт тасарсан: өмнөх долоо хоногийн 3 өдөр л хадгалагдсан.
        const rows: SocialDailyRow[] = [
            ...days(range.from, 7).map(day => ({ day, metric: 'page_media_view', value: 100 })),
            ...days('2026-10-04', 3).map(day => ({ day, metric: 'page_media_view', value: 50 })),
        ];
        const views = metric(rows, 'page_media_view');
        expect(views).toMatchObject({ value: 700, previous: 150, days: 7, previousDays: 3, delta: null, deltaPct: null });
        expect(previousCoverageNote(views)).toBe('3/7 өдөр');
        // Бүтэн бол тэмдэглэлгүй; төлөв (дагагч) метрикт хамаарахгүй.
        const full = [...rows, ...days(previousRange.from, 4).map(day => ({ day, metric: 'page_media_view', value: 50 }))];
        expect(previousCoverageNote(metric(full, 'page_media_view'))).toBeNull();
        expect(previousCoverageNote({ kind: 'latest', previous: 900, previousDays: 0, days: 1 })).toBeNull();
        expect(previousCoverageNote({ kind: 'sum', previous: null, previousDays: 0, days: 7 })).toBeNull();
    });

    it('counts week coverage over summed metrics only — a follower snapshot of the unfinished Meta day does not make the week complete', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 6).map(day => ({ day, metric: 'page_media_view', value: 100 })),
            ...days(range.from, 7).map(day => ({ day, metric: 'page_follows', value: 1000 })),
        ];
        const metrics = summarizeSocialWeek(rows, range, previousRange);
        expect(Math.max(...metrics.map(item => item.days))).toBe(7);
        expect(weekCoverageDays(metrics)).toBe(6);
        expect(weekCoverageDays([])).toBe(0);
    });

    it('returns null, never zero, when Meta returned nothing; skips the non-additive unique reach', () => {
        const result = summarizeSocialWeek([{ day: '2026-10-08', metric: 'page_video_views', value: null }], range, previousRange);
        expect(result.find(item => item.metric === 'page_video_views')).toMatchObject({ value: null, previous: null, days: 0, delta: null });
        expect(result.map(item => item.metric)).not.toContain('page_total_media_view_unique');
    });

    it('ignores rows outside both weeks and gives no percent against a zero week', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 7).map(day => ({ day, metric: 'page_video_views', value: 2 })),
            ...days(previousRange.from, 7).map(day => ({ day, metric: 'page_video_views', value: 0 })),
            { day: '2026-10-14', metric: 'page_video_views', value: 999 },
        ];
        expect(metric(rows, 'page_video_views')).toMatchObject({ value: 14, previous: 0, delta: 14, deltaPct: null });
    });

    it('leaves out page_total_actions, which Meta returns as 0 every day', () => {
        const rows = days(range.from, 7).map(day => ({ day, metric: 'page_total_actions', value: 0 }));
        expect(summarizeSocialWeek(rows, range, previousRange).map(item => item.metric)).toEqual([...SOCIAL_WEEK_METRICS]);
        expect(SOCIAL_WEEK_METRICS).not.toContain('page_total_actions');
    });

    it('is the generic summariser applied to the Page catalog', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 6).map(day => ({ day, metric: 'page_media_view', value: 100 })),
            ...days(previousRange.from, 7).map((day, i) => ({ day, metric: 'page_follows', value: 900 + i })),
            ...days(range.from, 7).map((day, i) => ({ day, metric: 'page_follows', value: 910 + i })),
        ];
        expect(summarizeWeekMetrics(rows, range, previousRange, SOCIAL_WEEK_METRICS, PAGE_METRIC_INFO)).toEqual(summarizeSocialWeek(rows, range, previousRange));
    });
});

describe('summarizeInstagramWeek', () => {
    it('sums Instagram actions, keeps the follower snapshot and never adds daily unique reach', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 7).flatMap((day, i) => [
                { day, metric: 'views', value: 300 }, { day, metric: 'reach', value: 200 }, { day, metric: 'accounts_engaged', value: 20 },
                { day, metric: 'follows', value: i === 0 ? 0 : 2 }, { day, metric: 'followers_count', value: 800 + i },
            ]),
            ...days(previousRange.from, 7).flatMap(day => [{ day, metric: 'views', value: 200 }, { day, metric: 'follows', value: 1 }]),
            { day: '2026-10-06', metric: 'followers_count', value: 790 },
        ];
        const week = summarizeInstagramWeek(rows, range, previousRange);
        expect(week.map(item => item.metric)).toEqual([...IG_WEEK_METRICS]);
        expect(week.map(item => item.metric)).not.toContain('reach');
        expect(week.map(item => item.metric)).not.toContain('accounts_engaged');
        const at = (name: string) => week.find(item => item.metric === name)!;
        expect(at('views')).toMatchObject({ label: 'Үзэлт', kind: 'sum', value: 2100, previous: 1400, comparison: 'week', delta: 700, deltaPct: 50 });
        // Эхний өдрийн 0 нь Meta-гийн хариу — 7 өдөр бүрэн.
        expect(at('follows')).toMatchObject({ label: 'Шинэ дагагч', value: 12, days: 7, previous: 7, delta: 5 });
        expect(at('followers_count')).toMatchObject({ label: 'Дагагч', kind: 'latest', value: 806, day: '2026-10-13', comparison: 'week-ago', previous: 790, delta: 16 });
        // Хадгалаагүй метрик 0 биш — null.
        expect(at('saves')).toMatchObject({ value: null, previous: null, days: 0, delta: null });
    });

    it('compares an unfinished Instagram week with the same days of the previous week', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 6).map(day => ({ day, metric: 'total_interactions', value: 50 })),
            ...days(previousRange.from, 7).map((day, i) => ({ day, metric: 'total_interactions', value: i === 6 ? 999 : 40 })),
        ];
        expect(summarizeInstagramWeek(rows, range, previousRange).find(item => item.metric === 'total_interactions'))
            .toMatchObject({ value: 300, days: 6, comparison: 'same-days', previous: 240, delta: 60, deltaPct: 25 });
    });
});

type Filter = { op: string; args: unknown[] };
/** Хамгийн энгийн chainable fake: хүснэгт бүрт өгсөн хариуг (эсвэл шүүлтээс хамаарсан функц) буцааж, шүүлтүүдийг бүртгэнэ. */
function fakeDb(tables: Record<string, unknown | ((filters: Filter[]) => unknown)>) {
    const calls: { table: string; op: string; args: unknown[] }[] = [];
    const from = (table: string) => {
        const builder: Record<string, unknown> = {};
        const filters: Filter[] = [];
        for (const op of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'range']) builder[op] = (...args: unknown[]) => { calls.push({ table, op, args }); filters.push({ op, args }); return builder; };
        const value = tables[table];
        const result = () => ({ data: (typeof value === 'function' ? value(filters) : value) ?? null, error: null });
        builder.single = async () => result();
        builder.maybeSingle = async () => result();
        builder.then = (resolve: (value: unknown) => unknown) => resolve(result());
        return builder;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

describe('loadSocialWeek', () => {
    it('returns an empty week when no Page is connected', async () => {
        const { db } = fakeDb({ shops: { facebook_page_id: null, facebook_page_name: null } });
        expect(await loadSocialWeek(db, 'shop', range, previousRange)).toMatchObject({ page: null, metrics: [], posts: [], rangeDays: 7 });
    });

    it('reads posts by Ulaanbaatar days with their latest stored views and ranks them by views (unknown last)', async () => {
        const isPost = (filters: Filter[]) => filters.some(filter => filter.op === 'eq' && filter.args[0] === 'object_type' && filter.args[1] === 'post');
        const { db, calls } = fakeDb({
            shops: { facebook_page_id: '676357242225387', facebook_page_name: 'Elysium Residence' },
            social_insights_sync: { last_to: '2026-10-12' },
            social_insights_daily: (filters: Filter[]) => isPost(filters) ? [
                // Шинэ өдөр эхэнд (order day desc).
                { object_id: 'b', metric: 'post_media_view', value: '900', day: '2026-10-13' },
                { object_id: 'b', metric: 'post_clicks', value: '12', day: '2026-10-13' },
                { object_id: 'b', metric: 'post_media_view', value: '400', day: '2026-10-09' },
            ] : [{ day: '2026-10-08', metric: 'page_media_view', value: '1200' }],
            social_posts: [
                { external_post_id: 'a', content: 'A', likes: 1, comments: 0, shares: 0, published_at: '2026-10-09T01:00:00Z' },
                { external_post_id: 'b', content: 'B', likes: 5, comments: 1, shares: 0, published_at: '2026-10-08T01:00:00Z' },
            ],
        });
        const week = await loadSocialWeek(db, 'shop', range, previousRange);
        expect(week.page).toEqual({ id: '676357242225387', name: 'Elysium Residence' });
        expect(week.syncedTo).toBe('2026-10-12');
        expect(week.posts.map(post => post.id)).toEqual(['b', 'a']);
        expect(week.posts[0]).toMatchObject({ views: 900, clicks: 12, asOf: '2026-10-13' });
        expect(week.posts[1]).toMatchObject({ views: null, clicks: null, asOf: null });
        expect(week.metrics.find(item => item.metric === 'page_media_view')?.value).toBe(1200);
        const posts = calls.filter(call => call.table === 'social_posts');
        // 2026-10-07 00:00 УБ = 2026-10-06 16:00Z, 2026-10-13-ны төгсгөл = 2026-10-13 16:00Z.
        expect(posts).toContainEqual({ table: 'social_posts', op: 'gte', args: ['published_at', '2026-10-06T16:00:00.000Z'] });
        expect(posts).toContainEqual({ table: 'social_posts', op: 'lt', args: ['published_at', '2026-10-13T16:00:00.000Z'] });
        expect(calls).toContainEqual({ table: 'social_insights_daily', op: 'gte', args: ['day', previousRange.from] });
    });
});

describe('latestSocialRanges', () => {
    it('ends at the last synced Meta day, not inside the unfinished meeting week', () => {
        // Пүрэв 10.15: Meta-гийн 10.14 хараахан дуусаагүй, синк 10.13 хүртэл → 10.07–10.13 ↔ 09.30–10.06.
        expect(latestSocialRanges('2026-10-13', '2026-10-15')).toEqual({
            range: { from: '2026-10-07', to: '2026-10-13' }, previousRange: { from: '2026-09-30', to: '2026-10-06' },
        });
    });

    it('never ends after yesterday and falls back to yesterday without a sync', () => {
        expect(latestSocialRanges('2026-10-15', '2026-10-15').range).toEqual({ from: '2026-10-08', to: '2026-10-14' });
        expect(latestSocialRanges(null, '2026-03-01').range).toEqual({ from: '2026-02-22', to: '2026-02-28' });
    });
});

describe('loadLatestSocialWeek', () => {
    it('reads the stored days up to the last sync and compares them with the 7 days before', async () => {
        const { db, calls } = fakeDb({
            shops: { facebook_page_id: '676357242225387', facebook_page_name: 'Elysium Residence' },
            social_insights_sync: { last_to: '2026-10-13' },
            social_insights_daily: [
                ...days('2026-10-07', 7).map(day => ({ day, metric: 'page_media_view', value: '100' })),
                ...days('2026-09-30', 7).map(day => ({ day, metric: 'page_media_view', value: '50' })),
            ],
            social_posts: [],
        });
        const week = await loadLatestSocialWeek(db, 'shop', '2026-10-15');
        expect(week).toMatchObject({ range: { from: '2026-10-07', to: '2026-10-13' }, syncedTo: '2026-10-13' });
        expect(week.metrics.find(item => item.metric === 'page_media_view')).toMatchObject({ value: 700, previous: 350, comparison: 'week', deltaPct: 100 });
        expect(calls).toContainEqual({ table: 'social_insights_sync', op: 'eq', args: ['page_id', '676357242225387'] });
        expect(calls).toContainEqual({ table: 'social_insights_daily', op: 'gte', args: ['day', '2026-09-30'] });
    });

    it('returns an empty week ending yesterday when no Page is connected', async () => {
        const { db, calls } = fakeDb({ shops: { facebook_page_id: null, facebook_page_name: null } });
        expect(await loadLatestSocialWeek(db, 'shop', '2026-10-15')).toMatchObject({ page: null, range: { from: '2026-10-08', to: '2026-10-14' }, metrics: [] });
        expect(calls.some(call => call.table === 'social_insights_sync')).toBe(false);
    });
});

describe('loadInstagramWeek', () => {
    const IG = '17841475771440904';
    const isPost = (filters: Filter[]) => filters.some(filter => filter.op === 'eq' && filter.args[0] === 'object_type' && filter.args[1] === 'post');

    it('returns an empty week when no Instagram account is connected', async () => {
        const { db, calls } = fakeDb({ shops: { instagram_business_account_id: null, instagram_username: null } });
        expect(await loadInstagramWeek(db, 'shop', range, previousRange)).toMatchObject({ account: null, metrics: [], posts: [], rangeDays: 7 });
        expect(calls.some(call => call.table === 'social_insights_daily')).toBe(false);
    });

    it('reads stored Instagram days and the week media with their latest views and real reach', async () => {
        const { db, calls } = fakeDb({
            shops: { instagram_business_account_id: IG, instagram_username: 'elysiumbymoncon' },
            social_insights_sync: { last_to: '2026-10-12' },
            social_insights_daily: (filters: Filter[]) => isPost(filters) ? [
                { object_id: '1791', metric: 'views', value: '1500', day: '2026-10-13', page_id: IG },
                { object_id: '1791', metric: 'reach', value: '1100', day: '2026-10-13', page_id: IG },
                { object_id: '1791', metric: 'saved', value: '9', day: '2026-10-13', page_id: IG },
                { object_id: '1791', metric: 'views', value: '600', day: '2026-10-10', page_id: IG },
                { object_id: '1790', metric: 'shares', value: '4', day: '2026-10-13', page_id: IG },
            ] : [
                ...days(range.from, 7).map(day => ({ day, metric: 'views', value: '300' })),
                { day: '2026-10-13', metric: 'followers_count', value: '812' },
            ],
            social_posts: [
                { external_post_id: '1790', content: 'Пост', likes: 10, comments: 2, shares: null, published_at: '2026-10-09T01:00:00Z' },
                { external_post_id: '1791', content: 'Reel', likes: 31, comments: 4, shares: 3, published_at: '2026-10-08T01:00:00Z' },
            ],
        });
        const week = await loadInstagramWeek(db, 'shop', range, previousRange);
        expect(week.account).toEqual({ id: IG, username: 'elysiumbymoncon' });
        expect(week.syncedTo).toBe('2026-10-12');
        expect(week.metrics.find(item => item.metric === 'views')).toMatchObject({ value: 2100, days: 7 });
        expect(week.metrics.find(item => item.metric === 'followers_count')).toMatchObject({ value: 812, day: '2026-10-13' });
        expect(week.posts.map(post => post.id)).toEqual(['1791', '1790']);
        expect(week.posts[0]).toEqual({ id: '1791', content: 'Reel', publishedAt: '2026-10-08T01:00:00Z', views: 1500, reach: 1100, likes: 31, comments: 4, shares: 3, saved: 9, asOf: '2026-10-13' });
        expect(week.posts[1]).toMatchObject({ views: null, reach: null, shares: 4, saved: null, asOf: null });
        expect(calls).toContainEqual({ table: 'social_insights_daily', op: 'eq', args: ['platform', 'instagram'] });
        expect(calls).toContainEqual({ table: 'social_insights_daily', op: 'eq', args: ['page_id', IG] });
        expect(calls).toContainEqual({ table: 'social_insights_sync', op: 'eq', args: ['platform', 'instagram'] });
        expect(calls).toContainEqual({ table: 'social_posts', op: 'eq', args: ['platform', 'instagram'] });
        expect(calls).toContainEqual({ table: 'social_posts', op: 'gte', args: ['published_at', '2026-10-06T16:00:00.000Z'] });
    });

    it('leaves out media of a previously connected Instagram account (its rows carry the other account id)', async () => {
        const OLD = '17841400000000001';
        const { db } = fakeDb({
            shops: { instagram_business_account_id: IG, instagram_username: 'elysiumbymoncon' },
            social_insights_sync: { last_to: '2026-10-12' },
            social_insights_daily: (filters: Filter[]) => isPost(filters) ? [
                { object_id: '1791', metric: 'views', value: '1500', day: '2026-10-13', page_id: IG },
                // @mandalatower-ийн media: Elysium-д андуурч холбож байх үед хадгалагдсан.
                { object_id: '1888', metric: 'views', value: '9000', day: '2026-10-11', page_id: OLD },
                { object_id: '1888', metric: 'reach', value: '7000', day: '2026-10-11', page_id: OLD },
            ] : [],
            social_posts: [
                { external_post_id: '1888', content: 'Tower reel', likes: 90, comments: 5, shares: 2, published_at: '2026-10-09T01:00:00Z' },
                { external_post_id: '1791', content: 'Reel', likes: 31, comments: 4, shares: 3, published_at: '2026-10-08T01:00:00Z' },
                // Insights татагдаагүй (мөргүй) media — аль аккаунтынх нь тодорхойгүй тул хасахгүй.
                { external_post_id: '1792', content: 'Шинэ пост', likes: 1, comments: 0, shares: null, published_at: '2026-10-12T01:00:00Z' },
            ],
        });
        const week = await loadInstagramWeek(db, 'shop', range, previousRange);
        expect(week.posts.map(post => post.id)).toEqual(['1791', '1792']);
        expect(JSON.stringify(week.posts)).not.toContain('9000');
    });

    it('reads the latest synced Instagram week for the marketing dashboard', async () => {
        const { db, calls } = fakeDb({
            shops: { instagram_business_account_id: IG, instagram_username: null },
            social_insights_sync: { last_to: '2026-10-13' },
            social_insights_daily: [], social_posts: [],
        });
        const week = await loadLatestInstagramWeek(db, 'shop', '2026-10-15');
        expect(week).toMatchObject({ range: { from: '2026-10-07', to: '2026-10-13' }, syncedTo: '2026-10-13' });
        expect(week.metrics.every(item => item.value === null)).toBe(true);
        expect(calls).toContainEqual({ table: 'social_insights_sync', op: 'eq', args: ['page_id', IG] });
    });
});
