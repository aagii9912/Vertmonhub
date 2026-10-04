import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity, resolveActiveManagerName } from '@/lib/sales/manager-identity';
import { logLeadActivity } from '@/lib/leads/activities';
import { loadLeadTimeline } from '@/lib/leads/timeline-load';
import { leadDisplayName, normalizeLeadName, statusLabel } from '@/lib/leads/labels';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { logger } from '@/lib/utils/logger';
import { z } from 'zod';
import { applyLeadScope, assertProjectManager, canAccessProject, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { withRoute } from '@/lib/api/route';
import { leadCategoryName, logLeadCategoryChange, resolveLeadCategory } from '@/lib/services/LeadCategoryService';

const VALID_STATUS = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];
/** PATCH-ийн өмнөх утга (түүх, хүрээний шалгалтад); `category_id` зөвхөн ангилал өөрчлөхөд уншигдана. */
const PATCH_LEAD_COLUMNS = 'id, project_id, status, sales_manager_name, lost_reason, customer_name';
type PatchLeadRow = {
    id: string; project_id: string | null; status: string; sales_manager_name: string | null;
    lost_reason: string | null; customer_name: string | null; category_id?: string | null;
};
const LeadNameSchema = z.string().trim().min(1).max(200);

/**
 * GET /api/dashboard/leads/[id]
 * Хажуугийн панелд хэрэгтэй бүх зүйл нэг дуудлагаар: лид, уулзалтууд, гэрээнүүд,
 * үйл ажиллагааны түүх, менежерүүдийн Time-line (`timeline`), сонирхсон байр.
 * Дэд хэсэг бүр тусдаа уналтад тэсвэртэй (`partial`). `activities` нь хуучин client-д
 * зориулсан сүүлийн 100 үйлдэл (шинэ нь дээр) хэвээр.
 */
export const GET = withRoute<{ id: string }>({ module: 'leads', error: 'Лид татахад алдаа гарлаа' }, async ({ shop: authShop, params }) => {
    const { id } = await params;
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);

    const { data: lead, error } = await applyLeadScope(db
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null), scope)
        .maybeSingle();
    if (error) return NextResponse.json({ error: 'Лид татахад алдаа гарлаа' }, { status: 500 });
    if (!lead) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });

    // Дэд хэсэг унавал хоосон буцаах ч `partial`-д нэрийг нь тэмдэглэнэ (нуухгүй).
    const partial: string[] = [];
    const soft = <T,>(name: string, r: { error: unknown; data: T | null }, fallback: T): T => {
        if (r.error) { partial.push(name); return fallback; }
        return r.data ?? fallback;
    };
    const [viewings, contracts, history, property] = await Promise.all([
        db
            .from('property_viewings')
            .select('id, scheduled_at, status, meeting_type, property_id, agent_notes, customer_feedback, interest_level, sales_manager_name')
            .eq('lead_id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('scheduled_at', { ascending: false })
            .limit(20)
            .then((r) => soft('viewings', r, [] as Record<string, unknown>[])),
        db
            .from('property_contracts')
            .select('id, contract_number, contract_status, contract_date, total_price, paid_amount, balance, unit_number, block_name, sales_manager')
            .eq('lead_id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('contract_date', { ascending: false })
            .limit(10)
            .then((r) => soft('contracts', r, [] as Record<string, unknown>[])),
        loadLeadTimeline(db, authShop.id, lead, scope).catch((timelineError: unknown) => {
            logger.warn('[leads/[id]] timeline failed', { id, error: timelineError });
            return null;
        }),
        lead.property_id
            ? db
                  .from('properties')
                  .select('id, name, price, rooms, size_sqm, status, images')
                  .eq('id', lead.property_id)
                  .eq('shop_id', authShop.id)
                  .maybeSingle()
                  .then((r) => (r.error ? null : r.data))
            : Promise.resolve(null),
    ]);

    // Уулзалтын байрны нэрийг нэг удаа татна
    const propIds = [...new Set((viewings as { property_id: string | null }[]).map((v) => v.property_id).filter((x): x is string => !!x))];
    const propNames = new Map<string, string>();
    if (propIds.length) {
        const { data } = await db.from('properties').select('id, name').eq('shop_id', authShop.id).in('id', propIds);
        for (const p of data || []) propNames.set(p.id, p.name);
    }
    const viewingsOut = (viewings as Record<string, unknown>[]).map((v) => ({
        ...v,
        property_name: v.property_id ? propNames.get(v.property_id as string) ?? null : null,
    }));

    // Түүх уншигдаагүй бол «түүх» (activities), бусад эх сурвалж дутуу бол «менежерийн түүх» (timeline).
    if (!history?.activities) partial.push('activities');
    if (!history || history.timeline.partial.some((name) => name !== 'activities')) partial.push('timeline');
    const activities = history?.activities ? [...history.activities].reverse().slice(0, 100) : [];

    if (partial.length) logger.warn('[leads/[id]] partial sub-queries failed', { id, partial });
    return NextResponse.json({ lead, viewings: viewingsOut, contracts, activities, timeline: history?.timeline ?? null, property, partial });
});

