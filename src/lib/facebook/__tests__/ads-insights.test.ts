// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { fetchMetaAdsetInsights, fetchMetaPeriodReach, metaRowResult, parseMetaResults } from '../ads-insights';

const account = { id: 'act_123', currency: 'USD', timezone_name: 'Asia/Ulaanbaatar' };
const callRow = {
    account_id: '123', account_currency: 'USD', campaign_id: '11', campaign_name: 'Дуудлага', adset_id: '101', adset_name: 'Calls A',
    objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'QUALITY_CALL', date_start: '2026-09-23', date_stop: '2026-09-23',
    spend: '10.50', impressions: '1000', reach: '800', frequency: '1.25', clicks: '40', inline_link_clicks: '25',
    actions: [
        { action_type: 'click_to_call_native_call_placed', value: '3' }, { action_type: 'landing_page_view', value: '7' },
        { action_type: 'link_click', value: '25', '7d_click': '25' },
    ],
    cost_per_action_type: [{ action_type: 'click_to_call_native_call_placed', value: '3.5' }],
    results: [{ indicator: 'actions:click_to_call_native_call_placed', values: [{ value: '3', attribution_windows: ['default'] }] }],
    cost_per_result: [{ indicator: 'actions:click_to_call_native_call_placed', values: [{ value: '3.5' }] }],
};
const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', http); vi.stubEnv('META_ADS_APP_SECRET', 'ads-app-secret'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

it('reads ad set × day insights with Meta results, pages by cursor and never follows paging.next', async () => {
    http.mockResolvedValueOnce(reply({ data: [callRow], paging: { next: 'https://evil.test/?access_token=leak', cursors: { after: 'c1' } } }))
        .mockResolvedValueOnce(reply({ data: [{ ...callRow, date_start: '2026-09-24', date_stop: '2026-09-24', results: [{ indicator: 'actions:click_to_call_native_call_placed', values: [] }] }] }));
    const { rows, resultFields } = await fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29');
    expect(resultFields).toBe(true);
    expect(rows[0]).toMatchObject({
        day: '2026-09-23', campaign_id: '11', adset_id: '101', currency: 'USD', spend: 10.5, impressions: 1000, reach: 800, clicks: 40, inline_link_clicks: 25,
        landing_page_views: 7, calls_placed: 3, result_type: 'calls', result_indicator: 'click_to_call_native_call_placed', results: 3, result_source: 'results',
        objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'QUALITY_CALL',
    });
    // Attribution цонхны нэмэлт түлхүүрүүдийг хадгалахгүй.
    expect(rows[0].actions[2]).toEqual({ action_type: 'link_click', value: 25 });
    // Indicator байгаа ч утгагүй өдөр = 0 үр дүн (төрөл хэвээр).
    expect(rows[1]).toMatchObject({ result_type: 'calls', results: 0, result_source: 'results' });
    const urls = http.mock.calls.map(([url]) => url as URL);
    for (const [url, init] of http.mock.calls) {
        expect(url.origin).toBe('https://graph.facebook.com');
        expect(url.pathname).toBe('/v26.0/act_123/insights');
        expect(url.searchParams.get('level')).toBe('adset');
        expect(url.searchParams.get('time_increment')).toBe('1');
        expect(url.searchParams.get('limit')).toBe('500');
        expect(JSON.parse(url.searchParams.get('time_range')!)).toEqual({ since: '2026-09-23', until: '2026-09-29' });
        expect(url.searchParams.get('fields')!.split(',')).toEqual(expect.arrayContaining(['adset_id', 'optimization_goal', 'inline_link_clicks', 'actions', 'results', 'cost_per_result', 'video_thruplay_watched_actions']));
        expect(url.toString()).not.toContain('secret-token');
        expect(init.headers.Authorization).toBe('Bearer secret-token');
    }
    expect(urls[1].searchParams.get('after')).toBe('c1');
});

