/**
 * Самбарын огноотой Meta зарын тайлан (ROI, «Сурталчилгаа», AI-ийн маркетингийн нэгтгэл):
 *
 *  - Зардал = `meta_daily_spend` (кампанит ажил × дансны өдөр, API / файл). Төгрөг = мөр бүрт хадгалсан
 *    тооцооны ханшаар (`amount_mnt`); ханшгүй дүнг эх валютаар тусад нь, төгрөгийн нийтэд нэмэхгүй.
 *  - Харагдалт, товшилт, үр дүн = `meta_ad_insights_daily` (ad set × өдөр). Үр дүнг төрөл бүрээр
 *    (дуудлага, мессеж, лид…), кампанит ажлын зорилгоор хуваарилсан зардал, нэг үр дүнгийн өртөгтэй.
 *    Өөр төрлийг нэг тоонд нэмэхгүй; reach-ийг өдөр, кампанит ажлаар хэзээ ч нэмэхгүй.
 *  - Ad set-ийн зардлыг тухайн кампанит ажил / өдрийн ханшаар төгрөгт хөрвүүлнэ; ханшгүй бол эх валютаар.
 *  - Хуучин `ad_campaigns.spend` (30 хоногийн snapshot) ашиглахгүй.
 *
 * Цэвэр модуль: хуудас ч энэ төрөл, форматын функцуудыг ашиглана.
 */
import { z } from 'zod';
import { formatMNT } from '@/lib/utils/currency';
import { formatChannelValue } from './channel-reports';
import { dateSchema } from './performance';
import { META_RESULT_DEFS, META_RESULT_TYPES, metaResultCost, type MetaResultType } from './meta-results';
import {
    groupMetaResultRows, hasMetaDelivery, metaNumber, toMetaResultRows, type MetaInsightRow, type MetaResultGroup,
} from './meta-result-groups';

export const META_REPORT_TIMEZONE = 'Asia/Ulaanbaatar';

const dayNumber = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
/** Огноотой Meta тайлангийн хугацаа: YYYY-MM-DD, 367 хүртэл өдөр (маркетингийн самбартай адил). */
export const MetaAdsRangeSchema = z.object({ from: dateSchema, to: dateSchema })
    .refine(v => v.to >= v.from && dayNumber(v.to) - dayNumber(v.from) <= 366, '367 хүртэл өдрийн зөв хугацаа сонгоно уу');
export type MetaAdsRange = z.infer<typeof MetaAdsRangeSchema>;

/** `meta_daily_spend`-ийн мөр (`spent_at` = зарын дансны цагийн бүсийн өдөр). */
export interface MetaLedgerRow {
    account_id: string; campaign_id: string; campaign_name: string; spent_at: string;
    native_amount: number | string; currency: string; timezone: string;
    amount_mnt: number | string | null; mnt_per_unit: number | string | null;
}
/** `meta_ad_insights_daily`-ийн мөр + данс, валют. */
export interface MetaInsightDayRow extends MetaInsightRow { account_id: string; currency: string }

