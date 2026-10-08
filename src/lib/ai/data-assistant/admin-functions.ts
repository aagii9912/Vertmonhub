/**
 * Data Assistant — Admin mutating functions (ЗӨВХӨН super_admin)
 *
 * Хэрэглэгч урих, дүр оноох, дүр үүсгэх зэрэг өндөр эрхийн үйлдлүүд.
 * confirm=false → preview (зөвшөөрөл хүснэ), confirm=true → бодит үйлдэл.
 */

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUserInput, adminUserInputError, checkRoleAssignment, isAssignableRole, provisionUserAccess, resolveTargetShop } from '@/lib/admin/user-provisioning';
import { MANAGER_NAME_REQUIRED, formatStaffPhone, managerNameMissing } from '@/lib/admin/staff-profile';
import { ALL_MODULES, clearPermissionsCache } from '@/lib/rbac';
import { CreateRoleSchema } from '@/lib/validations/schemas';
import { updateUserProjects } from '@/lib/admin/user-projects';
import { getTeamMonthlySales, saveTeamMonthlySales } from '@/lib/sales/targets';
import { MONTHLY_SALES_LABELS, MonthlySalesPatchSchema, SalesYearSchema, type MonthlySalesField } from '@/lib/sales/monthly';
import { ubParts } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { ZodError } from 'zod';

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
        if (!parsed.success) return { error: adminUserInputError(parsed.error) };
        const { email, role, full_name, phone = null } = parsed.data;
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
        // Шинэ менежерийн нэрийг баталгаажуулалтаас ӨМНӨ шалгана (бүртгэлтэй бол профайлын нэр хүчинтэй).
        if (!profile && managerNameMissing(role, full_name, email)) return { error: MANAGER_NAME_REQUIRED };
        if (!confirm) return confirmNeeded('invite_user', { email, role, full_name, phone, shop_id: shop.id },
            `Хэрэглэгч нэмэх: ${email}`,
            {
                Имэйл: email, 'Дүр (role)': role, 'Төсөл': shop.id,
                ...(profile ? { Профайл: 'Бүртгэлтэй — нэр, утас өөрчлөгдөхгүй' }
                    : { Нэр: full_name || '-', Утас: formatStaffPhone(phone) || '-' }),
            });

        let uid = profile?.id;
        let tempPassword: string | undefined;
        if (!uid) {
            tempPassword = `Vh1${randomBytes(18).toString('base64url')}!`;
            const { data, error } = await db.auth.admin.createUser({
                email, password: tempPassword, email_confirm: true, user_metadata: { full_name: full_name || email },
            });
            if (error || !data?.user?.id) return { error: 'Хэрэглэгч үүссэнгүй. Бүртгэлтэй имэйл бол хэрэглэгчийн жагсаалтаас дүрийг нь өөрчилнө үү.' };
            uid = data.user.id;
        }
        const provisioningError = await provisionUserAccess(db, {
            actorId: actingUserId, userId: uid, email, fullName: full_name, phone, role, shopId: shop.id, isNew: !profile,
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
                'Түр нууц үгийг имэйлээр бус утсаар эсвэл биечлэн дамжуулна уу. Нууц үгийг админ «Хэрэглэгчид → Нууц үг» хэсгээс шинэчилнэ.',
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
        // Менежерийн төслийг баталгаажуулалтаас өмнө тогтоож, баталсан үйлдэл ижил төсөлд ажиллана.
        let managerShopId: string | undefined;
        if (role === 'sales_manager') {
            const shop = await resolveTargetShop(db, parsed.data.shop_id || shopId);
            if (!shop.id) return { error: shop.error };
            if (!await userCanAccessShop(db, actingUserId!, shop.id))
                return { error: 'Та энэ төсөлд харьяалагдахгүй байна' };
            managerShopId = shop.id;
        }
        if (!confirm) return confirmNeeded('assign_role', { email, role, ...(managerShopId ? { shop_id: managerShopId } : {}) },
            `Дүр оноох: ${email} → ${role}`, { Хэрэглэгч: email, 'Шинэ дүр': role, ...(managerShopId ? { Төсөл: managerShopId } : {}) });
        if (managerShopId) {
            const provisioningError = await provisionUserAccess(db, {
                actorId: actingUserId!, userId: profile.id, email, role, shopId: managerShopId, isNew: false,
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

const projectNames = (value: unknown) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .map((name) => String(name).trim()).filter(Boolean);

/** Хэрэглэгчийг төсөлд нэмэх/хасах — Admin → Хэрэглэгчид → Төслүүд-тэй нэг дүрэм (`updateUserProjects`). */
export async function setUserProjects(args: any, confirm = false, actingUserId?: string) {
    try {
        if (!actingUserId) return { error: 'Үйлдэл хийж буй хэрэглэгч тодорхойгүй байна' };
        const add = projectNames(args.add_projects);
        const remove = projectNames(args.remove_projects);
        if (!add.length && !remove.length) return { error: 'add_projects эсвэл remove_projects шаардлагатай' };
        const db = supabaseAdmin();

        let users: Array<{ id: string; full_name: string | null; email: string | null }>;
        const who = String(args.user || '').trim();
        if (typeof args.user_id === 'string' && args.user_id) {
            const { data, error } = await db.from('user_profiles').select('id, full_name, email').eq('id', args.user_id).limit(1);
            if (error) throw error;
            users = data || [];
        } else if (who) {
            const pattern = who.replace(/[\\%_]/g, '\\$&');
            const { data, error } = await db.from('user_profiles').select('id, full_name, email')
                .ilike(who.includes('@') ? 'email' : 'full_name', who.includes('@') ? pattern : `%${pattern}%`).limit(5);
            if (error) throw error;
            users = data || [];
        } else {
            return { error: 'user (имэйл эсвэл нэр) шаардлагатай' };
        }
        if (!users.length) return { error: 'Хэрэглэгч олдсонгүй' };
        if (users.length > 1) return { error: 'Олон хэрэглэгч таарлаа — имэйлээр тодруулна уу', options: users.map((u) => ({ name: u.full_name, email: u.email })) };
        const target = users[0];

        const [{ data: shops, error: shopError }, { data: members, error: memberError }] = await Promise.all([
            db.from('shops').select('id, name'),
            db.from('shop_members').select('shop_id').eq('user_id', target.id),
        ]);
        if (shopError) throw shopError;
        if (memberError) throw memberError;
        const byName = (name: string) => (shops || []).find((shop) => String(shop.name || '').trim().toLowerCase() === name.toLowerCase());
        const unknown = [...add, ...remove].filter((name) => !byName(name));
        if (unknown.length) return { error: `Төсөл олдсонгүй: ${unknown.join(', ')}`, options: (shops || []).map((shop) => shop.name) };
        const wanted = new Set((members || []).map((row) => row.shop_id as string));
        for (const name of add) wanted.add(byName(name)!.id);
        for (const name of remove) wanted.delete(byName(name)!.id);

        const label = target.full_name || target.email || 'хэрэглэгч';
        if (!confirm) {
            return confirmNeeded('set_user_projects', { user_id: target.id, add_projects: add, remove_projects: remove }, `Төслийн эрх: ${label}`, {
                Хэрэглэгч: `${label}${target.email && target.full_name ? ` (${target.email})` : ''}`,
                Нэмэх: add.join(', ') || '—', Хасах: remove.join(', ') || '—',
            });
        }
        const result = await updateUserProjects(db, { actorId: actingUserId, userId: target.id, shopIds: [...wanted] });
        if (!result.ok) return { error: result.error, ...(result.partial_failure ? { partial_failure: true } : {}) };
        return { success: true, message: `${label}-ийн төслийн эрхийг шинэчиллээ${add.length ? ` · нэмсэн: ${add.join(', ')}` : ''}${remove.length ? ` · хассан: ${remove.join(', ')}` : ''}.` };
    } catch (error) {
        console.error('AI user projects update failed:', error);
        return { error: 'Хэрэглэгчийн төслийн эрхийг хадгалж чадсангүй. Дахин оролдоно уу.' };
    }
}

/** Admin page and AI share the same revision-checked monthly write. */
export async function setSalesTarget(shopId: string, args: any, confirm = false, actingUserId?: string) {
    try {
        const year = SalesYearSchema.parse(args.year ?? ubParts().year);
        const metricFields: Record<string, MonthlySalesField> = { contract_plan: 'target_amount', cashflow_plan: 'cashflow_target_amount',
            contract_actual: 'manual_contract_actual_amount', cashflow_actual: 'manual_cashflow_actual_amount' };
        const metric = args.metric ?? 'contract_plan';
        const field = metricFields[metric];
        if (!field) return { error: 'Төлөвлөгөө эсвэл гүйцэтгэлийн үзүүлэлтээ сонгоно уу' };
        const patch = MonthlySalesPatchSchema.parse({ month: args.month, expectedRevision: args.expectedRevision ?? 0, [field]: args.amount });
        const { month } = patch;
        const amount = patch[field]!;
        const valueLabel = (value: number | null) => value === null ? 'Оруулаагүй' : formatMNT(value);
        const label = MONTHLY_SALES_LABELS[field];
        const db = supabaseAdmin();
        // Old confirmation cards must be previewed again; never replace the revision silently.
        if (!confirm || args.expectedRevision === undefined) {
            const [current, { data: shop }] = await Promise.all([
                getTeamMonthlySales(db, shopId, year),
                db.from('shops').select('name').eq('id', shopId).maybeSingle(),
            ]);
            return confirmNeeded('set_sales_target', { year, month, metric, amount, expectedRevision: current[month - 1].revision }, `${label}: ${year}-${String(month).padStart(2, '0')}`, {
                Төсөл: shop?.name || '-', Сар: `${year} оны ${month}-р сар`,
                Үзүүлэлт: label, Одоогийн: valueLabel(current[month - 1][field]), Шинэ: valueLabel(amount),
            });
        }
        if (!actingUserId) return { error: 'Үйлдэл хийж буй хэрэглэгч тодорхойгүй байна' };
        const { error } = await saveTeamMonthlySales(db, shopId, year, [patch], actingUserId);
        if (error) return { error: error.code === '40001' ? 'Энэ сарын мэдээлэл өөрчлөгдсөн байна. Шинэ утгыг уншиж дахин батална уу.' : 'Сарын мэдээлэл хадгалахад алдаа гарлаа' };
        return { success: true, message: `${year} оны ${month}-р сарын ${label.toLowerCase()}: ${valueLabel(amount)}.` };
    } catch (error) {
        if (error instanceof ZodError) return { error: 'Он, сар, дүн эсвэл хувилбар буруу байна. Дүн нь 0-ээс дээш, 2 орны нарийвчлалтай байна; null бол цэвэрлэнэ.' };
        console.error('AI sales target update failed:', error);
        return { error: 'Төлөвлөгөөг шалгаж чадсангүй. Дахин оролдоно уу.' };
    }
}
