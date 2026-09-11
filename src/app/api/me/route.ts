import { NextResponse } from 'next/server';
import { getAuthUser, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { fetchRolePermissions } from '@/lib/rbac';

/**
 * GET /api/me — нэвтэрсэн хэрэглэгч + дүр + эрх + хандах боломжтой shop-ууд НЭГ хариугаар.
 *
 * 2026-09 review (M3/M24): AuthContext өмнө нь browser-оос user_roles → roles/role_permissions →
 * /api/user/shops гэж 4–5 дараалсан хүсэлт хийдэг байв (auth waterfall). Одоо сервер талд
 * нэг удаа тооцоолж буцаана; дүрийн эх сурвалж зөвхөн user_roles.
 */
export async function GET() {
    try {
        const authUser = await getAuthUser();
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const [{ data: roleRow }, { data: memberRows }, { data: profile }] = await Promise.all([
            db.from('user_roles').select('role').eq('user_id', authUser.id).maybeSingle(),
            db.from('shop_members').select('shop_id').eq('user_id', authUser.id),
            db.from('user_profiles').select('full_name').eq('id', authUser.id).maybeSingle(),
        ]);
        const role = roleRow?.role || 'viewer';
        const permissions = await fetchRolePermissions(role);

        const memberIds = (memberRows || []).map((r) => r.shop_id);
        let shopQuery = db
            .from('shops')
            .select('id, name, owner_name, phone, facebook_page_id, facebook_page_name, is_active, setup_completed, created_at')
            .order('created_at', { ascending: true });
        shopQuery = memberIds.length > 0
            ? shopQuery.or(`user_id.eq.${authUser.id},id.in.(${memberIds.join(',')})`)
            : shopQuery.eq('user_id', authUser.id);
        const { data: shops } = await shopQuery;

        return NextResponse.json(
            {
                user: {
                    id: authUser.id,
                    email: authUser.email || '',
                    fullName: profile?.full_name || authUser.user_metadata?.full_name || null,
                },
                role,
                permissions,
                shops: shops || [],
            },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (error) {
        console.error('[api/me] error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа' }, { status: 500 });
    }
}