/** Зардал: ханштай мөрүүдийн төгрөг + ханшгүй эх валют. */
export interface MetaSpend {
    /** Ханштай мөрүүдийн төгрөгийн нийлбэр. */
    mnt: number;
    /** Зардалтай бүх мөр ханштай. */
    complete: boolean;
    /** Ханшгүй (төгрөгт ороогүй) эх валютын дүн: валют → дүн. */
    pending: Record<string, number>;
    /** Бүх мөрийн эх валютын дүн: валют → дүн. Хоосон = зардлын бүртгэлгүй. */
    native: Record<string, number>;
}
/** Мөнгөн дүн: 'MNT' эсвэл ганц эх валют (USD…). */
export interface MetaMoney { value: number; currency: string }
export interface MetaResultSummary {
    type: MetaResultType; label: string; costLabel: string;
    /** null = тооцоогүй (reach давхардалгүй тул нэмэхгүй, эсвэл тоо Meta-гаас ирээгүй). */
    results: number | null;
    /** Тухайн төрөлд кампанит ажлын зорилгоор ногдсон зардал (ad set × өдрийн өгөгдлөөс). */
    spend: MetaSpend;
    cost: MetaMoney | null;
}
export interface MetaDelivery {
    /** Ad set × өдрийн өгөгдлийн зардал (CPC, CPM-ийн суурь). */
    spend: MetaSpend;
    impressions: number; linkClicks: number; clicks: number;
    /** Link click / impressions, %. */
    ctr: number | null;
    cpc: MetaMoney | null;
    cpm: MetaMoney | null;
}
export interface MetaCampaignReport {
    campaignId: string; accountId: string; name: string; currency: string | null;
    spend: MetaSpend;
    /** Зардлын бүртгэлтэй өдрийн тоо. */
    days: number;
    delivery: MetaDelivery | null;
    results: MetaResultSummary[];
}
export interface MetaAdsCoverage {
    spendDays: number; insightDays: number;
    /** Зардалтай боловч ad set-ийн дэлгэрэнгүй өгөгдөлгүй өдөр. */
    spendDaysWithoutInsights: number;
    /** false = дэлгэрэнгүй үр дүнгийн хүснэгт суулгаагүй. */
    insightsReady: boolean;
    lastSpendDay: string | null; lastInsightDay: string | null;
    timezones: string[];
}
export interface MetaAdsReport {
    range: { from: string; to: string };
    spend: MetaSpend;
    delivery: MetaDelivery | null;
    results: MetaResultSummary[];
    campaigns: MetaCampaignReport[];
    coverage: MetaAdsCoverage;
    notes: string[];
    basis: string;
}

export const META_ADS_BASIS = 'Зардал = Meta-гийн өдрийн зардал (API эсвэл файл) зарын дансны цагийн бүсийн өдрөөр. Төгрөг = өдөр бүрт хадгалсан тооцооны ханшаар; ханшгүй дүнг эх валютаар тусад нь харуулж төгрөгийн нийтэд нэмэхгүй (банкны бодит ханш биш). Харагдалт, товшилт, үр дүн = ad set × өдрийн дэлгэрэнгүй өгөгдөл; үр дүнг төрөл бүрээр (дуудлага, мессеж, лид…) тоолж, өөр төрлийг нэг тоонд нэмэхгүй, кампанит ажлын зардлыг зорилгоор нь төрөлд хуваарилна. Reach-ийг өдөр, кампанит ажлаар нэмэхгүй. Хуучин 30 хоногийн snapshot ашиглахгүй.';

const round = (value: number, digits = 6) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const sum = <T>(list: readonly T[], pick: (item: T) => number) => list.reduce((total, item) => total + pick(item), 0);

export const emptyMetaSpend = (): MetaSpend => ({ mnt: 0, complete: true, pending: {}, native: {} });
export const hasMetaSpend = (spend: MetaSpend | null | undefined): spend is MetaSpend => !!spend && Object.keys(spend.native).length > 0;

function addSpend(target: MetaSpend, native: number, currency: string, mnt: number | null) {
    target.native[currency] = (target.native[currency] ?? 0) + native;
    if (mnt !== null) target.mnt += mnt;
    else if (native > 0) {
        target.pending[currency] = (target.pending[currency] ?? 0) + native;
        target.complete = false;
    }
}
function finalizeSpend(spend: MetaSpend): MetaSpend {
    const fix = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k, round(v)]));
    return { mnt: Math.round(spend.mnt), complete: spend.complete, pending: fix(spend.pending), native: fix(spend.native) };
}
const onlyCurrency = (spend: MetaSpend) => { const keys = Object.keys(spend.native); return keys.length === 1 ? keys[0] : null; };

/** Зардал ÷ тоо × хуваагч: бүх зардал ханштай бол төгрөгөөр, эс бөгөөс ганц эх валютаар; бусад үед null. */
function spendRatio(spend: MetaSpend, divisor: number, type: MetaResultType | null, scale = 1): MetaMoney | null {
    if (!(divisor > 0) || !hasMetaSpend(spend)) return null;
    const cost = (amount: number) => type ? metaResultCost(type, amount, divisor) : Number((amount / divisor * scale).toFixed(amount / divisor * scale < 1 ? 4 : 2));
    if (spend.complete) {
        const value = cost(spend.mnt);
        return value === null ? null : { value, currency: 'MNT' };
    }
    const currency = onlyCurrency(spend);
    const value = currency ? cost(spend.native[currency]) : null;
    return currency && value !== null ? { value, currency } : null;
}

