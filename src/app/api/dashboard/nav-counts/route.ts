import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ubDayRange } from '@/lib/utils/date';

/**
 * GET /api/dashboard/nav-counts
 *
 * Sidebar болон гар утасны табын амьд тоонууд — нэг хөнгөн дуудлага:
 *   leads    — шинэ (status = new) лид
 *   meetings — өнөөдрийн товлосон уулзалт
 *   inbox    — AI-г түр зогсоож хүн хариулж буй харилцагч (ai_paused_until > now)
 *
 * Гурван тоолол зэрэг явна; аль нэг нь бүтэлгүйтвэл тэр талбар undefined
 * буцна — sidebar тоогүй ч бүрэн ажиллана (миграци хийгдээгүй орчинд ч).
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const shopId = authShop.id;

        // «Өнөөдөр» — Улаанбаатарын өдрийн хилээр (сервер UTC)
        const { start: dayStart, end: dayEnd } = ubDayRange();
        const nowIso = new Date().toISOString();

        const [leads, meetings, inbox] = await Promise.all([
            db
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('status', 'new')
                .is('deleted_at', null)
                .then((r) => (r.error ? undefined : r.count ?? 0)),
            db
                .from('property_viewings')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('status', 'scheduled')
                .is('deleted_at', null)
                .gte('scheduled_at', dayStart.toISOString())
                .lt('scheduled_at', dayEnd.toISOString())
                .then((r) => (r.error ? undefined : r.count ?? 0)),
            db
                .from('customers')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .gt('ai_paused_until', nowIso)
                .then((r) => (r.error ? undefined : r.count ?? 0)),
        ]);

        // no-store: react-query өөрөө cache-лэнэ; browser HTTP cache нь invalidation-ийг
        // хүчингүй болгож, shop сольсны дараа өмнөх shop-ийн тоог харуулдаг байв.
        return NextResponse.json(
            { leads, meetings, inbox },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (error) {
        return safeErrorResponse(error, 'Тоолол татахад алдаа гарлаа');
    }
}
