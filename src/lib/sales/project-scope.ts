import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { matchRosterEntry, type RosterEntry } from '@/lib/sales/manager-identity';
import { fetchAllRows } from '@/lib/utils/pagination';

export interface SalesProjectScope {
    /** null = байгууллагын эрх; [] = төсөлд холбогдоогүй менежер. */
    projectIds: string[] | null;
    managerName: string | null;
}

export const UNRESTRICTED_SALES_SCOPE: SalesProjectScope = { projectIds: null, managerName: null };

export class ProjectScopeError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
}

/** Зөвхөн серверийн баталсан actor өгнө; хүсэлтийн body-оос авч болохгүй. */
export async function resolveSalesProjectScope(
    db: SupabaseClient,
    shopId: string,
    actor?: { userId: string; role: string },
): Promise<SalesProjectScope> {
    if (!actor) {
        const [userId, perms] = await Promise.all([getUserId(), resolvePermissions()]);
        if (!userId || !perms) throw new ProjectScopeError(401, 'Нэвтрэх шаардлагатай');
        actor = { userId, role: perms.role };
    }
    if (actor.role === 'super_admin' || actor.role === 'admin') return { projectIds: null, managerName: null };
    const [profile, roster] = await Promise.all([
        db.from('user_profiles').select('full_name').eq('id', actor.userId).maybeSingle(),
        fetchAllRows<RosterEntry>((from, to) => db.from('sales_managers').select('name,user_id,is_active')
            .eq('shop_id', shopId).order('name').range(from, to)),
    ]).catch(() => { throw new ProjectScopeError(503, 'Менежерийн харьяаллыг шалгаж чадсангүй'); });
    if (profile.error) throw new ProjectScopeError(503, 'Менежерийн харьяаллыг шалгаж чадсангүй');
    const entry = matchRosterEntry(roster, actor.userId, profile.data?.full_name || null);
    const hasActiveLink = roster.some(row => row.user_id === actor.userId && row.is_active);
    if (actor.role !== 'sales_manager' && !entry?.is_active && !hasActiveLink) return { projectIds: null, managerName: null };
    // Өөрөө засдаг profile нэрээр дансгүй legacy менежерийн лидийг авч болохгүй.
    if (!entry?.is_active || entry.user_id !== actor.userId) return { projectIds: [], managerName: null };
    try {
        const memberships = await fetchAllRows<{ project_id: string }>((from, to) => db.from('sales_manager_projects')
            .select('project_id').eq('shop_id', shopId).eq('manager_name', entry.name)
            .order('project_id').range(from, to));
        return { projectIds: memberships.map(row => row.project_id), managerName: entry.name };
    } catch {
        throw new ProjectScopeError(503, 'Менежерийн төслийн харьяаллыг шалгаж чадсангүй');
    }
}

export function canAccessProject(scope: SalesProjectScope, projectId: string | null | undefined): boolean {
    return scope.projectIds === null || (!!projectId && scope.projectIds.includes(projectId));
}

type ScopeQuery = { in(column: string, values: string[]): ScopeQuery; eq(column: string, value: string): ScopeQuery };

export function applyProjectScope<T>(
    query: T, scope: SalesProjectScope, column = 'project_id',
): T {
    return scope.projectIds === null ? query : (query as ScopeQuery).in(column, scope.projectIds) as T;
}

export function applyLeadScope<T>(
    query: T, scope: SalesProjectScope, projectColumn = 'project_id', managerColumn = 'sales_manager_name',
): T {
    const scoped = applyProjectScope(query, scope, projectColumn);
    return scope.projectIds === null ? scoped : (scoped as ScopeQuery).eq(managerColumn, scope.managerName || '') as T;
}

export async function assertProjectManager(db: SupabaseClient, shopId: string, projectId: string | null | undefined, managerName: string) {
    if (!projectId) throw new ProjectScopeError(400, 'Менежер хуваарилахын өмнө лидийн төслийг сонгоно уу');
    const [membership, manager] = await Promise.all([
        db.from('sales_manager_projects').select('project_id').eq('shop_id', shopId)
            .eq('project_id', projectId).eq('manager_name', managerName).maybeSingle(),
        db.from('sales_managers').select('name').eq('shop_id', shopId).eq('name', managerName).eq('is_active', true).maybeSingle(),
    ]);
    if (membership.error || manager.error) throw new ProjectScopeError(503, 'Менежерийн төслийн харьяаллыг шалгаж чадсангүй');
    if (!membership.data || !manager.data) throw new ProjectScopeError(400, 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу');
}