/**
 * Ханшийн хайлт: тухайн кампанит ажил / өдрийн зардлын мөрийн ханш (мөр нь ханшгүй бол null — таамаглахгүй).
 * Зардлын мөргүй кампанит ажил / өдөрт ижил данс, валют, өдрийн ханш. MNT данс = 1.
 */
function mntConverter(ledger: readonly MetaLedgerRow[]) {
    const byCampaign = new Map<string, number | null>(), byAccount = new Map<string, number>();
    for (const row of ledger) {
        const value = row.mnt_per_unit === null || row.mnt_per_unit === undefined ? 0 : metaNumber(row.mnt_per_unit);
        const rate = value > 0 ? value : null;
        byCampaign.set(`${row.account_id}|${row.currency}|${row.campaign_id}|${row.spent_at}`, rate);
        const account = `${row.account_id}|${row.currency}|${row.spent_at}`;
        if (rate !== null && !byAccount.has(account)) byAccount.set(account, rate);
    }
    return (row: MetaInsightDayRow): number | null => {
        const spend = metaNumber(row.spend);
        if (spend === 0) return 0;
        if (row.currency === 'MNT') return spend;
        const key = `${row.account_id}|${row.currency}|${row.campaign_id}|${row.day}`;
        const rate = byCampaign.has(key) ? byCampaign.get(key) : byAccount.get(`${row.account_id}|${row.currency}|${row.day}`);
        return rate ? spend * rate : null;
    };
}

function summarizeResults(groups: readonly MetaResultGroup[], currencyOf: (campaign: string) => string): MetaResultSummary[] {
    return META_RESULT_TYPES.flatMap(type => {
        const list = groups.filter(g => g.type === type);
        if (!list.length) return [];
        const spend = emptyMetaSpend();
        for (const group of list) addSpend(spend, group.spend, currencyOf(group.campaign), group.spendMnt);
        // Reach-ийг нэмэхгүй (давхардалгүй тоо зөвхөн Meta-гаас); тоо ирээгүй бүлэгтэй бол тооцохгүй.
        const results = type === 'reach' || list.some(g => g.results === null) ? null : round(sum(list, g => g.results ?? 0));
        const final = finalizeSpend(spend);
        return [{
            type, label: META_RESULT_DEFS[type].label, costLabel: META_RESULT_DEFS[type].costLabel, results, spend: final,
            // Өртгийг бөөрөнхийлөөгүй зардлаас.
            cost: results !== null ? spendRatio(spend, results, type) : null,
        }];
    });
}

function deliveryOf(rows: readonly { spend: number; spendMnt: number | null; impressions: number; linkClicks: number; clicks: number; currency: string }[]): MetaDelivery | null {
    if (!rows.length) return null;
    const spend = emptyMetaSpend();
    for (const row of rows) addSpend(spend, row.spend, row.currency, row.spendMnt);
    const impressions = sum(rows, r => r.impressions), linkClicks = sum(rows, r => r.linkClicks);
    return {
        spend: finalizeSpend(spend), impressions, linkClicks, clicks: sum(rows, r => r.clicks),
        ctr: impressions > 0 ? round(linkClicks / impressions * 100, 2) : null,
        cpc: spendRatio(spend, linkClicks, null),
        cpm: spendRatio(spend, impressions, null, 1000),
    };
}

const formatAmount = (amount: number, currency: string) => currency === 'MNT' ? formatMNT(amount) : formatChannelValue(amount, 'money', currency);
/** «12.5 USD, 3 EUR» — ханшгүй эх валютын дүнгүүд. */
export function formatMetaPending(spend: MetaSpend): string {
    return Object.entries(spend.pending).map(([currency, amount]) => formatAmount(amount, currency)).join(', ');
}

