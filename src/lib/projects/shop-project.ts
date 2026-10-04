import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shop = төсөл: shop бүр нэг л төслийн мөртэй (`projects_one_per_shop` trigger).
 * Хүсэлт төсөл заагаагүй үед тухайн shop-ийн ганц төслийг буцаана. Хуучин олон
 * төсөлтэй shop эсвэл төсөлгүй shop-д `null` — дуудагч төслийг ил сонгуулна.
 */
export async function soleShopProjectId(db: SupabaseClient, shopId: string): Promise<string | null> {
    const { data, error } = await db.from('projects').select('id').eq('shop_id', shopId).order('id').limit(2);
    if (error) throw error;
    return data?.length === 1 ? data[0].id as string : null;
}
