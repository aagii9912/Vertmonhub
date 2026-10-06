import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { loadLeadTimeline } from '@/lib/leads/timeline-load';
import { logger } from '@/lib/utils/logger';
import { applyLeadScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { updateStaffLead } from '@/lib/services/LeadService';
import { withRoute } from '@/lib/api/route';

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
 * Лийдийн нэр/төлөв/тэмдэглэл/менежер/ангилал/дараагийн холбоо/сонирхлыг шинэчилнэ (leads
 * модулийн бичих эрх). Дүрэм нь AI `update_lead`-тэй нэг (`LeadService.updateStaffLead`).
 */
export const PATCH = withRoute<{ id: string }>({ module: 'leads', access: 'write', error: 'Лийд шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    const result = await updateStaffLead(db, authShop.id, id, body ?? {}, { userId: await getUserId(), scope });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
});
