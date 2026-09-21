import { z } from 'zod';
import { ubDateStr } from '@/lib/utils/date';
import { hasRealContractFields } from '@/lib/leads/contracts';

export const MARKETING_CHANNELS = {
    meta_ads: 'Meta Ads', google_ads: 'Google Ads', organic: 'Website / Organic',
    event: 'Event / Open Day', content: 'Content / Video / PR', other: 'Бусад',
} as const;
export type MarketingChannel = keyof typeof MARKETING_CHANNELS;
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Огноо буруу байна');
export const PerformanceFilterSchema = z.object({
    from: dateSchema, to: dateSchema, project: z.string().uuid().optional(),
}).refine(v => v.to >= v.from && dayNumber(v.to) - dayNumber(v.from) <= 366, '367 хүртэл өдрийн зөв хугацаа сонгоно уу');
export type PerformanceFilter = z.infer<typeof PerformanceFilterSchema>;
const dayNumber = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86400000;
const shift = (s: string, days: number) => new Date((dayNumber(s) + days) * 86400000).toISOString().slice(0, 10);
export function previousRange(range: { from: string; to: string }) {
    // Full calendar months compare to the previous calendar month, not 31 arbitrary days.
    if (range.from.slice(0, 7) === range.to.slice(0, 7) && range.from.endsWith('-01') && shift(range.to, 1).endsWith('-01')) {
        const to = shift(range.from, -1);
        return { from: `${to.slice(0, 7)}-01`, to };
    }
    return { from: shift(range.from, -(dayNumber(range.to) - dayNumber(range.from) + 1)), to: shift(range.from, -1) };
}
export function marketingChannel(source: string | null): MarketingChannel {
    if (source && source in MARKETING_CHANNELS) return source as MarketingChannel;
    if (['facebook_ads', 'instagram_ads'].includes(source || '')) return 'meta_ads';
    if (['website', 'organic', 'facebook', 'instagram'].includes(source || '')) return 'organic';
    return 'other';
}
export interface MarketingActivity {
    id: string; name: string; project_id: string | null; marketing_owner_name: string | null;
    channel: string | null; activity_kind: 'campaign' | 'content'; status: string;
    external_campaign_id?: string | null;
    start_date: string | null; completed_on: string | null;
}
export interface MarketingLead {
    id: string; created_at: string; project_id: string | null; source: string | null;
    marketing_campaign_id: string | null; marketing_owner_name: string | null;
    marketing_channel: string | null; sales_handoff_at: string | null; sales_manager_name: string | null;
}
export interface MarketingContract {
    lead_id: string | null; contract_date: string | null; contract_number: string | null;
    total_price: number | string | null; contract_status: string | null;
}
export interface MarketingSpend {
    id: string; spent_at: string; amount: number | string; channel: string;
    source?: 'manual' | 'meta'; exclusion?: 'manual_overlap' | 'missing_fx' | null; native_amount?: number; currency?: string;
    project_id: string | null; marketing_owner_name: string | null; marketing_campaign_id: string | null; note: string | null;
}
export const SPEND_BASIS = 'Зардал = гар бүртгэл + Meta өдрийн зардал. Meta нь зарын дансны цагийн бүсээр; төгрөгт хөрвүүлсэн дүнгээр тооцно. Автомат синк хийсэн өдрийн гар Meta Ads бүртгэлийг давхардлаас сэргийлж нийтээс хасна. Ханшгүй зардал нийтэд орохгүй. Meta snapshot нэмэхгүй.';
export function spendQuality(rows: MarketingSpend[]) {
    const pending: Record<string, number> = {};
    for (const r of rows.filter(s => s.exclusion === 'missing_fx')) pending[r.currency!] = (pending[r.currency!] ?? 0) + (r.native_amount ?? 0);
    return { missingFx: rows.filter(s => s.exclusion === 'missing_fx').length, pendingCurrencies: pending,
        excludedManual: rows.filter(s => s.exclusion === 'manual_overlap').length,
        unmappedMeta: rows.filter(s => s.source === 'meta' && !s.marketing_campaign_id).length };
}

export interface MarketingTarget {
    id: string; month: string; project_id: string; marketing_owner_name: string;
    lead_target: number; deal_target: number; budget: number | string;
}
export interface PerformanceData {
    projects: { id: string; name: string }[]; activities: MarketingActivity[]; leads: MarketingLead[];
    contracts: MarketingContract[]; spend: MarketingSpend[]; targets: MarketingTarget[];
}
const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : null;
export const performanceChange = (current: number, previous: number) => previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ubDateStr(new Date(value));

