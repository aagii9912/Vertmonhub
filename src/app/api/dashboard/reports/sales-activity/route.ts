import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { DailyReportUnavailableError } from '@/lib/dashboard/daily-report-load';
import { loadSalesActivity } from '@/lib/dashboard/sales-activity-load';
import { meetingDateSchema, nextMeetingDate } from '@/lib/dashboard/weekly-review';
import { resolveReportRange } from '@/lib/dashboard/report-range';

/**
 * GET /api/dashboard/reports/sales-activity?meeting=YYYY-MM-DD (Лхагва; анхдагч: дараагийн хурал)&from=&to=
 * Лхагвын илтгэлийн тоон мэдээлэл: төслийн утас, менежерийн дугаар, шинэ/давтан уулзалт, чатыг
 * тайлант хугацааны сүүлийн өдрөөр дуусах 5 бүтэн 7 хоногоор (сарын хилээр тасалдаггүй) ба сарын эхнээс, багийн
 * сарын төлөвлөгөөтэй (`buildSalesActivity`). `from`/`to` — хуудсан дээр сонгосон тайлант хугацаа
 * (`resolveReportRange`; өгөөгүй бол хурлын Лхагва→Мягмар). Багийн тайлан тул `reports` модуль (super_admin
 * нэвтэрнэ); төслийн хүрээгээр хязгаарлагдсан менежерт 403 (төлөвлөгөөний биелэлтийн дүрэм).
 */
export const GET = withRoute({ module: 'reports', error: 'Борлуулалтын тоон мэдээллийг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const meeting = meetingDateSchema.safeParse(params.get('meeting') || nextMeetingDate());
    if (!meeting.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const period = resolveReportRange(meeting.data, params.get('from'), params.get('to'));
    if (!period.ok) return NextResponse.json({ error: period.error }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Багийн тоон мэдээлэл удирдлагад харагдана' }, { status: 403 });
    try {
        const report = await loadSalesActivity(db, { shopId: shop.id, shopName: shop.name || 'Төсөл', meetingDate: meeting.data, range: period.range });
        return NextResponse.json({ ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error instanceof DailyReportUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
        throw error;
    }
});
