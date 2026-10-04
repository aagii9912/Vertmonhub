import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { LEAD_WORK_QUEUES, workQueueFilter } from '@/lib/leads/work-queue';
import { applyLeadScope, canAccessProject, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/dashboard/leads/summary
 * Хадгалсан харагдацын (таб) тоонууд — нэг дуудлага, head-only count-ууд.
 *   all · mine · new · meetings (уулзалт товлосон) · active (хаагдаагүй)
 */
export const GET = withRoute({ module: 'leads', error: 'Лидийн тоолол татахад алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const db = supabaseAdmin();
    const shopId = authShop.id;
    const scope = await resolveSalesProjectScope(db, shopId);
    const projectId = request?.nextUrl.searchParams.get('project');
    if (projectId && !z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Буруу төсөл' }, { status: 400 });
    if (projectId && !canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төслийн лид харах эрхгүй' }, { status: 403 });
    const uid = await getUserId();
    const identity = uid ? await resolveManagerIdentity(db, shopId, uid) : null;
    const mineName = identity?.managerName ?? null;

    const base = () => {
        let q = applyLeadScope(db.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).is('deleted_at', null), scope);
        if (projectId) q = q.eq('project_id', projectId);
        return q;
    };
    const count = async (q: ReturnType<typeof base>) => {
        const { count: c, error } = await q;
        if (error) throw error; // 0 гэж нуухгүй — бодит алдааг 500-аар мэдэгдэнэ
        return c ?? 0;
    };

    const [all, mine, fresh, meetings, active, queueCounts] = await Promise.all([
        count(base()),
        mineName ? count(base().eq('sales_manager_name', mineName)) : Promise.resolve(0),
        count(base().eq('status', 'new')),
        count(base().eq('status', 'viewing_scheduled')),
        count(base().in('status', ACTIVE_STATUSES)),
        Promise.all(LEAD_WORK_QUEUES.map(q => count(base().or(workQueueFilter(q.key))))),
    ]);

    return NextResponse.json(
        { all, mine, new: fresh, meetings, active, mineName,
            canClaim: !!identity?.isManager && scope.projectIds === null,
            queues: Object.fromEntries(LEAD_WORK_QUEUES.map((q, i) => [q.key, queueCounts[i]])),
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
    );
});
