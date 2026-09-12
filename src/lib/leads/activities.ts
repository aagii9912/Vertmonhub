import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * lead_activities туслахууд — миграци хийгдээгүй орчинд ЧИМЭЭГҮЙ алгасна
 * (бичилт null буцаана, уншилт хоосон), лидийн үндсэн урсгал хэзээ ч тасрахгүй.
 */

export type LeadActivityType = 'note' | 'call' | 'status' | 'manager' | 'meeting' | 'contract' | 'system';

export interface LeadActivity {
    id: string;
    lead_id: string;
    type: LeadActivityType;
    content: string | null;
    meta: Record<string, unknown>;
    created_by_name: string | null;
    created_at: string;
}

export async function logLeadActivity(
    db: SupabaseClient,
    input: {
        shopId: string;
        leadId: string;
        type: LeadActivityType;
        content?: string | null;
        meta?: Record<string, unknown>;
        createdBy?: string | null;
        createdByName?: string | null;
    },
): Promise<LeadActivity | null> {
    try {
        const { data, error } = await db
            .from('lead_activities')
            .insert({
                shop_id: input.shopId,
                lead_id: input.leadId,
                type: input.type,
                content: input.content ?? null,
                meta: input.meta ?? {},
                created_by: input.createdBy ?? null,
                created_by_name: input.createdByName ?? null,
            })
            .select('id, lead_id, type, content, meta, created_by_name, created_at')
            .single();
        if (error) return null;
        return data as LeadActivity;
    } catch {
        return null;
    }
}

export async function listLeadActivities(db: SupabaseClient, shopId: string, leadId: string, limit = 100): Promise<LeadActivity[]> {
    try {
        const { data, error } = await db
            .from('lead_activities')
            .select('id, lead_id, type, content, meta, created_by_name, created_at')
            .eq('shop_id', shopId)
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) return [];
        return (data || []) as LeadActivity[];
    } catch {
        return [];
    }
}

/**
 * Дуудлага/тэмдэглэл бүртгэх + лидийн last_contact_at / next_followup_at шинэчлэх —
 * API route (`POST /leads/[id]/activities`) ба AI tool (`log_call`, `set_followup`) хоёулаа энд дамжина.
 */
export async function recordLeadContact(
    db: SupabaseClient,
    input: { shopId: string; leadId: string; type: 'note' | 'call'; content: string; nextFollowupAt?: string | null; userId?: string | null; managerName?: string | null },
): Promise<{ activity: LeadActivity | null }> {
    const activity = await logLeadActivity(db, {
        shopId: input.shopId, leadId: input.leadId, type: input.type, content: input.content,
        createdBy: input.userId ?? null, createdByName: input.managerName ?? null,
    });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.type === 'call') updates.last_contact_at = new Date().toISOString();
    if (input.nextFollowupAt !== undefined) updates.next_followup_at = input.nextFollowupAt;
    if (Object.keys(updates).length > 1) await db.from('leads').update(updates).eq('id', input.leadId);
    return { activity };
}
