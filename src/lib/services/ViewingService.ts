/**
 * Уулзалт (property_viewings) — API route ба AI tool хоёулаа ЭНЭ функцуудаар дамжина,
 * ингэснээр гараар ба AI-аар хийсэн өөрчлөлт ижил side-effect (лидийн статус,
 * last_contact_at, next_followup_at, lead_activities) үүсгэнэ.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logLeadActivity } from '@/lib/leads/activities';

export interface Actor {
    userId: string | null;
    managerName: string | null;
}

export interface ViewingPatch {
    status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    scheduled_at?: string;
    agent_notes?: string | null;
    customer_feedback?: string | null;
    interest_level?: number | null;
    next_followup_at?: string | null;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function updateViewing(db: SupabaseClient, shopId: string, viewingId: string, p: ViewingPatch, actor: Actor): Promise<ServiceResult<{ id: string; status: string; scheduled_at: string; lead_id: string | null; property_id: string | null }>> {
    const updates: Record<string, unknown> = {};
    if (p.status !== undefined) {
        updates.status = p.status;
        updates.completed_at = p.status === 'completed' ? new Date().toISOString() : null;
    }
    if (p.scheduled_at !== undefined) updates.scheduled_at = p.scheduled_at;
    if (p.agent_notes !== undefined) updates.agent_notes = p.agent_notes;
    if (p.customer_feedback !== undefined) updates.customer_feedback = p.customer_feedback;
    if (p.interest_level !== undefined) updates.interest_level = p.interest_level;
    if (!Object.keys(updates).length && p.next_followup_at === undefined) return { ok: false, error: 'Өөрчлөх зүйл алга', status: 400 };

    let data: { id: string; status: string; scheduled_at: string; lead_id: string | null; property_id: string | null } | null = null;
    if (Object.keys(updates).length) {
        const res = await db.from('property_viewings').update(updates).eq('id', viewingId).eq('shop_id', shopId).is('deleted_at', null)
            .select('id, status, scheduled_at, completed_at, lead_id, property_id').maybeSingle();
        if (res.error) return { ok: false, error: 'Шинэчлэхэд алдаа гарлаа', status: 500 };
        data = res.data;
    } else {
        const res = await db.from('property_viewings').select('id, status, scheduled_at, lead_id, property_id').eq('id', viewingId).eq('shop_id', shopId).maybeSingle();
        data = res.data;
    }
    if (!data) return { ok: false, error: 'Уулзалт олдсонгүй', status: 404 };

    // Лидийн түүх + дараагийн алхам (best-effort)
    if (data.lead_id && (p.status !== undefined || p.next_followup_at !== undefined || p.scheduled_at !== undefined)) {
        const leadUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (p.status === 'completed') leadUpdates.last_contact_at = new Date().toISOString();
        if (p.next_followup_at !== undefined) leadUpdates.next_followup_at = p.next_followup_at;
        if (p.scheduled_at !== undefined) leadUpdates.viewing_scheduled_at = p.scheduled_at;
        // Цуцлагдсан / ирээгүй уулзалт: лид «Уулзалт товлосон»-д гацахгүй — товлосон цагийг цэвэрлэж,
        // статусыг «Холбогдсон» руу буцаана (хаагдсан лидэд хүрэхгүй).
        if (p.status === 'cancelled' || p.status === 'no_show') {
            const { data: leadRow } = await db.from('leads').select('status').eq('id', data.lead_id).maybeSingle();
            leadUpdates.viewing_scheduled_at = null;
            if (leadRow?.status === 'viewing_scheduled') leadUpdates.status = 'contacted';
        }
        await db.from('leads').update(leadUpdates).eq('id', data.lead_id).eq('shop_id', shopId);

        if (p.status !== undefined || p.scheduled_at !== undefined) {
            const outcome =
                p.status === 'completed' ? `Уулзалт болов${p.interest_level ? ` · сонирхол ${p.interest_level}/5` : ''}${p.customer_feedback ? ` · ${p.customer_feedback}` : ''}`
                : p.status === 'no_show' ? 'Уулзалтад ирээгүй'
                : p.status === 'cancelled' ? 'Уулзалт цуцлагдав'
                : p.scheduled_at !== undefined ? 'Уулзалтын цаг өөрчлөгдөв'
                : 'Уулзалт дахин товлогдов';
            await logLeadActivity(db, {
                shopId, leadId: data.lead_id, type: 'meeting', createdBy: actor.userId, createdByName: actor.managerName,
                content: outcome,
                meta: { viewing_id: data.id, status: data.status, scheduled_at: data.scheduled_at },
            });
        }
    }
    return { ok: true, data };
}

export interface ListViewingsArgs {
    range?: 'today' | 'upcoming' | 'past' | 'all';
    status?: string;
    manager?: string;
    leadId?: string;
    limit?: number;
}

/** Уулзалтын жагсаалт (лид + байр join). Асиа/Улаанбаатар өдрийн хилээр «өнөөдөр»-ийг тооцно. */
export async function listViewings(db: SupabaseClient, shopId: string, a: ListViewingsArgs) {
    let q = db.from('property_viewings')
        .select('id, scheduled_at, status, meeting_type, interest_level, agent_notes, customer_feedback, sales_manager_name, leads(id, customer_name, customer_phone, status), properties(id, name, district)')
        .eq('shop_id', shopId).is('deleted_at', null);
    const now = new Date();
    const ubOffsetMs = 8 * 60 * 60 * 1000;
    const ubDay = new Date(now.getTime() + ubOffsetMs);
    const dayStart = new Date(Date.UTC(ubDay.getUTCFullYear(), ubDay.getUTCMonth(), ubDay.getUTCDate()) - ubOffsetMs);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const range = a.range || 'upcoming';
    if (range === 'today') q = q.gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).order('scheduled_at');
    else if (range === 'upcoming') q = q.gte('scheduled_at', now.toISOString()).order('scheduled_at');
    else if (range === 'past') q = q.lt('scheduled_at', now.toISOString()).order('scheduled_at', { ascending: false });
    else q = q.order('scheduled_at', { ascending: false });
    if (a.status) q = q.eq('status', a.status);
    if (a.manager) q = q.ilike('sales_manager_name', `%${a.manager}%`);
    if (a.leadId) q = q.eq('lead_id', a.leadId);
    const { data, error } = await q.limit(Math.min(a.limit || 20, 100));
    if (error) return { error: `Уулзалт унших алдаа: ${error.message}` };
    return { viewings: data || [] };
}
