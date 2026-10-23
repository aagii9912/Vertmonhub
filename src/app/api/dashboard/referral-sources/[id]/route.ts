import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { UpdateReferralSourceSchema, referralInputError, updateReferralSource } from '@/lib/sales/referral-sources-store';

/**
 * PATCH /api/dashboard/referral-sources/[id] — нэр солих, архивлах / сэргээх (Тохиргоо бичих эрх; хатуу
 * allow-list `{ name?, archived? }`). Архивласан сонголт шинэ уулзалт, гэрээнд сонгогдохгүй, өмнө оноосон мөрөнд
 * хэвээр харагдана. Устгах үйлдэл байхгүй (ашиглагдсан сонголт түүхэнд үлдэнэ).
 */
export const PATCH = withRoute<{ id: string }>({ module: 'settings', access: 'write', error: '«Сэжим» шинэчлэхэд алдаа гарлаа' }, async ({ request, shop, params }) => {
    const parsed = UpdateReferralSourceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: referralInputError(parsed.error) }, { status: 400 });
    const result = await updateReferralSource(supabaseAdmin(), shop.id, params.id, parsed.data, await getUserId());
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ source: result.source });
});
