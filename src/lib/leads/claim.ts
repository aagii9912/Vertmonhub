import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { logLeadActivity } from '@/lib/leads/activities';
import { applyProjectScope, assertProjectManager, type SalesProjectScope } from '@/lib/sales/project-scope';

export interface ClaimLeadInput {
    shopId: string;
    leadId: string;
    userId: string | null;
    /** Хариуцаж авч буй менежерийн roster нэр (идэвхтэй, акаунттай холбогдсон). */
    managerName: string;
    scope: SalesProjectScope;
    /**
     * Эхний холбоо барих цаг. «Хариуцагчгүй» жагсаалтаас авахад заавал (route шалгана);
     * ирсэн уулзалт бүртгэхдээ авахад өгөхгүй — уулзалт өөрөө эхний холбоо (эзэмшигч 2026-11-26).
     */
    nextFollowupAt?: string;
    /** Лидийн түүхэнд үлдэх мөр. */
    activity: { content: string; meta?: Record<string, unknown> };
}

export type ClaimLeadResult =
    | { ok: true; lead: { id: string; project_id: string | null }; activityLogged: boolean }
    | { ok: false; status: number; error: string };

/**
 * Хариуцагчгүй лидийг менежер өөртөө авна (эзэмшигч 2026-10-15: автоматаар хуваарилахгүй).
 * Нэг UPDATE: зөвхөн идэвхтэй, хариуцагчгүй хэвээр байгаа лид (уралдсан claim → 409). Хамт олны лидийг
 * нууна (404). `assertProjectManager`-ийн `ProjectScopeError`, DB уншилтын алдааг throw хийнэ.
 */
export async function claimUnassignedLead(db: SupabaseClient, input: ClaimLeadInput): Promise<ClaimLeadResult> {
    const { shopId, leadId, scope, managerName } = input;
    const { data: lead, error: readError } = await applyProjectScope(db.from('leads').select('id, project_id, sales_manager_name')
        .eq('id', leadId).eq('shop_id', shopId).is('deleted_at', null), scope).maybeSingle();
    if (readError) throw readError;
    // Хамт олны лидийг нууна (404); өөрийнх эсвэл хаагдсан бол доорх UPDATE 409 буцаана.
    const owner = String(lead?.sales_manager_name ?? '').trim();
    if (!lead || (scope.projectIds !== null && owner && owner !== scope.managerName)) {
        return { ok: false, status: 404, error: 'Лид олдсонгүй' };
    }
    await assertProjectManager(db, shopId, lead.project_id, managerName);
    const { data, error } = await applyProjectScope(db.from('leads').update({
        sales_manager_name: managerName,
        ...(input.nextFollowupAt ? { next_followup_at: input.nextFollowupAt } : {}),
        updated_at: new Date().toISOString(),
    }).eq('id', leadId).eq('shop_id', shopId).eq('project_id', lead.project_id).is('deleted_at', null)
        .in('status', ACTIVE_STATUSES).or('sales_manager_name.is.null,sales_manager_name.eq.""'), scope)
        .select('id').maybeSingle();
    if (error) return { ok: false, status: 500, error: 'Лид хариуцаж авахад алдаа гарлаа' };
    if (!data) return { ok: false, status: 409, error: 'Лидийг өөр хүн авсан, хаасан эсвэл олдсонгүй. Жагсаалтаа шинэчилнэ үү.' };
    const activity = await logLeadActivity(db, {
        shopId, leadId, type: 'manager', createdBy: input.userId, createdByName: managerName,
        content: input.activity.content,
        meta: { action: 'claim', to: managerName, ...input.activity.meta },
    });
    return { ok: true, lead: { id: lead.id as string, project_id: (lead.project_id as string | null) ?? null }, activityLogged: !!activity };
}
