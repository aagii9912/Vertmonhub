import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { meetingDateSchema, shiftReviewDate, weeklyReviewRange } from '@/lib/dashboard/weekly-review';
import { loadInstagramWeek, loadLatestInstagramWeek, loadLatestSocialWeek, loadSocialWeek, type InstagramWeek } from '@/lib/marketing/social-week';
import { ubDateStr } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';

/**
 * Instagram-ийн уншилт бүтэлгүйтвэл Facebook хуудасны хэсгийг унагахгүй: `instagram: null` ба монгол мессеж
 * (`instagramError`) — карт өөрөө алдаагаа харуулна. Instagram холбогдоогүй бол `instagram.account: null`.
 */
async function instagramPart(load: () => Promise<InstagramWeek>): Promise<{ instagram: InstagramWeek | null; instagramError: string | null }> {
    try {
        return { instagram: await load(), instagramError: null };
    } catch (error) {
        logger.warn('[social-week] Instagram уншиж чадсангүй', { error });
        return { instagram: null, instagramError: 'Instagram-ийн үзүүлэлтийг уншиж чадсангүй. Шинэчилж дахин оролдоно уу.' };
    }
}

/**
 * GET /api/dashboard/marketing/social-week?meetingDate=YYYY-MM-DD (Лхагва)
 * Хурлын долоо хоногийн (Лхагва–Мягмар) Facebook хуудас (`week`) ба Instagram аккаунтын (`instagram`) хадгалсан
 * органик үзүүлэлт, өмнөх долоо хоногтой харьцуулалт, тухайн долоо хоногт нийтэлсэн пост. Маркетингийн хэсэг тул marketing-roi.
 * GET ...?latest=1 — маркетингийн самбар: сүүлд синк хийсэн өдрөөр дуусах 7 хоног (`loadLatestSocialWeek`).
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Facebook хуудасны үзүүлэлтийг уншиж чадсангүй' }, async ({ request, shop }) => {
    const db = supabaseAdmin();
    if (request.nextUrl.searchParams.get('latest') === '1') {
        const today = ubDateStr();
        const [week, instagram] = await Promise.all([loadLatestSocialWeek(db, shop.id, today), instagramPart(() => loadLatestInstagramWeek(db, shop.id, today))]);
        return NextResponse.json({ week, ...instagram }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const date = meetingDateSchema.safeParse(request.nextUrl.searchParams.get('meetingDate'));
    if (!date.success) return NextResponse.json({ error: 'Лхагва гарагийн огноо сонгоно уу.' }, { status: 400 });
    const range = weeklyReviewRange(date.data);
    const previousRange = weeklyReviewRange(shiftReviewDate(date.data, -7));
    const [week, instagram] = await Promise.all([loadSocialWeek(db, shop.id, range, previousRange), instagramPart(() => loadInstagramWeek(db, shop.id, range, previousRange))]);
    return NextResponse.json({ week, ...instagram }, { headers: { 'Cache-Control': 'private, no-store' } });
});