export function buildMetaAdsReport(input: {
    range: { from: string; to: string };
    ledger: readonly MetaLedgerRow[];
    /** null = дэлгэрэнгүй үр дүнгийн хүснэгт суулгаагүй. */
    insights: readonly MetaInsightDayRow[] | null;
}): MetaAdsReport {
    const { range } = input;
    const ledger = input.ledger.filter(r => r.spent_at >= range.from && r.spent_at <= range.to);
    const insights = input.insights?.filter(r => r.day >= range.from && r.day <= range.to) ?? null;

    // 1) Зардал (ledger): нийт ба кампанит ажил бүрээр.
    const total = emptyMetaSpend();
    const campaigns = new Map<string, { campaignId: string; accountId: string; name: string; nameDay: string; currency: string | null; spend: MetaSpend; days: Set<string> }>();
    const campaignOf = (campaignId: string, accountId: string, name: string, day: string, currency: string) => {
        const entry = campaigns.get(campaignId) ?? { campaignId, accountId, name, nameDay: day, currency, spend: emptyMetaSpend(), days: new Set<string>() };
        if (day >= entry.nameDay) { entry.name = name || campaignId; entry.nameDay = day; }
        campaigns.set(campaignId, entry);
        return entry;
    };
    for (const row of ledger) {
        const native = metaNumber(row.native_amount);
        const mnt = row.amount_mnt === null || row.amount_mnt === undefined ? null : metaNumber(row.amount_mnt);
        addSpend(total, native, row.currency, mnt);
        const campaign = campaignOf(row.campaign_id, row.account_id, row.campaign_name, row.spent_at, row.currency);
        addSpend(campaign.spend, native, row.currency, mnt);
        campaign.days.add(row.spent_at);
    }

    // 2) Харагдалт, товшилт, үр дүн (ad set × өдөр).
    let delivery: MetaDelivery | null = null;
    let results: MetaResultSummary[] = [];
    const campaignDelivery = new Map<string, MetaDelivery | null>();
    const campaignResults = new Map<string, MetaResultSummary[]>();
    let approximate = 0;
    if (insights?.length) {
        const rows = toMetaResultRows(insights, mntConverter(input.ledger));
        const currencies = new Map(insights.map(r => [r.campaign_id, r.currency]));
        const currencyOf = (campaign: string) => currencies.get(campaign) ?? 'MNT';
        for (const row of insights) campaignOf(row.campaign_id, row.account_id, row.campaign_name, row.day, row.currency);
        const withCurrency = rows.map((row, i) => ({ ...row, currency: insights[i].currency }));
        delivery = deliveryOf(withCurrency);
        const groups = groupMetaResultRows(rows).filter(hasMetaDelivery);
        results = summarizeResults(groups, currencyOf);
        for (const id of new Set(rows.map(r => r.campaign))) {
            campaignDelivery.set(id, deliveryOf(withCurrency.filter(r => r.campaign === id)));
            campaignResults.set(id, summarizeResults(groups.filter(g => g.campaign === id), currencyOf));
        }
        approximate = rows.filter(r => r.source === 'goal' && r.type && r.type !== 'reach' && (r.results ?? 0) > 0).length;
    }

    const campaignList: MetaCampaignReport[] = [...campaigns.values()].map(c => ({
        campaignId: c.campaignId, accountId: c.accountId, name: c.name, currency: c.currency,
        spend: finalizeSpend(c.spend), days: c.days.size,
        delivery: campaignDelivery.get(c.campaignId) ?? null, results: campaignResults.get(c.campaignId) ?? [],
    })).sort((a, b) => b.spend.mnt - a.spend.mnt
        || sum(Object.values(b.spend.native), v => v) - sum(Object.values(a.spend.native), v => v)
        || a.name.localeCompare(b.name));

    const spendDays = new Set(ledger.map(r => r.spent_at)), insightDays = new Set((insights ?? []).map(r => r.day));
    const last = (days: Set<string>) => [...days].sort().at(-1) ?? null;
    const timezones = [...new Set(ledger.map(r => r.timezone))].sort();
    const coverage: MetaAdsCoverage = {
        spendDays: spendDays.size, insightDays: insightDays.size,
        spendDaysWithoutInsights: [...spendDays].filter(day => !insightDays.has(day)).length,
        insightsReady: insights !== null, lastSpendDay: last(spendDays), lastInsightDay: last(insightDays), timezones,
    };

    const spend = finalizeSpend(total);
    const notes: string[] = [];
    if (!spend.complete) notes.push(`Ханшгүй зардал ${formatMetaPending(spend)} — төгрөгийн нийтэд ороогүй. Ханшийг /marketing → «Бүртгэл» → «Meta автомат зардал» хэсэгт оруулна.`);
    if (!coverage.insightsReady) notes.push('Meta-гийн дэлгэрэнгүй үр дүн (ad set × өдөр) хараахан идэвхжээгүй — зөвхөн зардал харагдана.');
    else if (coverage.spendDaysWithoutInsights > 0) {
        notes.push(`Зардалтай ${coverage.spendDays} өдрийн ${coverage.spendDaysWithoutInsights}-д ad set-ийн дэлгэрэнгүй өгөгдөл алга (файлаар оруулсан эсвэл дэлгэрэнгүй синк хийгээгүй) — харагдалт, үр дүн, нэг үр дүнгийн өртөг зөвхөн өгөгдөлтэй өдрүүдээс.`);
    }
    if (approximate) notes.push(`${approximate} мөрийн үр дүнг Meta-гийн «results» талбаргүйгээр ad set-ийн зорилгоор тооцсон — Ads Manager-ийн Results-аас бага зэрэг зөрж болно.`);
    if (results.some(r => r.type === 'reach')) notes.push('Хүрсэн хүн (reach)-ийг өдөр, кампанит ажлаар нэмэхгүй тул дурын хугацаанд тооцоогүй — давхардалгүй reach хурлын долоо хоногийн Meta тайланд харагдана.');
    const foreignZones = timezones.filter(zone => zone !== META_REPORT_TIMEZONE);
    if (foreignZones.length) notes.push(`Meta өдрийг зарын дансны цагийн бүсээр (${foreignZones.join(', ')}) тоолдог; CRM-ийн лид, гэрээ Улаанбаатарын цагаар — хугацааны хил хэдэн цагаар зөрнө.`);

    return { range, spend, delivery, results, campaigns: campaignList, coverage, notes, basis: META_ADS_BASIS };
}

