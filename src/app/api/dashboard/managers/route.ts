import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireAnyModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { z } from 'zod';
import { canAccessProject, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';

/**
 * GET /api/dashboard/managers
 * Тухайн shop-ийн идэвхтэй борлуулалтын менежерүүдийн жагсаалт.
 * sales_managers бүртгэл цорын ганц эх сурвалж: хуучин гэрээ, лидийн нэр
 * идэвхтэй багийн сонгогчид эргэн орохгүй.
 * Хамгаалалт: reports эсвэл leads модулийн эрх.
 */
export async function GET(request?: Request) {
    try {
        const denied = await requireAnyModule(['reports', 'leads']);
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ managers: [] });
        }

        const db = supabaseAdmin();
        const scope = await resolveSalesProjectScope(db, authShop.id);
        const projectId = request ? new URL(request.url).searchParams.get('project') : null;
        if (projectId && !z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Буруу төсөл' }, { status: 400 });
        if (projectId && !canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төслийн менежерүүдийг харах эрхгүй' }, { status: 403 });
        const memberships = await fetchAllRows<{ manager_name: string; project_id: string }>((from, to) => {
            let q = db.from('sales_manager_projects').select('manager_name, project_id').eq('shop_id', authShop.id);
            if (projectId) q = q.eq('project_id', projectId);
            else if (scope.projectIds !== null) q = q.in('project_id', scope.projectIds);
            return q.order('manager_name').order('project_id').range(from, to);
        });
        const projectsByManager = new Map<string, string[]>();
        for (const row of memberships) {
            const ids = projectsByManager.get(row.manager_name) || [];
            ids.push(row.project_id);
            projectsByManager.set(row.manager_name, ids);
        }
        const { data, error } = await db.from('sales_managers')
            .select('name, user_id')
            .eq('shop_id', authShop.id)
            .eq('is_active', true);
        if (error) throw error;

        const managers = (data || [])
            .filter((m) => !!m.name)
            .filter((m) => (!projectId && scope.projectIds === null) || projectsByManager.has(m.name))
            .map((m) => ({
                name: m.name,
                user_id: m.user_id ?? null,
                is_active: true,
                hasAccount: !!m.user_id,
                assignable: projectsByManager.has(m.name),
                project_ids: projectsByManager.get(m.name) || [],
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'mn'));

        return NextResponse.json({ managers });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Менежерийн жагсаалт унших алдаа');
    }
}
