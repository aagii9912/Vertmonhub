import { NextResponse } from 'next/server';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { loadMarketingTimeline } from '@/lib/marketing/timeline-load';

/**
 * GET /api/dashboard/marketing-roi/timeline
 * Маркетингийн нөлөөллийн сүүлийн 6 сарын цуваа (Улаанбаатарын сараар): лид, уулзалт,
 * идэвхжүүлэлт (пост, кампанит ажил) ба сонгосон Meta зарын дансны өдрийн зардал дансны
 * валютаар (`currency`). Тооцоо: `lib/marketing/timeline.ts`.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Цуваа татахад алдаа гарлаа' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const timeline = await loadMarketingTimeline(db, { shopId: shop.id, scope });
    return NextResponse.json(timeline, { headers: { 'Cache-Control': 'private, no-store' } });
});
