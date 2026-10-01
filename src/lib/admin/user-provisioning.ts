import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';

type AdminDb = ReturnType<typeof supabaseAdmin>;

export const adminUserInput = z.object({
    email: z.preprocess((value) => typeof value === 'string' ? value.trim().toLowerCase() : value, z.email().max(254)),
    full_name: z.string().trim().max(120).optional().default(''),
    role: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).optional().default('viewer'),
    shop_id: z.preprocess((value) => value === '' ? undefined : value, z.guid().optional()),
});

/** DB-defined roles may be assigned; only super_admin retains its missing-row fallback. */
export async function isAssignableRole(db: AdminDb, role: unknown): Promise<boolean> {
    if (typeof role !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(role)) return false;
    const { data, error } = await db.from('roles').select('id').eq('name', role).maybeSingle();
    if (error) throw error;
    return Boolean(data) || role === 'super_admin';
}

/** API болон AI дүр оноох замууд ижил self-change хамгаалалт ашиглана. */
export async function checkRoleAssignment(db: AdminDb, actorId: string | undefined, userId: string, role: unknown) {
    if (!actorId) return { error: 'Үйлдэл хийж буй хэрэглэгч тодорхойгүй байна', status: 403 };
    if (actorId === userId) return { error: 'Өөрийн дүрийг өөрчлөх боломжгүй', status: 409 };
    if (!await isAssignableRole(db, role)) return { error: 'Сонгосон дүр олдсонгүй', status: 400 };
    return null;
}

type AccessError = { error: string; status: number; partial_failure?: boolean };
type ManagerRow = { name: string; user_id: string | null; is_active: boolean };

