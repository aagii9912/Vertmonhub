import { hasRealContractFields } from '@/lib/leads/contracts';

export interface RoiLead { id: string; source: string | null; status: string | null; facebook_campaign_id: string | null; }
export interface RoiCampaign { external_id: string | null; name: string; status: string | null; spend: number | string | null; }
export interface RoiContract {
    lead_id: string | null; total_price: number | string | null;
    contract_number: string | null; contract_status: string | null;
}

/** Бүх хугацааны гэрээний дүн. Зарцуулалтын хугацаа DB-д хадгалагдаагүй тул харьцаа бодохгүй. */
export function buildMarketingRoi(leads: RoiLead[], campaigns: RoiCampaign[], contracts: RoiContract[]) {
    const revenueByLead = new Map<string, number>();
    for (const c of contracts) {
        if (c.lead_id && hasRealContractFields(c)) {
            revenueByLead.set(c.lead_id, (revenueByLead.get(c.lead_id) || 0) + Number(c.total_price));
        }
    }
    const metrics = (rows: RoiLead[], spend: number) => ({
        spend, leads: rows.length,
        won: rows.filter(l => revenueByLead.has(l.id)).length,
        revenue: rows.reduce((sum, l) => sum + (revenueByLead.get(l.id) || 0), 0),
        cpl: null, cpa: null, roas: null,
    });
    const campaignRoi = campaigns.filter(c => c.external_id).map(c => ({
        external_id: c.external_id!, name: c.name, status: c.status,
        ...metrics(leads.filter(l => l.facebook_campaign_id === c.external_id), Number(c.spend) || 0),
        profit: null,
    })).sort((a, b) => b.spend - a.spend);
    const spend = campaigns.reduce((sum, c) => sum + (Number(c.spend) || 0), 0);
    const bySource = new Map<string, RoiLead[]>();
    for (const lead of leads) {
        // Facebook-ийн organic/ads эх үүсвэрүүд нэг зардлын мөртэй байна.
        const source = lead.source === 'facebook_ads' ? 'facebook' : lead.source || 'other';
        const rows = bySource.get(source) || [];
        rows.push(lead);
        bySource.set(source, rows);
    }
    if (spend > 0 && !bySource.has('facebook')) bySource.set('facebook', []);
    return {
        campaigns: campaignRoi,
        sources: [...bySource].map(([source, rows]) => ({ source, ...metrics(rows, source === 'facebook' ? spend : 0) }))
            .sort((a, b) => b.leads - a.leads),
        totals: { ...metrics(leads, spend), profit: null },
        basis: {
            revenue: 'linked_valid_contract_total', leadPeriod: 'all_time', spendPeriod: 'unknown_snapshot',
            comparable: false,
            note: 'Гэрээний дүн нь бүх хугацааны, лидтэй холбосон хүчинтэй гэрээнүүдийн нийлбэр. Meta Ads зардлын хугацаа хадгалагдаагүй тул CPL, CPA, ROAS болон ашгийг тооцоогүй. Гэрээний дүн нь орж ирсэн мөнгө биш.',
        },
    };
}
