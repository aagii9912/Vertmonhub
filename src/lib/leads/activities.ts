import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Түүхийн нэмэлт лог/уншилт нь best-effort. Хэрэглэгчийн үндсэн бичилт
 * (recordLeadContact) хадгалалт бүрийг шалгаж, хэсэгчилсэн алдааг ил тод буцаана.
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
 * ok=true зөвхөн бүх хадгалалт амжилттай үед. partialSuccess=true бол лидийн цаг
 * шинэчлэгдсэн ч түүх хадгалагдаагүй; дуудагч алдааг харуулж, дэлгэцийн өгөгдлийг шинэчилнэ.
 */
export async function recordLeadContact(
    db: SupabaseClient,
    input: { shopId: string; leadId: string; type: 'note' | 'call'; content: string; nextFollowupAt?: string | null; userId?: string | null; managerName?: string | null },
): Promise<
    { ok: true; activity: LeadActivity }
    | { ok: false; error: string; status: number; partialSuccess?: boolean }
> {
    const { data: lead, error: readError } = await db.from('leads').select('id')
        .eq('id', input.leadId).eq('shop_id', input.shopId).is('deleted_at', null).maybeSingle();
    if (readError) return { ok: false, error: 'Лид шалгахад алдаа гарлаа', status: 500 };
    if (!lead) return { ok: false, error: 'Лид олдсонгүй', status: 404 };

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (input.type === 'call') updates.last_contact_at = now;
    if (input.nextFollowupAt !== undefined) updates.next_followup_at = input.nextFollowupAt;
    const changesLead = Object.keys(updates).length > 1;
    if (changesLead) {
        const { data, error } = await db.from('leads').update(updates)
            .eq('id', input.leadId).eq('shop_id', input.shopId).is('deleted_at', null).select('id').maybeSingle();
        if (error) return { ok: false, error: 'Лидийн холбооны мэдээлэл шинэчлэгдсэнгүй. Бүртгэл хадгалагдаагүй.', status: 500 };
        if (!data) return { ok: false, error: 'Лид олдсонгүй. Бүртгэл хадгалагдаагүй.', status: 404 };
    }

    const activity = await logLeadActivity(db, {
        shopId: input.shopId, leadId: input.leadId, type: input.type, content: input.content,
        meta: input.nextFollowupAt !== undefined ? { next_followup_at: input.nextFollowupAt } : {},
        createdBy: input.userId ?? null, createdByName: input.managerName ?? null,
    });
    if (!activity) {
        return {
            ok: false, status: 500, partialSuccess: changesLead,
            error: changesLead
                ? 'Лидийн холбооны цаг шинэчлэгдсэн боловч дуудлага/тэмдэглэлийн түүх хадгалагдсангүй. Лидээ нээж шалгана уу.'
                : 'Тэмдэглэл хадгалагдсангүй. Дахин оролдоно уу.',
        };
    }
    return { ok: true, activity };
}