/** Мөнгө: төгрөг эсвэл эх валютаар («21,000₮», «2.59 USD»). */
export function formatMetaMoney(money: MetaMoney | null | undefined): string {
    return money ? formatAmount(money.value, money.currency) : '—';
}

/** Зардал: бүрэн ханштай бол төгрөг; эс бөгөөс «… ₮ + 12.5 USD (ханшгүй)»; бүртгэлгүй бол «—». */
export function formatMetaSpend(spend: MetaSpend | null | undefined, options?: { compact?: boolean }): string {
    if (!hasMetaSpend(spend)) return '—';
    if (spend.complete) return formatMNT(spend.mnt, options);
    const converted = Object.keys(spend.native).some(currency => (spend.native[currency] ?? 0) > (spend.pending[currency] ?? 0));
    const parts = converted ? [formatMNT(spend.mnt, options)] : [];
    for (const [currency, amount] of Object.entries(spend.pending)) parts.push(`${formatAmount(amount, currency)} (ханшгүй)`);
    return parts.join(' + ');
}

/** «Дуудлага (Meta) 45 · 2.59 USD/нэг» маягийн богино мөр. */
export function formatMetaResult(result: MetaResultSummary): string {
    const count = result.results === null ? 'тооцоогүй' : new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 1 }).format(result.results);
    const cost = result.cost ? ` · ${formatMetaMoney(result.cost)}${META_RESULT_DEFS[result.type].costScale === 1000 ? ' / 1000 хүн' : ''}` : '';
    return `${result.label}: ${count}${cost}`;
}
