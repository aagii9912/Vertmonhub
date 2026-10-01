import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';

type AdminDb = ReturnType<typeof supabaseAdmin>;

export const adminUserInput = z.object({
    email: z.preprocess((value) => typeof value === 'string' ? value.trim().toLowerCase() : value, z.email().max(254)),
    full_name: z.string().trim().max(120).optional().default(''),
    role: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).optional().default('viewer'),
    shop_id: z.preprocess((value) => value === '' ? undefined : value, z.uuid().optional()),
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

/** Алдаа гарвал шинэ Auth бүртгэл эсвэл шинээр нэмсэн гишүүнчлэлийг буцаана. */
export async function provisionUserAccess(db: AdminDb, input: {
    actorId: string; userId: string; email: string; fullName?: string;
    role: string; shopId: string; isNew: boolean;
}): Promise<{ error: string; status: number; partial_failure?: boolean } | null> {
    let addedMembership = false;
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
        // Write the role last: a failed profile/membership must never demote an existing account.
        const { error } = await db.from('user_roles').upsert({ user_id: input.userId, role: input.role }, { onConflict: 'user_id' });
        if (error) throw error;
        return null;
    } catch (error) {
        console.error('User provisioning failed:', error);
        let rollbackError: unknown;
        try {
            if (input.isNew) {
                ({ error: rollbackError } = await db.auth.admin.deleteUser(input.userId));
            } else if (addedMembership) {
                ({ error: rollbackError } = await db.from('shop_members').delete()
                    .eq('shop_id', input.shopId).eq('user_id', input.userId));
            }
        } catch (error) { rollbackError = error; }
        if (rollbackError) {
            console.error('User provisioning rollback failed:', rollbackError);
            return { error: 'Бүртгэлийн холболт дутуу үүссэн бөгөөд буцаах үйлдэл амжилтгүй. Админ хэрэглэгчийн дүр, гишүүнчлэлийг шалгана уу.', status: 500, partial_failure: true };
        }
        return { error: 'Бүртгэлийн холболт үүссэнгүй. Өөрчлөлтийг буцаасан тул дахин оролдоно уу.', status: 500 };
    }
}

/** A multi-shop installation must always name the destination shop explicitly. */
export async function resolveTargetShop(db: AdminDb, shopId: unknown): Promise<{ id?: string; error?: string }> {
    if (shopId !== undefined && shopId !== null && shopId !== '') {
        if (!z.uuid().safeParse(shopId).success) return { error: 'Байгууллагын ID буруу байна' };
        const { data, error } = await db.from('shops').select('id').eq('id', shopId).maybeSingle();
        if (error) throw error;
        return data ? { id: data.id } : { error: 'Сонгосон байгууллага олдсонгүй' };
    }

    const { data, error } = await db.from('shops').select('id').limit(2);
    if (error) throw error;
    if (data?.length === 1) return { id: data[0].id };
    return { error: data?.length ? 'Байгууллага сонгоно уу' : 'Эхлээд байгууллага үүсгэнэ үү' };
}
