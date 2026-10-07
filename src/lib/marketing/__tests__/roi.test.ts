// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMarketingRoi, type RoiContract, type RoiLead } from '../roi';
import { buildMetaAdsReport, type MetaLedgerRow } from '../meta-ads-report';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const spendRow = (patch: Partial<MetaLedgerRow>): MetaLedgerRow => ({
    account_id: 'act_1', campaign_id: '101', campaign_name: 'Mandala дуудлага', spent_at: '2026-09-01', native_amount: '100',
    currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: '350000', mnt_per_unit: '3500', ...patch,
});
const lead = (id: string, patch: Partial<RoiLead> = {}): RoiLead => ({
    id, created_at: '2026-09-10T03:00:00Z', source: 'facebook_ads', marketing_channel: null,
    facebook_campaign_id: '101', marketing_campaign_id: null, ...patch,
});
const contract = (leadId: string, total: number): RoiContract => ({ lead_id: leadId, total_price: total, contract_number: `C-${leadId}`, contract_status: 'active' });

describe('buildMarketingRoi', () => {
    const originalTz = process.env.TZ;
    // Vercel шиг UTC сервер: лидийн хугацааг Улаанбаатарын өдрөөр.
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    it('assigns leads by Ulaanbaatar day and computes CPL/CPA/ROAS only from fully converted spend', () => {
        const meta = buildMetaAdsReport({ range: RANGE, ledger: [spendRow({}), spendRow({ spent_at: '2026-09-02' })], insights: null });
        const leads = [
            lead('a', { created_at: '2026-08-31T16:30:00Z' }), // УБ 09-01 00:30 → орно
            lead('b'),
            lead('late', { created_at: '2026-09-30T16:30:00Z' }), // УБ 10-01 → орохгүй
        ];
        const roi = buildMarketingRoi({ range: RANGE, leads, activities: [], contracts: [contract('a', 300_000_000), contract('late', 1)], meta });
        expect(roi.campaigns).toHaveLength(1);
        expect(roi.campaigns[0]).toMatchObject({ campaignId: '101', name: 'Mandala дуудлага', leads: 2, won: 1, revenue: 300_000_000, cpl: 350000, cpa: 700000, roas: 428.57 });
        expect(roi.totals).toMatchObject({ spend: { mnt: 700000, complete: true }, leads: 2, won: 1, cpl: 350000, roas: 428.57 });
        expect(roi.basis.note).toContain('гэрээний дүн нь орж ирсэн мөнгө биш');
    });

    it('does not divide when FX is missing or there is no spend record', () => {
        const meta = buildMetaAdsReport({ range: RANGE, ledger: [spendRow({ amount_mnt: null, mnt_per_unit: null })], insights: null });
        const roi = buildMarketingRoi({ range: RANGE, leads: [lead('a'), lead('n', { facebook_campaign_id: '555' })], activities: [], contracts: [contract('a', 10)], meta });
        expect(roi.totals).toMatchObject({ spend: { complete: false, pending: { USD: 100 } }, cpl: null, cpa: null, roas: null });
        const orphan = roi.campaigns.find(c => c.campaignId === '555')!;
        expect(orphan).toMatchObject({ name: 'Кампанит ажил 555', spend: null, leads: 1, cpl: null });
        expect(roi.quality.leadsWithoutSpend).toBe(1);
    });

    it('links leads through the activity Meta campaign ID and flags Meta leads without a campaign', () => {
        const meta = buildMetaAdsReport({ range: RANGE, ledger: [spendRow({ campaign_id: '777', campaign_name: 'Elysium мессеж' })], insights: null });
        const roi = buildMarketingRoi({
            range: RANGE, meta, contracts: [],
            activities: [{ id: 'act-uuid', name: 'Elysium акц', external_campaign_id: ' 777 ' }],
            leads: [
                lead('via-activity', { facebook_campaign_id: null, marketing_campaign_id: 'act-uuid' }),
                lead('meta-no-campaign', { facebook_campaign_id: null }),
                lead('organic', { facebook_campaign_id: null, source: 'website' }),
            ],
        });
        expect(roi.campaigns.map(c => [c.campaignId, c.leads])).toEqual([['777', 1]]);
        expect(roi.quality.unattributedMetaLeads).toBe(1);
    });
});
