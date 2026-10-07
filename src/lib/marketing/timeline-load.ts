import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLeadScope, applyProjectScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadMetaActivities, loadMetaLedger, metaCampaignFilter } from './meta-ads-load';
import { buildMarketingTimeline, timelineMonths, timelineWindow, type TimelineMonth } from './timeline';

export interface MarketingTimeline {
    months: TimelineMonth[];
}

/**
 * Сүүлийн `count` УБ сарын маркетингийн цуваа. Бүх уншилт хуудаслалттай (`fetchAllRows`), лид ба
 * уулзалт хэрэглэгчийн төслийн хүрээгээр (`applyLeadScope`), акц нь төслөөр, Meta зардал ROI тайлантай
 * нэг ledger ба кампанит ажлын шүүлтээр (`loadMetaLedger`, `metaCampaignFilter`). Аль нэг уншилт унавал
 * алдаа шиднэ — тэгээр дүүргэсэн цуваа буцаахгүй. Эрхийг дуудагч (route) шалгана.
 */
export async function loadMarketingTimeline(
    db: SupabaseClient, options: { shopId: string; scope: SalesProjectScope; now?: Date; count?: number },
): Promise<MarketingTimeline> {
    const { shopId, scope } = options;
    const months = timelineMonths(options.now, options.count);
    const bounds = timelineWindow(months);
    const start = bounds.start.toISOString();
    const end = bounds.end.toISOString();

    const [leads, viewings, posts, campaigns, ledger, coverage, metaActivities] = await Promise.all([
        fetchAllRows<{ created_at: string | null }>((from, to) => applyLeadScope(db.from('leads')
            .select('created_at').eq('shop_id', shopId).is('deleted_at', null)
            .gte('created_at', start).lt('created_at', end).order('id').range(from, to), scope)),
        fetchAllRows<{ scheduled_at: string | null }>((from, to) => applyLeadScope(db.from('property_viewings')
            .select(scope.projectIds === null ? 'scheduled_at' : 'scheduled_at,leads!inner(project_id,sales_manager_name)')
            .eq('shop_id', shopId).is('deleted_at', null)
            .gte('scheduled_at', start).lt('scheduled_at', end).order('id').range(from, to), scope, 'leads.project_id', 'leads.sales_manager_name') as unknown as
            PromiseLike<{ data: { scheduled_at: string | null }[] | null; error: { message: string } | null }>),
        fetchAllRows<{ published_at: string | null }>((from, to) => db.from('social_posts')
            .select('published_at').eq('shop_id', shopId).eq('status', 'published')
            .gte('published_at', start).lt('published_at', end).order('id').range(from, to)),
        // Эхэлсэн огноо (DATE) эсвэл бүртгэсэн огноогоор сард орно — DB шүүлтүүрээр хасахгүй.
        fetchAllRows<{ start_date: string | null; created_at: string | null; status: string | null }>((from, to) => applyProjectScope(db.from('marketing_campaigns')
            .select('start_date,created_at,status').eq('shop_id', shopId).order('id').range(from, to), scope)),
        loadMetaLedger(db, shopId, bounds.firstDay, bounds.lastDay),
        fetchAllRows<{ spent_at: string }>((from, to) => db.from('meta_spend_coverage')
            .select('spent_at').eq('shop_id', shopId)
            .gte('spent_at', bounds.firstDay).lte('spent_at', bounds.lastDay).order('account_id').order('spent_at').range(from, to)),
        loadMetaActivities(db, shopId),
    ]);

    return {
        months: buildMarketingTimeline(months, {
            leads, viewings, posts, campaigns,
            spend: { rows: metaCampaignFilter(metaActivities, scope)(ledger), coveredDays: coverage.map(c => c.spent_at) },
        }),
    };
}