it('falls back once without the results fields when Meta rejects them and types results by optimization goal', async () => {
    const leadRow = {
        ...callRow, campaign_id: '22', adset_id: '202', optimization_goal: 'LEAD_GENERATION', results: undefined, cost_per_result: undefined,
        actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '5' }, { action_type: 'lead', value: '5' }],
    };
    const videoRow = { ...leadRow, adset_id: '303', optimization_goal: 'THRUPLAY', actions: [{ action_type: 'video_view', value: '900' }] };
    http.mockResolvedValueOnce(reply({ error: { code: 100, message: '(#100) results is not a valid field' } }, 400))
        .mockResolvedValueOnce(reply({ data: [leadRow, videoRow] }));
    const { rows, resultFields } = await fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29');
    expect(resultFields).toBe(false);
    expect(http).toHaveBeenCalledTimes(2);
    const fallbackFields = (http.mock.calls[1][0] as URL).searchParams.get('fields')!.split(',');
    for (const field of ['results', 'cost_per_result', 'video_thruplay_watched_actions']) expect(fallbackFields).not.toContain(field);
    // lead_grouped ба lead-ийг давхар тоолохгүй.
    expect(rows[0]).toMatchObject({ result_type: 'leads', result_indicator: 'onsite_conversion.lead_grouped', results: 5, result_source: 'goal' });
    // ThruPlay талбаргүй үед тоо тодорхойгүй (null), «video_view» (3 секунд)-ийг ThruPlay гэж тооцохгүй.
    expect(rows[1]).toMatchObject({ result_type: 'thruplay', results: null, result_source: 'goal' });
});

