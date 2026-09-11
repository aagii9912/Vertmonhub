import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { logLeadActivity } from '@/lib/leads/activities';

const PatchSchema = z.object({
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    agent_notes: z.string().max(4000).nullable().optional(),
    customer_feedback: z.string().max(4000).nullable().optional(),
    interest_level: z.number().int().min(1).max(5).nullable().optional(),
    /** Үр дүнгийн дараа лидийн дараагийн холбоо барих цаг (заавал биш) */
    next_followup_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * PATCH /api/dashboard/viewings/[id]
 * Уулзалтын төлөв / цаг / тэмдэглэлийг шинэчилнэ (shop-scoped).
 * «Өнөөдөр» дэлгэцийн мөрийн үйлдлүүд (Дууссан, Хойшлуулах) үүнийг дуудна.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const denied = await requireModuleWrite('viewings');
        if (denied) return denied;

        const { id } = await params;
        const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Буруу өгөгдөл', details: parsed.error.flatten() }, { status: 400 });
        }
        const p = parsed.data;
        const updates: Record<string, unknown> = {};
        if (p.status !== undefined) {
            updates.status = p.status;
            updates.completed_at = p.status === 'completed' ? new Date().toISOString() : null;
        }
        if (p.scheduled_at !== undefined) updates.scheduled_at = p.scheduled_at;
        if (p.agent_notes !== undefined) updates.agent_notes = p.agent_notes;
        if (p.customer_feedback !== undefined) updates.customer_feedback = p.customer_feedback;
        if (p.interest_level !== undefined) updates.interest_level = p.interest_level;
        if (!Object.keys(updates).length) {
            return NextResponse.json({ error: 'Өөрчлөх зүйл алга' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('property_viewings')
            .update(updates)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .select('id, status, scheduled_at, completed_at, lead_id, property_id')
            .maybeSingle();
        if (error) return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Уулзалт олдсонгүй' }, { status: 404 });

        // Лидийн түүх + дараагийн алхам (best-effort)
        if (data.lead_id && (p.status !== undefined || p.next_followup_at !== undefined || p.scheduled_at !== undefined)) {
            const uid = await getUserId();
            const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
            const leadUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (p.status === 'completed') leadUpdates.last_contact_at = new Date().toISOString();
            if (p.next_followup_at !== undefined) leadUpdates.next_followup_at = p.next_followup_at;
            if (p.scheduled_at !== undefined) leadUpdates.viewing_scheduled_at = p.scheduled_at;
            // Цуцлагдсан / ирээгүй уулзалт: лид «Уулзалт товлосон»-д гацахгүй — товлосон цагийг
            // цэвэрлэж, статусыг «Холбогдсон» руу буцаана (хаагдсан лидэд хүрэхгүй).
            if (p.status === 'cancelled' || p.status === 'no_show' || p.status === 'completed') {
                const { data: leadRow } = await db.from('leads').select('status').eq('id', data.lead_id).maybeSingle();
                if (p.status !== 'completed') leadUpdates.viewing_scheduled_at = null;
                if (leadRow?.status === 'viewing_scheduled' && p.status !== 'completed') leadUpdates.status = 'contacted';
            }
            await db.from('leads').update(leadUpdates).eq('id', data.lead_id).eq('shop_id', authShop.id);

            if (p.status !== undefined || p.scheduled_at !== undefined) {
                const outcome =
                    p.status === 'completed' ? `Уулзалт болов${p.interest_level ? ` · сонирхол ${p.interest_level}/5` : ''}${p.customer_feedback ? ` · ${p.customer_feedback}` : ''}`
                    : p.status === 'no_show' ? 'Уулзалтад ирээгүй'
                    : p.status === 'cancelled' ? 'Уулзалт цуцлагдав'
                    : p.scheduled_at !== undefined ? 'Уулзалтын цаг өөрчлөгдөв'
                    : 'Уулзалт дахин товлогдов';
                await logLeadActivity(db, {
                    shopId: authShop.id, leadId: data.lead_id, type: 'meeting', createdBy: uid, createdByName: identity?.managerName ?? null,
                    content: outcome,
                    meta: { viewing_id: data.id, status: data.status, scheduled_at: data.scheduled_at },
                });
            }
        }

        return NextResponse.json({ viewing: data });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт шинэчлэхэд алдаа гарлаа');
    }
}
