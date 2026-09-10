import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logLeadActivity } from '@/lib/leads/activities';

/**
 * GET /api/dashboard/viewings?range=today|upcoming|past|all&status=&manager=&lead=
 * Уулзалтын жагсаалт (shop-scoped, зөөлөн устгасныг хасна) + лид/байрны нэр.
 * v1-д хуудас browser supabase-аар шууд уншдаг байсан; v2-т нэг API.
 */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const range = sp.get('range') || 'upcoming';
        const status = sp.get('status');
        const manager = sp.get('manager');
        const lead = sp.get('lead');
        const limit = Math.min(500, Math.max(1, Number(sp.get('limit')) || 300));

        const db = supabaseAdmin();
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

        let q = db
            .from('property_viewings')
            .select('*, leads(id, customer_name, customer_phone, status), properties(id, name, district)')
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .limit(limit);

        if (range === 'today') q = q.gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).order('scheduled_at', { ascending: true });
        else if (range === 'upcoming') q = q.gte('scheduled_at', dayStart.toISOString()).order('scheduled_at', { ascending: true });
        else if (range === 'past') q = q.lt('scheduled_at', dayStart.toISOString()).order('scheduled_at', { ascending: false });
        else q = q.order('scheduled_at', { ascending: false });

        if (status && status !== 'all') q = q.eq('status', status);
        if (manager && manager !== 'all') q = q.eq('sales_manager_name', manager);
        if (lead) q = q.eq('lead_id', lead);

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: 'Уулзалт татахад алдаа гарлаа' }, { status: 500 });

        const viewings = (data || []).map((v: Record<string, unknown>) => {
            const { leads, properties, ...rest } = v as Record<string, unknown> & { leads?: unknown; properties?: unknown };
            return { ...rest, lead: leads ?? null, property: properties ?? null };
        });

        // Табын тоонууд (нэг дуудлагаар) — head count, зөөлөн устгасныг хасна
        const base = () => db.from('property_viewings').select('id', { count: 'exact', head: true }).eq('shop_id', authShop.id).is('deleted_at', null);
        const cnt = async (x: ReturnType<typeof base>) => { const r = await x; return r.error ? 0 : r.count ?? 0; };
        const [today, upcoming, past] = await Promise.all([
            cnt(base().gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).eq('status', 'scheduled')),
            cnt(base().gte('scheduled_at', dayStart.toISOString()).eq('status', 'scheduled')),
            cnt(base().lt('scheduled_at', dayStart.toISOString())),
        ]);

        return NextResponse.json({ viewings, counts: { today, upcoming, past } });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт татахад алдаа гарлаа');
    }
}

const CreateSchema = z.object({
    lead_id: z.string().uuid().nullish(),
    customer_name: z.string().trim().max(200).nullish(),
    customer_phone: z.string().trim().max(30).nullish(),
    property_id: z.string().uuid().nullish(),
    scheduled_at: z.string().datetime({ offset: true }).nullish(),
    meeting_type: z.enum(['new_customer', 'repeat_customer', 'existing_buyer']).default('new_customer'),
    notes: z.string().trim().max(4000).nullish(),
    /** Талбай дээр ирсэн уулзалт — шууд «болсон» гэж бүртгэнэ */
    walk_in: z.boolean().default(false),
    interest_level: z.number().int().min(1).max(5).nullish(),
    feedback: z.string().trim().max(4000).nullish(),
});

