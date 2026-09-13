/**
 * Уулзалт (property_viewings) — API route ба AI tool хоёулаа ЭНЭ функцуудаар дамжина,
 * ингэснээр гараар ба AI-аар хийсэн өөрчлөлт ижил side-effect (лидийн статус,
 * last_contact_at, next_followup_at, lead_activities) үүсгэнэ.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logLeadActivity } from '@/lib/leads/activities';
import { z } from 'zod';
import { ubDayRange } from '@/lib/utils/date';
import { normalizePhone } from '@/lib/utils/phone';

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

export type ServiceResult<T> = { ok: true; data: T; warning?: string } | { ok: false; error: string; status: number; partialSuccess?: boolean; leadId?: string };

export const CreateViewingSchema = z.object({
    lead_id: z.string().uuid().nullish(),
    customer_name: z.string().trim().min(1).max(200).nullish(),
    customer_phone: z.string().trim().max(30).nullish(),
    property_id: z.string().uuid().nullish(),
    scheduled_at: z.string().datetime({ offset: true }).nullish(),
    meeting_type: z.enum(['new_customer', 'repeat_customer', 'existing_buyer']).default('new_customer'),
    notes: z.string().trim().max(4000).nullish(),
    walk_in: z.boolean().default(false),
    interest_level: z.number().int().min(1).max(5).nullish(),
    feedback: z.string().trim().max(4000).nullish(),
}).refine(p => p.walk_in || !!p.scheduled_at, { message: 'Уулзалтын огноо, цаг шаардлагатай' })
    .refine(p => !!(p.lead_id || p.customer_name || p.customer_phone), { message: 'Лид эсвэл харилцагчийн мэдээлэл шаардлагатай' });

/** Баталгаажуулах мэдээллийг зөвхөн уншина; preview хэзээ ч лид/уулзалт үүсгэхгүй. */
export async function resolveViewingInput(db: SupabaseClient, shopId: string, input: unknown) {
    const parsed = CreateViewingSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: 'Уулзалтын мэдээлэл, огноо/цагийг шалгана уу', status: 400 };
    const p = parsed.data;
    let property: { id: string; name: string } | null = null;
    if (p.property_id) {
        const result = await db.from('properties').select('id, name').eq('id', p.property_id).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (result.error) return { ok: false as const, error: 'Байр шалгахад алдаа гарлаа', status: 500 };
        if (!result.data) return { ok: false as const, error: 'Байр олдсонгүй', status: 404 };
        property = result.data;
    }
    let lead: { id: string; status: string; customer_name: string | null } | null = null;
    const base = () => db.from('leads').select('id, status, customer_name, customer_phone').eq('shop_id', shopId).is('deleted_at', null);
    if (p.lead_id) {
        const result = await base().eq('id', p.lead_id).maybeSingle();
        if (result.error) return { ok: false as const, error: 'Лид шалгахад алдаа гарлаа', status: 500 };
        if (!result.data) return { ok: false as const, error: 'Лид олдсонгүй', status: 404 };
        lead = result.data;
    } else if (p.customer_name || p.customer_phone) {
        const phone = normalizePhone(p.customer_phone);
        if (p.customer_phone && (!phone || phone.length < 8)) return { ok: false as const, error: 'Утасны дугаараа бүтнээр оруулна уу', status: 400 };
        // Бүтэн дугаар өгсөн бол ижил нэртэй өөр хүнийг автоматаар сонгохгүй.
        const query = phone
            ? base().ilike('customer_phone', `%${phone.split('').join('%')}%`)
            : base().ilike('customer_name', p.customer_name!.replace(/[\\%_]/g, '\\$&'));
        const result = await query.limit(phone ? 51 : 2);
        if (result.error) return { ok: false as const, error: 'Лид хайхад алдаа гарлаа', status: 500 };
        // SQL ilike нь зөвхөн нэр дэвшигч олно; улсын код/зайнаас үүссэн
        // цифрийн дарааллыг өөр хүний бүтэн утас гэж андуурч холбохгүй.
        const matches = phone ? (result.data ?? []).filter(row => normalizePhone(row.customer_phone) === phone) : result.data ?? [];
        if ((result.data?.length ?? 0) > 50 || matches.length > 1) return { ok: false as const, error: 'Олон лид таарлаа. Лидээ сонгоод уулзалт товлоно уу.', status: 409 };
        lead = matches[0] ?? null;
        if (!lead && !p.customer_name) return { ok: false as const, error: 'Энэ утсаар лид олдсонгүй. Шинэ харилцагчийн нэрийг оруулна уу.', status: 400 };
    }
    return { ok: true as const, data: { input: p, lead, property } };
}

