import { applyLeadScope, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ubDayRange } from '@/lib/utils/date';
import { resolvePermissions } from '@/lib/auth/require-permission';

/**
 * GET /api/dashboard/nav-counts
 *
 * Sidebar болон гар утасны табын амьд тоонууд — нэг хөнгөн дуудлага:
 *   leads    — шинэ (status = new) лид
 *   meetings — өнөөдрийн товлосон уулзалт
 *
 * Хоёр тоолол зэрэг явна; аль нэг нь бүтэлгүйтвэл тэр талбар undefined
 * буцна — sidebar тоогүй ч бүрэн ажиллана (миграци хийгдээгүй орчинд ч).
 */
export async function GET() {
    try {
        const access = await resolvePermissions();
        if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const canRead = (moduleName: string) => access.role === 'super_admin' || access.permissions.modules.includes(moduleName);
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const scope = await resolveSalesProjectScope(db, authShop.id);
        const shopId = authShop.id;

        // «Өнөөдөр» — Улаанбаатарын өдрийн хилээр (сервер UTC)
        const { start: dayStart, end: dayEnd } = ubDayRange();

        const [leads, meetings] = await Promise.all([
            canRead('leads') ? applyLeadScope(db
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('status', 'new')
                .is('deleted_at', null), scope)
                .then((r) => (r.error ? undefined : r.count ?? 0)) : undefined,
            canRead('viewings') ? applyLeadScope(db
                .from('property_viewings')
                .select(scope.projectIds === null ? 'id' : 'id,leads!inner(project_id,sales_manager_name)', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('status', 'scheduled')
                .is('deleted_at', null)
                .gte('scheduled_at', dayStart.toISOString())
                .lt('scheduled_at', dayEnd.toISOString()), scope, 'leads.project_id', 'leads.sales_manager_name')
                .then((r) => (r.error ? undefined : r.count ?? 0)) : undefined,
        ]);

        // no-store: react-query өөрөө cache-лэнэ; browser HTTP cache нь invalidation-ийг
        // хүчингүй болгож, shop сольсны дараа өмнөх shop-ийн тоог харуулдаг байв.
        return NextResponse.json(
            { leads, meetings },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Тоолол татахад алдаа гарлаа');
    }
}
