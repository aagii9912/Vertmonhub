// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
    aggregateByReviewWeeks, aggregateChannelReport, applyRememberedMapping, channelSplitWeeks, compareWithPrevious, formatChannelValue,
    formatDayRanges, pickDuplicateReport, splitWeekSkip, suggestMapping, type ChannelMapping,
} from '../channel-reports';
import { readChannelFile, type ChannelFileTable } from '../channel-reports-file';
// Хиймэл өдрийн экспорт (2026-09-12 – 09-24, 9 кампанит ажил × 13 өдөр): дуудлага, постын харилцаа/оролцоо,
// ThruPlay, хүрсэн хүн; хүргэлтгүй 0 мөр; ижил нэртэй кампанит ажил (нэг нь өөр өөр төрөлтэй).
import { META_ADS_DAILY_CSV } from '../../../../e2e/fixtures/meta-ads-daily';

/** Ads Manager-ийн Campaigns экспортын 27 багана (бодит файлын толгойтой ижил дараалал). */
const META_EXPORT_HEADERS = [
    'Reporting starts', 'Reporting ends', 'Campaign name', 'Campaign delivery', 'Attribution setting', 'Results', 'Result indicator', 'Reach', 'Frequency',
    'Cost per results', 'Ad set budget', 'Ad set budget type', 'Amount spent (USD)', 'Ends', 'Impressions', 'CPM (cost per 1,000 impressions) (USD)',
    'Link clicks', 'shop_clicks', 'CPC (cost per link click) (USD)', 'CTR (link click-through rate)', 'Clicks (all)', 'CTR (all)', 'CPC (all) (USD)',
    'Landing page views', 'Cost per landing page view (USD)', 'Results (initial)', 'Results (initial) indicator',
];
const table = (header: string[], ...rows: unknown[][]) => rows.map(values => Object.fromEntries(header.map((h, i) => [h, values[i] ?? ''])));

let file: ChannelFileTable;
let mapping: ChannelMapping;
beforeAll(async () => {
    file = await readChannelFile(new TextEncoder().encode(META_ADS_DAILY_CSV), 'meta_ads');
    mapping = suggestMapping(file.headers, 'meta_ads');
});

