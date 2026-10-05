import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { resolveLeadsReportRange } from '@/lib/reports/leads-summary';
import { loadLeadsSummary } from '@/lib/reports/leads-summary-load';

/**
 * GET /api/dashboard/reports/leads-summary?period=today|week|month|quarter|year
 * GET /api/dashboard/reports/leads-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Лидийн тайлан: хугацаанд (УБ өдрөөр) бүртгэгдсэн бүх лидийн тоо — төлөв, эх сурвалж,
 * төсөл, менежер, хөрвүүлэлт. Тайлангийн бусад endpoint-ын адил `reports` модулиар хамгаалж,
 * менежерийг өөрийн төсөл, өөрийн лидээр (applyLeadScope) хязгаарлана.
 */
export const GET = withRoute({ module: 'reports', error: 'Лидийн тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const query = request.nextUrl.searchParams;
    const resolved = resolveLeadsReportRange({ period: query.get('period'), from: query.get('from'), to: query.get('to') });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const report = await loadLeadsSummary(db, { shopId: shop.id, scope, range: resolved.range });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
});
