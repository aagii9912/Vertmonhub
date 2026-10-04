import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import {
    UpdateLeadCategorySchema, deleteLeadCategory, leadCategoryInputError, updateLeadCategory,
} from '@/lib/services/LeadCategoryService';

/**
 * PATCH /api/dashboard/lead-categories/[id] — нэр, тайлбар, өнгө, эрэмбэ, идэвхтэй/архив
 * (Тохиргоо бичих эрх; хатуу allow-list). Архивласан ангилал шинэ лидэд оноогдохгүй,
 * өмнө оноосон лидэд хэвээр харагдана.
 */
export const PATCH = withRoute<{ id: string }>({ module: 'settings', access: 'write', error: 'Лидийн ангилал шинэчлэхэд алдаа гарлаа' }, async ({ request, shop, params }) => {
    const { id } = params;
    const parsed = UpdateLeadCategorySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: leadCategoryInputError(parsed.error) }, { status: 400 });
    const result = await updateLeadCategory(supabaseAdmin(), shop.id, id, parsed.data, await getUserId());
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ category: result.category });
});

/**
 * DELETE /api/dashboard/lead-categories/[id] — зөвхөн ямар ч лидэд (устгасан лид орно)
 * ашиглагдаагүй ангиллыг устгана (Тохиргоо устгах эрх); бусад үед 409 — архивлана.
 */
export const DELETE = withRoute<{ id: string }>({ module: 'settings', access: 'delete', error: 'Лидийн ангилал устгахад алдаа гарлаа' }, async ({ shop, params }) => {
    const result = await deleteLeadCategory(supabaseAdmin(), shop.id, params.id, await getUserId());
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
});
