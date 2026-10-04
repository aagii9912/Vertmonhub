// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ account: vi.fn(), adsets: vi.fn(), reach: vi.fn() }));
vi.mock('@/lib/facebook/ads-auth', () => ({ metaAdsToken: () => 'ads-token' }));
vi.mock('@/lib/facebook/daily-spend', () => ({ fetchMetaAccount: mocks.account }));
vi.mock('@/lib/facebook/ads-insights', () => ({ fetchMetaAdsetInsights: mocks.adsets, fetchMetaPeriodReach: mocks.reach }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildMetaChannelReport, syncMetaInsights, type MetaInsightRow } from '../meta-insights';

const row = (patch: Partial<MetaInsightRow>): MetaInsightRow => ({
    day: '2026-09-23', campaign_id: '11', campaign_name: 'Дуудлага', adset_id: '101', spend: 0, impressions: 0, reach: null, clicks: 0,
    inline_link_clicks: 0, landing_page_views: 0, result_type: null, results: null, result_source: 'results', ...patch,
});
// Гараар тооцсон 7 хоног (2026-09-23 – 09-29, USD):
//  C1 «Дуудлага»: A1 дуудлага (3 үр дүн, нэг өдөр үр дүнгүй), A2 постын оролцоо (үр дүнгүй) → бүх 17$ дуудлагад.
//  C2 «Мессеж»: B1 мессеж 4 (20$), B2 лид 2 (8$, зорилгоор) → хоёр тусдаа мөр.
//  C3 «Reach»: өдрийн reach 4000 + 3500 (нэмэхгүй), кампанит ажлын давхардалгүй reach 6000, 9$.
//  C4 «Идэвхгүй»: хүргэлтгүй → хасагдана.
const fixture: MetaInsightRow[] = [
    row({ campaign_name: 'Дуудлага (хуучин)', spend: '10.000000', impressions: '1000', reach: '800', clicks: '40', inline_link_clicks: '25', result_type: 'calls', results: '3' }),
    row({ day: '2026-09-24', spend: 5, impressions: 500, reach: 450, clicks: 20, inline_link_clicks: 10, result_type: 'calls', results: 0, result_source: 'goal' }),
    row({ adset_id: '102', spend: 2, impressions: 300, reach: 280, clicks: 5, result_type: 'post_engagement', results: 0, result_source: 'goal' }),
    row({ day: '2026-09-25', campaign_id: '22', campaign_name: 'Мессеж', adset_id: '201', spend: 20, impressions: 2000, reach: 1500, clicks: 60, inline_link_clicks: 30, landing_page_views: 12, result_type: 'messages', results: 4 }),
    row({ day: '2026-09-26', campaign_id: '22', campaign_name: 'Мессеж', adset_id: '202', spend: 8, impressions: 800, reach: 700, clicks: 10, inline_link_clicks: 6, result_type: 'leads', results: 2, result_source: 'goal' }),
    row({ day: '2026-09-27', campaign_id: '33', campaign_name: 'Reach', adset_id: '301', spend: 4.5, impressions: 5000, reach: 4000, clicks: 2, inline_link_clicks: 1, result_type: 'reach', results: 4000, result_source: 'goal' }),
    row({ day: '2026-09-28', campaign_id: '33', campaign_name: 'Reach', adset_id: '301', spend: 4.5, impressions: 5000, reach: 3500, clicks: 1, result_type: 'reach', results: 3500, result_source: 'goal' }),
    row({ day: '2026-09-29', campaign_id: '44', campaign_name: 'Идэвхгүй', adset_id: '401', result_source: 'goal' }),
];
const periodReach = { account: 9000, campaigns: new Map([['11', 1500], ['22', 2500], ['33', 6000]]) };

it('builds the meta_ads weekly report exactly per the shared contract (hand-computed fixture)', () => {
    const report = buildMetaChannelReport({ rows: fixture, currency: 'USD', reach: periodReach });
    expect(report.totals).toEqual({
        spend: 54, currency: 'USD', impressions: 14600, link_clicks: 72, clicks_all: 138, landing_page_views: 12,
        reach: 9000, frequency: 1.62, cpm: 3.7, cost_per_link_click: 0.75, ctr_link: 0.49, cost_per_landing_page_view: 4.5,
        spend_calls: 17, results_calls: 3, cost_per_result_calls: 5.67,
        spend_messages: 20, results_messages: 4, cost_per_result_messages: 5,
        spend_leads: 8, results_leads: 2, cost_per_result_leads: 4,
        // Reach-ийн үр дүн = кампанит ажлын давхардалгүй reach; өртөг 1000 хүнд.
        spend_reach: 9, results_reach: 6000, cost_per_result_reach: 1.5,
    });
    expect(report.breakdown).toEqual([
        { kind: 'campaign', label: 'Мессеж', tag: 'messages', values: { spend: 20, impressions: 2000, link_clicks: 30, results: 4, cost_per_result: 5 } },
        { kind: 'campaign', label: 'Дуудлага', tag: 'calls', values: { spend: 17, impressions: 1800, link_clicks: 35, reach: 1500, results: 3, cost_per_result: 5.67 } },
        { kind: 'campaign', label: 'Reach', tag: 'reach', values: { spend: 9, impressions: 10000, link_clicks: 1, reach: 6000, results: 6000, cost_per_result: 1.5 } },
        { kind: 'campaign', label: 'Мессеж', tag: 'leads', values: { spend: 8, impressions: 800, link_clicks: 6, results: 2, cost_per_result: 4 } },
    ]);
    expect(report.rowCount).toBe(8);
    expect(report.warnings).toEqual([expect.objectContaining({ code: 'field_ignored', level: 'info', message: expect.stringContaining('1 мөрийн') })]);
});

it('keeps legacy results keys only for a single result type', () => {
    const report = buildMetaChannelReport({ rows: fixture.slice(0, 3), currency: 'USD', reach: { account: 1500, campaigns: new Map([['11', 1500]]) } });
    expect(report.totals).toMatchObject({ spend: 17, results_calls: 3, cost_per_result_calls: 5.67, results: 3, cost_per_result: 5.67 });
    expect(buildMetaChannelReport({ rows: fixture, currency: 'USD', reach: periodReach }).totals).not.toHaveProperty('results');
});

it('never sums daily reach: without Meta deduplicated reach there is no reach, frequency or reach result', () => {
    const report = buildMetaChannelReport({ rows: fixture, currency: 'USD', reach: null });
    for (const key of ['reach', 'frequency', 'results_reach', 'cost_per_result_reach']) expect(report.totals).not.toHaveProperty(key);
    expect(report.totals).toMatchObject({ spend_reach: 9, results_calls: 3 });
    expect(report.breakdown.find(r => r.tag === 'reach')!.values).toEqual({ spend: 9, impressions: 10000, link_clicks: 1, results: null, cost_per_result: null });
    expect(report.warnings.map(w => [w.code, w.level])).toEqual(expect.arrayContaining([['non_additive', 'warning'], ['non_additive', 'info']]));
});

it('splits a campaign whose ad sets have different result types and does not guess reach for the split rows', () => {
    const rows = [
        row({ campaign_id: '55', campaign_name: 'Холимог', adset_id: '501', spend: 6, impressions: 600, result_type: 'calls', results: 2 }),
        row({ campaign_id: '55', campaign_name: 'Холимог', adset_id: '502', spend: 3, impressions: 3000, reach: 2500, result_type: 'reach', results: 2500, result_source: 'goal' }),
        row({ campaign_id: '66', campaign_name: 'Хүрэлт 2', adset_id: '601', spend: 1, impressions: 900, reach: 800, result_type: 'reach', results: 800, result_source: 'goal' }),
    ];
    const report = buildMetaChannelReport({ rows, currency: 'MNT', reach: { account: 3000, campaigns: new Map([['55', 2900], ['66', 800]]) } });
    expect(report.breakdown.map(r => [r.label, r.tag, r.values.results, 'reach' in r.values])).toEqual([
        ['Холимог', 'calls', 2, false], ['Холимог', 'reach', null, false], ['Хүрэлт 2', 'reach', 800, true],
    ]);
    // Reach төрлийн нэг мөр тодорхойгүй тул results_reach-ийг таамаглахгүй.
    expect(report.totals).toMatchObject({ spend_calls: 6, results_calls: 2, spend_reach: 4 });
    expect(report.totals).not.toHaveProperty('results_reach');
});

it('reports spend without a count for result types Meta did not count, truncates the breakdown, and handles an empty week', () => {
    const rows = [
        row({ campaign_id: '1', campaign_name: 'A', adset_id: '1', spend: 3, impressions: 10, result_type: 'other', results: null, result_source: 'goal' }),
        row({ campaign_id: '2', campaign_name: 'B', adset_id: '2', spend: 2, impressions: 10, result_type: 'link_clicks', results: 5 }),
        row({ campaign_id: '3', campaign_name: 'C', adset_id: '3', spend: 1, impressions: 10, result_type: 'link_clicks', results: 1 }),
    ];
    const report = buildMetaChannelReport({ rows, currency: 'USD', reach: { account: 25, campaigns: new Map() }, breakdownLimit: 2 });
    expect(report.totals).toMatchObject({ spend_other: 3, spend_link_clicks: 3, results_link_clicks: 6, cost_per_result_link_clicks: 0.5 });
    expect(report.totals).not.toHaveProperty('results_other');
    expect(report.breakdown.map(r => r.label)).toEqual(['A', 'B']);
    expect(report.breakdown[0].values).toMatchObject({ results: null, cost_per_result: null });
    expect(report.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['no_values', 'truncated']));

    expect(buildMetaChannelReport({ rows: [], currency: 'USD', reach: { account: 0, campaigns: new Map() } })).toEqual({
        totals: { spend: 0, currency: 'USD', impressions: 0, link_clicks: 0, clicks_all: 0, landing_page_views: 0, reach: 0 },
        breakdown: [], warnings: [], rowCount: 0,
    });
});

