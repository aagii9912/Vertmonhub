import { NextResponse } from 'next/server';
import { applyLeadScope, applyProjectScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMarketingTimeline, timelineMonths, timelineWindow } from '@/lib/marketing/timeline';
import { loadMetaActivities, loadMetaLedger, metaCampaignFilter } from '@/lib/marketing/meta-ads-load';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/dashboard/marketing-roi/timeline
 * Сүүлийн 6 сарын (Улаанбаатарын сараар) лид, уулзалт, идэвхжүүлэлт (пост + эхэлсэн акц / кампанит ажил)
 * ба Meta зардал (meta_daily_spend, төгрөг; ханшгүй дүн эх валютаар `pending`-д). Идэвхжүүлэлт лид /
 * уулзалтад хэрхэн нөлөөлж буйг харьцуулах графикт ашиглана.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Цуваа татахад алдаа гарлаа' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const months = timelineMonths();
    // Meta-гийн өдөр дансны цагийн бүсээр тул «өнөөдөр»-өөр биш, сүүлийн сарын эцсээр хязгаарлана.
    const { start, firstDay, lastDay } = timelineWindow(months);
    const startISO = start.toISOString();
    // Төслөөр хязгаарлагдсан хэрэглэгчид уулзалтыг лидийн төсөл, менежерээр шүүнэ.
    const viewingColumns: string = scope.projectIds === null ? 'scheduled_at' : 'scheduled_at,leads!inner(project_id,sales_manager_name)';

    const [leads, viewings, posts, activities, spend, metaActivities] = await Promise.all([
        fetchAllRows<{ created_at: string }>((from, to) => applyLeadScope(db.from('leads').select('created_at')
            .eq('shop_id', shop.id).is('deleted_at', null).gte('created_at', startISO).order('id').range(from, to), scope)),
        fetchAllRows<{ scheduled_at: string | null }>(async (from, to) => await applyLeadScope(db.from('property_viewings')
            .select(viewingColumns).eq('shop_id', shop.id).is('deleted_at', null).gte('scheduled_at', startISO).order('id').range(from, to),
        scope, 'leads.project_id', 'leads.sales_manager_name') as unknown as { data: { scheduled_at: string | null }[] | null; error: { message: string } | null }),
        fetchAllRows<{ published_at: string | null }>((from, to) => db.from('social_posts').select('published_at')
            .eq('shop_id', shop.id).eq('status', 'published').gte('published_at', startISO).order('id').range(from, to)),
        fetchAllRows<{ start_date: string | null; created_at: string | null; status: string | null }>((from, to) => applyProjectScope(db.from('marketing_campaigns')
            .select('start_date,created_at,status').eq('shop_id', shop.id).order('id').range(from, to), scope)),
        loadMetaLedger(db, shop.id, firstDay, lastDay),
        loadMetaActivities(db, shop.id),
    ]);
    return NextResponse.json({
        months: buildMarketingTimeline(months, { leads, viewings, posts, activities, spend: metaCampaignFilter(metaActivities, scope)(spend) }),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
});
