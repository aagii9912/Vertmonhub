import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { meetingDateSchema } from '@/lib/dashboard/weekly-review';
import { loadWeeklySales } from '@/lib/dashboard/weekly-sales-load';

/**
 * GET /api/dashboard/reports/weekly-sales?meetingDate=YYYY-MM-DD (Лхагва)
 * Идэвхтэй төслийн (shop) хурлын долоо хоногийн борлуулалт: ERP/CRM гэрээ, сарын явц,
 * менежерээр, мөнгөн орлого, авлага, үлдэгдэл, давхрын зураглал.
 */
export const GET = withRoute({ module: 'reports', error: 'Долоо хоногийн борлуулалтын тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const meetingDate = meetingDateSchema.safeParse(request.nextUrl.searchParams.get('meetingDate'));
    if (!meetingDate.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const permissions = await resolvePermissions();
    const canSeeCustomers = permissions?.role === 'super_admin' || !!permissions?.permissions.modules.includes('contracts');
    const report = await loadWeeklySales(supabaseAdmin(), { shopId: shop.id, meetingDate: meetingDate.data, canSeeCustomers });
    return NextResponse.json({ ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
});
