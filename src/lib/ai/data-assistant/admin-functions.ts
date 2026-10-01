/**
 * Data Assistant — Admin mutating functions (ЗӨВХӨН super_admin)
 *
 * Хэрэглэгч урих, дүр оноох, дүр үүсгэх зэрэг өндөр эрхийн үйлдлүүд.
 * confirm=false → preview (зөвшөөрөл хүснэ), confirm=true → бодит үйлдэл.
 */

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUserInput, checkRoleAssignment, isAssignableRole, provisionUserAccess, resolveTargetShop } from '@/lib/admin/user-provisioning';
import { ALL_MODULES, clearPermissionsCache } from '@/lib/rbac';
import { CreateRoleSchema } from '@/lib/validations/schemas';

function confirmNeeded(tool: string, args: any, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

function loginUrl(): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    return base ? `${base}/auth/login` : '(аппын нэвтрэх хуудас)';
}

async function userCanAccessShop(db: ReturnType<typeof supabaseAdmin>, userId: string, shopId: string): Promise<boolean> {
    const [owned, member] = await Promise.all([
        db.from('shops').select('id').eq('id', shopId).eq('user_id', userId).maybeSingle(),
        db.from('shop_members').select('id').eq('shop_id', shopId).eq('user_id', userId).maybeSingle(),
    ]);
    if (owned.error) throw owned.error;
    if (member.error) throw member.error;
    return !!owned.data || !!member.data;
}

/** Шинэ хэрэглэгчид түр нууц үг үүсгэнэ; бүртгэлтэй хэрэглэгчийн нууц үгийг хадгална. */
export async function inviteUser(shopId: string, args: any, confirm = false, actingUserId?: string) {
    try {
        if (!actingUserId) return { error: 'Үйлдэл хийж буй хэрэглэгч тодорхойгүй байна' };
        const parsed = adminUserInput.safeParse({ ...args, shop_id: args.shop_id || shopId });
        if (!parsed.success) return { error: 'Имэйл, дүр эсвэл байгууллагын мэдээлэл буруу байна' };
        const { email, role, full_name } = parsed.data;
        const db = supabaseAdmin();
        if (!await isAssignableRole(db, role)) return { error: 'Сонгосон дүр олдсонгүй' };
        const shop = await resolveTargetShop(db, parsed.data.shop_id);
        if (!shop.id) return { error: shop.error };
        if (!await userCanAccessShop(db, actingUserId, shop.id))
            return { error: 'Та энэ төсөлд хэрэглэгч урих эрхгүй (тухайн төсөлд харьяалагдахгүй байна).' };

        const { data: profile, error: profileError } = await db.from('user_profiles').select('id').eq('email', email).maybeSingle();
        if (profileError) throw profileError;
        if (profile) {
            const denied = await checkRoleAssignment(db, actingUserId, profile.id, role);
            if (denied) return { error: denied.error };
            const { data, error } = await db.auth.admin.getUserById(profile.id);
            if (error || !data?.user) return { error: 'Бүртгэлтэй хэрэглэгчийн Auth мэдээлэл уншигдсангүй' };
        }
        if (!confirm) return confirmNeeded('invite_user', { email, role, full_name, shop_id: shop.id },
            `Хэрэглэгч нэмэх: ${email}`,
            { Имэйл: email, 'Дүр (role)': role, 'Төсөл': shop.id });

        let uid = profile?.id;
        let tempPassword: string | undefined;
        if (!uid) {
            if (role === 'sales_manager' && (!full_name || full_name === email))
                return { error: 'Борлуулалтын менежерийн бодит нэрийг оруулна уу' };
            tempPassword = `Vh1${randomBytes(18).toString('base64url')}!`;
            const { data, error } = await db.auth.admin.createUser({
                email, password: tempPassword, email_confirm: true, user_metadata: { full_name: full_name || email },
            });
            if (error || !data?.user?.id) return { error: 'Хэрэглэгч үүссэнгүй. Бүртгэлтэй имэйл бол хэрэглэгчийн жагсаалтаас дүрийг нь өөрчилнө үү.' };
            uid = data.user.id;
        }
        const provisioningError = await provisionUserAccess(db, {
            actorId: actingUserId, userId: uid, email, fullName: full_name, role, shopId: shop.id, isNew: !profile,
        });
        if (provisioningError) return provisioningError;
        if (profile) return {
            success: true, userId: uid,
            message: `${email}-д "${role}" дүр болон төслийн гишүүнчлэл оноолоо. Одоо байгаа нууц үгээрээ нэвтэрнэ.`,
        };
        return {
            success: true, userId: uid,
            message: `Хэрэглэгч амжилттай үүсгэлээ. Доорх мэдээллийг тухайн хүнд дамжуулна уу (имэйл автоматаар илгээгдэхгүй):\n\n` +
                `- **Имэйл:** ${email}\n- **Түр нууц үг:** \`${tempPassword}\`\n- **Нэвтрэх хаяг:** ${loginUrl()}\n- **Эрх:** ${role}\n\n` +
                'Тухайн хүн анх нэвтэрсний дараа нууц үгээ солихыг зөвлөж байна.',
        };
    } catch (error) {
        console.error('AI user invite failed:', error);
        return { error: 'Хэрэглэгч урих мэдээллийг бүрэн шалгаж чадсангүй. Дахин оролдоно уу.' };
    }
}

