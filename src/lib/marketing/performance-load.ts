import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadMarketingSpend } from './spend-load';
import { ubDateStr } from '@/lib/utils/date';
import { buildMarketingPerformance, PerformanceFilterSchema, previousRange, type MarketingActivity, type MarketingLead, type MarketingContract, type MarketingTarget } from './performance';

/** API and AI share one calculation and fail closed when any required read fails. */
export async function loadMarketingPerformance(db: SupabaseClient, shopId: string, input: { from?: unknown; to?: unknown; project?: unknown }) {
    const today = ubDateStr();
    const filter = PerformanceFilterSchema.parse({ from: input.from ?? `${today.slice(0, 7)}-01`, to: input.to ?? today, project: input.project || undefined });
    const prev = previousRange(filter);
    const [projects, activities, leads, contracts, spend, targets] = await Promise.all([
        fetchAllRows<{ id: string; name: string }>((from, to) => db.from('projects').select('id,name').eq('shop_id', shopId).order('id').range(from, to)),
        fetchAllRows<MarketingActivity>((from, to) => db.from('marketing_campaigns').select('id,name,project_id,marketing_owner_name,channel,external_campaign_id,activity_kind,status,start_date,completed_on').eq('shop_id', shopId).order('id').range(from, to)),
        fetchAllRows<MarketingLead>((from, to) => db.from('leads').select('id,created_at,project_id,source,marketing_campaign_id,marketing_owner_name,marketing_channel,sales_handoff_at,sales_manager_name')
            .eq('shop_id', shopId).is('deleted_at', null).gte('created_at', `${prev.from}T00:00:00+08:00`).lte('created_at', `${filter.to}T23:59:59.999999+08:00`).order('id').range(from, to)),
        fetchAllRows<MarketingContract>((from, to) => db.from('property_contracts').select('lead_id,contract_date,contract_number,total_price,contract_status')
            .eq('shop_id', shopId).is('deleted_at', null).order('id').range(from, to)),
        loadMarketingSpend(db, shopId, prev.from, filter.to),
        fetchAllRows<MarketingTarget>((from, to) => db.from('marketing_targets').select('id,month,project_id,marketing_owner_name,lead_target,deal_target,budget')
            .eq('shop_id', shopId).gte('month', `${filter.from.slice(0, 7)}-01`).lte('month', filter.to).order('id').range(from, to)),
    ]);
    return { report: buildMarketingPerformance({ projects, activities, leads, contracts, spend, targets }, filter),
        projects, activities, spend: spend.filter(s => s.spent_at >= filter.from && (!filter.project || s.project_id === filter.project)) };
}
