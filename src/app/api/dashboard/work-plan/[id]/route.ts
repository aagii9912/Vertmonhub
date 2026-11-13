import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { slideActor } from '@/lib/dashboard/weekly-slides-store';
import { WorkPlanPatchSchema, workPlanInputError } from '@/lib/sales/work-plan';
import { deleteWorkPlanItem, updateWorkPlanItem, type WorkPlanActor } from '@/lib/sales/work-plan-store';

const headers = { 'Cache-Control': 'private, no-store' };

async function actorOf(): Promise<{ response: Response } | { db: ReturnType<typeof supabaseAdmin>; actor: WorkPlanActor }> {
    const userId = await getUserId();
    if (!userId) return { response: NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 }) };
    const db = supabaseAdmin();
    const actor = await slideActor(db, userId);
    if ('error' in actor) throw new Error(actor.error.message);
    return { db, actor };
}

/** PATCH /api/dashboard/work-plan/[id] { title?, assigneeIds?, done? } — гарчиг, хариуцагч, хийгдсэн эсэх. */
export const PATCH = withRoute<{ id: string }>({ module: 'dashboard', access: 'write', error: 'Ажлыг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop, params }) => {
    if (!z.guid().safeParse(params.id).success) return NextResponse.json({ error: 'Ажил олдсонгүй' }, { status: 404 });
    const parsed = WorkPlanPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: workPlanInputError(parsed.error) }, { status: 400 });
    const who = await actorOf();
    if ('response' in who) return who.response;
    const result = await updateWorkPlanItem(who.db, shop.id, params.id, parsed.data, who.actor);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ item: result.item }, { headers });
});

/** DELETE /api/dashboard/work-plan/[id] — өөрийн нэмсэн ажлыг бичих эрхээр, бусдынхыг устгах эрхээр (слайдтай нэг дүрэм). */
export const DELETE = withRoute<{ id: string }>({ module: 'dashboard', access: 'write', error: 'Ажлыг устгаж чадсангүй. Дахин оролдоно уу.' }, async ({ shop, params }) => {
    if (!z.guid().safeParse(params.id).success) return NextResponse.json({ error: 'Ажил олдсонгүй' }, { status: 404 });
    const who = await actorOf();
    if ('response' in who) return who.response;
    const canDeleteOthers = !(await requireModuleDelete('dashboard'));
    const result = await deleteWorkPlanItem(who.db, shop.id, params.id, who.actor, canDeleteOthers);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true }, { headers });
});
