// @vitest-environment node
// Огнооны хил: Vercel UTC-д ажилладаг тул өдрийн шилжилтийг UTC-д шалгана.
process.env.TZ = 'UTC';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMetaChannelReport, compareMetaSameDays, metaSameDaysTotals } from '../meta-channel-report';
import { loadChannelReports, metaSameDaysPlan, type ChannelReportSummary } from '../channel-reports-load';
import type { MetaInsightRow } from '../meta-result-groups';

vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const row = (day: string, patch: Partial<MetaInsightRow> = {}): MetaInsightRow => ({
    day, campaign_id: '11', campaign_name: 'Дуудлага', adset_id: '101', spend: 10, impressions: 1000, reach: 900, clicks: 30,
    inline_link_clicks: 20, landing_page_views: 5, result_type: 'calls', results: 2, result_source: 'results', ...patch,
});
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

// Өмнөх хурлын долоо хоног 10.14–10.20 (бүтэн, API), энэ долоо хоног 10.21–10.27-оос хурлын өглөө 10.21–10.26 (6/7 өдөр).
const previousRows = days('2026-10-14', 7).flatMap((day, i) => [
    row(day, { spend: 10 + i, impressions: 1000 + i * 100 }),
    // Постын оролцоо зөвхөн долоо хоногийн сүүлийн өдөр (мөн өдрүүдэд ороогүй) — мөн өдрүүдэд 0.
    ...(i === 6 ? [row(day, { campaign_id: '22', campaign_name: 'Пост', adset_id: '201', spend: 5, impressions: 4000, result_type: 'post_interaction', results: 300 })] : []),
]);
const previousReport = buildMetaChannelReport({ rows: previousRows, currency: 'USD', reach: { account: 6000, campaigns: new Map([['11', 5000], ['22', 2000]]) } });
const currentRows = days('2026-10-21', 6).map((day, i) => row(day, { spend: 12 + i, impressions: 1100 + i * 100, results: 3 }));
const currentReport = buildMetaChannelReport({ rows: currentRows, currency: 'USD', reach: { account: 5200, campaigns: new Map([['11', 5200]]) } });

const summary = (id: string, from: string, to: string, data: { from: string; to: string }, totals: ChannelReportSummary['totals'], origin: 'api' | 'file' = 'api'): ChannelReportSummary => ({
    id, source: 'meta_ads', period_from: from, period_to: to, origin, data_from: data.from, data_to: data.to, file_name: origin === 'file' ? 'meta.csv' : null,
    totals, warnings: [], row_count: 7, note: null, imported_by: null, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});
const current = summary('cur', '2026-10-21', '2026-10-27', { from: '2026-10-21', to: '2026-10-26' }, currentReport.totals);
const previous = summary('prev', '2026-10-14', '2026-10-20', { from: '2026-10-14', to: '2026-10-20' }, previousReport.totals);

describe('Meta same-days comparison (pure)', () => {
    it('sums only the same days of the previous week, keeps known types at 0 and leaves reach/frequency out', () => {
        const totals = metaSameDaysTotals({ rows: previousRows, previous, days: { from: '2026-10-14', to: '2026-10-19' }, knownTypes: ['calls', 'post_interaction'] })!;
        // 6 өдөр: зардал 10+…+15 = 75, харагдалт 1000+…+1500 = 7500, дуудлага 12.
        expect(totals).toMatchObject({ spend: 75, impressions: 7500, link_clicks: 120, results_calls: 12, spend_calls: 75, cost_per_result_calls: 6.25, cpm: 10, ctr_link: 1.6 });
        expect(totals.results_post_interaction).toBe(0);
        expect(totals.spend_post_interaction).toBe(0);
        for (const key of ['reach', 'frequency', 'results_reach', 'cost_per_result_reach']) expect(totals).not.toHaveProperty(key);

        const comparison = compareMetaSameDays(current.totals, totals);
        // Энэ долоо хоног: 12+…+17 = 87 USD, 3 × 6 = 18 дуудлага.
        expect(comparison.spend).toMatchObject({ current: 87, previous: 75, delta: 12, pct: 16, comparable: true });
        expect(comparison.results_calls).toMatchObject({ current: 18, previous: 12, delta: 6, pct: 50 });
        expect(comparison.cost_per_result_calls).toMatchObject({ previous: 6.25, comparable: true });
        expect(comparison).not.toHaveProperty('reach');
        expect(comparison).not.toHaveProperty('frequency');
    });

    it('refuses when the stored rows no longer rebuild the previous API report (account changed, rows rewritten) or miss the days', () => {
        const days6 = { from: '2026-10-14', to: '2026-10-19' };
        expect(metaSameDaysTotals({ rows: previousRows.slice(1), previous, days: days6, knownTypes: [] })).toBeNull();
        expect(metaSameDaysTotals({ rows: [], previous, days: days6, knownTypes: [] })).toBeNull();
        expect(metaSameDaysTotals({ rows: previousRows, previous: { ...previous, data_to: '2026-10-18' }, days: days6, knownTypes: [] })).toBeNull();
        expect(metaSameDaysTotals({ rows: previousRows, previous: { ...previous, totals: { ...previous.totals, currency: 1 } }, days: days6, knownTypes: [] })).toBeNull();
    });

    it('plans the same days only for a partial API week against the previous API week — never against a file report', () => {
        expect(metaSameDaysPlan(current, [current, previous])).toEqual({ previous, days: { from: '2026-10-14', to: '2026-10-19' } });
        expect(metaSameDaysPlan(current, [current, { ...previous, origin: 'file' }])).toBeNull();
        expect(metaSameDaysPlan({ ...current, origin: 'file' }, [current, previous])).toBeNull();
        // Бүтэн долоо хоног: ердийн (өмнөх тайлантай) харьцуулалт.
        expect(metaSameDaysPlan({ ...current, data_to: '2026-10-27' }, [previous])).toBeNull();
        // Өмнөх долоо хоног мөн өдрүүдийг хамраагүй, эсвэл залгаа биш.
        expect(metaSameDaysPlan(current, [{ ...previous, data_to: '2026-10-18' }])).toBeNull();
        expect(metaSameDaysPlan(current, [{ ...previous, period_from: '2026-10-07', period_to: '2026-10-13' }])).toBeNull();
        // Сарын хил (UTC): 2026-11-04–11-10 → 10.28–11.02.
        const november = { ...current, period_from: '2026-11-04', period_to: '2026-11-10', data_from: '2026-11-04', data_to: '2026-11-09' };
        const october = { ...previous, period_from: '2026-10-28', period_to: '2026-11-03', data_from: '2026-10-28', data_to: '2026-11-03' };
        expect(metaSameDaysPlan(november, [october])?.days).toEqual({ from: '2026-10-28', to: '2026-11-02' });
    });
});

