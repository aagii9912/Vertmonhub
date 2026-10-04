// @vitest-environment node
// Ижил өгөгдөл: Meta API-ийн синк (syncMetaInsights) ба Ads Manager-ийн өдрийн CSV-г долоо хоногоор хуваасан
// импорт (aggregateByReviewWeeks) үр дүнгийн төрлийн түлхүүрүүдийг адилхан бичнэ — хүргэлтгүй долоо хоногт 0.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ adsets: vi.fn(), reach: vi.fn() }));
vi.mock('@/lib/facebook/ads-auth', () => ({ metaAdsToken: () => 'ads-token' }));
vi.mock('@/lib/facebook/daily-spend', async original => ({
    ...await original<typeof import('@/lib/facebook/daily-spend')>(),
    fetchMetaAccount: async () => ({ id: 'act_123', currency: 'USD', timezone_name: 'Asia/Ulaanbaatar' }),
}));
vi.mock('@/lib/facebook/ads-insights', () => ({ fetchMetaAdsetInsights: mocks.adsets, fetchMetaPeriodReach: mocks.reach }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { aggregateByReviewWeeks, compareWithPrevious, suggestMapping, type ChannelTotals } from '../channel-reports';
import { presentMetaResultTypes } from '../meta-results';
import { syncMetaInsights, type MetaInsightRow } from '../meta-insights';

const WEEKS = [
    { from: '2026-09-02', to: '2026-09-08' }, { from: '2026-09-09', to: '2026-09-15' },
    { from: '2026-09-16', to: '2026-09-22' }, { from: '2026-09-23', to: '2026-09-29' },
];
const DAYS = Array.from({ length: 28 }, (_, i) => new Date(Date.parse('2026-09-02T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
// Дуудлага: 1 ба 3-р долоо хоногт; постын оролцоо: эхний 3 долоо хоног өдөр бүр; ThruPlay: зөвхөн 1-р долоо хоногт.
// 4-р долоо хоногт ямар ч хүргэлтгүй (CSV-д 0 мөрүүд, API-д мөргүй).
const CAMPAIGNS = [
    { id: '11', name: 'Дуудлага', indicator: 'actions:click_to_call_native_call_placed', type: 'calls', spend: 10, impressions: 1000, links: 10, results: 5, on: (day: string) => day <= '2026-09-08' || (day >= '2026-09-16' && day <= '2026-09-22') },
    { id: '22', name: 'Пост', indicator: 'actions:post_engagement', type: 'post_engagement', spend: 3, impressions: 2000, links: 5, results: 300, on: (day: string) => day <= '2026-09-22' },
    { id: '33', name: 'Видео', indicator: 'video_thruplay_watched_actions', type: 'thruplay', spend: 2, impressions: 800, links: 1, results: 40, on: (day: string) => day <= '2026-09-08' },
] as const;

const apiRows: MetaInsightRow[] = DAYS.flatMap(day => CAMPAIGNS.filter(c => c.on(day)).map(c => ({
    day, campaign_id: c.id, campaign_name: c.name, adset_id: `${c.id}0`, spend: c.spend, impressions: c.impressions, reach: null, clicks: c.links * 2,
    inline_link_clicks: c.links, landing_page_views: 0, result_type: c.type, results: c.results, result_source: 'results',
})));
const HEADERS = ['Reporting starts', 'Reporting ends', 'Campaign name', 'Result indicator', 'Results', 'Amount spent (USD)', 'Impressions', 'Link clicks'];
const csvRows = DAYS.flatMap(day => CAMPAIGNS.map(c => c.on(day)
    ? { 'Reporting starts': day, 'Reporting ends': day, 'Campaign name': c.name, 'Result indicator': c.indicator, Results: c.results, 'Amount spent (USD)': c.spend, Impressions: c.impressions, 'Link clicks': c.links }
    // Ads Manager-ийн өдрийн экспорт хүргэлтгүй өдрийг хоосон indicator, 0 зардалтай мөрөөр өгдөг.
    : { 'Reporting starts': day, 'Reporting ends': day, 'Campaign name': c.name, 'Result indicator': '', Results: '', 'Amount spent (USD)': 0, Impressions: 0, 'Link clicks': '' }));

/** Үр дүнгийн түлхүүрүүд: results_T, spend_T, cost_per_result_T ба хуучин results / cost_per_result. */
const resultKeys = (totals: ChannelTotals) => Object.fromEntries(Object.entries(totals)
    .filter(([key]) => /^(results|cost_per_result)(_|$)|^spend_/.test(key)).sort(([a], [b]) => a.localeCompare(b)));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T04:00:00Z'));
    mocks.adsets.mockResolvedValue({ rows: apiRows.map(r => ({ day: r.day, adset_id: r.adset_id })), resultFields: true });
    mocks.reach.mockResolvedValue({ account: 0, campaigns: new Map() });
});
afterEach(() => vi.useRealTimers());

it('API weekly reports and the split CSV import write the same result keys, zeros for a type that stopped delivering and for a zero week', async () => {
    const reports: Array<{ period_from: string; totals: ChannelTotals }> = [];
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'eq', 'gte', 'lte']) q[method] = () => q;
    q.single = async () => ({ data: { facebook_ad_account_id: '123' }, error: null });
    q.range = async () => ({ data: apiRows, error: null });
    q.in = async () => ({ data: [], error: null });
    q.upsert = async (value: { period_from?: string; totals?: ChannelTotals }) => { if (value.totals) reports.push(value as { period_from: string; totals: ChannelTotals }); return { error: null }; };
    const db = { from: () => q, rpc: async () => ({ data: apiRows.length, error: null }) } as unknown as SupabaseClient;
    await syncMetaInsights(db, 'shop-1', { from: '2026-09-02', to: '2026-09-29' });
    const api = WEEKS.map(week => reports.find(r => r.period_from === week.from)!.totals);

    const csv = aggregateByReviewWeeks(csvRows, suggestMapping(HEADERS, 'meta_ads'), 'meta_ads', WEEKS).map(({ result }) => result.totals);
    expect(csv).toHaveLength(4);

    for (let i = 0; i < WEEKS.length; i++) expect(resultKeys(api[i]), WEEKS[i].from).toEqual(resultKeys(csv[i]));
    // 2-р долоо хоног: дуудлага, ThruPlay 0; 4-р долоо хоног: бүх төрөл 0, хуучин results-гүй.
    expect(api[1]).toMatchObject({ spend_calls: 0, results_calls: 0, spend_thruplay: 0, results_thruplay: 0, results: 2100 });
    expect(api[3]).toMatchObject({ spend_calls: 0, results_calls: 0, spend_post_engagement: 0, results_post_engagement: 0, spend_thruplay: 0, results_thruplay: 0 });
    expect(api[3]).not.toHaveProperty('results');
    expect(api.map(totals => presentMetaResultTypes(totals))).toEqual(csv.map(totals => presentMetaResultTypes(totals)));
    // Долоо хоногийн харьцуулалт хоёр замаар ижил: 0 руу буурч, 0-ээс өснө.
    for (const [current, previous] of [[1, 0], [2, 1], [3, 2]]) {
        const fromApi = compareWithPrevious(api[current], api[previous], 'meta_ads');
        const fromCsv = compareWithPrevious(csv[current], csv[previous], 'meta_ads');
        for (const key of ['results_calls', 'spend_calls', 'results_thruplay', 'results_post_engagement']) expect(fromApi[key], `${key} ${current}`).toEqual(fromCsv[key]);
    }
    expect(compareWithPrevious(api[1], api[0], 'meta_ads').results_calls).toMatchObject({ current: 0, previous: 35, delta: -35 });
    expect(compareWithPrevious(api[2], api[1], 'meta_ads').results_calls).toMatchObject({ current: 35, previous: 0, delta: 35 });
});
