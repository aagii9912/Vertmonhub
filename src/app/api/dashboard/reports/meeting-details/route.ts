import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { loadMeetingDetails } from '@/lib/dashboard/meeting-details-load';
import { meetingDateSchema, nextMeetingDate } from '@/lib/dashboard/weekly-review';
import { resolveReportRange } from '@/lib/dashboard/report-range';

/**
 * GET /api/dashboard/reports/meeting-details?meeting=YYYY-MM-DD (Лхагва; анхдагч: дараагийн хурал)&from=&to=
 * Лхагвын илтгэлийн уулзалтын дэлгэрэнгүй: тайлант хугацааны сүүлийн өдрөөр дуусах 4 долоо хоногийн болсон уулзалт
 * сонирхсон загвараар, тайлант хугацааны шинэ уулзалт «Сэжим»-ээр, бүх уулзалт төлбөрийн нөхцөлөөр (`buildMeetingDetails`).
 * `from`/`to` — сонгосон тайлант хугацаа (`resolveReportRange`; өгөөгүй бол хурлын Лхагва→Мягмар). Захиалагчийн нэр,
 * утас гаргахгүй. `reports` модуль (super_admin нэвтэрнэ); төслийн хүрээгээр хязгаарлагдсан менежерт 403.
 */
export const GET = withRoute({ module: 'reports', error: 'Уулзалтын дэлгэрэнгүйг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const meeting = meetingDateSchema.safeParse(params.get('meeting') || nextMeetingDate());
    if (!meeting.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const period = resolveReportRange(meeting.data, params.get('from'), params.get('to'));
    if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Багийн уулзалтын дэлгэрэнгүй удирдлагад харагдана' }, { status: 403 });
    const report = await loadMeetingDetails(db, { shopId: shop.id, meetingDate: meeting.data, range: period.range });
    return NextResponse.json({ meetingDate: meeting.data, ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
});