describe('Meta Ads Manager daily campaign export', () => {
    it('maps the real export columns, including Clicks (all) and Landing page views', () => {
        expect(file.headers).toEqual(META_EXPORT_HEADERS);
        expect(Object.fromEntries(Object.entries(mapping).filter(([, key]) => key))).toEqual({
            'Reporting starts': 'reporting_starts', 'Reporting ends': 'reporting_ends', 'Campaign name': 'campaign', Results: 'results',
            'Result indicator': 'result_type', Reach: 'reach', Frequency: 'frequency', 'Amount spent (USD)': 'spend', Impressions: 'impressions',
            'Link clicks': 'link_clicks', 'Clicks (all)': 'clicks_all', 'Landing page views': 'landing_page_views',
        });
    });

    it('keeps Results mapped on the second import although «Results (initial)» normalizes to the same header', () => {
        const first = applyRememberedMapping(META_EXPORT_HEADERS, 'meta_ads', null);
        expect(first.mapping).toMatchObject({ Results: 'results', 'Results (initial)': '' });
        // jsonb түлхүүрийг уртаар, дараа нь байтаар эрэмбэлдэг тул «Results» (7) «Results (initial)» (17)-ээс өмнө ирнэ.
        const stored = Object.fromEntries(Object.entries(first.mapping).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)));
        const second = applyRememberedMapping(META_EXPORT_HEADERS, 'meta_ads', stored);
        expect(second).toEqual({ mapping: first.mapping, origin: 'remembered' });
        // Өөр нэршилтэй (зөвхөн normalize-аар таарах) толгойд ч хоосон холболт үзүүлэлттэйг дарахгүй.
        expect(applyRememberedMapping(['RESULTS', 'Result indicator'], 'meta_ads', stored).mapping).toEqual({ RESULTS: 'results', 'Result indicator': 'result_type' });
        expect(applyRememberedMapping(['Results (initial)', 'Results'], 'meta_ads', { 'Results (initial)': '', Results: 'results' }).mapping).toEqual({ 'Results (initial)': '', Results: 'results' });
    });

    it('splits Results by type and attributes each campaign’s spend by its objective', () => {
        const result = aggregateChannelReport(file.rows, mapping, 'meta_ads', { firstLine: file.firstLine });
        expect(result.errors).toEqual([]);
        expect(result.totals).toEqual({
            spend: 183.9, currency: 'USD', impressions: 234500, link_clicks: 523, clicks_all: 2589, landing_page_views: 56,
            cpm: 0.78, cost_per_link_click: 0.35, ctr_link: 0.22, cost_per_landing_page_view: 3.28,
            // Дуудлагын кампанит ажлын үр дүнгүй өдрийн зардал ч (3 өдөр × 10) дуудлагад; ижил нэртэй өөр кампанит ажлын дуудлага нэмэгдэнэ.
            results_calls: 28, spend_calls: 125, cost_per_result_calls: 4.46,
            results_post_interaction: 180, spend_post_interaction: 36, cost_per_result_post_interaction: 0.2,
            results_post_engagement: 3100, spend_post_engagement: 8.5, cost_per_result_post_engagement: 0.0027,
            results_thruplay: 1200, spend_thruplay: 6, cost_per_result_thruplay: 0.005,
            // Хүрсэн хүнийг өдрөөр нэмэхгүй — зөвхөн зардал.
            spend_reach: 8.4,
        });
        expect(result.missing).toEqual(['reach']);
        expect(result.warnings.find(w => w.code === 'mixed_results')).toMatchObject({ level: 'info', message: expect.stringContaining('Дуудлага (Meta), Постын харилцаа, Постын оролцоо, ThruPlay (видео үзэлт), Хүрсэн хүн (үр дүн)') });
        expect(result.warnings.find(w => w.field === 'results_reach')).toMatchObject({ code: 'non_additive', level: 'info' });
        expect(result.warnings.filter(w => w.level === 'warning')).toEqual([]);
    });

    it('counts only delivering rows and drops zero campaigns from the spend-sorted breakdown', () => {
        const result = aggregateChannelReport(file.rows, mapping, 'meta_ads', { firstLine: file.firstLine });
        expect([result.rowCount, result.zeroRows]).toEqual([36, 81]);
        expect(result.breakdown.map(row => [row.label, row.tag, row.values.spend, row.values.results, row.values.cost_per_result, row.values.reach])).toEqual([
            ['Дуудлагын кампанит ажил', 'calls', 120, 26, 4.62, null],
            ['Постын урамшуулал', 'post_interaction', 36, 180, 0.2, null],
            // Олон өдрийн хүрсэн хүн давхцдаг тул үр дүн, өртөг null.
            ['Брэнд хүрэлт', 'reach', 8.4, null, null, null],
            ['Постын оролцоо', 'post_engagement', 7.5, 2700, 0.0028, null],
            ['Видео үзэлт', 'thruplay', 6, 1200, 0.005, null],
            // Ижил нэртэй, өөр төрлийн кампанит ажил тусдаа мөр; ганц өдрийн reach давхцахгүй.
            ['Давхар нэр', 'calls', 5, 2, 2.5, 2000],
            ['Давхар нэр', 'post_engagement', 1, 400, 0.0025, 1200],
        ]);
        expect(JSON.stringify(result.breakdown)).not.toContain('Хуучин кампанит ажил');
        expect(Object.keys(result.breakdown[0].values).sort()).toEqual(['clicks_all', 'cost_per_result', 'frequency', 'impressions', 'landing_page_views', 'link_clicks', 'reach', 'results', 'spend']);
    });

    it('takes reach results only from a single row and costs them per 1000 people', () => {
        const day = aggregateChannelReport(file.rows, mapping, 'meta_ads', { period: { from: '2026-09-18', to: '2026-09-18' }, firstLine: file.firstLine });
        expect(day.totals).toMatchObject({ results_reach: 9000, spend_reach: 1.2, cost_per_result_reach: 0.1333 });
        expect(day.breakdown.find(row => row.tag === 'reach')?.values).toMatchObject({ results: 9000, cost_per_result: 0.1333, reach: 9000 });
        expect(day.totals.reach).toBeUndefined();
    });

    it('uses a summary row for deduplicated reach only when reach is the only result type', () => {
        const header = ['Campaign name', 'Reporting starts', 'Reporting ends', 'Results', 'Result indicator', 'Reach', 'Amount spent (USD)'];
        const rows = table(header,
            ['A', '2026-09-23', '2026-09-23', 900, 'reach', 900, 1],
            ['A', '2026-09-24', '2026-09-24', 800, 'reach', 800, 1],
            ['Results from 1 campaign', '2026-09-23', '2026-09-24', 1200, 'reach', 1200, 2]);
        const result = aggregateChannelReport(rows, suggestMapping(header, 'meta_ads'), 'meta_ads');
        expect(result.totals).toMatchObject({ reach: 1200, results_reach: 1200, spend_reach: 2, cost_per_result_reach: 1.67, results: 1200, cost_per_result: 1.67 });
        const mixed = aggregateChannelReport([...rows.slice(0, 2), ...table(header, ['B', '2026-09-23', '2026-09-23', 3, 'actions:click_to_call_native_call_placed', 50, 6]), rows[2]], suggestMapping(header, 'meta_ads'), 'meta_ads');
        expect(mixed.totals.results_reach).toBeUndefined();
        expect(mixed.totals).toMatchObject({ results_calls: 3, cost_per_result_calls: 2 });
        expect(mixed.totals.results).toBeUndefined();
    });

    it('keeps legacy results keys for a single type and never rounds a sub-cent cost to zero', () => {
        const header = ['Campaign name', 'Results', 'Result indicator', 'Amount spent (USD)'];
        const result = aggregateChannelReport(table(header, ['A', 11087, 'actions:post_engagement', 30.86], ['B', '', '', 2]), suggestMapping(header, 'meta_ads'), 'meta_ads');
        // B-д үр дүнгийн төрөл огт байхгүй тул түүний зардал төрлийн зардалд орохгүй.
        expect(result.totals).toEqual({ spend: 32.86, currency: 'USD', results_post_engagement: 11087, spend_post_engagement: 30.86, cost_per_result_post_engagement: 0.0028, results: 11087, cost_per_result: 0.0028 });
        expect(result.warnings.find(w => w.code === 'unattributed_spend')).toMatchObject({ level: 'info', message: expect.stringContaining('1 кампанит ажлын 2 зардал') });
        expect(formatChannelValue(0.0028, 'money', 'USD')).toMatch(/^0[.,]0028 USD$/);
        expect(formatChannelValue(0.229, 'money', 'USD')).toMatch(/^0[.,]23 USD$/);
        expect(formatChannelValue(0, 'money', 'USD')).toBe('0 USD');
    });

    it('never adds up untyped Results across rows and asks to map the Result indicator', () => {
        const header = ['Campaign name', 'Reporting starts', 'Reporting ends', 'Results', 'Amount spent (USD)'];
        const map = suggestMapping(header, 'meta_ads');
        // Нэг нь дуудлага (2), нөгөө нь хүрсэн хүн (100) байж болно — 102 гэж нэмэхгүй.
        const mixed = aggregateChannelReport(table(header, ['Дуудлага', '2026-09-23', '2026-09-29', 2, 0.5], ['Хүрэлт', '2026-09-23', '2026-09-29', 100, 0.3]), map, 'meta_ads');
        expect(mixed.totals).toEqual({ spend: 0.8, currency: 'USD' });
        expect(mixed.warnings.find(w => w.code === 'unknown_result_type')).toMatchObject({ level: 'warning', message: expect.stringContaining('«Result indicator» баганыг «Үр дүнгийн төрөл»-д холбоно уу') });
        // Кампанит ажил бүрийн ганц мөрийн үр дүн хэвээр, олон өдрийнхийг (хүрсэн хүн байж болно) нэмэхгүй.
        expect(mixed.breakdown.map(row => [row.label, row.tag, row.values.results, row.values.cost_per_result])).toEqual([['Дуудлага', undefined, 2, 0.25], ['Хүрэлт', undefined, 100, 0.003]]);
        const daily = aggregateChannelReport(table(header, ['A', '2026-09-23', '2026-09-23', 3, 1], ['A', '2026-09-24', '2026-09-24', 4, 1]), map, 'meta_ads');
        expect(daily.breakdown[0].values).toMatchObject({ spend: 2, results: null, cost_per_result: null });
        // Ганц мөр эсвэл файлын «нийт» мөрийн Results-ийг (нэг төрөлтэй үед Meta бөглөдөг) авна.
        const single = aggregateChannelReport(table(header, ['A', '2026-09-23', '2026-09-29', 1000, 2.5]), map, 'meta_ads');
        expect(single.totals).toMatchObject({ results: 1000, cost_per_result: 0.0025 });
        expect(single.warnings.find(w => w.code === 'unknown_result_type')?.level).toBe('info');
        const summary = aggregateChannelReport(table(header, ['A', '2026-09-23', '2026-09-29', 1000, 2.5], ['B', '2026-09-23', '2026-09-29', 500, 1], ['Results from 2 campaigns', '2026-09-23', '2026-09-29', 1500, 3.5]), map, 'meta_ads');
        expect(summary.totals).toMatchObject({ results: 1500, cost_per_result: 0.0023 });
    });

    it('separates same-named campaigns by Campaign ID and labels them by name', () => {
        const header = ['Campaign ID', 'Campaign name', 'Reporting starts', 'Reporting ends', 'Results', 'Result indicator', 'Reach', 'Amount spent (USD)'];
        const rows = table(header,
            ['120000000000000001', 'Нэг нэр', '2026-09-23', '2026-09-23', 2, 'actions:click_to_call_native_call_placed', 100, 4],
            ['120000000000000001', 'Нэг нэр', '2026-09-24', '2026-09-24', '', '', 90, 3],
            ['120000000000000002', 'Нэг нэр', '2026-09-23', '2026-09-23', 50, 'actions:post_interaction_gross', 300, 1]);
        const map = suggestMapping(header, 'meta_ads');
        expect(map['Campaign ID']).toBe('campaign_id');
        const result = aggregateChannelReport(rows, map, 'meta_ads');
        expect(result.breakdown.map(row => [row.label, row.tag, row.values.spend, row.values.results])).toEqual([['Нэг нэр', 'calls', 7, 2], ['Нэг нэр', 'post_interaction', 1, 50]]);
        expect(result.totals).toMatchObject({ spend_calls: 7, results_calls: 2, cost_per_result_calls: 3.5, spend_post_interaction: 1 });
    });
});