/** API-тай ижил дүрийн шалгалт: тодорхой дүр, өөр хэрэглэгч, баталгаажуулалт. */
export async function assignRole(shopId: string, args: any, confirm = false, actingUserId?: string) {
    try {
        const parsed = adminUserInput.safeParse(args);
        if (!parsed.success || !args.role) return { error: 'Имэйл эсвэл дүр буруу байна' };
        const { email, role } = parsed.data;
        const db = supabaseAdmin();
        const { data: profile, error } = await db.from('user_profiles').select('id, email').eq('email', email).maybeSingle();
        if (error) throw error;
        if (!profile) return { error: 'Хэрэглэгч олдсонгүй (эхлээд урих шаардлагатай байж магадгүй)' };
        const denied = await checkRoleAssignment(db, actingUserId, profile.id, role);
        if (denied) return { error: denied.error };
        const { data: target, error: targetError } = await db.auth.admin.getUserById(profile.id);
        if (targetError || !target?.user) return { error: 'Хэрэглэгчийн Auth мэдээлэл уншигдсангүй' };
        if (!confirm) return confirmNeeded('assign_role', { email, role },
            `Дүр оноох: ${email} → ${role}`, { Хэрэглэгч: email, 'Шинэ дүр': role });
        if (role === 'sales_manager') {
            const shop = await resolveTargetShop(db, args.shop_id || shopId);
            if (!shop.id) return { error: shop.error };
            if (!await userCanAccessShop(db, actingUserId!, shop.id))
                return { error: 'Та энэ байгууллагад харьяалагдахгүй байна' };
            const provisioningError = await provisionUserAccess(db, {
                actorId: actingUserId!, userId: profile.id, email, role, shopId: shop.id, isNew: false,
            });
            if (provisioningError) return provisioningError;
        } else {
            const { error: roleError } = await db.from('user_roles').upsert({ user_id: profile.id, role }, { onConflict: 'user_id' });
            if (roleError) throw roleError;
        }
        return { success: true, message: `${email}-д "${role}" дүр оноолоо.` };
    } catch (error) {
        console.error('AI role assignment failed:', error);
        return { error: 'Хэрэглэгчийн дүр оноогдсонгүй. Дахин оролдоно уу.' };
    }
}

/** Дүр ба модулийн эрхүүдийн аль нэг нь үүсээгүй бол амжилт гэж буцаахгүй. */
export async function createRole(_shopId: string, args: any, confirm = false) {
    try {
        const parsed = CreateRoleSchema.safeParse({ ...args, display_name: args.display_name || args.name });
        if (!parsed.success) return { error: 'Дүрийн нэр эсвэл тохиргоо буруу байна' };
        const { modules = [], ...fields } = parsed.data;
        if (modules.some(module => !ALL_MODULES.includes(module as typeof ALL_MODULES[number])))
            return { error: 'Танигдаагүй модуль байна' };
        if (new Set(modules).size !== modules.length) return { error: 'Модуль давхар сонгогдсон байна' };
        if (!confirm) return confirmNeeded('create_role', { ...fields, modules }, `Шинэ дүр үүсгэх: ${fields.name}`, {
            Нэр: fields.name, 'Монгол нэр': fields.display_name_mn,
            Бичих: fields.can_write ? 'тийм' : 'үгүй', Устгах: fields.can_delete ? 'тийм' : 'үгүй',
            Модулиуд: modules.join(', ') || '-',
        });
        const db = supabaseAdmin();
        const { data: role, error } = await db.from('roles').insert({ ...fields, is_system: false }).select('id, name').single();
        if (error || !role) return { error: 'Дүр үүссэнгүй. Нэр давхардсан эсэхийг шалгана уу.' };
        if (modules.length) {
            let permissionError: unknown;
            try { ({ error: permissionError } = await db.from('role_permissions').insert(modules.map(module => ({ role_id: role.id, module })))); }
            catch (error) { permissionError = error; }
            if (permissionError) {
                console.error('AI role permission creation failed:', permissionError);
                try {
                    const { error: rollbackError } = await db.from('roles').delete().eq('id', role.id);
                    if (rollbackError) throw rollbackError;
                } catch (error) {
                    console.error('AI role rollback failed:', error);
                    return { error: 'Дүрийн модулиуд үүссэнгүй, дутуу дүрийг буцааж устгаж чадсангүй. Админ дүрийг шалгана уу.', partial_failure: true, roleId: role.id };
                }
                return { error: 'Модулийн эрх үүссэнгүй. Дутуу дүрийг буцаасан тул дахин оролдоно уу.' };
            }
        }
        clearPermissionsCache(fields.name);
        return { success: true, message: `"${role.name}" дүр үүсгэлээ.`, roleId: role.id };
    } catch (error) {
        console.error('AI role creation failed:', error);
        return { error: 'Дүр үүсгэх мэдээллийг бүрэн шалгаж чадсангүй. Дахин оролдоно уу.' };
    }
}
