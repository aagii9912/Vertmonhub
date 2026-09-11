import { NextRequest, NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { requireModuleWrite, requireModule } from '@/lib/auth/require-permission';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logLeadActivity, listLeadActivities } from '@/lib/leads/activities';
import { statusLabel } from '@/lib/leads/labels';
import { logger } from '@/lib/utils/logger';

const VALID_STATUS = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];

/**
 * GET /api/dashboard/leads/[id]
 * Хажуугийн панелд хэрэгтэй бүх зүйл нэг дуудлагаар: лид, уулзалтууд, гэрээнүүд,
 * үйл ажиллагааны түүх, сонирхсон байр. Дэд хэсэг бүр тусдаа уналтад тэсвэртэй.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModule('leads');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const db = supabaseAdmin();

        const { data: lead, error } = await db
            .from('leads')
            .select('*')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .maybeSingle();
        if (error) return NextResponse.json({ error: 'Лид татахад алдаа гарлаа' }, { status: 500 });
        if (!lead) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });

        // Дэд хэсэг унавал хоосон буцаах ч `partial`-д нэрийг нь тэмдэглэнэ (нуухгүй).
        const partial: string[] = [];
        const soft = <T,>(name: string, r: { error: unknown; data: T | null }, fallback: T): T => {
            if (r.error) { partial.push(name); return fallback; }
            return r.data ?? fallback;
        };
        const [viewings, contracts, activities, property] = await Promise.all([
            db
                .from('property_viewings')
                .select('id, scheduled_at, status, meeting_type, property_id, agent_notes, customer_feedback, interest_level, sales_manager_name')
                .eq('lead_id', id)
                .is('deleted_at', null)
                .order('scheduled_at', { ascending: false })
                .limit(20)
                .then((r) => soft('viewings', r, [] as Record<string, unknown>[])),
            db
                .from('property_contracts')
                .select('id, contract_number, contract_status, contract_date, total_price, paid_amount, balance, unit_number, block_name')
                .eq('lead_id', id)
                .is('deleted_at', null)
                .order('contract_date', { ascending: false })
                .limit(10)
                .then((r) => soft('contracts', r, [] as Record<string, unknown>[])),
            listLeadActivities(db, authShop.id, id),
            lead.property_id
                ? db
                      .from('properties')
                      .select('id, name, price, rooms, size_sqm, status, images')
                      .eq('id', lead.property_id)
                      .maybeSingle()
                      .then((r) => (r.error ? null : r.data))
                : Promise.resolve(null),
        ]);

        // Уулзалтын байрны нэрийг нэг удаа татна
        const propIds = [...new Set((viewings as { property_id: string | null }[]).map((v) => v.property_id).filter((x): x is string => !!x))];
        const propNames = new Map<string, string>();
        if (propIds.length) {
            const { data } = await db.from('properties').select('id, name').in('id', propIds);
            for (const p of data || []) propNames.set(p.id, p.name);
        }
        const viewingsOut = (viewings as Record<string, unknown>[]).map((v) => ({
            ...v,
            property_name: v.property_id ? propNames.get(v.property_id as string) ?? null : null,
        }));

        if (partial.length) logger.warn('[leads/[id]] partial sub-queries failed', { id, partial });
        return NextResponse.json({ lead, viewings: viewingsOut, contracts, activities, property, partial });
    } catch (error) {
        return safeErrorResponse(error, 'Лид татахад алдаа гарлаа');
    }
}

/**
 * PATCH /api/dashboard/leads/[id]
 * Лийдийн төлөв/тэмдэглэл/менежер/дараагийн холбоог шинэчилнэ (leads модулийн
 * бичих эрх). Статус ба менежерийн өөрчлөлтийг lead_activities-д автоматаар бичнэ.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) {
            if (!VALID_STATUS.includes(body.status)) {
                return NextResponse.json({ error: 'Буруу төлөв' }, { status: 400 });
            }
            updates.status = body.status;
            // closed_lost-аас өөр шат руу шилжвэл алдсан шалтгааныг цэвэрлэнэ.
            if (body.status !== 'closed_lost' && body.lost_reason === undefined) {
                updates.lost_reason = null;
            }
        }
        if (typeof body.notes === 'string') updates.notes = body.notes;
        // «Өнөөдөр» дэлгэц: дараагийн холбоо барих цагийг хойшлуулах / дуусгах (null).
        if (body.next_followup_at !== undefined) {
            if (body.next_followup_at === null) updates.next_followup_at = null;
            else if (typeof body.next_followup_at === 'string' && !Number.isNaN(Date.parse(body.next_followup_at))) {
                updates.next_followup_at = new Date(body.next_followup_at).toISOString();
            } else {
                return NextResponse.json({ error: 'Буруу огноо' }, { status: 400 });
            }
        }
        if (body.last_contact_at !== undefined) {
            if (typeof body.last_contact_at === 'string' && !Number.isNaN(Date.parse(body.last_contact_at))) {
                updates.last_contact_at = new Date(body.last_contact_at).toISOString();
            }
        }
        if (typeof body.lost_reason === 'string') updates.lost_reason = body.lost_reason.slice(0, 300) || null;
        // Хариуцагч менежер хуваарилах/чөлөөлөх (null = хуваарилаагүй)
        if (body.sales_manager_name !== undefined) {
            const name = body.sales_manager_name;
            if (name !== null && typeof name !== 'string') {
                return NextResponse.json({ error: 'Буруу менежерийн нэр' }, { status: 400 });
            }
            const trimmed = typeof name === 'string' ? name.trim().slice(0, 120) : null;
            updates.sales_manager_name = trimmed || null;
        }
        // Сонирхол (inline засвар)
        if (body.preferred_rooms !== undefined) {
            const n = body.preferred_rooms === null ? null : Number(body.preferred_rooms);
            if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) {
                return NextResponse.json({ error: 'Буруу өрөөний тоо' }, { status: 400 });
            }
            updates.preferred_rooms = n;
        }
        if (body.preferred_type !== undefined) {
            // `property_type` enum — дурын string 500 өгдөг байсан.
            const PROPERTY_TYPES = ['apartment', 'house', 'office', 'land', 'commercial'];
            if (body.preferred_type !== null && !PROPERTY_TYPES.includes(body.preferred_type)) {
                return NextResponse.json({ error: 'Буруу байрны төрөл' }, { status: 400 });
            }
            updates.preferred_type = body.preferred_type;
        }
        if (body.budget_max !== undefined) {
            const n = body.budget_max === null ? null : Number(body.budget_max);
            if (n !== null && (!Number.isFinite(n) || n < 0)) return NextResponse.json({ error: 'Буруу төсөв' }, { status: 400 });
            updates.budget_max = n;
        }

        const db = supabaseAdmin();

        // Лийд энэ shop-д харьяалагдаж байгааг шалгана (өмнөх утгуудыг түүхэнд бичихэд ашиглана)
        const { data: lead } = await db
            .from('leads')
            .select('id, status, sales_manager_name, lost_reason')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .single();
        if (!lead) {
            return NextResponse.json({ error: 'Лийд олдсонгүй' }, { status: 404 });
        }

        // «Амжилттай» — зөвхөн бодит гэрээтэй лид. DB trigger (create_contract_on_lead_won)
        // гэрээгүй closed_won-д үнэгүй stub гэрээ үүсгэж статистикийг өсгөдөг байв (review H5).
        if (updates.status === 'closed_won' && lead.status !== 'closed_won') {
            const { count } = await db
                .from('property_contracts')
                .select('id', { count: 'exact', head: true })
                .eq('lead_id', id)
                .eq('shop_id', authShop.id)
                .is('deleted_at', null);
            if (!count) {
                return NextResponse.json(
                    { error: 'Гэрээгүй лидийг «Амжилттай» болгох боломжгүй. Эхлээд «Гэрээ үүсгэх»-ээр гэрээ бүртгэнэ үү.' },
                    { status: 400 },
                );
            }
        }
        // «Алдсан» — шалтгаан заавал (UI StatusPicker асуудаг ч API талд шаардаагүй байв).
        if (updates.status === 'closed_lost' && lead.status !== 'closed_lost' && !updates.lost_reason && !lead.lost_reason) {
            return NextResponse.json({ error: 'Алдсан шалтгаанаа (lost_reason) заана уу' }, { status: 400 });
        }

        const { error } = await db.from('leads').update(updates).eq('id', id).eq('shop_id', authShop.id);
        if (error) {
            return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        }

        // Түүх: статус / менежерийн өөрчлөлт (best-effort)
        const changedStatus = updates.status !== undefined && updates.status !== lead.status;
        const changedManager = updates.sales_manager_name !== undefined && updates.sales_manager_name !== lead.sales_manager_name;
        if (changedStatus || changedManager) {
            const uid = await getUserId();
            const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
            const by = identity?.managerName ?? null;
            if (changedStatus) {
                await logLeadActivity(db, {
                    shopId: authShop.id, leadId: id, type: 'status', createdBy: uid, createdByName: by,
                    content: `${statusLabel(lead.status)} → ${statusLabel(updates.status as string)}${updates.lost_reason ? ` · ${updates.lost_reason}` : ''}`,
                    meta: { from: lead.status, to: updates.status, lost_reason: updates.lost_reason ?? null },
                });
            }
            if (changedManager) {
                await logLeadActivity(db, {
                    shopId: authShop.id, leadId: id, type: 'manager', createdBy: uid, createdByName: by,
                    content: `${lead.sales_manager_name || '—'} → ${(updates.sales_manager_name as string | null) || '—'}`,
                    meta: { from: lead.sales_manager_name, to: updates.sales_manager_name },
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд шинэчлэхэд алдаа гарлаа');
    }
}