describe('meeting-week split', () => {
    it('offers the Wednesday–Tuesday weeks of a daily export and aggregates each week with its coverage', () => {
        const whole = aggregateChannelReport(file.rows, mapping, 'meta_ads', { firstLine: file.firstLine });
        expect(whole.dailyRows).toBe(true);
        expect(whole.detectedPeriod).toEqual({ from: '2026-09-12', to: '2026-09-24' });
        const weeks = channelSplitWeeks(whole);
        expect(weeks).toEqual([{ from: '2026-09-09', to: '2026-09-15' }, { from: '2026-09-16', to: '2026-09-22' }, { from: '2026-09-23', to: '2026-09-29' }]);
        const split = aggregateByReviewWeeks(file.rows, mapping, 'meta_ads', weeks, { firstLine: file.firstLine });
        expect(split.map(({ week, result }) => ({
            week: week.from, data: result.dataPeriod, missing: result.missingDays, rows: [result.rowCount, result.zeroRows],
            spend: result.totals.spend, calls: result.totals.results_calls, perCall: result.totals.cost_per_result_calls, reach: result.totals.spend_reach,
        }))).toEqual([
            { week: '2026-09-09', data: { from: '2026-09-12', to: '2026-09-15' }, missing: ['2026-09-09', '2026-09-10', '2026-09-11'], rows: [8, 28], spend: 34.8, calls: 6, perCall: 5, reach: 4.8 },
            { week: '2026-09-16', data: { from: '2026-09-16', to: '2026-09-22' }, missing: [], rows: [23, 40], spend: 120.1, calls: 18, perCall: 4.17, reach: 3.6 },
            // Хүрсэн хүний кампанит ажил энэ долоо хоногт хүргэлтгүй — зардал 0.
            { week: '2026-09-23', data: { from: '2026-09-23', to: '2026-09-24' }, missing: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'], rows: [5, 13], spend: 29, calls: 4, perCall: 5, reach: 0 },
        ]);
        // Долоо хоногуудын зардал файлын нийттэй тэнцүү; кампанит ажлын задаргаа долоо хоногоор.
        expect(split.reduce((total, { result }) => total + (result.totals.spend as number), 0)).toBeCloseTo(183.9, 6);
        expect(split[2].result.breakdown.map(row => row.label)).toEqual(['Дуудлагын кампанит ажил', 'Постын урамшуулал', 'Давхар нэр']);
        for (const { result } of split) expect(result.warnings.map(w => w.code)).not.toContain('out_of_period');
        expect(split[0].result.warnings.find(w => w.code === 'partial_coverage')?.message).toContain('7 өдрөөс 4-д л өгөгдөл байна — өгөгдөлгүй: 2026-09-09 – 2026-09-11');
        expect(split[1].result.warnings.map(w => w.code)).not.toContain('partial_coverage');
    });

    it('stores 0 for a result type of the file without delivery in that week, so the next week compares with 0', () => {
        const weeks = aggregateByReviewWeeks(file.rows, mapping, 'meta_ads', channelSplitWeeks(aggregateChannelReport(file.rows, mapping, 'meta_ads')), { firstLine: file.firstLine });
        const [first, second, third] = weeks.map(({ result }) => result.totals);
        // ThruPlay зөвхөн 09-17, 09-18-нд: эхний долоо хоногт 0 (өртөггүй), хүрсэн хүний тоог (давхцдаг) 0 гэж бичихгүй.
        expect(first).toMatchObject({ results_thruplay: 0, spend_thruplay: 0, results_post_engagement: 0, spend_post_engagement: 0, results_post_interaction: 0, spend_post_interaction: 0 });
        expect(first.cost_per_result_thruplay).toBeUndefined();
        expect(third).toMatchObject({ results_thruplay: 0, spend_reach: 0 });
        expect(third.results_reach).toBeUndefined();
        // Хуучин нийт `results` нь хүргэлттэй төрөл нэг байхад л (энд 2 төрөл: дуудлага, хүрсэн хүн).
        expect(first.results).toBeUndefined();
        expect(compareWithPrevious(second, first, 'meta_ads').results_thruplay).toEqual({ current: 1200, previous: 0, delta: 1200, pct: null, comparable: true });
        // Файлд огт хүргэлтгүй төрлийг (хоосон мөрийн indicator) 0-ээр нэмэхгүй.
        expect(Object.keys(first).filter(key => key.startsWith('results_')).sort()).toEqual(['results_calls', 'results_post_engagement', 'results_post_interaction', 'results_thruplay']);
    });

    it('notes the whole-file summary row as info only when splitting into weeks', () => {
        const header = ['Campaign name', 'Reporting starts', 'Reporting ends', 'Results', 'Result indicator', 'Amount spent (USD)'];
        const rows = table(header,
            ['A', '2026-09-14', '2026-09-14', 2, 'actions:click_to_call_native_call_placed', 5],
            ['B', '2026-09-17', '2026-09-17', 3, 'actions:click_to_call_native_call_placed', 7],
            ['Results from 2 campaigns', '2026-09-14', '2026-09-17', 5, 'actions:click_to_call_native_call_placed', 12]);
        const map = suggestMapping(header, 'meta_ads');
        const weeks = channelSplitWeeks(aggregateChannelReport(rows, map, 'meta_ads'));
        const split = aggregateByReviewWeeks(rows, map, 'meta_ads', weeks);
        expect(split.map(({ result }) => [result.totals.spend, result.totals.results_calls])).toEqual([[5, 2], [7, 3]]);
        for (const { result } of split) expect(result.warnings.find(w => w.code === 'total_ignored')).toMatchObject({ level: 'info' });
        const single = aggregateChannelReport(rows, map, 'meta_ads', { period: weeks[0] });
        expect(single.warnings.find(w => w.code === 'total_ignored')).toMatchObject({ level: 'warning' });
    });

    it('keeps a fuller saved week and never replaces a Meta API week by default', () => {
        const week = { from: '2026-09-02', to: '2026-09-08' };
        const saved = (data: { from: string; to: string } | null, origin: 'file' | 'api' = 'file', sameFile = false) =>
            ({ id: 'r', file_name: 'old.csv', updated_at: '2026-09-09', origin, sameFile, data_from: data?.from ?? null, data_to: data?.to ?? null });
        // «Сүүлийн 30 хоног»-ийн дараагийн экспорт 09-07-ноос эхэлбэл 7/7 хадгалсныг 2/7-оор дарахгүй.
        expect(splitWeekSkip(week, { from: '2026-09-07', to: '2026-09-08' }, saved(week))).toBe('fuller');
        expect(splitWeekSkip(week, { from: '2026-09-07', to: '2026-09-08' }, saved(null))).toBe('fuller');
        expect(splitWeekSkip(week, { from: '2026-09-02', to: '2026-09-07' }, saved({ from: '2026-09-02', to: '2026-09-08' }))).toBe('fuller');
        expect(splitWeekSkip(week, { from: '2026-09-02', to: '2026-09-08' }, saved({ from: '2026-09-05', to: '2026-09-08' }))).toBeNull();
        expect(splitWeekSkip(week, week, saved(null))).toBeNull();
        expect(splitWeekSkip(week, { from: '2026-09-07', to: '2026-09-08' }, saved(week, 'file', true))).toBeNull();
        expect(splitWeekSkip(week, week, saved(week, 'api'))).toBe('api');
        expect(splitWeekSkip(week, { from: '2026-09-07', to: '2026-09-08' }, null)).toBeNull();
    });

    it('warns about uncovered days for a single period and stores the covered days', () => {
        const week = aggregateChannelReport(file.rows, mapping, 'meta_ads', { period: { from: '2026-09-23', to: '2026-09-29' }, firstLine: file.firstLine });
        expect(week.dataPeriod).toEqual({ from: '2026-09-23', to: '2026-09-24' });
        expect(week.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['out_of_period', 'partial_coverage']));
        expect(week.excludedRows).toBe(99);
    });

    it('does not split a non-daily, single-week or very long export', () => {
        const header = ['Campaign name', 'Reporting starts', 'Reporting ends', 'Amount spent (USD)'];
        const weekly = aggregateChannelReport(table(header, ['A', '2026-09-09', '2026-09-15', 5], ['A', '2026-09-16', '2026-09-22', 5]), suggestMapping(header, 'meta_ads'), 'meta_ads');
        expect(weekly.dailyRows).toBe(false);
        expect(channelSplitWeeks(weekly)).toEqual([]);
        const oneWeek = aggregateChannelReport(table(header, ['A', '2026-09-16', '2026-09-16', 5], ['A', '2026-09-22', '2026-09-22', 5]), suggestMapping(header, 'meta_ads'), 'meta_ads');
        expect(channelSplitWeeks(oneWeek)).toEqual([]);
        const long = aggregateChannelReport(table(header, ['A', '2026-01-07', '2026-01-07', 5], ['A', '2026-06-30', '2026-06-30', 5]), suggestMapping(header, 'meta_ads'), 'meta_ads');
        expect(channelSplitWeeks(long)).toEqual([]);
        expect(channelSplitWeeks({ source: 'sms', dailyRows: true, detectedPeriod: { from: '2026-09-01', to: '2026-09-30' } })).toEqual([]);
    });

    it('formats missing days as ranges', () => {
        expect(formatDayRanges(['2026-09-29', '2026-09-26', '2026-09-27', '2026-09-30', '2026-10-02'])).toBe('2026-09-26 – 2026-09-27, 2026-09-29 – 2026-09-30, 2026-10-02');
    });
});

