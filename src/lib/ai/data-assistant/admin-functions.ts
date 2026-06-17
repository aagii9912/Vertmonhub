/**
 * Data Assistant — Admin mutating functions (ЗӨВХӨН super_admin)
 *
 * Хэрэглэгч урих, дүр оноох, дүр үүсгэх зэрэг өндөр эрхийн үйлдлүүд.
 * confirm=false → preview (зөвшөөрөл хүснэ), confirm=true → бодит үйлдэл.
 */

import { supabaseAdmin } from '@/lib/supabase';

function confirmNeeded(tool: string, args: any, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

/** Хэрэглэгчийг имэйлээр урьж, дүр + дэлгүүрийн гишүүнчлэл онооно. */
export async function inviteUser(shopId: string, args: any, confirm = false) {
    if (!args.email) return { error: 'email шаардлагатай' };
    const role = args.role || 'viewer';
    const targetShop = args.shop_id || shopId;

    if (!confirm) {
        return confirmNeeded('invite_user', { email: args.email, role, shop_id: targetShop },
            `Хэрэглэгч урих: ${args.email}`,
            { Имэйл: args.email, 'Дүр (role)': role, 'Дэлгүүр': targetShop || '-' });
    }

    const db = supabaseAdmin();
    const { data: invited, error } = await db.auth.admin.inviteUserByEmail(args.email);
    if (error || !invited?.user) {
        return { error: `Урилга илгээхэд алдаа: ${error?.message || 'тодорхойгүй (Supabase email тохиргоо шалгана уу)'}` };
    }
    const uid = invited.user.id;
    await db.from('user_profiles').upsert({ id: uid, email: args.email });
    await db.from('user_roles').upsert({ user_id: uid, role }, { onConflict: 'user_id' });
    if (targetShop) {
        await db.from('shop_members').upsert({ shop_id: targetShop, user_id: uid, role: 'member' }, { onConflict: 'shop_id,user_id' });
    }
    return { success: true, message: `${args.email} хаягт урилга илгээж, "${role}" дүр оноолоо.`, userId: uid };
}

/** Бүртгэлтэй хэрэглэгчид (имэйлээр) дүр оноох/солих. */
export async function assignRole(_shopId: string, args: any, confirm = false) {
    if (!args.email || !args.role) return { error: 'email ба role шаардлагатай' };
    const db = supabaseAdmin();

    const { data: prof } = await db.from('user_profiles').select('id, email').ilike('email', args.email).maybeSingle();
    if (!prof) return { error: `"${args.email}" хэрэглэгч олдсонгүй (эхлээд урих шаардлагатай байж магадгүй)` };

    if (!confirm) {
        return confirmNeeded('assign_role', { email: prof.email, role: args.role },
            `Дүр оноох: ${prof.email} → ${args.role}`,
            { Хэрэглэгч: prof.email, 'Шинэ дүр': args.role });
    }

    const { error } = await db.from('user_roles').upsert({ user_id: prof.id, role: args.role }, { onConflict: 'user_id' });
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `${prof.email}-д "${args.role}" дүр оноолоо.` };
}

/** Шинэ дүр (role) + модулийн эрхүүдийг үүсгэх. */
export async function createRole(_shopId: string, args: any, confirm = false) {
    if (!args.name || !args.display_name_mn) return { error: 'name ба display_name_mn шаардлагатай' };
    const name = String(args.name).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const modules: string[] = Array.isArray(args.modules) ? args.modules : [];

    if (!confirm) {
        return confirmNeeded('create_role', { ...args, name },
            `Шинэ дүр үүсгэх: ${name}`,
            {
                Нэр: name, 'Монгол нэр': args.display_name_mn,
                Бичих: args.can_write ? 'тийм' : 'үгүй', Устгах: args.can_delete ? 'тийм' : 'үгүй',
                Модулиуд: modules.join(', ') || '-',
            });
    }

    const db = supabaseAdmin();
    const { data: role, error } = await db.from('roles').insert({
        name,
        display_name: args.display_name || name,
        display_name_mn: args.display_name_mn,
        description: args.description || null,
        can_write: !!args.can_write,
        can_delete: !!args.can_delete,
        can_access_admin: !!args.can_access_admin,
        is_system: false,
    }).select('id, name').single();
    if (error) return { error: `Алдаа: ${error.message}` };

    if (modules.length > 0) {
        const rows = modules.map((m) => ({ role_id: role.id, module: m }));
        await db.from('role_permissions').insert(rows);
    }
    return { success: true, message: `"${role.name}" дүр үүсгэлээ.`, roleId: role.id };
}