/**
 * POST /api/dashboard/viewings
 * Уулзалт товлох / ирсэн уулзалт бүртгэх. Лид өгөөгүй бол нэрээр олох эсвэл
 * шинээр үүсгэнэ; хариуцагч менежерийг СЕРВЕР дээр тамгална; лидийн статус
 * viewing_scheduled болж, түүхэнд бичигдэнэ.
 */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('viewings');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return NextResponse.json({ error: 'Буруу өгөгдөл', details: parsed.error.flatten() }, { status: 400 });
        const p = parsed.data;

        const db = supabaseAdmin();
        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
        const managerName = identity?.managerName ?? null;

        // 1) Лид
        let leadId = p.lead_id ?? null;
        if (leadId) {
            const { data: l } = await db.from('leads').select('id').eq('id', leadId).eq('shop_id', authShop.id).is('deleted_at', null).maybeSingle();
            if (!l) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });
        } else if (p.customer_name) {
            const digits = (p.customer_phone || '').replace(/\D/g, '');
            let found: { id: string } | null = null;
            if (digits.length >= 6) {
                const chunks = digits.match(/.{1,4}/g) ?? [digits];
                const { data } = await db.from('leads').select('id').eq('shop_id', authShop.id).is('deleted_at', null).ilike('customer_phone', `%${chunks.join('%')}%`).limit(1);
                found = data?.[0] ?? null;
            }
            if (!found) {
                const { data } = await db.from('leads').select('id').eq('shop_id', authShop.id).is('deleted_at', null).ilike('customer_name', p.customer_name).limit(1);
                found = data?.[0] ?? null;
            }
            if (found) leadId = found.id;
            else {
                const { data: created, error } = await db
                    .from('leads')
                    .insert({
                        shop_id: authShop.id,
                        customer_name: p.customer_name,
                        customer_phone: p.customer_phone || null,
                        status: p.walk_in ? 'contacted' : 'viewing_scheduled',
                        source: 'meeting',
                        sales_manager_name: managerName,
                    })
                    .select('id')
                    .single();
                if (error) return NextResponse.json({ error: 'Лид үүсгэхэд алдаа гарлаа' }, { status: 500 });
                leadId = created.id;
            }
        }

        // 2) Уулзалт
        const nowIso = new Date().toISOString();
        const scheduledIso = p.walk_in ? nowIso : p.scheduled_at || nowIso;
        const insert = {
            shop_id: authShop.id,
            lead_id: leadId,
            property_id: p.property_id || null,
            scheduled_at: scheduledIso,
            status: p.walk_in ? 'completed' : 'scheduled',
            meeting_type: p.meeting_type,
            agent_notes: p.notes || null,
            sales_manager_name: managerName,
            completed_at: p.walk_in ? nowIso : null,
            interest_level: p.walk_in ? p.interest_level ?? null : null,
            customer_feedback: p.walk_in ? p.feedback || null : null,
        };
        const { data: viewing, error } = await db.from('property_viewings').insert(insert).select('id, scheduled_at, status').single();
        if (error) return NextResponse.json({ error: 'Уулзалт үүсгэхэд алдаа гарлаа' }, { status: 500 });

        // 3) Лидийн төлөв + түүх (best-effort)
        if (leadId) {
            const { data: lead } = await db.from('leads').select('status').eq('id', leadId).maybeSingle();
            const closed = lead && ['closed_won', 'closed_lost'].includes(lead.status);
            const leadUpdates: Record<string, unknown> = { updated_at: nowIso };
            if (!p.walk_in) leadUpdates.viewing_scheduled_at = scheduledIso;
            if (p.walk_in) leadUpdates.last_contact_at = nowIso;
            if (!closed && !p.walk_in && lead && ['new', 'contacted'].includes(lead.status)) leadUpdates.status = 'viewing_scheduled';
            await db.from('leads').update(leadUpdates).eq('id', leadId);

            let propName: string | null = null;
            if (p.property_id) {
                const { data: prop } = await db.from('properties').select('name').eq('id', p.property_id).maybeSingle();
                propName = prop?.name ?? null;
            }
            await logLeadActivity(db, {
                shopId: authShop.id, leadId, type: 'meeting', createdBy: uid, createdByName: managerName,
                content: p.walk_in ? `Ирсэн уулзалт бүртгэв${propName ? ` · ${propName}` : ''}` : `Уулзалт товлов${propName ? ` · ${propName}` : ''}`,
                meta: { viewing_id: viewing.id, scheduled_at: scheduledIso, walk_in: p.walk_in },
            });
        }

        return NextResponse.json({ viewing, lead_id: leadId }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт үүсгэхэд алдаа гарлаа');
    }
}