/** Хүснэгтээр хариулах хуурамч Supabase: тайлангууд, дэлгэрэнгүй, shops, ad set × өдрийн мөр. */
function fakeDb(input: { summaries: ChannelReportSummary[]; account: string | null; rows: MetaInsightRow[]; rowsError?: { message: string } }) {
    const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
    const db = {
        from: (table: string) => {
            const ops: Array<[string, unknown[]]> = [];
            calls.push({ table, ops });
            const builder: Record<string, unknown> = new Proxy({}, {
                get(_t, prop: string) {
                    if (prop === 'then') {
                        const result = table === 'shops' ? { data: { facebook_ad_account_id: input.account }, error: null }
                            : table === 'meta_ad_insights_daily' ? (input.rowsError ? { data: null, error: input.rowsError } : { data: input.rows, error: null })
                            : ops.some(([op, args]) => op === 'in' && args[0] === 'id') ? { data: input.summaries.map(s => ({ id: s.id, breakdown: [], mapping: {} })), error: null }
                            : { data: input.summaries, error: null };
                        return (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
                    }
                    return (...args: unknown[]) => { ops.push([prop, args]); return builder; };
                },
            });
            return builder;
        },
    };
    return { db: db as unknown as SupabaseClient, calls };
}

describe('loadChannelReports — Meta same days', () => {
    const week = { from: '2026-10-21', to: '2026-10-27' };

    it('compares an unfinished API week with the previous week\'s same days from the current account\'s stored rows', async () => {
        const { db, calls } = fakeDb({ summaries: [current, previous], account: '1129994262383674', rows: previousRows });
        const result = await loadChannelReports(db, 'shop-1', week, { sources: ['meta_ads'] });
        expect(result.meta_ads.sameDays).toEqual({ from: '2026-10-14', to: '2026-10-19' });
        expect(result.meta_ads.previous?.id).toBe('prev');
        expect(result.meta_ads.comparison?.spend).toMatchObject({ previous: 75, delta: 12, comparable: true });
        expect(Object.values(result.meta_ads.comparison ?? {}).some(delta => delta.reason === 'coverage')).toBe(false);
        expect(result.meta_ads.comparison).not.toHaveProperty('reach');
        const insights = calls.find(call => call.table === 'meta_ad_insights_daily')!.ops;
        expect(insights).toEqual(expect.arrayContaining([['eq', ['shop_id', 'shop-1']], ['eq', ['account_id', 'act_1129994262383674']], ['gte', ['day', '2026-10-14']], ['lte', ['day', '2026-10-20']]]));
    });

    it('keeps the week uncompared when no account is selected, the rows do not match or cannot be read', async () => {
        for (const setup of [
            { account: null, rows: previousRows },
            { account: 'act_1', rows: previousRows.slice(2) },
            { account: 'act_1', rows: previousRows, rowsError: { message: 'statement timeout' } },
        ]) {
            const { db } = fakeDb({ summaries: [current, previous], ...setup });
            const result = await loadChannelReports(db, 'shop-1', week, { sources: ['meta_ads'] });
            expect(result.meta_ads.sameDays).toBeUndefined();
            expect(result.meta_ads.comparison?.spend).toMatchObject({ comparable: false, reason: 'coverage' });
        }
    });

    it('does not read stored rows for a complete week or a file report', async () => {
        const { db, calls } = fakeDb({ summaries: [{ ...current, origin: 'file' }, previous], account: 'act_1', rows: previousRows });
        await loadChannelReports(db, 'shop-1', week, { sources: ['meta_ads'] });
        expect(calls.some(call => call.table === 'meta_ad_insights_daily' || call.table === 'shops')).toBe(false);
    });
});