it('does not retry other errors without the results fields', async () => {
    http.mockResolvedValue(reply({ error: { code: 190 } }, 400));
    await expect(fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow(/эрх дууссан/);
    expect(http).toHaveBeenCalledTimes(1);
});

it.each([
    ['another account', { account_id: '999' }],
    ['another currency', { account_currency: 'MNT' }],
    ['non-numeric ad set id', { adset_id: '../101' }],
    ['missing campaign id', { campaign_id: undefined }],
    ['multi-day row', { date_stop: '2026-09-24' }],
    ['day outside the window', { date_start: '2026-09-30', date_stop: '2026-09-30' }],
    ['negative spend', { spend: '-1' }],
    ['fractional impressions', { impressions: '10.5' }],
    ['non-numeric reach', { reach: 'many' }],
    ['action without a number', { actions: [{ action_type: 'lead', value: 'NaN' }] }],
    ['actions that are not a list', { actions: { lead: 1 } }],
])('rejects the whole sync on an unsafe row (%s)', async (_label, patch) => {
    http.mockResolvedValue(reply({ data: [{ ...callRow, ...patch }] }));
    await expect(fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow();
});

it('accepts full-precision ratios from Graph (frequency, action values, costs, results) instead of failing the sync', async () => {
    http.mockResolvedValueOnce(reply({ data: [{
        ...callRow, frequency: '1.3076923076923',
        actions: [{ action_type: 'click_to_call_native_call_placed', value: '3' }, { action_type: 'video_view', value: '3.3333333333333' }],
        cost_per_action_type: [{ action_type: 'click_to_call_native_call_placed', value: '3.3333333333333' }],
        results: [{ indicator: 'actions:click_to_call_native_call_placed', values: [{ value: '2.6666666666667' }] }],
    }] }));
    const { rows } = await fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29');
    expect(rows[0]).toMatchObject({ calls_placed: 3, results: 2.6666666666667, result_type: 'calls' });
    expect(rows[0].cost_per_action_type).toEqual([{ action_type: 'click_to_call_native_call_placed', value: 3.3333333333333 }]);
    expect(rows[0].actions[1]).toEqual({ action_type: 'video_view', value: 3.3333333333333 });
    // `frequency` хадгалагдахгүй тул ямар ч хэлбэртэй ирсэн синкийг унагахгүй.
    http.mockResolvedValueOnce(reply({ data: [{ ...callRow, frequency: 'n/a' }] }));
    await expect(fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29')).resolves.toMatchObject({ rows: [{ adset_id: '101' }] });
});

it('rejects duplicate ad set days and non-advancing cursors', async () => {
    http.mockResolvedValueOnce(reply({ data: [callRow, callRow] }));
    await expect(fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow(/зөрүүтэй/);
    http.mockImplementation(async () => reply({ data: [], paging: { next: 'more', cursors: { after: 'same' } } }));
    await expect(fetchMetaAdsetInsights(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow(/хуудаслалт/);
    expect(http).toHaveBeenCalledTimes(3);
});

it('types a row from the results indicator, else from the optimization goal with exactly one action type', () => {
    const base = { optimization_goal: null, actions: [], thruplay: [], reach: 500 };
    expect(metaRowResult({ ...base, results: [{ indicator: 'actions:onsite_conversion.messaging_conversation_started_7d', values: [{ value: '4', attribution_windows: ['1d_view'] }, { value: '6', attribution_windows: ['default'] }] }] }))
        .toEqual({ result_type: 'messages', result_indicator: 'onsite_conversion.messaging_conversation_started_7d', results: 6, result_source: 'results' });
    expect(metaRowResult({ ...base, results: [{ indicator: 'reach', values: [{ value: 1200 }] }] })).toMatchObject({ result_type: 'reach', results: 1200 });
    expect(metaRowResult({ ...base, results: [{ indicator: 'actions:offsite_conversion.custom.123', values: [{ value: '2' }] }] })).toMatchObject({ result_type: 'other', results: 2 });
    expect(metaRowResult({ ...base, optimization_goal: 'REACH' })).toEqual({ result_type: 'reach', result_indicator: 'reach', results: 500, result_source: 'goal' });
    expect(metaRowResult({ ...base, optimization_goal: 'THRUPLAY', thruplay: [{ action_type: 'video_view', value: 77 }] })).toMatchObject({ result_type: 'thruplay', results: 77 });
    expect(metaRowResult({ ...base, optimization_goal: 'CONVERSATIONS', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: 9 }, { action_type: 'onsite_conversion.total_messaging_connection', value: 12 }] }))
        .toMatchObject({ result_type: 'messages', results: 9 });
    expect(metaRowResult({ ...base, optimization_goal: 'POST_ENGAGEMENT' })).toMatchObject({ result_type: 'post_engagement', results: 0 });
    expect(metaRowResult({ ...base, optimization_goal: 'IMPRESSIONS' })).toMatchObject({ result_type: 'other', results: null });
    expect(metaRowResult({ ...base, results: 'garbage' })).toEqual({ result_type: null, result_indicator: null, results: null, result_source: 'goal' });
    expect(parseMetaResults([{ values: [{ value: '1' }] }, { indicator: 'actions:link_click', values: [{ value: 'x' }] }])).toEqual({ indicator: 'actions:link_click', value: null });
});

it('fetches deduplicated period reach for the account and per campaign', async () => {
    http.mockResolvedValueOnce(reply({ data: [{ account_id: '123', reach: '5000', frequency: '2.1', impressions: '10500', spend: '50.00', date_start: '2026-09-23', date_stop: '2026-09-29' }] }))
        .mockResolvedValueOnce(reply({ data: [{ account_id: '123', campaign_id: '11', reach: '3000' }], paging: { next: 'x', cursors: { after: 'c1' } } }))
        .mockResolvedValueOnce(reply({ data: [{ account_id: '123', campaign_id: '22', reach: '2500' }] }));
    const reach = await fetchMetaPeriodReach(account, 'secret-token', '2026-09-23', '2026-09-29');
    expect(reach.account).toBe(5000);
    expect([...reach.campaigns]).toEqual([['11', 3000], ['22', 2500]]);
    const [accountUrl, campaignUrl] = http.mock.calls.map(([url]) => url as URL);
    expect(accountUrl.searchParams.get('level')).toBe('account');
    expect(accountUrl.searchParams.has('time_increment')).toBe(false);
    expect(accountUrl.searchParams.get('fields')).toContain('reach');
    expect(campaignUrl.searchParams.get('level')).toBe('campaign');
    expect(JSON.parse(campaignUrl.searchParams.get('time_range')!)).toEqual({ since: '2026-09-23', until: '2026-09-29' });

    http.mockReset();
    http.mockResolvedValueOnce(reply({ data: [] })).mockResolvedValueOnce(reply({ data: [] }));
    expect(await fetchMetaPeriodReach(account, 'secret-token', '2026-09-23', '2026-09-29')).toEqual({ account: 0, campaigns: new Map() });

    http.mockReset();
    http.mockResolvedValueOnce(reply({ data: [{ account_id: '123', reach: '5000', date_start: '2026-09-22', date_stop: '2026-09-29' }] }));
    await expect(fetchMetaPeriodReach(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow();

    // Хүргэлттэй ч reach ирээгүй бол 0 гэж таамаглахгүй; reach-гүй кампанит ажил тодорхойгүй хэвээр.
    http.mockReset();
    http.mockResolvedValueOnce(reply({ data: [{ account_id: '123', impressions: '10' }] }));
    await expect(fetchMetaPeriodReach(account, 'secret-token', '2026-09-23', '2026-09-29')).rejects.toThrow(/reach/);
    http.mockReset();
    http.mockResolvedValueOnce(reply({ data: [{ account_id: '123', reach: '10' }] }))
        .mockResolvedValueOnce(reply({ data: [{ campaign_id: '11' }, { campaign_id: '22', reach: '4' }] }));
    expect([...(await fetchMetaPeriodReach(account, 'secret-token', '2026-09-23', '2026-09-29')).campaigns]).toEqual([['22', 4]]);
});