// ---------------------------------------------------------------------------
// syncMetaInsights: хадгалах → долоо хоног бүрийн тайлан → төлөв
// ---------------------------------------------------------------------------

function database(stored: MetaInsightRow[], options: { saveError?: boolean; reportError?: boolean } = {}) {
    const upserts: Array<{ table: string; value: Record<string, unknown>; onConflict?: string }> = [];
    const filters: Array<[string, string, unknown]> = [];
    const rpc = vi.fn(async (_name: string, args: { p_rows: unknown[] }) => options.saveError ? { data: null, error: { message: 'x' } } : { data: args.p_rows.length, error: null });
    const from = (table: string) => {
        const q: Record<string, unknown> = {};
        for (const method of ['select', 'order']) q[method] = () => q;
        for (const method of ['eq', 'gte', 'lte']) q[method] = (column: string, value: unknown) => { filters.push([table, `${method}:${column}`, value]); return q; };
        q.single = async () => ({ data: { facebook_ad_account_id: '123', meta_ads_user_access_token: null, meta_ads_user_token_expires_at: null }, error: null });
        q.range = async () => ({ data: stored, error: null });
        q.upsert = async (value: Record<string, unknown>, opts: { onConflict?: string }) => {
            upserts.push({ table, value, onConflict: opts?.onConflict });
            return { error: options.reportError && table === 'marketing_channel_reports' ? { message: 'column origin does not exist' } : null };
        };
        return q;
    };
    return { db: { from, rpc } as unknown as SupabaseClient, rpc, upserts, filters };
}
const account = { id: 'act_123', currency: 'USD', timezone_name: 'Asia/Ulaanbaatar' };
const apiRow = { day: '2026-09-03', adset_id: '101' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T04:00:00Z')); // Даваа, УБ 12:00
    mocks.account.mockResolvedValue(account);
    mocks.adsets.mockResolvedValue({ rows: [apiRow], resultFields: true });
    mocks.reach.mockResolvedValue({ account: 100, campaigns: new Map([['11', 100]]) });
});
afterEach(() => vi.useRealTimers());

