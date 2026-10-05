// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ account: vi.fn(), adsets: vi.fn(), reach: vi.fn() }));
vi.mock('@/lib/facebook/ads-auth', () => ({ metaAdsToken: () => 'ads-token' }));
// Хугацааны туслахууд, MetaApiError жинхэнэ; зөвхөн Meta-д хандах функцийг орлуулна.
vi.mock('@/lib/facebook/daily-spend', async original => ({ ...await original<typeof import('@/lib/facebook/daily-spend')>(), fetchMetaAccount: mocks.account }));
vi.mock('@/lib/facebook/ads-insights', () => ({ fetchMetaAdsetInsights: mocks.adsets, fetchMetaPeriodReach: mocks.reach }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { MetaApiError, type MetaDeadline } from '@/lib/facebook/daily-spend';
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

it('for a reach-only week keeps the per-1000 cost only in cost_per_result_reach, never in the legacy per-result key', () => {
    const report = buildMetaChannelReport({ rows: fixture.slice(5, 7), currency: 'USD', reach: { account: 6000, campaigns: new Map([['33', 6000]]) } });
    expect(report.totals).toMatchObject({ spend_reach: 9, results_reach: 6000, cost_per_result_reach: 1.5, results: 6000 });
    expect(report.totals).not.toHaveProperty('cost_per_result');
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

it('in a mixed-type campaign gives a result-less ad set of another goal to the campaign\'s main result type', () => {
    // A1 дуудлага 2 (6$), A2 мессеж 1 (4$), A3 постын оролцоо 0 (3$, зорилгоор) → A3-ийн зардал дуудлагад (хамгийн их зардалтай).
    const rows = [
        row({ campaign_id: '77', campaign_name: 'Холимог 2', adset_id: '701', spend: 6, impressions: 600, result_type: 'calls', results: 2 }),
        row({ campaign_id: '77', campaign_name: 'Холимог 2', adset_id: '702', spend: 4, impressions: 400, result_type: 'messages', results: 1 }),
        row({ campaign_id: '77', campaign_name: 'Холимог 2', adset_id: '703', spend: 3, impressions: 300, result_type: 'post_engagement', results: 0, result_source: 'goal' }),
    ];
    const report = buildMetaChannelReport({ rows, currency: 'USD', reach: { account: 900, campaigns: new Map([['77', 900]]) } });
    expect(report.totals).toMatchObject({ spend_calls: 9, results_calls: 2, cost_per_result_calls: 4.5, spend_messages: 4, results_messages: 1 });
    for (const key of ['spend_post_engagement', 'results_post_engagement', 'cost_per_result_post_engagement']) expect(report.totals).not.toHaveProperty(key);
    expect(report.breakdown.map(r => [r.tag, r.values.spend, r.values.results])).toEqual([['calls', 9, 2], ['messages', 4, 1]]);
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

it('zero-fills result types known to the sync but not delivered this week (reach included), without a cost or legacy key', () => {
    // C1 «Дуудлага» (A2 постын оролцооны үр дүнгүй ad set нь дуудлагад): post_engagement нь энэ долоо хоногт хүргэлтгүй төрөл.
    const report = buildMetaChannelReport({
        rows: fixture.slice(0, 3), currency: 'USD', reach: { account: 1500, campaigns: new Map([['11', 1500]]) },
        knownTypes: ['calls', 'post_engagement', 'reach', 'thruplay'],
    });
    expect(report.totals).toMatchObject({
        spend_calls: 17, results_calls: 3, cost_per_result_calls: 5.67,
        // Хуучин түлхүүр зөвхөн хүргэлттэй төрлөөс.
        results: 3, cost_per_result: 5.67,
        spend_post_engagement: 0, results_post_engagement: 0, spend_reach: 0, results_reach: 0, spend_thruplay: 0, results_thruplay: 0,
    });
    for (const type of ['post_engagement', 'reach', 'thruplay']) expect(report.totals).not.toHaveProperty(`cost_per_result_${type}`);
    // Тайлангийн төрлөөр биш бол нөлөөлөхгүй; хоосон долоо хоногт зөвхөн мэдэгдэх төрлүүд 0.
    expect(buildMetaChannelReport({ rows: fixture.slice(0, 3), currency: 'USD', reach: null }).totals).not.toHaveProperty('spend_post_engagement');
    expect(buildMetaChannelReport({ rows: [], currency: 'USD', reach: { account: 0, campaigns: new Map() }, knownTypes: new Set(['calls'] as const) }).totals).toEqual({
        spend: 0, currency: 'USD', impressions: 0, link_clicks: 0, clicks_all: 0, landing_page_views: 0, reach: 0, spend_calls: 0, results_calls: 0,
    });
});

it('notes when the ad account counts days in a timezone other than Ulaanbaatar', () => {
    const reach = { account: 0, campaigns: new Map<string, number>() };
    expect(buildMetaChannelReport({ rows: [], currency: 'USD', reach, timezone: 'America/Los_Angeles' }).warnings).toEqual([
        expect.objectContaining({ code: 'out_of_period', level: 'info', message: expect.stringContaining('America/Los_Angeles') }),
    ]);
    expect(buildMetaChannelReport({ rows: [], currency: 'USD', reach, timezone: 'Asia/Ulaanbaatar' }).warnings).toEqual([]);
});

// ---------------------------------------------------------------------------
// syncMetaInsights: хадгалах → долоо хоног бүрийн тайлан → төлөв
// ---------------------------------------------------------------------------

function database(stored: MetaInsightRow[], options: {
    saveError?: boolean; reportError?: boolean; readError?: boolean;
    existing?: Array<{ period_from: string; period_to: string; origin: string }>;
} = {}) {
    const upserts: Array<{ table: string; value: Record<string, unknown>; onConflict?: string }> = [];
    const filters: Array<[string, string, unknown]> = [];
    const rpc = vi.fn(async (_name: string, args: { p_rows: unknown[] }) => options.saveError ? { data: null, error: { message: 'x' } } : { data: args.p_rows.length, error: null });
    const from = (table: string) => {
        const q: Record<string, unknown> = {};
        const range = { gte: '', lte: '9999-12-31' };
        for (const method of ['select', 'order']) q[method] = () => q;
        for (const method of ['eq', 'gte', 'lte']) q[method] = (column: string, value: unknown) => {
            filters.push([table, `${method}:${column}`, value]);
            if (column === 'day' && (method === 'gte' || method === 'lte')) range[method] = String(value);
            return q;
        };
        q.single = async () => ({ data: { facebook_ad_account_id: '123', meta_ads_user_access_token: null, meta_ads_user_token_expires_at: null }, error: null });
        q.range = async () => options.readError ? { data: null, error: { message: 'canceling statement due to statement timeout' } }
            : { data: stored.filter(r => r.day >= range.gte && r.day <= range.lte), error: null };
        q.in = async (column: string, value: unknown) => { filters.push([table, `in:${column}`, value]); return { data: options.existing ?? [], error: null }; };
        q.upsert = async (value: Record<string, unknown>, opts: { onConflict?: string }) => {
            upserts.push({ table, value, onConflict: opts?.onConflict });
            return { error: options.reportError && table === 'marketing_channel_reports' ? { message: 'column origin does not exist' } : null };
        };
        return q;
    };
    const reports = () => upserts.filter(u => u.table === 'marketing_channel_reports').map(u => u.value as Record<string, unknown> & { totals: Record<string, unknown> });
    const week = (periodFrom: string) => reports().find(r => r.period_from === periodFrom)!;
    return { db: { from, rpc } as unknown as SupabaseClient, rpc, upserts, filters, reports, week };
}
const account = { id: 'act_123', currency: 'USD', timezone_name: 'Asia/Ulaanbaatar' };
const apiRow = { day: '2026-09-03', adset_id: '101' };
const anyDeadline = expect.objectContaining({ at: expect.any(Number), signal: expect.any(AbortSignal) });
const budget = (ms: number, signal = new AbortController().signal): MetaDeadline => ({ at: Date.now() + ms, signal });

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T04:00:00Z')); // Даваа, УБ 12:00
    mocks.account.mockResolvedValue(account);
    mocks.adsets.mockResolvedValue({ rows: [apiRow], resultFields: true });
    mocks.reach.mockResolvedValue({ account: 100, campaigns: new Map([['11', 100]]) });
});
afterEach(() => vi.useRealTimers());

it('saves the 35-day window with today and rewrites every meeting week from finished days only, newest first', async () => {
    const stored = [
        row({ day: '2026-09-03', spend: 5, impressions: 100, result_type: 'calls', results: 1 }),
        row({ day: '2026-10-04', spend: 2, impressions: 50, result_type: 'calls', results: 1 }),
        // Дансны өнөөдөр (дуусаагүй өдөр): хадгалагдана, тайланд орохгүй.
        row({ day: '2026-10-05', spend: 7, impressions: 70, result_type: 'calls', results: 3 }),
    ];
    const { db, rpc, upserts, filters, reports, week } = database(stored);
    const result = await syncMetaInsights(db, 'shop-1');

    expect(mocks.account).toHaveBeenCalledWith('act_123', 'ads-token', anyDeadline);
    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-09-01', '2026-10-05', anyDeadline);
    expect(rpc).toHaveBeenCalledWith('save_meta_ad_insights', { p_shop: 'shop-1', p_account: 'act_123', p_from: '2026-09-01', p_to: '2026-10-05', p_rows: [apiRow] });
    // 2026-08-26-нд эхэлсэн долоо хоног [from, to]-оос өмнө эхэлсэн тул бичихгүй (зөвхөн төрлийг нь уншина).
    expect(result.weeks).toEqual([
        { from: '2026-09-02', to: '2026-09-08', dataTo: '2026-09-08' }, { from: '2026-09-09', to: '2026-09-15', dataTo: '2026-09-15' },
        { from: '2026-09-16', to: '2026-09-22', dataTo: '2026-09-22' }, { from: '2026-09-23', to: '2026-09-29', dataTo: '2026-09-29' },
        { from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-04' },
    ]);
    expect(result).not.toHaveProperty('partial');
    expect(filters).toEqual(expect.arrayContaining([
        ['meta_ad_insights_daily', 'eq:shop_id', 'shop-1'], ['meta_ad_insights_daily', 'eq:account_id', 'act_123'],
        ['meta_ad_insights_daily', 'gte:day', '2026-08-26'], ['meta_ad_insights_daily', 'lte:day', '2026-10-05'],
    ]));
    // Давхардалгүй reach-ийг зөвхөн өгөгдөлтэй долоо хоногт, дууссан өдрүүдээр асууна.
    expect(mocks.reach.mock.calls.map(call => [call[2], call[3]])).toEqual([['2026-09-30', '2026-10-04'], ['2026-09-02', '2026-09-08']]);
    expect(mocks.reach.mock.calls.every(call => call[4] === mocks.adsets.mock.calls[0][4])).toBe(true);

    expect(reports().map(r => r.period_from)).toEqual(['2026-09-30', '2026-09-23', '2026-09-16', '2026-09-09', '2026-09-02']);
    expect(upserts.filter(u => u.table === 'marketing_channel_reports').every(r => r.onConflict === 'shop_id,source,period_from,period_to')).toBe(true);
    expect(week('2026-09-02')).toMatchObject({
        shop_id: 'shop-1', source: 'meta_ads', period_from: '2026-09-02', period_to: '2026-09-08', origin: 'api', data_from: '2026-09-02', data_to: '2026-09-08',
        file_name: null, content_hash: null, mapping: {}, row_count: 1, totals: { spend: 5, results_calls: 1, reach: 100 },
    });
    // Хүргэлтгүй долоо хоног: синкийн мэдэгдэх төрөл (дуудлага) 0, өртөггүй.
    expect(week('2026-09-09')).toMatchObject({ row_count: 0, totals: { spend: 0, reach: 0, spend_calls: 0, results_calls: 0 } });
    expect(week('2026-09-09').totals).not.toHaveProperty('cost_per_result_calls');
    expect(week('2026-09-30')).toMatchObject({ period_to: '2026-10-06', data_to: '2026-10-04', row_count: 1, totals: { spend: 2, results_calls: 1 } });
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { shop_id: 'shop-1', account_id: 'act_123', last_error: null, row_count: 1, weeks: 5, result_source: 'results', last_from: '2026-09-01', last_to: '2026-10-05' } });
});

it('zero-fills types delivered in the window or in the meeting week before it, taking the types from the built reports', async () => {
    const stored = [
        // Өмнөх хурлын долоо хоног (08-26 – 09-01): ThruPlay — дахин бичихгүй, гэхдээ төрөл нь мэдэгдэнэ.
        row({ day: '2026-08-28', campaign_id: '90', campaign_name: 'Видео', adset_id: '901', spend: 3, impressions: 300, result_type: 'thruplay', results: 50 }),
        row({ day: '2026-09-03', spend: 5, impressions: 100, result_type: 'calls', results: 2 }),
        // Дуудлагын кампанит ажлын үр дүнгүй өөр зорилготой ad set: мөрийн result_type нь тусдаа төрөл болохгүй.
        row({ day: '2026-09-04', adset_id: '102', spend: 1, impressions: 10, result_type: 'post_engagement', results: 0, result_source: 'goal' }),
        row({ day: '2026-09-10', campaign_id: '22', campaign_name: 'Пост', adset_id: '201', spend: 4, impressions: 400, result_type: 'post_interaction', results: 8 }),
    ];
    const { db, week, reports } = database(stored);
    await syncMetaInsights(db, 'shop-1');
    expect(reports().some(r => r.period_from === '2026-08-26')).toBe(false);
    expect(week('2026-09-02').totals).toMatchObject({
        spend_calls: 6, results_calls: 2, results: 2, cost_per_result: 3,
        spend_post_interaction: 0, results_post_interaction: 0, spend_thruplay: 0, results_thruplay: 0,
    });
    for (const key of ['spend_post_engagement', 'results_post_engagement', 'cost_per_result_post_interaction', 'cost_per_result_thruplay']) {
        expect(week('2026-09-02').totals).not.toHaveProperty(key);
    }
    expect(week('2026-09-09').totals).toMatchObject({
        spend_post_interaction: 4, results_post_interaction: 8, results: 8, cost_per_result: 0.5, spend_calls: 0, results_calls: 0, spend_thruplay: 0, results_thruplay: 0,
    });
    for (const zero of ['2026-09-16', '2026-09-23', '2026-09-30']) {
        expect(week(zero)).toMatchObject({ row_count: 0, totals: { spend: 0, spend_calls: 0, results_calls: 0, spend_post_interaction: 0, results_post_interaction: 0, spend_thruplay: 0, results_thruplay: 0 } });
        expect(week(zero).totals).not.toHaveProperty('results');
    }
});

it('does not overwrite a past week with a half week when a manual range ends mid-week', async () => {
    const { db, reports } = database([row({ day: '2026-09-03', spend: 1, impressions: 10 })]);
    const result = await syncMetaInsights(db, 'shop-1', { from: '2026-09-02', to: '2026-09-20' });
    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-09-02', '2026-09-20', anyDeadline);
    expect(result.weeks.map(w => w.from)).toEqual(['2026-09-02', '2026-09-09']);
    expect(reports()).toHaveLength(2);
});

it('fetches the whole meeting week when a manual range starts mid-week (the page\'s month range), within 93 days', async () => {
    const { db, reports } = database([row({ day: '2026-10-01', spend: 3, impressions: 30 })]);
    mocks.adsets.mockResolvedValue({ rows: [{ day: '2026-10-01', adset_id: '101' }], resultFields: true });
    const result = await syncMetaInsights(db, 'shop-1', { from: '2026-10-01', to: '2026-10-31' });
    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-09-30', '2026-10-05', anyDeadline);
    expect(result).toMatchObject({ from: '2026-09-30', to: '2026-10-05', weeks: [{ from: '2026-09-30', to: '2026-10-06', dataTo: '2026-10-04' }] });
    expect(reports()).toHaveLength(1);

    // 93 өдрийн хязгаарыг давахаар бол эхлэлийг сунгахгүй (тэр хагас долоо хоногийг алгасна).
    mocks.adsets.mockClear();
    await syncMetaInsights(database([]).db, 'shop-1', { from: '2026-07-05', to: '2026-10-05' });
    expect(mocks.adsets).toHaveBeenCalledWith(account, 'ads-token', '2026-07-05', '2026-10-05', anyDeadline);
});

it('counts only finished account days: on Tuesday the week is written through Monday, on Wednesday morning the new week waits', async () => {
    vi.setSystemTime(new Date('2026-09-29T06:00:00Z')); // Мягмар, УБ 14:00
    const todayRow = { day: '2026-09-29', adset_id: '101' };
    mocks.adsets.mockResolvedValue({ rows: [{ day: '2026-09-23', adset_id: '101' }, todayRow], resultFields: true });
    const stored = [
        row({ day: '2026-09-23', spend: 5, impressions: 50, result_type: 'calls', results: 1 }),
        row({ day: '2026-09-29', spend: 9, impressions: 90, result_type: 'calls', results: 4 }),
    ];
    const tuesday = database(stored);
    const result = await syncMetaInsights(tuesday.db, 'shop-1');
    // Өнөөдрийн мөр хадгалагдана.
    expect(tuesday.rpc.mock.calls[0][1]).toMatchObject({ p_to: '2026-09-29', p_rows: [{ day: '2026-09-23' }, todayRow] });
    expect(result.weeks).toEqual([{ from: '2026-09-23', to: '2026-09-29', dataTo: '2026-09-28' }]);
    expect(tuesday.week('2026-09-23')).toMatchObject({ data_from: '2026-09-23', data_to: '2026-09-28', row_count: 1, totals: { spend: 5, results_calls: 1 } });
    expect(tuesday.week('2026-09-23').warnings).toEqual([]);
    expect(mocks.reach).toHaveBeenCalledWith(account, 'ads-token', '2026-09-23', '2026-09-28', anyDeadline);

    vi.setSystemTime(new Date('2026-09-30T00:30:00Z')); // Лхагва, УБ 08:30 — шинэ долоо хоногийн дууссан өдөр алга.
    const wednesday = database([...stored, row({ day: '2026-09-30', spend: 1, impressions: 5, result_type: 'calls', results: 0 })]);
    const next = await syncMetaInsights(wednesday.db, 'shop-1');
    expect(next.weeks).toEqual([{ from: '2026-09-23', to: '2026-09-29', dataTo: '2026-09-29' }]);
    expect(wednesday.week('2026-09-23')).toMatchObject({ data_to: '2026-09-29', row_count: 2, totals: { spend: 14, results_calls: 5 } });
    expect(wednesday.reports().some(r => r.period_from === '2026-09-30')).toBe(false);
});

it('for an account behind Ulaanbaatar keeps the meeting week partial until the account day ends and notes the timezone', async () => {
    vi.setSystemTime(new Date('2026-09-30T00:30:00Z')); // УБ Лхагва 08:30, Los Angeles Мягмар 17:30
    mocks.account.mockResolvedValue({ ...account, timezone_name: 'America/Los_Angeles' });
    mocks.adsets.mockResolvedValue({ rows: [{ day: '2026-09-23', adset_id: '101' }], resultFields: true });
    const { db, week } = database(['2026-09-23', '2026-09-29'].map(day => row({ day, spend: 1, impressions: 10, result_type: 'calls', results: 1 })));
    const result = await syncMetaInsights(db, 'shop-1');
    expect(result.to).toBe('2026-09-29');
    expect([week('2026-09-23').data_from, week('2026-09-23').data_to]).toEqual(['2026-09-23', '2026-09-28']);
    expect(week('2026-09-23').warnings).toContainEqual(expect.objectContaining({ code: 'out_of_period', level: 'info', message: expect.stringContaining('America/Los_Angeles') }));
});

it('writes an empty week as zero only after the account\'s first data day and never over a file import', async () => {
    // Өгөгдөл 09-17-нөөс: 09-02, 09-09 долоо хоног (холбохоос өмнө) бичигдэхгүй; 09-23 файлтай тул дарахгүй; 09-30 тэг.
    mocks.adsets.mockResolvedValue({ rows: [{ day: '2026-09-17', adset_id: '101' }], resultFields: true });
    const { db, upserts, filters, reports } = database([row({ day: '2026-09-17', spend: 4, impressions: 40 })], {
        existing: [{ period_from: '2026-09-23', period_to: '2026-09-29', origin: 'file' }, { period_from: '2026-09-30', period_to: '2026-10-06', origin: 'api' }],
    });
    const result = await syncMetaInsights(db, 'shop-1');
    expect(result.weeks.map(w => w.from)).toEqual(['2026-09-16', '2026-09-30']);
    expect(reports().map(r => [r.period_from, r.row_count])).toEqual([['2026-09-30', 0], ['2026-09-16', 1]]);
    expect(reports().every(r => r.note === null && r.origin === 'api')).toBe(true);
    // Зөвхөн өгөгдлийн дараах хоосон долоо хоногуудын тайланг шалгана.
    expect(filters).toContainEqual(['marketing_channel_reports', 'in:period_from', ['2026-09-23', '2026-09-30']]);
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { weeks: 2, last_error: null } });

    // Цонхонд өгөгдөлгүй (идэвхгүй/шинэ данс) бол ямар ч долоо хоногийг 0-ээр бичихгүй.
    mocks.adsets.mockResolvedValue({ rows: [], resultFields: true });
    const idle = database([]);
    expect((await syncMetaInsights(idle.db, 'shop-1')).weeks).toEqual([]);
    expect(idle.reports()).toHaveLength(0);
});

it('stops starting weeks when the shared deadline runs low (newest first) and records the partial run', async () => {
    const stored = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01']
        .map(day => row({ day, spend: 1, impressions: 10, result_type: 'calls', results: 1 }));
    // Долоо хоног бүрийн reach 20 сек: 45 → 25 → 5 сек (< 10) — хамгийн сүүлийн хоёр долоо хоног л.
    mocks.reach.mockImplementation(async () => { vi.setSystemTime(Date.now() + 20_000); return { account: 10, campaigns: new Map() }; });
    const deadline = budget(45_000);
    const { db, upserts, reports } = database(stored);
    const result = await syncMetaInsights(db, 'shop-1', {}, { deadline });
    expect(mocks.adsets.mock.calls[0][4]).toBe(deadline);
    expect(mocks.reach.mock.calls.every(call => call[4] === deadline)).toBe(true);
    expect(result.weeks.map(w => w.from)).toEqual(['2026-09-23', '2026-09-30']);
    expect(reports().map(r => r.period_from)).toEqual(['2026-09-30', '2026-09-23']);
    expect(result.partial).toMatch(/хурлын 5 долоо хоногийн 2-ийн Meta тайланг/);
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { weeks: 2, last_error: result.partial, last_success_at: expect.any(String), row_count: 1 } });

    // Reach-ийн дуудлагыг нийт хугацаа тасалбал reach-гүй тайлан бичихгүй.
    const controller = new AbortController();
    mocks.reach.mockImplementation(async () => { controller.abort(); throw new MetaApiError('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин синк хийнэ үү.'); });
    const cut = database(stored);
    const partial = await syncMetaInsights(cut.db, 'shop-1', {}, { deadline: budget(60_000, controller.signal) });
    expect(partial.weeks).toEqual([]);
    expect(cut.reports()).toHaveLength(0);
    expect(cut.upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { weeks: 0, last_error: expect.stringContaining('5 долоо хоногийн 0-ийн') } });
});