/** UI ба AI-ийн уулзалт үүсгэх нэгдсэн урсгал. Хэсэгчилсэн хадгалалтыг ил тод буцаана. */
export async function createViewing(db: SupabaseClient, shopId: string, input: unknown, actor: Actor): Promise<ServiceResult<{ viewing: { id: string; scheduled_at: string; status: string }; lead_id: string | null }>> {
    const resolved = await resolveViewingInput(db, shopId, input);
    if (!resolved.ok) return resolved;
    const { input: p, property } = resolved.data;
    let lead = resolved.data.lead;
    let createdLead = false;
    if (!lead && p.customer_name) {
        const result = await db.from('leads').insert({ shop_id: shopId, customer_name: p.customer_name,
            customer_phone: p.customer_phone || null, status: 'new', source: 'meeting', sales_manager_name: actor.managerName,
        }).select('id, status, customer_name').single();
        if (result.error || !result.data) return { ok: false, error: 'Лид үүсгэхэд алдаа гарлаа', status: 500 };
        lead = result.data;
        createdLead = true;
    }
    const now = new Date().toISOString();
    const scheduledAt = p.walk_in ? now : p.scheduled_at!;
    const { data: viewing, error } = await db.from('property_viewings').insert({
        shop_id: shopId, lead_id: lead?.id ?? null, property_id: property?.id ?? null,
        scheduled_at: scheduledAt, status: p.walk_in ? 'completed' : 'scheduled', meeting_type: p.meeting_type,
        agent_notes: p.notes || null, sales_manager_name: actor.managerName, completed_at: p.walk_in ? now : null,
        interest_level: p.walk_in ? p.interest_level ?? null : null, customer_feedback: p.walk_in ? p.feedback || null : null,
    }).select('id, scheduled_at, status').single();
    if (error || !viewing) return { ok: false, status: 500, partialSuccess: createdLead, leadId: lead?.id,
        error: createdLead ? 'Лид үүссэн боловч уулзалт хадгалагдсангүй. Лидээ нээгээд уулзалтаа товлоно уу.' : 'Уулзалт хадгалсныг баталгаажуулж чадсангүй. Жагсаалтаа шалгана уу.' };
    let warning: string | undefined;
    if (lead) {
        const updates: Record<string, unknown> = { updated_at: now };
        if (p.walk_in) updates.last_contact_at = now;
        else updates.viewing_scheduled_at = scheduledAt;
        if (p.walk_in && lead.status === 'new') updates.status = 'contacted';
        if (!p.walk_in && ['new', 'contacted'].includes(lead.status)) updates.status = 'viewing_scheduled';
        let updateQuery = db.from('leads').update(updates).eq('id', lead.id).eq('shop_id', shopId).is('deleted_at', null);
        if (updates.status) updateQuery = updateQuery.eq('status', lead.status);
        const result = await updateQuery.select('id').maybeSingle();
        const activity = await logLeadActivity(db, { shopId, leadId: lead.id, type: 'meeting',
            createdBy: actor.userId, createdByName: actor.managerName,
            content: `${p.walk_in ? 'Ирсэн уулзалт бүртгэв' : 'Уулзалт товлов'}${property ? ` · ${property.name}` : ''}`,
            meta: { viewing_id: viewing.id, scheduled_at: scheduledAt, walk_in: p.walk_in },
        });
        if (result.error || !result.data || !activity) warning = 'Уулзалт хадгалагдсан. Лидийн төлөв эсвэл үйл ажиллагааны түүх бүрэн шинэчлэгдсэнгүй. Уулзалтыг дахин үүсгэлгүй лидээ шалгана уу.';
    }
    return { ok: true, data: { viewing, lead_id: lead?.id ?? null }, warning };
}

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
        const res = await db.from('property_viewings').select('id, status, scheduled_at, lead_id, property_id').eq('id', viewingId).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (res.error) return { ok: false, error: 'Уулзалт шалгахад алдаа гарлаа', status: 500 };
        data = res.data;
    }
    if (!data) return { ok: false, error: 'Уулзалт олдсонгүй', status: 404 };

    // Үндсэн уулзалт хадгалагдсан бол дараах алдааг хэсэгчилсэн хадгалалт гэж ил тод мэдээлнэ.
    const viewingSaved = Object.keys(updates).length > 0;
    const partial = (): ServiceResult<typeof data & {}> => viewingSaved
        ? { ok: true, data, warning: 'Уулзалтын өөрчлөлт хадгалагдсан. Лидийн дараагийн алхам эсвэл түүх бүрэн шинэчлэгдсэнгүй. Уулзалтыг дахин бүртгэлгүй лидээ шалгана уу.' }
        : { ok: false, error: 'Лидийн дараагийн алхам хадгалагдсангүй. Дахин оролдоно уу.', status: 500 };
    if (p.next_followup_at !== undefined && !data.lead_id) return partial();
    if (data.lead_id && (p.status !== undefined || p.next_followup_at !== undefined || p.scheduled_at !== undefined)) {
        try {
            const leadResult = await db.from('leads').select('status').eq('id', data.lead_id).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
            if (leadResult.error || !leadResult.data) return partial();
            const leadUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (p.status === 'completed') leadUpdates.last_contact_at = new Date().toISOString();
            if (p.next_followup_at !== undefined) leadUpdates.next_followup_at = p.next_followup_at;
            if (p.scheduled_at !== undefined) leadUpdates.viewing_scheduled_at = p.scheduled_at;
            if (p.status === 'cancelled' || p.status === 'no_show') {
                leadUpdates.viewing_scheduled_at = null;
                if (leadResult.data.status === 'viewing_scheduled') leadUpdates.status = 'contacted';
            }
            let leadQuery = db.from('leads').update(leadUpdates).eq('id', data.lead_id).eq('shop_id', shopId).is('deleted_at', null);
            // Уншсаны дараа хаагдсан лидийг өмнөх шат руу буцааж болохгүй.
            if (leadUpdates.status !== undefined) leadQuery = leadQuery.eq('status', leadResult.data.status);
            const leadWrite = await leadQuery.select('id').maybeSingle();
            let historySaved = true;
            if (p.status !== undefined || p.scheduled_at !== undefined) {
                const outcome =
                    p.status === 'completed' ? `Уулзалт болов${p.interest_level ? ` · сонирхол ${p.interest_level}/5` : ''}${p.customer_feedback ? ` · ${p.customer_feedback}` : ''}`
                    : p.status === 'no_show' ? 'Уулзалтад ирээгүй'
                    : p.status === 'cancelled' ? 'Уулзалт цуцлагдав'
                    : p.scheduled_at !== undefined ? 'Уулзалтын цаг өөрчлөгдөв'
                    : 'Уулзалт дахин товлогдов';
                historySaved = !!(await logLeadActivity(db, {
                    shopId, leadId: data.lead_id, type: 'meeting', createdBy: actor.userId, createdByName: actor.managerName,
                    content: outcome, meta: { viewing_id: data.id, status: data.status, scheduled_at: data.scheduled_at },
                }));
            }
            if (leadWrite.error || !leadWrite.data || !historySaved) return partial();
        } catch { return partial(); }
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
    const { start: dayStart, end: dayEnd } = ubDayRange(now);
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
