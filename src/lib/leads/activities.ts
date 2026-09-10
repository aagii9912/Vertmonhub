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
