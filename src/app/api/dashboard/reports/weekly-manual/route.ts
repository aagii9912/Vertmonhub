import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { meetingDateSchema } from '@/lib/dashboard/weekly-review';
import { resolveReportRange } from '@/lib/dashboard/report-range';
import { loadWeeklyManual } from '@/lib/dashboard/weekly-manual-load';

/**
 * GET /api/dashboard/reports/weekly-manual?meetingDate=YYYY-MM-DD (Лхагва)&from=&to=
 * Лхагвын тайлангийн «Гараар нөхөх» алхам: менежергүй, огноогүй амьд гэрээ ба тайлант сарын төлөвлөгөө,
 * гараар оруулсан гүйцэтгэл байгаа эсэх. Захиалагчийн нэр зөвхөн `contracts`, мөнгөн урсгалын мөр зөвхөн `finance` эрхтэйд.
 * `from`/`to` — сонгосон тайлант хугацаа (`resolveReportRange`; өгөөгүй бол хурлын Лхагва→Мягмар).
 */
export const GET = withRoute({ module: 'reports', error: 'Гараар нөхөх зүйлсийг уншиж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const meetingDate = meetingDateSchema.safeParse(params.get('meetingDate'));
    if (!meetingDate.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const period = resolveReportRange(meetingDate.data, params.get('from'), params.get('to'));
    if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 });
    const permissions = await resolvePermissions();
    const allowed = (module: string) => permissions?.role === 'super_admin' || !!permissions?.permissions.modules.includes(module);
    const manual = await loadWeeklyManual(supabaseAdmin(), {
        shopId: shop.id, meetingDate: meetingDate.data, range: period.range, canSeeCustomers: allowed('contracts'), canSeeCash: allowed('finance'),
    });
    return NextResponse.json(manual, { headers: { 'Cache-Control': 'private, no-store' } });
});
