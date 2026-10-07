import { hasRealContractFields } from '@/lib/leads/contracts';
import { ubDateStr } from '@/lib/utils/date';
import { hasMetaSpend, type MetaAdsReport, type MetaResultSummary, type MetaSpend } from './meta-ads-report';
import { marketingChannel } from './performance';

export interface RoiLead {
    id: string; created_at: string; source: string | null; marketing_channel?: string | null;
    facebook_campaign_id: string | null; marketing_campaign_id: string | null;
}
/** Акц / контент (`marketing_campaigns`): Meta campaign ID-аар лидийг кампанит ажилд холбоно. */
export interface RoiActivity { id: string; name: string; external_campaign_id: string | null }
export interface RoiContract {
    lead_id: string | null; total_price: number | string | null;
    contract_number: string | null; contract_status: string | null;
}
export interface RoiMetrics {
    leads: number; won: number; revenue: number;
    /** Төгрөгөөр; зардал бүртгэлгүй, ханш дутуу эсвэл хуваах тоо 0 бол null. */
    cpl: number | null; cpa: number | null;
    /** Гэрээний дүн ÷ зардал (орж ирсэн мөнгө биш). */
    roas: number | null;
}
export interface CampaignRoi extends RoiMetrics {
    campaignId: string; name: string;
    /** null = энэ хугацаанд Meta зардлын бүртгэлгүй (зөвхөн лидээр гарсан кампанит ажил). */
    spend: MetaSpend | null;
    results: MetaResultSummary[];
}
export interface MarketingRoi {
    range: { from: string; to: string };
    campaigns: CampaignRoi[];
    totals: RoiMetrics & { spend: MetaSpend };
    quality: {
        /** Meta зарын эх үүсвэртэй боловч кампанит ажилгүй лид (CPL-д ороогүй). */
        unattributedMetaLeads: number;
        /** Энэ хугацаанд зардлын бүртгэлгүй кампанит ажилд холбогдсон лид. */
        leadsWithoutSpend: number;
    };
    meta: MetaAdsReport;
    basis: { revenue: 'cohort_valid_contract_total'; leadPeriod: 'created_at_ub'; spendPeriod: 'meta_account_day'; note: string };
}

export const ROI_BASIS_NOTE = 'Лид = сонгосон хугацаанд үүссэн (Улаанбаатарын цагаар) бөгөөд Meta кампанит ажилд лидийн Facebook campaign ID эсвэл акцын Meta campaign ID-аар холбогдсон CRM лид. Гэрээ = тэдгээр лидийн өнөөдрийг хүртэлх хүчинтэй гэрээ; гэрээний дүн нь орж ирсэн мөнгө биш. Зардал = тухайн хугацааны Meta өдрийн зардал (зарын дансны өдрөөр). CPL, CPA (гэрээтэй лидийн зардал), ROAS (гэрээний дүн ÷ зардал) нь төгрөгөөр; зардлын бүртгэлгүй, ханш дутуу эсвэл хуваах тоо 0 бол тооцохгүй. Meta-гийн үр дүн (дуудлага, мессеж, лид маягт…) нь CRM лидтэй адил биш — тусад нь харуулна.';

const META_ID = /^\d{1,40}$/;
const metaId = (value: string | null | undefined) => { const id = String(value ?? '').trim(); return META_ID.test(id) ? id : null; };

function metrics(leads: readonly RoiLead[], revenueByLead: Map<string, number>, spend: MetaSpend | null): RoiMetrics {
    const won = leads.filter(l => revenueByLead.has(l.id)).length;
    const revenue = leads.reduce((total, l) => total + (revenueByLead.get(l.id) ?? 0), 0);
    // Зардал бүрэн төгрөгөөр байхад л харьцаа; ханшгүй эх валютыг төгрөгтэй хольж хуваахгүй.
    const mnt = hasMetaSpend(spend) && spend.complete ? spend.mnt : null;
    return {
        leads: leads.length, won, revenue,
        cpl: mnt !== null && leads.length > 0 ? Math.round(mnt / leads.length) : null,
        cpa: mnt !== null && won > 0 ? Math.round(mnt / won) : null,
        roas: mnt !== null && mnt > 0 ? Math.round(revenue / mnt * 100) / 100 : null,
    };
}

/**
 * Meta кампанит ажлын ROI: огноотой зардал (`meta_daily_spend`) + үр дүн төрлөөр (`meta_ad_insights_daily`)
 * + тухайн хугацаанд үүссэн CRM лид, тэдгээрийн хүчинтэй гэрээ.
 */
export function buildMarketingRoi(input: {
    range: { from: string; to: string };
    leads: readonly RoiLead[];
    activities: readonly RoiActivity[];
    contracts: readonly RoiContract[];
    meta: MetaAdsReport;
}): MarketingRoi {
    const { range, meta } = input;
    const cohort = input.leads.filter(l => {
        const day = ubDateStr(new Date(l.created_at));
        return day >= range.from && day <= range.to;
    });
    const activities = new Map(input.activities.map(a => [a.id, a]));
    const campaignOf = (lead: RoiLead) => metaId(lead.facebook_campaign_id)
        ?? (lead.marketing_campaign_id ? metaId(activities.get(lead.marketing_campaign_id)?.external_campaign_id) : null);
    const revenueByLead = new Map<string, number>();
    for (const c of input.contracts) {
        if (c.lead_id && hasRealContractFields(c)) revenueByLead.set(c.lead_id, (revenueByLead.get(c.lead_id) ?? 0) + Number(c.total_price));
    }

    const leadsByCampaign = new Map<string, RoiLead[]>();
    for (const lead of cohort) {
        const id = campaignOf(lead);
        if (id) leadsByCampaign.set(id, [...(leadsByCampaign.get(id) ?? []), lead]);
    }
    const metaCampaigns = new Map(meta.campaigns.map(c => [c.campaignId, c]));
    const activityNames = new Map(input.activities.flatMap(a => { const id = metaId(a.external_campaign_id); return id ? [[id, a.name] as const] : []; }));
    const ids = new Set([...metaCampaigns.keys(), ...leadsByCampaign.keys()]);
    const campaigns: CampaignRoi[] = [...ids].map(id => {
        const report = metaCampaigns.get(id);
        const spend = hasMetaSpend(report?.spend) ? report!.spend : null;
        return {
            campaignId: id, name: report?.name || activityNames.get(id) || `Кампанит ажил ${id}`,
            spend, results: report?.results ?? [],
            ...metrics(leadsByCampaign.get(id) ?? [], revenueByLead, spend),
        };
    }).sort((a, b) => (b.spend?.mnt ?? 0) - (a.spend?.mnt ?? 0) || b.leads - a.leads || a.name.localeCompare(b.name));

    const attributed = [...leadsByCampaign.values()].flat();
    return {
        range, campaigns,
        totals: { spend: meta.spend, ...metrics(attributed, revenueByLead, meta.spend) },
        quality: {
            unattributedMetaLeads: cohort.filter(l => !campaignOf(l) && marketingChannel(l.marketing_channel || l.source) === 'meta_ads').length,
            leadsWithoutSpend: campaigns.filter(c => !c.spend).reduce((total, c) => total + c.leads, 0),
        },
        meta,
        basis: { revenue: 'cohort_valid_contract_total', leadPeriod: 'created_at_ub', spendPeriod: 'meta_account_day', note: ROI_BASIS_NOTE },
    };
}
