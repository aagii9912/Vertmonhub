import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireAnyModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/managers
 * Тухайн shop-ийн идэвхтэй борлуулалтын менежерүүдийн жагсаалт.
 * sales_managers бүртгэл цорын ганц эх сурвалж: хуучин гэрээ, лидийн нэр
 * идэвхтэй багийн сонгогчид эргэн орохгүй.
 * Хамгаалалт: reports эсвэл leads модулийн эрх.
 */
export async function GET() {
    try {
        const denied = await requireAnyModule(['reports', 'leads']);
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ managers: [] });
        }

        const db = supabaseAdmin();
        const { data, error } = await db.from('sales_managers')
            .select('name, user_id')
            .eq('shop_id', authShop.id)
            .eq('is_active', true);
        if (error) throw error;

        const managers = (data || [])
            .filter((m) => !!m.name)
            .map((m) => ({
                name: m.name,
                user_id: m.user_id ?? null,
                is_active: true,
                hasAccount: !!m.user_id,
                assignable: true,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'mn'));

        return NextResponse.json({ managers });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн жагсаалт унших алдаа');
    }
}