/** Алдаа гарвал шинэ Auth бүртгэл эсвэл шинээр нэмсэн гишүүнчлэлийг буцаана. */
export async function provisionUserAccess(db: AdminDb, input: {
    actorId: string; userId: string; email: string; fullName?: string;
    role: string; shopId: string; isNew: boolean;
}): Promise<AccessError | null> {
    let addedMembership = false;
    let managerName: string | undefined;
    let previousManager: ManagerRow | null = null;
    let changedManager = false;
    try {
        const denied = await checkRoleAssignment(db, input.actorId, input.userId, input.role);
        if (denied) {
            if (!input.isNew || input.actorId === input.userId) return denied;
            throw new Error(denied.error);
        }
        if (input.isNew) {
            const { error } = await db.from('user_profiles').upsert({
                id: input.userId, email: input.email, full_name: input.fullName || input.email,
            }, { onConflict: 'id' });
            if (error) throw error;
        }

        // sales_manager эрх нь идэвхтэй, яг энэ акаунттай холбосон roster-гүй бол
        // лид авах/оноох урсгал ажиллахгүй. Одоо байгаа профайлын нэрийг хадгална.
        if (input.role === 'sales_manager') {
            const { data: profile, error: profileError } = await db.from('user_profiles')
                .select('full_name').eq('id', input.userId).maybeSingle();
            if (profileError) throw profileError;
            const name = profile?.full_name?.trim();
            if (!name || name === input.email || name.length > 120)
                throw { error: 'Борлуулалтын менежерийн профайлд бодит нэр оруулна уу. Имэйлээр менежер үүсгэх боломжгүй.', status: 400 };
            const [linked, named] = await Promise.all([
                db.from('sales_managers').select('name, user_id, is_active')
                    .eq('shop_id', input.shopId).eq('user_id', input.userId).limit(2),
                db.from('sales_managers').select('name, user_id, is_active')
                    .eq('shop_id', input.shopId).eq('name', name).maybeSingle(),
            ]);
            if (linked.error) throw linked.error;
            if (named.error) throw named.error;
            if ((linked.data || []).length > 1)
                throw { error: 'Энэ акаунт олон менежерт холбогдсон байна. Борлуулалтын төлөвлөгөө хэсэгт холбоосыг засна уу.', status: 409 };
            previousManager = linked.data?.[0] || named.data;
            if (previousManager?.user_id && previousManager.user_id !== input.userId)
                throw { error: 'Ижил нэртэй менежер өөр акаунттай холбогдсон байна. Профайлын нэр эсвэл менежерийн холбоосыг шалгана уу.', status: 409 };
            managerName = previousManager?.name || name;
        }

        const { data: membership, error: readError } = await db.from('shop_members').select('id')
            .eq('shop_id', input.shopId).eq('user_id', input.userId).maybeSingle();
        if (readError) throw readError;
        if (!membership) {
            // Existing owners/members keep their current membership role.
            const { error } = await db.from('shop_members').insert({
                shop_id: input.shopId, user_id: input.userId, role: 'member',
            });
            if (error && error.code !== '23505') throw error;
            addedMembership = !error;
        }

        if (managerName && (!previousManager || !previousManager.user_id || !previousManager.is_active)) {
            const row = { shop_id: input.shopId, name: managerName, user_id: input.userId, is_active: true };
            // Нэрийг өөр акаунт зэрэг холбосон бол дарж бичихгүй.
            let query = previousManager
                ? db.from('sales_managers').update({ user_id: input.userId, is_active: true })
                    .eq('shop_id', input.shopId).eq('name', managerName).eq('is_active', previousManager.is_active)
                : db.from('sales_managers').insert(row);
            if (previousManager) query = previousManager.user_id
                ? query.eq('user_id', input.userId) : query.is('user_id', null);
            const { data, error } = await query.select('name').maybeSingle();
            if (error) throw error;
            if (!data) throw { error: 'Менежерийн холбоос зэрэг өөрчлөгдсөн байна. Жагсаалтыг шинэчлээд дахин оролдоно уу.', status: 409 };
            changedManager = true;
        }
        // Write the role last: a failed profile/membership must never demote an existing account.
        const { error } = await db.from('user_roles').upsert({ user_id: input.userId, role: input.role }, { onConflict: 'user_id' });
        if (error) throw error;
        return null;
    } catch (error) {
        console.error('User provisioning failed:', error);
        let rollbackError: unknown;
        if (changedManager && managerName) {
            try {
                const query = previousManager
                    ? db.from('sales_managers').update({ user_id: previousManager.user_id, is_active: previousManager.is_active })
                    : db.from('sales_managers').delete();
                const rollback = await query.eq('shop_id', input.shopId).eq('name', managerName)
                    .eq('user_id', input.userId).eq('is_active', true).select('name').maybeSingle();
                if (rollback.error || !rollback.data) rollbackError = rollback.error || new Error('Менежерийн холбоос буцаагдсангүй');
            } catch (error) { rollbackError = error; }
        }
        try {
            if (input.isNew) {
                const rollback = await db.auth.admin.deleteUser(input.userId);
                rollbackError ||= rollback.error;
            } else if (addedMembership) {
                const rollback = await db.from('shop_members').delete()
                    .eq('shop_id', input.shopId).eq('user_id', input.userId);
                rollbackError ||= rollback.error;
            }
        } catch (error) { rollbackError ||= error; }
        if (rollbackError) {
            console.error('User provisioning rollback failed:', rollbackError);
            return { error: 'Бүртгэлийн холболт дутуу үүссэн бөгөөд буцаах үйлдэл амжилтгүй. Админ хэрэглэгчийн дүр, гишүүнчлэлийг шалгана уу.', status: 500, partial_failure: true };
        }
        if (error && typeof error === 'object' && 'status' in error && 'error' in error)
            return error as AccessError;
        return { error: 'Бүртгэлийн холболт үүссэнгүй. Өөрчлөлтийг буцаасан тул дахин оролдоно уу.', status: 500 };
    }
}

/** A multi-shop installation must always name the destination shop explicitly. */
export async function resolveTargetShop(db: AdminDb, shopId: unknown): Promise<{ id?: string; error?: string }> {
    if (shopId !== undefined && shopId !== null && shopId !== '') {
        if (!z.guid().safeParse(shopId).success) return { error: 'Байгууллагын ID буруу байна' };
        const { data, error } = await db.from('shops').select('id').eq('id', shopId).maybeSingle();
        if (error) throw error;
        return data ? { id: data.id } : { error: 'Сонгосон байгууллага олдсонгүй' };
    }

    const { data, error } = await db.from('shops').select('id').limit(2);
    if (error) throw error;
    if (data?.length === 1) return { id: data[0].id };
    return { error: data?.length ? 'Байгууллага сонгоно уу' : 'Эхлээд байгууллага үүсгэнэ үү' };
}
