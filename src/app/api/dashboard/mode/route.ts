import { NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/mode
 * Дашбоардын горимыг СЕРВЕР талд шийднэ (client role-таамаглал биш):
 * • personal — sales_manager role-той ЭСВЭЛ sales_managers бүртгэлд идэвхтэй
 *   таарсан (админ биш) хэрэглэгч → «Миний самбар».
 * • org — бусад бүгд (админ, marketing, viewer...) → нэгдсэн самбар.
 * Анхаар: roster хоосон үед my-target-ийн «бүгдэд харуулах» fallback-ийг ЭНД
 * хэрэглэхгүй — эс бөгөөс бүх role personal болчихно.
 *
 * managerName — user_profiles/roster-оос гарсан КАНОН нэр; attribution
 * тамгалахад (уулзалт г.м) мөн үүнийг ашиглана.
 */
export async function GET() {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({
                mode: 'org',
                managerName: null,
                isManager: false,
                canViewTeam: false,
            });
        }

        const [perms, identity] = await Promise.all([
            resolvePermissions(),
            resolveManagerIdentity(supabaseAdmin(), authShop.id, uid),
        ]);

        const role = perms?.role || 'viewer';
        const modules = perms?.permissions.modules || [];
        const isAdmin = role === 'admin' || role === 'super_admin';
        const personal = !isAdmin && (role === 'sales_manager' || identity.isManager);
        const canViewTeam = !personal && (isAdmin || modules.includes('reports'));

        return NextResponse.json({
            mode: personal ? 'personal' : 'org',
            managerName: identity.managerName,
            isManager: personal,
            canViewTeam,
        });
    } catch (error) {
        return safeErrorResponse(error, 'Дашбоардын горим унших алдаа');
    }
}
