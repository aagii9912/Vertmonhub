import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import {
    CreateLeadCategorySchema, ReorderLeadCategoriesSchema, addDefaultLeadCategories, countLeadsByCategory, createLeadCategory,
    leadCategoryInputError, listLeadCategories, reorderLeadCategories, type CategoryFailure,
} from '@/lib/services/LeadCategoryService';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const fail = (result: CategoryFailure) => NextResponse.json({ error: result.error }, { status: result.status });

/**
 * GET /api/dashboard/lead-categories — тухайн төслийн (shop) лидийн ангиллууд.
 * Лид, лидийн тайлан, тохиргоо уншигч бүрт (ангилал нь лидийн өгөгдөл биш, төслийн тохиргоо).
 *   ?include=archived — архивласныг нэмнэ (шүүлтүүр, тайлан, тохиргоо).
 *   ?counts=1 — ангилал бүрийн лидийн тоо + `referenced` (устгасан лид орно, устгах боломжгүй):
 *     зөвхөн «Тохиргоо» эрхтэй, төслийн хүрээгээр хязгаарлагдаагүй хэрэглэгчид (хувийн хүрээтэй
 *     менежерт байгууллагын тоо ил гарахгүй).
 */
export const GET = withRoute({ module: ['leads', 'reports-leads', 'settings'], error: 'Лидийн ангилал татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const { searchParams } = new URL(request.url);
    const db = supabaseAdmin();
    const categories = await listLeadCategories(db, shop.id, { includeArchived: searchParams.get('include') === 'archived' });
    if (searchParams.get('counts') !== '1') return NextResponse.json({ categories }, { headers: NO_STORE });

    const denied = await requireModule('settings');
    if (denied) return NextResponse.json({ error: 'Ангиллын лидийн тоог харах эрхгүй' }, { status: 403 });
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Ангиллын лидийн тоог харах эрхгүй' }, { status: 403 });
    const counts = await countLeadsByCategory(db, shop.id, categories.map((category) => category.id));
    return NextResponse.json({ categories, counts }, { headers: NO_STORE });
});

const PresetSchema = z.object({ preset: z.literal('defaults') }).strict();

/**
 * POST /api/dashboard/lead-categories — ангилал нэмэх (Тохиргоо бичих эрх).
 *   { name, description?, tone?, sort_order? } → 201 { category }
 *   { preset: 'defaults' } → санал болгох ангиллуудыг (байхгүйг нь) нэмнэ → { created, skipped }
 */
export const POST = withRoute({ module: 'settings', access: 'write', error: 'Лидийн ангилал нэмэхэд алдаа гарлаа' }, async ({ request, shop }) => {
    const body = await request.json().catch(() => null);
    const db = supabaseAdmin();
    const actorId = await getUserId();
    if (body && typeof body === 'object' && 'preset' in body) {
        if (!PresetSchema.safeParse(body).success) return NextResponse.json({ error: 'Буруу загвар' }, { status: 400 });
        const result = await addDefaultLeadCategories(db, shop.id, actorId);
        if (!result.ok) return fail(result);
        return NextResponse.json({ created: result.created, skipped: result.skipped });
    }
    const parsed = CreateLeadCategorySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: leadCategoryInputError(parsed.error) }, { status: 400 });
    const result = await createLeadCategory(db, shop.id, parsed.data, actorId);
    if (!result.ok) return fail(result);
    return NextResponse.json({ category: result.category }, { status: 201 });
});

/**
 * PATCH /api/dashboard/lead-categories — эрэмбэ (Тохиргоо бичих эрх): { order: uuid[] } нь төслийн
 * бүх ангиллын шинэ дараалал → { categories }. Мөр бүрийг тусад нь PATCH-лахгүй (нэг audit).
 */
export const PATCH = withRoute({ module: 'settings', access: 'write', error: 'Ангиллын эрэмбэ хадгалахад алдаа гарлаа' }, async ({ request, shop }) => {
    const parsed = ReorderLeadCategoriesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: leadCategoryInputError(parsed.error) }, { status: 400 });
    const result = await reorderLeadCategories(supabaseAdmin(), shop.id, parsed.data.order, await getUserId());
    if (!result.ok) return fail(result);
    return NextResponse.json({ categories: result.categories });
});
