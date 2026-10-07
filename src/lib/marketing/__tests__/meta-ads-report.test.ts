// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    buildMetaAdsReport, formatMetaMoney, formatMetaResult, formatMetaSpend, type MetaInsightDayRow, type MetaLedgerRow,
} from '../meta-ads-report';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const ledger = (patch: Partial<MetaLedgerRow>): MetaLedgerRow => ({
    account_id: 'act_1', campaign_id: '101', campaign_name: 'Дуудлагын зар', spent_at: '2026-09-01',
    native_amount: '10', currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: '35000', mnt_per_unit: '3500', ...patch,
});
const insight = (patch: Partial<MetaInsightDayRow>): MetaInsightDayRow => ({
    account_id: 'act_1', currency: 'USD', day: '2026-09-01', campaign_id: '101', campaign_name: 'Дуудлагын зар', adset_id: '901',
    spend: '10', impressions: '1000', reach: '800', clicks: '60', inline_link_clicks: '40', landing_page_views: '0',
    result_type: 'calls', results: '4', result_source: 'results', ...patch,
});

const LEDGER: MetaLedgerRow[] = [
    ledger({}),
    ledger({ spent_at: '2026-09-02', native_amount: '5', amount_mnt: '17500' }),
    // Ханшгүй өөр кампанит ажил.
    ledger({ campaign_id: '202', campaign_name: 'Мессежийн зар', spent_at: '2026-09-02', native_amount: '20', amount_mnt: null, mnt_per_unit: null }),
    // Хугацаанаас гадуур — тооцохгүй.
    ledger({ spent_at: '2026-08-31', native_amount: '999', amount_mnt: '3496500' }),
];
const INSIGHTS: MetaInsightDayRow[] = [
    insight({}),
    insight({ day: '2026-09-02', spend: '5', impressions: '500', clicks: '20', inline_link_clicks: '10', results: '1' }),
    insight({ day: '2026-09-02', campaign_id: '202', campaign_name: 'Мессежийн зар', adset_id: '902', spend: '20', impressions: '2000',
        clicks: '50', inline_link_clicks: '30', result_type: 'messages', results: '6' }),
];

describe('buildMetaAdsReport', () => {
    it('sums MNT only where FX exists and keeps unconverted spend in its own currency', () => {
        const report = buildMetaAdsReport({ range: RANGE, ledger: LEDGER, insights: INSIGHTS });
        expect(report.spend).toEqual({ mnt: 52500, complete: false, pending: { USD: 20 }, native: { USD: 35 } });
        expect(formatMetaSpend(report.spend)).toBe('52,500₮ + 20 USD (ханшгүй)');
        expect(report.notes[0]).toContain('Ханшгүй зардал 20 USD');
        const [calls, messages] = report.campaigns;
        expect(calls).toMatchObject({ campaignId: '101', days: 2, spend: { mnt: 52500, complete: true } });
        expect(messages).toMatchObject({ campaignId: '202', spend: { mnt: 0, complete: false, pending: { USD: 20 } } });
        expect(formatMetaSpend(messages.spend)).toBe('20 USD (ханшгүй)');
    });

    it('counts results per type without mixing them, with MNT or native cost per result', () => {
        const report = buildMetaAdsReport({ range: RANGE, ledger: LEDGER, insights: INSIGHTS });
        expect(report.results.map(r => [r.type, r.results, r.cost])).toEqual([
            ['calls', 5, { value: 10500, currency: 'MNT' }],
            // Ханшгүй тул эх валютаар: 20 USD / 6.
            ['messages', 6, { value: 3.33, currency: 'USD' }],
        ]);
        expect(formatMetaResult(report.results[0])).toBe('Дуудлага (Meta): 5 · 10,500₮');
        expect(report.delivery).toMatchObject({ impressions: 3500, linkClicks: 80, clicks: 130, ctr: 2.29, spend: { mnt: 52500, pending: { USD: 20 } } });
        // Нийт зардал ханш дутуу боловч ганц валют (USD) тул CPC = 35 USD / 80 (1-ээс бага өртөг 4 оронтой).
        expect(report.delivery!.cpc).toEqual({ value: 0.4375, currency: 'USD' });
        expect(report.campaigns[0].results).toEqual([expect.objectContaining({ type: 'calls', results: 5, cost: { value: 10500, currency: 'MNT' } })]);
        expect(report.campaigns[0].delivery).toMatchObject({ impressions: 1500, linkClicks: 50, cpc: { value: 1050, currency: 'MNT' } });
    });

    it('never sums daily reach and explains it', () => {
        const report = buildMetaAdsReport({ range: RANGE, ledger: [ledger({ campaign_id: '303' })], insights: [
            insight({ campaign_id: '303', adset_id: '930', result_type: 'reach', results: '800', result_source: 'goal' }),
            insight({ campaign_id: '303', adset_id: '930', day: '2026-09-02', result_type: 'reach', results: '700', result_source: 'goal' }),
        ] });
        expect(report.results).toEqual([expect.objectContaining({ type: 'reach', results: null, cost: null })]);
        expect(report.notes.some(n => n.includes('reach'))).toBe(true);
    });

    it('converts ad set spend with the same account/day rate when the campaign row has none and keeps MNT accounts at 1', () => {
        const report = buildMetaAdsReport({ range: RANGE, ledger: [ledger({})], insights: [
            insight({ campaign_id: '404', adset_id: '940', spend: '2', results: '1' }),
        ] });
        expect(report.results[0]).toMatchObject({ type: 'calls', results: 1, spend: { mnt: 7000, complete: true } });
        const mnt = buildMetaAdsReport({ range: RANGE, ledger: [], insights: [insight({ currency: 'MNT', spend: '5000' })] });
        expect(mnt.results[0].cost).toEqual({ value: 1250, currency: 'MNT' });
    });

    it('reports missing detailed data instead of zeros', () => {
        const noTable = buildMetaAdsReport({ range: RANGE, ledger: LEDGER, insights: null });
        expect(noTable).toMatchObject({ delivery: null, results: [], coverage: { insightsReady: false, spendDays: 2 } });
        expect(noTable.notes.some(n => n.includes('идэвхжээгүй'))).toBe(true);
        const partial = buildMetaAdsReport({ range: RANGE, ledger: LEDGER, insights: INSIGHTS.slice(0, 1) });
        expect(partial.coverage).toMatchObject({ spendDays: 2, insightDays: 1, spendDaysWithoutInsights: 1 });
        expect(partial.notes.some(n => n.includes('2 өдрийн 1-д'))).toBe(true);
        const empty = buildMetaAdsReport({ range: RANGE, ledger: [], insights: [] });
        expect(formatMetaSpend(empty.spend)).toBe('—');
        expect(formatMetaMoney(empty.delivery?.cpc)).toBe('—');
    });

    it('notes a Meta account timezone that differs from Ulaanbaatar', () => {
        const report = buildMetaAdsReport({ range: RANGE, ledger: [ledger({ timezone: 'America/Los_Angeles' })], insights: [] });
        expect(report.notes.some(n => n.includes('America/Los_Angeles'))).toBe(true);
    });
});