it('saves the 35-day window and rewrites every meeting week inside it, including the current partial week', async () => {
    const stored = [row({ day: '2026-09-03', spend: 5, impressions: 100, result_type: 'calls', results: 1 }), row({ day: '2026-10-05', spend: 2, impressions: 50, result_type: 'calls', results: 1 })];
    const { db, rpc, upserts, filters } = database(stored);
    const result = await syncMetaInsights(db, 'shop-1');

    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-09-01', '2026-10-05');
    expect(rpc).toHaveBeenCalledWith('save_meta_ad_insights', { p_shop: 'shop-1', p_account: 'act_123', p_from: '2026-09-01', p_to: '2026-10-05', p_rows: [apiRow] });
    // 2026-08-26-нд эхэлсэн долоо хоног [from, to]-оос өмнө эхэлсэн тул алгасна.
    expect(result.weeks).toEqual([
        { from: '2026-09-02', to: '2026-09-08', dataTo: '2026-09-08' }, { from: '2026-09-09', to: '2026-09-15', dataTo: '2026-09-15' },
        { from: '2026-09-16', to: '2026-09-22', dataTo: '2026-09-22' }, { from: '2026-09-23', to: '2026-09-29', dataTo: '2026-09-29' },
        { from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-05' },
    ]);
    expect(filters).toEqual(expect.arrayContaining([['meta_ad_insights_daily', 'eq:shop_id', 'shop-1'], ['meta_ad_insights_daily', 'eq:account_id', 'act_123'], ['meta_ad_insights_daily', 'gte:day', '2026-09-02']]));
    // Давхардалгүй reach-ийг зөвхөн өгөгдөлтэй долоо хоногт асууна.
    expect(mocks.reach.mock.calls.map(call => [call[2], call[3]])).toEqual([['2026-09-02', '2026-09-08'], ['2026-09-30', '2026-10-05']]);

    const reports = upserts.filter(u => u.table === 'marketing_channel_reports');
    expect(reports).toHaveLength(5);
    expect(reports.every(r => r.onConflict === 'shop_id,source,period_from,period_to')).toBe(true);
    expect(reports[0].value).toMatchObject({
        shop_id: 'shop-1', source: 'meta_ads', period_from: '2026-09-02', period_to: '2026-09-08', origin: 'api', data_from: '2026-09-02', data_to: '2026-09-08',
        file_name: null, content_hash: null, mapping: {}, row_count: 1, totals: { spend: 5, results_calls: 1, reach: 100 },
    });
    expect(reports[1].value).toMatchObject({ period_from: '2026-09-09', row_count: 0, totals: { spend: 0, reach: 0 } });
    expect(reports[4].value).toMatchObject({ period_from: '2026-09-30', period_to: '2026-10-06', data_to: '2026-10-05', totals: { spend: 2 } });
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { shop_id: 'shop-1', account_id: 'act_123', last_error: null, row_count: 1, weeks: 5, result_source: 'results', last_from: '2026-09-01', last_to: '2026-10-05' } });
});

