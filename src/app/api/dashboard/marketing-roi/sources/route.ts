import { NextResponse } from 'next/server';
import { applyLeadScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildLeadSourceStats, type LeadSourceLead } from '@/lib/marketing/lead-sources';
import { timelineMonths } from '@/lib/marketing/timeline';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/dashboard/marketing-roi/sources
 * Лидийн эх үүсвэрийн нэгтгэл: суваг бүрийн нийт / гэрээтэй / алдсан / идэвхтэй лид, конверс, шилдэг суваг
 * ба сүүлийн 6 сарын (Улаанбаатарын сараар) үүссэн лид. Огноо сонголтоос үл хамааран харах эрхтэй бүх лидээр —
 * хуудас хуудсаар (`fetchAllRows`), 1000 мөрөөр тасрахгүй.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Лидийн эх үүсвэр татахад алдаа гарлаа' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const leads = await fetchAllRows<LeadSourceLead>((from, to) => applyLeadScope(db.from('leads')
        .select('source,status,created_at').eq('shop_id', shop.id).is('deleted_at', null)
        .order('id').range(from, to), scope));
    return NextResponse.json({ stats: buildLeadSourceStats(leads, timelineMonths()) },
        { headers: { 'Cache-Control': 'private, no-store' } });
});
