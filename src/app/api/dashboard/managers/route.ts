import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/managers
 * Тухайн shop-ийн борлуулалтын менежерүүдийн НЭГДСЭН жагсаалт:
 * sales_managers бүртгэл ∪ manager_performance (гэрээтэй нэрс) ∪
 * leads.sales_manager_name (лидтэй нэрс). Ингэснээр гэрээгүй шинэ менежер ч,
 * бүртгэлгүй хуучин нэр ч сонгогч/хуваарилах dropdown-д гарна.
 * Хамгаалалт: reports модулийн эрх (менежер сонгогч + багийн харагдацын жишиг).
 */
export async function GET() {
    try {
        const denied = await requireModule('reports');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ managers: [] });
        }

        const db = supabaseAdmin();
        const [rosterRes, perfRes, leadRes] = await Promise.all([
            db.from('sales_managers').select('name, user_id, is_active').eq('shop_id', authShop.id),
            db.from('manager_performance').select('sales_manager').eq('shop_id', authShop.id),
            db
                .from('leads')
                .select('sales_manager_name')
                .eq('shop_id', authShop.id)
                .is('deleted_at', null)
                .not('sales_manager_name', 'is', null)
                .limit(2000),
        ]);

        const map = new Map<
            string,
            { name: string; user_id: string | null; is_active: boolean; hasAccount: boolean }
        >();

        for (const r of rosterRes.error ? [] : rosterRes.data || []) {
            if (!r.name) continue;
            map.set(r.name, {
                name: r.name,
                user_id: r.user_id ?? null,
                is_active: !!r.is_active,
                hasAccount: !!r.user_id,
            });
        }

        // Бүртгэлд байхгүй нэрс — default идэвхтэй (manager-performance route-ын жишиг)
        const addName = (name?: string | null) => {
            if (!name || map.has(name)) return;
            map.set(name, { name, user_id: null, is_active: true, hasAccount: false });
        };
        for (const r of perfRes.error ? [] : perfRes.data || []) addName(r.sales_manager);
        for (const r of leadRes.error ? [] : leadRes.data || []) addName(r.sales_manager_name);

        const managers = Array.from(map.values()).sort((a, b) =>
            a.name.localeCompare(b.name, 'mn'),
        );

        return NextResponse.json({ managers });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн жагсаалт унших алдаа');
    }
}
