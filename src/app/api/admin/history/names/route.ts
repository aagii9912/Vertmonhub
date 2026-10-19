import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { loadNameMismatches } from '@/lib/admin/activity-feed';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/admin/history/names — «Нэрийн зөрүү» (super_admin, идэвхтэй төсөл): менежерийн бүртгэл
 * (холбосон акаунт, төсөл, анхааруулга) ба бүртгэлд байхгүй нэрээр орсон лид, уулзалт, гэрээ,
 * өдрийн тайлангийн тоо, санал гомдол. Зөвхөн уншина — засвар «Төлөвлөгөө ба баг»-т.
 */
export async function GET() {
    if (!await getUserId()) return NextResponse.json({ error: 'Нэвтэрнэ үү' }, { status: 401, headers: NO_STORE });
    if (!await getAdminUser()) return NextResponse.json({ error: 'Зөвхөн super admin хандана' }, { status: 403, headers: NO_STORE });
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403, headers: NO_STORE });
    try {
        return NextResponse.json(await loadNameMismatches(supabaseAdmin(), shop.id), { headers: NO_STORE });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн нэрийн зөрүүг уншиж чадсангүй', 503);
    }
}
