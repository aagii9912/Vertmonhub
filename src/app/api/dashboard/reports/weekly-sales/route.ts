import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { meetingDateSchema } from '@/lib/dashboard/weekly-review';
import { resolveReportRange } from '@/lib/dashboard/report-range';
import { loadWeeklySales } from '@/lib/dashboard/weekly-sales-load';

/**
 * GET /api/dashboard/reports/weekly-sales?meetingDate=YYYY-MM-DD (Лхагва)&from=&to=
 * Идэвхтэй төслийн (shop) хурлын долоо хоногийн борлуулалт: ERP/CRM гэрээ, сарын явц,
 * менежерээр, мөнгөн орлого, авлага, үлдэгдэл, давхрын зураглал. `from`/`to` — сонгосон тайлант хугацаа
 * (`resolveReportRange`; өгөөгүй бол хурлын Лхагва→Мягмар).
 */
export const GET = withRoute({ module: 'reports', error: 'Долоо хоногийн борлуулалтын тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const meetingDate = meetingDateSchema.safeParse(params.get('meetingDate'));
    if (!meetingDate.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const period = resolveReportRange(meetingDate.data, params.get('from'), params.get('to'));
    if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 });
    const permissions = await resolvePermissions();
    const canSeeCustomers = permissions?.role === 'super_admin' || !!permissions?.permissions.modules.includes('contracts');
    const report = await loadWeeklySales(supabaseAdmin(), { shopId: shop.id, meetingDate: meetingDate.data, range: period.range, canSeeCustomers });
    return NextResponse.json({ ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
});
