import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessProject, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { buildMetaAdsReport, MetaAdsRangeSchema, type MetaAdsRange, type MetaAdsReport, type MetaInsightDayRow, type MetaLedgerRow } from './meta-ads-report';
import { META_INSIGHT_COLUMNS, META_INSIGHTS_TABLE } from './meta-insights';
import type { RoiActivity } from './roi';

export { MetaAdsRangeSchema, type MetaAdsRange } from './meta-ads-report';

/** Хугацаагүй бол энэ сарын 1-нээс өнөөдөр хүртэл (Улаанбаатар). */
export function metaAdsRangeInput(input: { from?: unknown; to?: unknown }) {
    const today = ubDateStr();
    return { from: input.from || `${today.slice(0, 7)}-01`, to: input.to || today };
}
export const parseMetaAdsRange = (input: { from?: unknown; to?: unknown }): MetaAdsRange => MetaAdsRangeSchema.parse(metaAdsRangeInput(input));

const LEDGER_COLUMNS = 'account_id,campaign_id,campaign_name,spent_at,native_amount,currency,timezone,amount_mnt,mnt_per_unit';
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

export function loadMetaLedger(db: SupabaseClient, shopId: string, from: string, to: string): Promise<MetaLedgerRow[]> {
    return fetchAllRows<MetaLedgerRow>((start, end) => db.from('meta_daily_spend').select(LEDGER_COLUMNS)
        .eq('shop_id', shopId).gte('spent_at', from).lte('spent_at', to).order('id').range(start, end));
}

/** null = `meta_ad_insights_daily` суулгаагүй (20261005130000); бусад алдаа шидэгдэнэ. */
export async function loadMetaInsightDays(db: SupabaseClient, shopId: string, from: string, to: string): Promise<MetaInsightDayRow[] | null> {
    let missing = false;
    const rows = await fetchAllRows<MetaInsightDayRow>(async (start, end) => {
        const result = await db.from(META_INSIGHTS_TABLE).select(`account_id,currency,${META_INSIGHT_COLUMNS}`)
            .eq('shop_id', shopId).gte('day', from).lte('day', to).order('id').range(start, end);
        if (start === 0 && MISSING_TABLE.has(result.error?.code ?? '')) {
            missing = true;
            return { data: [], error: null };
        }
        return result;
    });
    return missing ? null : rows;
}

export function loadMetaActivities(db: SupabaseClient, shopId: string) {
    return fetchAllRows<RoiActivity & { project_id: string | null }>((start, end) => db.from('marketing_campaigns')
        .select('id,name,project_id,external_campaign_id').eq('shop_id', shopId).order('id').range(start, end));
}

/**
 * Төслөөр хязгаарлагдсан хэрэглэгч зөвхөн өөрийн төслийн акцад Meta campaign ID-аар холбогдсон кампанит
 * ажлын зардал, үр дүнг харна (`loadMarketingPerformance`-ийн зардлын шүүлттэй адил); холбоогүй кампанит
 * ажил байгууллагын эрхтэй хүнд л.
 */
export function metaCampaignFilter(
    activities: readonly { project_id: string | null; external_campaign_id: string | null }[], scope: SalesProjectScope,
): <T extends { campaign_id: string }>(rows: T[]) => T[] {
    if (scope.projectIds === null) return rows => rows;
    const projectOf = new Map(activities.filter(a => a.external_campaign_id).map(a => [String(a.external_campaign_id).trim(), a.project_id]));
    return rows => rows.filter(row => canAccessProject(scope, projectOf.get(row.campaign_id)));
}

/** ROI, «Сурталчилгаа», AI нэг тооцоог ашиглана; аль нэг уншилт алдаатай бол бүхэлдээ алдаа (хоосон тоо харуулахгүй). */
export async function loadMetaAdsReport(
    db: SupabaseClient, shopId: string, input: { from?: unknown; to?: unknown }, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE,
): Promise<{ range: MetaAdsRange; report: MetaAdsReport; activities: Array<RoiActivity & { project_id: string | null }> }> {
    const range = parseMetaAdsRange(input);
    const [ledger, insights, activities] = await Promise.all([
        loadMetaLedger(db, shopId, range.from, range.to),
        loadMetaInsightDays(db, shopId, range.from, range.to),
        loadMetaActivities(db, shopId),
    ]);
    const visible = metaCampaignFilter(activities, scope);
    return { range, report: buildMetaAdsReport({ range, ledger: visible(ledger), insights: insights && visible(insights) }), activities };
}
