import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { latestSocialRanges, loadLatestSocialWeek, loadSocialWeek, summarizeSocialWeek, type SocialDailyRow } from '../social-week';

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

    it('returns null, never zero, when Meta returned nothing; skips the non-additive unique reach', () => {
        const result = summarizeSocialWeek([{ day: '2026-10-08', metric: 'page_video_views', value: null }], range, previousRange);
        expect(result.find(item => item.metric === 'page_video_views')).toMatchObject({ value: null, previous: null, days: 0, delta: null });
        expect(result.map(item => item.metric)).not.toContain('page_total_media_view_unique');
    });

    it('ignores rows outside both weeks and gives no percent against a zero week', () => {
        const rows: SocialDailyRow[] = [
            ...days(range.from, 7).map(day => ({ day, metric: 'page_total_actions', value: 2 })),
            ...days(previousRange.from, 7).map(day => ({ day, metric: 'page_total_actions', value: 0 })),
            { day: '2026-10-14', metric: 'page_total_actions', value: 999 },
        ];
        expect(metric(rows, 'page_total_actions')).toMatchObject({ value: 14, previous: 0, delta: 14, deltaPct: null });
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