/**
 * PATCH /api/dashboard/leads/[id]
 * Лийдийн нэр/төлөв/тэмдэглэл/менежер/ангилал/дараагийн холбоог шинэчилнэ (leads модулийн
 * бичих эрх). Статус, менежер, нэр, ангиллын өөрчлөлтийг lead_activities-д автоматаар бичнэ.
 */
export const PATCH = withRoute<{ id: string }>({ module: 'leads', access: 'write', error: 'Лийд шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.project_id !== undefined) {
        if (body.project_id !== null && !z.string().uuid().safeParse(body.project_id).success) {
            return NextResponse.json({ error: 'Буруу төсөл' }, { status: 400 });
        }
        updates.project_id = body.project_id;
    }
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
    // Харилцагчийн нэр нэмэх/засах (нэргүй лидийг дараа нь нэрлэнэ). Нэрийг хоосолж болохгүй.
    if (body.customer_name !== undefined) {
        const parsedName = LeadNameSchema.safeParse(body.customer_name);
        const name = parsedName.success ? normalizeLeadName(parsedName.data) : null;
        if (!name) return NextResponse.json({ error: 'Харилцагчийн нэрийг оруулна уу. Нэрийг хоосолж болохгүй.' }, { status: 400 });
        updates.customer_name = name;
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
    // Лидийн ангилал (null = ангилалгүй) — энэ төслийн ангилал эсэхийг лидийг уншсаны дараа шалгана.
    const categoryInput = body.category_id;
    if (categoryInput !== undefined && categoryInput !== null && !z.string().uuid().safeParse(categoryInput).success) {
        return NextResponse.json({ error: 'Буруу ангилал' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    if (updates.project_id !== undefined) {
        if (!canAccessProject(scope, updates.project_id as string | null)) return NextResponse.json({ error: 'Энэ төсөлд лид шилжүүлэх эрхгүй' }, { status: 403 });
        if (updates.project_id) {
            const { data: project, error } = await db.from('projects').select('id')
                .eq('id', updates.project_id).eq('shop_id', authShop.id).maybeSingle();
            if (error) throw error;
            if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 400 });
        }
    }

    // Лийд энэ shop-д харьяалагдаж байгааг шалгана (өмнөх утгуудыг түүхэнд бичихэд ашиглана)
    if (typeof updates.sales_manager_name === 'string') {
        const manager = await resolveActiveManagerName(db, authShop.id, updates.sales_manager_name);
        if (!manager.ok) return NextResponse.json({ error: manager.error }, { status: manager.status });
        updates.sales_manager_name = manager.managerName;
    }
    // category_id-г зөвхөн ангилал өөрчлөх үед уншина: ангиллын багана нэмэгдээгүй (migration
    // 20261004161000-аас өмнөх) DB дээр бусад засвар (төлөв, менежер, тэмдэглэл) ажилласаар байна.
    const leadColumns: string = categoryInput !== undefined ? `${PATCH_LEAD_COLUMNS}, category_id` : PATCH_LEAD_COLUMNS;
    const { data: leadRow, error: readError } = await applyLeadScope(db
        .from('leads')
        .select(leadColumns)
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null), scope)
        .single();
    if (readError && readError.code !== 'PGRST116') throw readError;
    const lead = leadRow as unknown as PatchLeadRow | null;
    if (!lead) {
        return NextResponse.json({ error: 'Лийд олдсонгүй' }, { status: 404 });
    }
    if (scope.projectIds !== null) {
        if (updates.sales_manager_name !== undefined && updates.sales_manager_name !== lead.sales_manager_name) {
            return NextResponse.json({ error: 'Лидийг өөр менежерт хуваарилах эрхгүй' }, { status: 403 });
        }
        if (updates.project_id !== undefined && updates.project_id !== lead.project_id) {
            return NextResponse.json({ error: 'Лидийн төслийг өөрчлөх эрхгүй' }, { status: 403 });
        }
    }
    // Шинээр зөвхөн идэвхтэй ангилал; одоогийн (архивласан) ангиллыг хэвээр үлдээж болно.
    const category = categoryInput !== undefined
        ? await resolveLeadCategory(db, authShop.id, { id: categoryInput }, { current: lead.category_id ?? null })
        : null;
    if (category && !category.ok) return NextResponse.json({ error: category.error }, { status: category.status });
    if (category) updates.category_id = category.categoryId;
    const projectId = updates.project_id !== undefined ? updates.project_id as string | null : lead.project_id;
    const managerName = updates.sales_manager_name !== undefined ? updates.sales_manager_name : lead.sales_manager_name;
    if (typeof managerName === 'string' && (updates.sales_manager_name !== undefined || updates.project_id !== undefined)) {
        await assertProjectManager(db, authShop.id, projectId, managerName);
    }

    // «Амжилттай» — зөвхөн бодит гэрээтэй лид. DB trigger (create_contract_on_lead_won)
    // гэрээгүй closed_won-д үнэгүй stub гэрээ үүсгэж статистикийг өсгөдөг байв (review H5).
    if (updates.status === 'closed_won' && lead.status !== 'closed_won') {
        const { data: contracts, error: contractError } = await db
            .from('property_contracts')
            .select('contract_number, total_price, contract_status')
            .eq('lead_id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null);
        if (contractError) return NextResponse.json({ error: 'Гэрээ шалгахад алдаа гарлаа' }, { status: 500 });
        if (!contracts?.some(hasRealContractFields)) {
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

    // Түүхэнд бичих өөрчлөлтийг бичилтээс өмнөх утгаар тодорхойлно.
    const changedStatus = updates.status !== undefined && updates.status !== lead.status;
    const changedManager = updates.sales_manager_name !== undefined && updates.sales_manager_name !== lead.sales_manager_name;
    const previousName: string | null = lead.customer_name ?? null;
    const changedName = updates.customer_name !== undefined && updates.customer_name !== previousName;
    const previousCategory: string | null = lead.category_id ?? null;
    const changedCategory = updates.category_id !== undefined && updates.category_id !== previousCategory;

    let write = applyLeadScope(db.from('leads').update(updates).eq('id', id).eq('shop_id', authShop.id).is('deleted_at', null), scope);
    write = lead.project_id ? write.eq('project_id', lead.project_id) : write.is('project_id', null);
    const { data: updated, error } = await write.select('id').maybeSingle();
    if (error) {
        return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: 'Лидийн төсөл өөрчлөгдсөн байна. Дахин уншаад оролдоно уу.' }, { status: 409 });

    // Түүх: статус / менежер / нэрийн өөрчлөлт (best-effort)
    if (changedStatus || changedManager || changedName || changedCategory) {
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
        if (changedName) {
            await logLeadActivity(db, {
                shopId: authShop.id, leadId: id, type: 'system', createdBy: uid, createdByName: by,
                content: `Нэр: ${leadDisplayName(previousName)} → ${updates.customer_name as string}`,
                meta: { field: 'customer_name', from: previousName, to: updates.customer_name },
            });
        }
        if (changedCategory && category?.ok) {
            await logLeadCategoryChange(db, {
                shopId: authShop.id, leadId: id, userId: uid, userName: by,
                from: { id: previousCategory, name: await leadCategoryName(db, authShop.id, previousCategory) },
                to: { id: category.categoryId, name: category.category?.name ?? null },
            });
        }
    }

    return NextResponse.json({ success: true });
});