it('does not overwrite a past week with a half week when a manual range ends mid-week', async () => {
    const { db, upserts } = database([]);
    const result = await syncMetaInsights(db, 'shop-1', { from: '2026-09-02', to: '2026-09-20' });
    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-09-02', '2026-09-20');
    expect(result.weeks.map(w => w.from)).toEqual(['2026-09-02', '2026-09-09']);
    expect(upserts.filter(u => u.table === 'marketing_channel_reports')).toHaveLength(2);
});

it('writes the report without reach when the deduplicated reach call fails', async () => {
    mocks.reach.mockRejectedValue(new Error('rate limited'));
    const { db, upserts } = database([row({ day: '2026-09-03', spend: 5, impressions: 100 })]);
    await syncMetaInsights(db, 'shop-1');
    const first = upserts.find(u => u.table === 'marketing_channel_reports')!.value as { totals: Record<string, unknown>; warnings: Array<{ code: string }> };
    expect(first.totals).not.toHaveProperty('reach');
    expect(first.warnings.map(w => w.code)).toContain('non_additive');
});

it('records the failure and writes no report when saving the rows fails', async () => {
    const { db, upserts } = database([], { saveError: true });
    await expect(syncMetaInsights(db, 'shop-1')).rejects.toThrow(/хадгалж чадсангүй/);
    expect(upserts.filter(u => u.table === 'marketing_channel_reports')).toHaveLength(0);
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { account_id: 'act_123', last_error: expect.stringContaining('хадгалж чадсангүй') } });
    expect(upserts.at(-1)!.value).not.toHaveProperty('last_success_at');

    const failing = database([], { reportError: true });
    await expect(syncMetaInsights(failing.db, 'shop-1')).rejects.toThrow(/долоо хоногийн Meta тайланг/);
});
