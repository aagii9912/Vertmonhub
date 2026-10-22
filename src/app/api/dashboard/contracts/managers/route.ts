import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { fetchAllRows } from '@/lib/utils/pagination';

/**
 * GET /api/dashboard/contracts/managers — гэрээний менежер сонгох нэрс: идэвхтэй багийн бүртгэл (roster) ба
 * тухайн төслийн гэрээнд аль хэдийн бичигдсэн нэрс (ERP-ийн «Нэр.Овог» хэлбэр). Elysium-ийн гэрээ ERP-ийн
 * нэрээр бичигддэг тул шинэ гэрээнд ч тэр хэлбэрийг сонгож болно — нэг хүн хоёр нэрээр тайланд хуваагдахгүй
 * (эзний шийдвэр W15, 2026-10-22). Бичих эрхийг PATCH /api/dashboard/contracts/[id] шалгана.
 */
export const GET = withRoute({ module: 'contracts', error: 'Менежерийн жагсаалт унших алдаа' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const [roster, contracts] = await Promise.all([
        db.from('sales_managers').select('name').eq('shop_id', shop.id).eq('is_active', true),
        fetchAllRows<{ id: string; sales_manager: string | null }>((from, to) => db.from('property_contracts')
            .select('id, sales_manager').eq('shop_id', shop.id).is('deleted_at', null).not('sales_manager', 'is', null)
            .order('id').range(from, to)),
    ]);
    if (roster.error) throw roster.error;
    const managers = new Map<string, { name: string; roster: boolean; contracts: number }>();
    for (const row of roster.data ?? []) {
        const name = row.name?.trim();
        if (name) managers.set(name, { name, roster: true, contracts: 0 });
    }
    for (const row of contracts) {
        const name = row.sales_manager?.trim();
        if (!name) continue;
        const entry = managers.get(name) ?? { name, roster: false, contracts: 0 };
        entry.contracts++;
        managers.set(name, entry);
    }
    return NextResponse.json({ managers: [...managers.values()].sort((a, b) => a.name.localeCompare(b.name, 'mn')) });
});
