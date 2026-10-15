import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { meetingDateSchema, shiftReviewDate, weeklyReviewRange } from '@/lib/dashboard/weekly-review';
import { loadLatestSocialWeek, loadSocialWeek } from '@/lib/marketing/social-week';
import { ubDateStr } from '@/lib/utils/date';

/**
 * GET /api/dashboard/marketing/social-week?meetingDate=YYYY-MM-DD (Лхагва)
 * Хурлын долоо хоногийн (Лхагва–Мягмар) Facebook хуудасны хадгалсан органик үзүүлэлт, өмнөх долоо
 * хоногтой харьцуулалт, тухайн долоо хоногт нийтэлсэн постууд. Маркетингийн хэсэг тул marketing-roi.
 * GET ...?latest=1 — маркетингийн самбар: сүүлд синк хийсэн өдрөөр дуусах 7 хоног (`loadLatestSocialWeek`).
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Facebook хуудасны үзүүлэлтийг уншиж чадсангүй' }, async ({ request, shop }) => {
    if (request.nextUrl.searchParams.get('latest') === '1') {
        const week = await loadLatestSocialWeek(supabaseAdmin(), shop.id, ubDateStr());
        return NextResponse.json({ week }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const date = meetingDateSchema.safeParse(request.nextUrl.searchParams.get('meetingDate'));
    if (!date.success) return NextResponse.json({ error: 'Лхагва гарагийн огноо сонгоно уу.' }, { status: 400 });
    const week = await loadSocialWeek(supabaseAdmin(), shop.id, weeklyReviewRange(date.data), weeklyReviewRange(shiftReviewDate(date.data, -7)));
    return NextResponse.json({ week }, { headers: { 'Cache-Control': 'private, no-store' } });
});