it('records a time-budget error, not a connection error, when the deadline cuts the Graph read or leaves too little time to start', async () => {
    const controller = new AbortController();
    mocks.adsets.mockImplementation(async () => { controller.abort(); throw new MetaApiError('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин синк хийнэ үү.'); });
    const cut = database([]);
    await expect(syncMetaInsights(cut.db, 'shop-1', {}, { deadline: budget(60_000, controller.signal) })).rejects.toThrow(/Синкийн хугацаа дууссан/);
    expect(cut.upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { last_error: expect.stringContaining('Синкийн хугацаа дууссан') } });
    expect(cut.upserts.at(-1)!.value).not.toHaveProperty('last_success_at');
    expect(cut.rpc).not.toHaveBeenCalled();

    // Эхлэхэд хугацаа хүрэлцэхгүй бол Meta-д хандахгүй, оролдлогыг бүртгэнэ.
    mocks.account.mockClear();
    const late = database([]);
    await expect(syncMetaInsights(late.db, 'shop-1', {}, { deadline: budget(5_000) })).rejects.toThrow(/Синкийн хугацаа дууссан/);
    expect(mocks.account).not.toHaveBeenCalled();
    expect(late.upserts).toEqual([expect.objectContaining({ table: 'meta_insights_sync', value: expect.objectContaining({ last_error: expect.stringContaining('Синкийн хугацаа дууссан') }) })]);
});

