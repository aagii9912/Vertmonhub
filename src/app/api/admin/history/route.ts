import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ActivityFeedQuerySchema, loadActivityFeed, resolveFeedRange } from '@/lib/admin/activity-feed';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** super_admin + идэвхтэй төсөл (x-shop-id-г getUserShop гишүүнчлэлээр шалгана). */
async function gate() {
    if (!await getUserId()) return { error: NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401, headers: NO_STORE }) };
    if (!await getAdminUser()) return { error: NextResponse.json({ error: 'Зөвхөн super admin хандана' }, { status: 403, headers: NO_STORE }) };
    const shop = await getUserShop();
    if (!shop) return { error: NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403, headers: NO_STORE }) };
    return { shop };
}

/**
 * GET /api/admin/history?user=<uuid|''>&from=YYYY-MM-DD&to=YYYY-MM-DD — «Өөрчлөлтийн түүх» (super_admin).
 * Идэвхтэй төслийн өдрийн тайлан, өгөгдлийн аудит, лидийн түүхийг шинэ нь эхэнд нэгтгэнэ (≤ 500,
 * анхдагч сүүлийн 30 өдөр, 92 хоногоос ихгүй) + шүүлтүүрийн хэрэглэгчид. Зөвхөн уншина.
 */
export async function GET(request: NextRequest) {
    const access = await gate();
    if (access.error) return access.error;
    const params = request.nextUrl.searchParams;
    const parsed = ActivityFeedQuerySchema.safeParse({
        user: params.get('user') ?? undefined,
        from: params.get('from') || undefined,
        to: params.get('to') || undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: 'Хэрэглэгч эсвэл огноо буруу байна' }, { status: 400, headers: NO_STORE });
    const range = resolveFeedRange(parsed.data);
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400, headers: NO_STORE });
    try {
        const feed = await loadActivityFeed(supabaseAdmin(), {
            shopId: access.shop.id, shopName: access.shop.name ?? '', from: range.from, to: range.to, userId: parsed.data.user || null,
        });
        return NextResponse.json(feed, { headers: NO_STORE });
    } catch (error) {
        return safeErrorResponse(error, 'Өөрчлөлтийн түүхийг уншиж чадсангүй', 503);
    }
}
