/**
 * Лид үүсгэх нэг дүрэм. Ажилтны оруулсан лид (dashboard, AI, нийтийн формын ажилтны
 * горим) `resolveStaffLead`-ээр төсөл, хариуцагч менежер, төлөв, эх үүсвэрээ тодорхойлно.
 * Бүх суваг (ажилтан, Elysium, Facebook Lead Ads, нийтийн форм) `insertLeadOnce`-оор
 * бичиж, `client_request_id` давтагдвал аль хэдийн хадгалсан лидийг буцаана.
 * `sales_handoff_at`-ийг DB trigger тавина; энд тавихгүй.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ACTIVE_STATUSES, toLeadSource } from '@/lib/leads/labels';
import { resolveActiveManagerName, resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { applyLeadScope, assertProjectManager, canAccessProject, ProjectScopeError, type SalesProjectScope } from '@/lib/sales/project-scope';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import type { LeadSource, LeadStatus } from '@/types/property';

export interface StaffLeadActor {
    userId: string;
    role: string;
    scope: SalesProjectScope;
}

export interface StaffLeadRequest {
    /** Өгөөгүй бол shop-ийн ганц төсөл (shop = төсөл). */
    projectId?: unknown;
    status?: unknown;
    source?: unknown;
    /** Админ өөр идэвхтэй менежерт шууд оноох нэр (бусдад үл хэрэгсэнэ). */
    assignManager?: string | null;
}

export interface ResolvedStaffLead {
    project_id: string;
    status: LeadStatus;
    source: LeadSource;
    sales_manager_name: string | null;
}

export type Failure = { ok: false; status: number; error: string };

/**
 * Төслийг (shop + хэрэглэгчийн хүрээ), идэвхтэй төлвийг, эх үүсвэрийг, хариуцагч менежерийг
 * шалгаж тодорхойлно. Менежер нь үүсгэгчийн roster нэр; админ `assignManager`-аар өөр менежер онооно.
 */
export async function resolveStaffLead(
    db: SupabaseClient,
    shopId: string,
    request: StaffLeadRequest,
    actor: StaffLeadActor,
): Promise<({ ok: true } & ResolvedStaffLead) | Failure> {
    // Shop = төсөл: төсөл заагаагүй бол тухайн shop-ийн ганц төслийг авна.
    const requested = typeof request.projectId === 'string' && request.projectId ? request.projectId : null;
    let projectId = requested ?? '';
    if (!requested) {
        try { projectId = await soleShopProjectId(db, shopId) ?? ''; }
        catch { return { ok: false, status: 503, error: 'Төслийг шалгаж чадсангүй' }; }
    }
    if (!z.uuid().safeParse(projectId).success) return { ok: false, status: 400, error: 'Лидийн төслийг сонгоно уу' };
    if (!canAccessProject(actor.scope, projectId)) return { ok: false, status: 403, error: 'Энэ төсөлд лид үүсгэх эрхгүй' };
    const { data: project, error: projectError } = await db.from('projects').select('id')
        .eq('id', projectId).eq('shop_id', shopId).maybeSingle();
    if (projectError) return { ok: false, status: 503, error: 'Төслийг шалгаж чадсангүй' };
    if (!project) return { ok: false, status: 400, error: 'Төсөл олдсонгүй' };

    if (request.status === 'closed_won' || request.status === 'closed_lost') {
        return { ok: false, status: 400, error: 'Шинэ лидийг идэвхтэй төлөвөөр бүртгэнэ. Гэрээ эсвэл алдсан шалтгаанаа дараа нь бүртгэнэ үү.' };
    }
    const status = (ACTIVE_STATUSES as string[]).includes(request.status as string) ? request.status as LeadStatus : 'new';

    const identity = await resolveManagerIdentity(db, shopId, actor.userId);
    let managerName = identity.isManager ? identity.managerName : null;
    if ((actor.role === 'admin' || actor.role === 'super_admin') && request.assignManager) {
        const manager = await resolveActiveManagerName(db, shopId, request.assignManager);
        if (!manager.ok) return { ok: false, status: manager.status, error: manager.error };
        managerName = manager.managerName;
    }
    if (managerName) {
        try { await assertProjectManager(db, shopId, projectId, managerName); }
        catch (error) {
            if (error instanceof ProjectScopeError) return { ok: false, status: error.status, error: error.message };
            throw error;
        }
    }
    return {
        ok: true,
        project_id: projectId,
        status,
        source: toLeadSource(typeof request.source === 'string' ? request.source : null),
        sales_manager_name: managerName,
    };
}

type LeadRow = Record<string, unknown> & { shop_id: string; project_id?: string | null; client_request_id?: string | null };

export type InsertLeadResult =
    | { ok: true; lead: Record<string, unknown>; duplicate: boolean }
    | { ok: false; conflict: true }
    | { ok: false; conflict: false; error: PostgrestError };

/**
 * Лидийг нэг удаа бичнэ. `client_request_id` өмнө ашиглагдсан бол ижил төслийн лидийг буцааж
 * (`duplicate`), өөр төсөлд ашиглагдсан бол `conflict`. `scope` өгвөл давтан уншилт хүрээндээ үлдэнэ.
 */
export async function insertLeadOnce(
    db: SupabaseClient,
    row: LeadRow,
    options: { scope?: SalesProjectScope; select?: string } = {},
): Promise<InsertLeadResult> {
    const select = options.select ?? '*';
    const requestId = row.client_request_id;
    const existing = async () => {
        let query = db.from('leads').select(select).eq('shop_id', row.shop_id).eq('client_request_id', requestId as string);
        if (options.scope) query = applyLeadScope(query, options.scope);
        return query.maybeSingle<Record<string, unknown>>();
    };
    const replay = (lead: Record<string, unknown> | null): InsertLeadResult | null => {
        if (!lead) return null;
        return (lead.project_id ?? null) === (row.project_id ?? null) ? { ok: true, lead, duplicate: true } : { ok: false, conflict: true };
    };

    if (requestId) {
        const prior = await existing();
        if (prior.error) return { ok: false, conflict: false, error: prior.error };
        const replayed = replay(prior.data);
        if (replayed) return replayed;
    }
    const { data, error } = await db.from('leads').insert(row).select(select).single<Record<string, unknown>>();
    if (!error && data) return { ok: true, lead: data, duplicate: false };
    if (error?.code === '23505' && requestId) {
        const raced = await existing();
        return (!raced.error && replay(raced.data)) || { ok: false, conflict: true };
    }
    return { ok: false, conflict: false, error: error as PostgrestError };
}
