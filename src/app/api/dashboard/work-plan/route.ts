import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { slideActor } from '@/lib/dashboard/weekly-slides-store';
import { WorkPlanCreateSchema, WorkPlanMonthSchema, workPlanInputError } from '@/lib/sales/work-plan';
import { createWorkPlanItem, readWorkPlan } from '@/lib/sales/work-plan-store';

/**
 * Сарын «бусад ажлын төлөвлөгөө» (хурлын хуудас, Лхагвын илтгэл). `dashboard` модуль: багийн гишүүн бүр харна,
 * бичих эрхтэй нь нэмж, хариуцагч оноож, хийгдсэнийг чеклэнэ. Shop, зохиогчийг серверээс авна.
 */
const headers = { 'Cache-Control': 'private, no-store' };

/** GET /api/dashboard/work-plan?month=YYYY-MM */
export const GET = withRoute({ module: 'dashboard', error: 'Ажлын төлөвлөгөөг уншиж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const month = WorkPlanMonthSchema.safeParse(request.nextUrl.searchParams.get('month'));
    if (!month.success) return NextResponse.json({ error: 'Сарын огноо буруу байна' }, { status: 400 });
    return NextResponse.json(await readWorkPlan(supabaseAdmin(), shop.id, month.data), { headers });
});

/** POST /api/dashboard/work-plan { month, title, assigneeIds } */
export const POST = withRoute({ module: 'dashboard', access: 'write', error: 'Ажлыг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = WorkPlanCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: workPlanInputError(parsed.error) }, { status: 400 });
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const db = supabaseAdmin();
    const actor = await slideActor(db, userId);
    if ('error' in actor) throw new Error(actor.error.message);
    const result = await createWorkPlanItem(db, shop.id, parsed.data, actor);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ item: result.item }, { status: 201, headers });
});