describe('duplicate file', () => {
    const saved = (source: string, from: string, to: string) => ({ id: `${source}:${from}`, source, period_from: from, period_to: to });
    it('flags a dated file only for another source of the same period, a date-less file for any other report', () => {
        const week = { from: '2026-09-23', to: '2026-09-29' };
        const rows = [saved('meta_ads', '2026-09-16', '2026-09-22'), saved('meta_ads', '2026-09-23', '2026-09-29')];
        // Нэг өдрийн Meta файлыг өөр долоо хоногт ашиглах нь давхар биш; ижил хугацаа, эх үүсвэрийнх нь «хадгалсан тайлан».
        expect(pickDuplicateReport(rows, { source: 'meta_ads', period: week, dated: true })).toBeNull();
        expect(pickDuplicateReport([...rows, saved('callpro', '2026-09-23', '2026-09-29')], { source: 'meta_ads', period: week, dated: true })?.id).toBe('callpro:2026-09-23');
        // Огноогүй CallPro бүлгийн тайланг дараагийн долоо хоногт андуурч дахин оруулбал анхааруулна.
        const group = [saved('callpro', '2026-09-16', '2026-09-22')];
        expect(pickDuplicateReport(group, { source: 'callpro', period: week, dated: false })?.id).toBe('callpro:2026-09-16');
        expect(pickDuplicateReport(group, { source: 'callpro', period: { from: '2026-09-16', to: '2026-09-22' }, dated: false })).toBeNull();
    });
});

describe('comparison', () => {
    it('compares per-type results and refuses to compare partial coverage', () => {
        const current = { spend: 30, currency: 'USD', results_calls: 6, spend_calls: 20, cost_per_result_calls: 3.33 };
        const previous = { spend: 20, currency: 'USD', results_calls: 4, spend_calls: 10, cost_per_result_calls: 2.5 };
        const full = compareWithPrevious(current, previous, 'meta_ads');
        expect(full.results_calls).toEqual({ current: 6, previous: 4, delta: 2, pct: 50, comparable: true });
        expect(full.cost_per_result_calls).toMatchObject({ delta: 0.83, comparable: true });
        expect(compareWithPrevious(current, { ...previous, currency: 'MNT' }, 'meta_ads').spend_calls).toMatchObject({ comparable: false, reason: 'currency' });
        const partial = compareWithPrevious(current, previous, 'meta_ads', { partialCoverage: true });
        expect(partial.results_calls).toEqual({ current: 6, previous: 4, delta: null, pct: null, comparable: false, reason: 'coverage' });
        expect(partial.spend).toMatchObject({ comparable: false, reason: 'coverage' });
    });
});