export function buildMarketingPerformance(data: PerformanceData, filter: PerformanceFilter) {
    const previous = previousRange(filter);
    function period(range: { from: string; to: string }) {
        const within = (v: string | null) => !!v && date(v) >= range.from && date(v) <= range.to;
        const inProject = (r: { project_id: string | null }) => !filter.project || r.project_id === filter.project;
        const leads = data.leads.filter(l => inProject(l) && within(l.created_at));
        const activities = data.activities.filter(inProject);
        const completed = activities.filter(a => a.status === 'completed' && within(a.completed_on));
        const planned = activities.filter(a => a.status !== 'cancelled' && within(a.start_date));
        const spend = data.spend.filter(s => !s.exclusion).filter(s => inProject(s) && within(s.spent_at));
        const won = new Set(data.contracts.filter(c => c.lead_id && c.contract_date && date(c.contract_date) <= range.to && hasRealContractFields(c)).map(c => c.lead_id));
        const sales = (l: MarketingLead) => !!l.sales_handoff_at && date(l.sales_handoff_at) <= range.to;
        const metrics = (rows: MarketingLead[]) => ({
            leads: rows.length, sales: rows.filter(sales).length, deals: rows.filter(l => won.has(l.id)).length,
            salesPct: pct(rows.filter(sales).length, rows.length), dealPct: pct(rows.filter(l => won.has(l.id)).length, rows.length),
        });
        const groups = (projectId: string | null, owner?: string) => {
            const match = (r: { project_id: string | null; marketing_owner_name: string | null }) => r.project_id === projectId && (owner === undefined || (r.marketing_owner_name || '') === owner);
            const plans = planned.filter(match);
            return { ...metrics(leads.filter(match)), activities: completed.filter(match).length,
                content: completed.filter(a => match(a) && a.activity_kind === 'content').length,
                planPct: pct(plans.filter(a => a.status === 'completed' && !!a.completed_on && a.completed_on <= range.to).length, plans.length),
                spend: spend.filter(match).reduce((s, r) => s + Number(r.amount), 0),
            };
        };
        return { leads, activities, completed, planned, spend, metrics, groups,
            totals: { ...metrics(leads), activities: completed.length, spend: spend.reduce((s, r) => s + Number(r.amount), 0) } };
    }
    const current = period(filter);
    const prev = period(previous);
    const month = filter.from.slice(0, 7);
    const fullMonth = filter.from === `${month}-01` && shift(filter.to, 1).endsWith('-01') && filter.to.startsWith(month);
    const targets = data.targets.filter(t => t.month === `${month}-01` && (!filter.project || t.project_id === filter.project));
    const projectName = (id: string | null) => data.projects.find(p => p.id === id)?.name || 'Төсөл холбоогүй';
    const projectIds = new Set<string | null>([
        ...data.projects.filter(p => !filter.project || p.id === filter.project).map(p => p.id),
        ...current.leads.map(l => l.project_id), ...current.activities.map(a => a.project_id), ...current.spend.map(s => s.project_id),
    ]);
    const pairs = new Map<string, { project_id: string | null; marketing_owner_name: string }>();
    for (const row of [...targets, ...current.leads, ...current.planned, ...current.completed, ...current.spend,
        ...prev.leads, ...prev.planned, ...prev.completed, ...prev.spend]) {
        const owner = row.marketing_owner_name || '';
        pairs.set(JSON.stringify([row.project_id, owner]), { project_id: row.project_id, marketing_owner_name: owner });
    }
    const team = [...pairs].map(([id, pair]) => {
        const actual = current.groups(pair.project_id, pair.marketing_owner_name);
        const target = fullMonth ? targets.find(t => t.project_id === pair.project_id && t.marketing_owner_name === pair.marketing_owner_name) : undefined;
        const budget = target ? Number(target.budget) : null;
        const previousLeads = prev.leads.filter(l => l.project_id === pair.project_id && (l.marketing_owner_name || '') === pair.marketing_owner_name).length;
        const prior = prev.groups(pair.project_id, pair.marketing_owner_name);
        return { id, ...pair, name: pair.marketing_owner_name || 'Хариуцагч холбоогүй', projectName: projectName(pair.project_id), ...actual,
            target: target || null, leadAttainment: target ? pct(actual.leads, target.lead_target) : null,
            dealAttainment: target ? pct(actual.deals, target.deal_target) : null, budget,
            variance: budget === null ? null : actual.spend - budget,
            variancePct: budget === null ? null : pct(actual.spend - budget, budget), previousLeads,
            leadChange: performanceChange(actual.leads, previousLeads),
            previousDeals: prior.deals, dealChange: performanceChange(actual.deals, prior.deals),
            previousSpend: prior.spend, spendChange: performanceChange(actual.spend, prior.spend),
        };
    });
    const targetsComplete = team.length > 0 && team.every(t => t.target !== null);
    const leadTarget = targetsComplete ? team.reduce((s, t) => s + t.target!.lead_target, 0) : null;
    const dealTarget = targetsComplete ? team.reduce((s, t) => s + t.target!.deal_target, 0) : null;
    const budget = targetsComplete ? team.reduce((s, t) => s + t.budget!, 0) : null;
    return {
        range: filter, previousRange: previous, fullMonth, totals: current.totals, previous: prev.totals,
        projects: [...projectIds].map(id => ({ id, name: projectName(id), ...current.groups(id),
            channels: Object.keys(MARKETING_CHANNELS).map(channel => ({ channel, count: current.leads.filter(l => l.project_id === id && marketingChannel(l.marketing_channel || l.source) === channel).length })),
        })),
        channels: Object.entries(MARKETING_CHANNELS).map(([id, name]) => ({ id, name, ...current.metrics(current.leads.filter(l => marketingChannel(l.marketing_channel || l.source) === id)) })),
        recent: current.completed.sort((a, b) => (b.completed_on || '').localeCompare(a.completed_on || '')).map(a => ({ ...a, projectName: projectName(a.project_id), ...current.metrics(current.leads.filter(l => l.marketing_campaign_id === a.id)) })),
        team,
        teamTotal: { leads: current.totals.leads, deals: current.totals.deals, leadTarget, dealTarget,
            leadAttainment: leadTarget === null ? null : pct(current.totals.leads, leadTarget),
            dealAttainment: dealTarget === null ? null : pct(current.totals.deals, dealTarget),
            budget, spend: current.totals.spend, variance: budget === null ? null : current.totals.spend - budget,
            variancePct: budget === null ? null : pct(current.totals.spend - budget, budget),
            planPct: pct(current.planned.filter(a => a.status === 'completed' && !!a.completed_on && a.completed_on <= filter.to).length, current.planned.length),
            previousLeads: prev.totals.leads, leadChange: performanceChange(current.totals.leads, prev.totals.leads), targetsComplete },
        spendQuality: { current: spendQuality(data.spend.filter(s => s.spent_at >= filter.from && s.spent_at <= filter.to && (!filter.project || s.project_id === filter.project))),
            previous: spendQuality(data.spend.filter(s => s.spent_at >= previous.from && s.spent_at <= previous.to && (!filter.project || s.project_id === filter.project))) },
        quality: {
            noProject: current.leads.filter(l => !l.project_id).length,
            noCampaign: current.leads.filter(l => !l.marketing_campaign_id).length,
            noOwner: current.leads.filter(l => !l.marketing_owner_name).length,
            unknownHandoff: current.leads.filter(l => l.sales_manager_name && !l.sales_handoff_at).length,
            undatedCompletedActivities: current.activities.filter(a => a.status === 'completed' && !a.completed_on).length,
            unlinkedContracts: data.contracts.filter(c => !c.lead_id && c.contract_date && date(c.contract_date) >= filter.from && date(c.contract_date) <= filter.to && hasRealContractFields(c)).length,
        },
        basis: 'Лид үүссэн хугацаагаар бүлэглэнэ. Sales = хугацааны эцэс хүртэл менежерт хуваарилсан огноотой лид; Deal = тэр бүлгийн хүчинтэй гэрээтэй давхардалгүй лид. Гэрээ хугацааны эцсээс хойш бол орохгүй. Акц/контент = дууссан огноогоор. Төлөвлөгөөний хувь = хугацаанд эхлэх ажлаас эцэс хүртэл дууссан хувь. ' + SPEND_BASIS + ' Хуучин шилжүүлсэн огноо тодорхойгүй лидийг Sales-д таамгаар оруулахгүй.',
    };
}
export type MarketingPerformance = ReturnType<typeof buildMarketingPerformance>;
