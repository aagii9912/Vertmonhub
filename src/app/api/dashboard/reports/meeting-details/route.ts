import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { loadMeetingDetails } from '@/lib/dashboard/meeting-details-load';
import { meetingDateSchema, nextMeetingDate } from '@/lib/dashboard/weekly-review';

/**
 * GET /api/dashboard/reports/meeting-details?meeting=YYYY-MM-DD (Лхагва; анхдагч: дараагийн хурал)
 * Лхагвын илтгэлийн уулзалтын дэлгэрэнгүй: сүүлийн 4 долоо хоногийн болсон уулзалт сонирхсон загвараар,
 * тайлант 7 хоногийн шинэ уулзалт «Сэжим»-ээр (`buildMeetingDetails`). Захиалагчийн нэр, утас гаргахгүй.
 * `reports` модуль (super_admin нэвтэрнэ); төслийн хүрээгээр хязгаарлагдсан менежерт 403.
 */
export const GET = withRoute({ module: 'reports', error: 'Уулзалтын дэлгэрэнгүйг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const raw = request.nextUrl.searchParams.get('meeting');
    const meeting = meetingDateSchema.safeParse(raw || nextMeetingDate());
    if (!meeting.success) return NextResponse.json({ error: 'Хурлын огноо (Лхагва гараг) буруу байна' }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Багийн уулзалтын дэлгэрэнгүй удирдлагад харагдана' }, { status: 403 });
    const report = await loadMeetingDetails(db, { shopId: shop.id, meetingDate: meeting.data });
    return NextResponse.json({ meetingDate: meeting.data, ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
});
