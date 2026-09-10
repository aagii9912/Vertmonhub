import { NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';

/**
 * GET /api/dashboard/leads/summary
 * Хадгалсан харагдацын (таб) тоонууд — нэг дуудлага, head-only count-ууд.
 *   all · mine · new · meetings (уулзалт товлосон) · active (хаагдаагүй)
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const db = supabaseAdmin();
        const shopId = authShop.id;
        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, shopId, uid) : null;
        const mineName = identity?.managerName ?? null;

        const base = () => db.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).is('deleted_at', null);
        const count = async (q: ReturnType<typeof base>) => {
            const { count: c, error } = await q;
            return error ? 0 : c ?? 0;
        };

        const [all, mine, fresh, meetings, active] = await Promise.all([
            count(base()),
            mineName ? count(base().eq('sales_manager_name', mineName)) : Promise.resolve(0),
            count(base().eq('status', 'new')),
            count(base().eq('status', 'viewing_scheduled')),
            count(base().in('status', ACTIVE_STATUSES)),
        ]);

        return NextResponse.json(
            { all, mine, new: fresh, meetings, active, mineName },
            { headers: { 'Cache-Control': 'private, max-age=15' } },
        );
    } catch (error) {
        return safeErrorResponse(error, 'Лидийн тоолол татахад алдаа гарлаа');
    }
}