it('answers a stored-row read failure in Mongolian without exposing the database message', async () => {
    const { db, upserts } = database([], { readError: true });
    await expect(syncMetaInsights(db, 'shop-1')).rejects.toThrow('Хадгалсан Meta үр дүнг уншиж чадсангүй. Дахин оролдоно уу.');
    const status = upserts.at(-1)!;
    expect(status).toMatchObject({ table: 'meta_insights_sync', value: { last_error: 'Хадгалсан Meta үр дүнг уншиж чадсангүй. Дахин оролдоно уу.' } });
    expect(JSON.stringify(status)).not.toContain('statement timeout');
});

it('writes the report without reach when the deduplicated reach call fails', async () => {
    mocks.reach.mockRejectedValue(new Error('rate limited'));
    const { db, week } = database([row({ day: '2026-09-03', spend: 5, impressions: 100 })]);
    await syncMetaInsights(db, 'shop-1');
    const first = week('2026-09-02') as { totals: Record<string, unknown>; warnings: Array<{ code: string }> };
    expect(first.totals).not.toHaveProperty('reach');
    expect(first.warnings.map(w => w.code)).toContain('non_additive');
});

it('records the failure and writes no report when saving the rows fails', async () => {
    const { db, upserts, reports } = database([], { saveError: true });
    await expect(syncMetaInsights(db, 'shop-1')).rejects.toThrow(/хадгалж чадсангүй/);
    expect(reports()).toHaveLength(0);
    expect(upserts.at(-1)).toMatchObject({ table: 'meta_insights_sync', value: { account_id: 'act_123', last_error: expect.stringContaining('хадгалж чадсангүй') } });
    expect(upserts.at(-1)!.value).not.toHaveProperty('last_success_at');

    const failing = database([], { reportError: true });
    await expect(syncMetaInsights(failing.db, 'shop-1')).rejects.toThrow(/долоо хоногийн Meta тайланг/);
});
