import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAudit } from '@/lib/admin/audit';
import { provisionUserAccess } from '@/lib/admin/user-provisioning';

export type UserProjectsResult =
    | { ok: true; added: string[]; removed: string[] }
    | { ok: false; status: number; error: string; added?: string[]; partial_failure?: boolean };

/**
 * Ажилтны хандах төслүүдийг (shop = төсөл) `shopIds` болгоно — PUT /api/admin/users/projects ба AI
 * `set_user_projects`. Нэмсэн төсөлд гишүүнчлэл үүснэ; борлуулалтын менежерийг `provisionUserAccess`-оор
 * бүртгэлд холбож, ганц төсөлтэй бол төслийг онооно. Хассан төсөлд гишүүнчлэл устаж, менежерийн
 * холбоос салж идэвхгүй болно. Эзэмшигчийн төслийг хасахгүй, өөрийгөө төслөөс хасахгүй. Audit бичнэ.
 * Гэнэтийн DB алдаа шидэгдэнэ.
 */
export async function updateUserProjects(db: SupabaseClient, input: { actorId: string; userId: string; shopIds: string[] }): Promise<UserProjectsResult> {
    const { actorId, userId } = input;
    const wanted = new Set(input.shopIds);
    const [roleResult, shopsResult, membersResult, profileResult] = await Promise.all([
        db.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
        db.from('shops').select('id, name, user_id'),
        db.from('shop_members').select('shop_id').eq('user_id', userId),
        db.from('user_profiles').select('email').eq('id', userId).maybeSingle(),
    ]);
    for (const result of [roleResult, shopsResult, membersResult, profileResult]) if (result.error) throw result.error;
    if (!roleResult.data) return { ok: false, status: 404, error: 'Хэрэглэгч олдсонгүй' };
    const role = roleResult.data.role as string;
    const shops = new Map((shopsResult.data || []).map(shop => [shop.id as string, shop]));
    if ([...wanted].some(id => !shops.has(id))) return { ok: false, status: 400, error: 'Сонгосон төсөл олдсонгүй' };

    const current = new Set((membersResult.data || []).map(row => row.shop_id as string));
    const owned = new Set([...shops.values()].filter(shop => shop.user_id === userId).map(shop => shop.id as string));
    const add = [...wanted].filter(id => !current.has(id) && !owned.has(id));
    const remove = [...current].filter(id => !wanted.has(id));
    if (remove.some(id => owned.has(id))) return { ok: false, status: 409, error: 'Эзэмшигчийн төслийг хасах боломжгүй' };
    if (actorId === userId && remove.length) return { ok: false, status: 409, error: 'Өөрийгөө төслөөс хасах боломжгүй' };

    const added: string[] = [];
    for (const shopId of add) {
        if (role === 'sales_manager') {
            // Гишүүнчлэл + менежерийн бүртгэлийн холбоос + төслийн харьяаллыг нэг дүрмээр үүсгэнэ.
            const failure = await provisionUserAccess(db, {
                actorId, userId, email: profileResult.data?.email || '', role, shopId, isNew: false,
            });
            if (failure) return { ok: false, ...failure, added };
        } else {
            const { error } = await db.from('shop_members').insert({ shop_id: shopId, user_id: userId, role: 'member' });
            if (error && error.code !== '23505') throw error;
        }
        added.push(shopId);
    }

    for (const shopId of remove) {
        // Хассан төслийн менежерийн холбоосыг салгаж идэвхгүй болгоно — эрх үлдэхгүй.
        const { error: rosterError } = await db.from('sales_managers').update({ user_id: null, is_active: false })
            .eq('shop_id', shopId).eq('user_id', userId);
        if (rosterError) throw rosterError;
        const { error } = await db.from('shop_members').delete().eq('shop_id', shopId).eq('user_id', userId);
        if (error) throw error;
    }

    await logAdminAudit({ actorId, action: 'user.projects_update', targetId: userId, meta: { added, removed: remove } });
    return { ok: true, added, removed: remove };
}
