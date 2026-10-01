import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logAdminAudit } from '@/lib/admin/audit';
import { getAdminUser } from '@/lib/admin/auth';
import { adminUserInput, checkRoleAssignment, isAssignableRole, provisionUserAccess, resolveTargetShop } from '@/lib/admin/user-provisioning';
import { fetchAllRows } from '@/lib/utils/pagination';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

const roleChangeInput = z.object({
    userId: z.uuid(),
    role: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
    shop_id: z.preprocess(value => value === '' ? undefined : value, z.uuid().optional()),
});
const passwordInput = z.string().min(8).max(1024);

/**
 * Үүсгэсэн/шинэчилсэн нууц үгээр нэвтрэлт БОДИТООР ажиллаж буйг сервер талд
 * шалгана (anon key, session хадгалахгүй). Ингэснээр "нууц үг өгсөн ч орохгүй"
 * асуудал үүсгэх үед нь шууд илэрч, админд жинхэнэ шалтгаан нь харагдана.
 */
async function verifyLoginWorks(
    email: string,
    password: string,
): Promise<{ ok: boolean; reason?: string }> {
    try {
        const anon = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await anon.auth.signInWithPassword({ email, password });
        if (error || !data?.user) {
            return { ok: false, reason: error?.code || error?.message || 'unknown' };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : 'network' };
    }
}

/**
 * GET /api/admin/users — List all users with roles
 * Uses Supabase Admin API instead of direct pg connection
 */
export async function GET() {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        // Get all users via Supabase Admin API
        const authUsers: User[] = [];
        for (let page = 1; ; page++) {
            const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw error;
            authUsers.push(...data.users);
            if (data.users.length < 1000) break;
        }

        // Get all roles
        const [roles, profiles, shops, members, managers] = await Promise.all([
            fetchAllRows<{ user_id: string; role: string }>((from, to) =>
                supabase.from('user_roles').select('user_id, role').range(from, to)),
            fetchAllRows<{ id: string; full_name: string | null }>((from, to) =>
                supabase.from('user_profiles').select('id, full_name').range(from, to)),
            fetchAllRows<{ id: string; name: string; user_id: string }>((from, to) =>
                supabase.from('shops').select('id, name, user_id').range(from, to)),
            fetchAllRows<{ user_id: string; shop_id: string }>((from, to) =>
                supabase.from('shop_members').select('user_id, shop_id').range(from, to)),
            fetchAllRows<{ user_id: string | null; shop_id: string; name: string; is_active: boolean }>((from, to) =>
                supabase.from('sales_managers').select('user_id, shop_id, name, is_active').range(from, to)),
        ]);

        const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
        const memberKeys = new Set(members.map(member => `${member.user_id}:${member.shop_id}`));

        const users = (authUsers || []).map(u => ({
            id: u.id,
            email: u.email || '',
            full_name: profileMap.get(u.id) || u.user_metadata?.full_name || null,
            role: roleMap.get(u.id) || 'viewer',
            created_at: u.created_at,
            email_confirmed: Boolean(u.email_confirmed_at),
            last_sign_in_at: u.last_sign_in_at || null,
            shops: shops.filter(shop => shop.user_id === u.id || memberKeys.has(`${u.id}:${shop.id}`))
                .map(shop => ({ id: shop.id, name: shop.name, is_owner: shop.user_id === u.id })),
            manager_shops: managers.filter(manager => manager.user_id === u.id && manager.is_active)
                .map(manager => ({ shop_id: manager.shop_id, name: manager.name })),
        }));

        // Sort by created_at desc
        users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return NextResponse.json({ users, actor_id: admin.id });
    } catch (error) {
        console.error('GET /api/admin/users error:', error);
        return safeErrorResponse(error, 'Хэрэглэгчдийн жагсаалт унших үед алдаа гарлаа');
    }
}

/**
 * PATCH /api/admin/users — Update user role
 */
export async function PATCH(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });

        const parsed = roleChangeInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
            return NextResponse.json({ error: 'Хэрэглэгч эсвэл дүр буруу байна' }, { status: 400 });
        const { userId: targetUserId, role, shop_id } = parsed.data;
        const denied = await checkRoleAssignment(supabase, userId, targetUserId, role);
        if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
        const { data: target, error: targetError } = await supabase.auth.admin.getUserById(targetUserId);
        if (targetError || !target?.user)
            return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 });

        let managerShopId: string | undefined;
        if (role === 'sales_manager') {
            const shop = await resolveTargetShop(supabase, shop_id);
            if (!shop.id) return NextResponse.json({ error: shop.error }, { status: 400 });
            managerShopId = shop.id;
            const provisioningError = await provisionUserAccess(supabase, {
                actorId: userId, userId: targetUserId, email: target.user.email || '',
                role, shopId: shop.id, isNew: false,
            });
            if (provisioningError) return NextResponse.json(provisioningError, { status: provisioningError.status });
        } else {
            const { error } = await supabase.from('user_roles')
                .upsert({ user_id: targetUserId, role }, { onConflict: 'user_id' });
            if (error) return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');
        }

        await logAdminAudit({ actorId: userId, action: role === 'super_admin' ? 'user.super_admin_grant' : 'user.role_update', targetId: targetUserId, meta: { role, shop_id: managerShopId } });

        return NextResponse.json({ success: true, message: `Role updated to ${role}` });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');
    }
}

/**
 * POST /api/admin/users — Create a new user (admin only)
 * Uses Supabase Admin API for proper user creation
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : body?.email;
        // Login preserves the exact password; creating/resetting must do the same.
        const password = body?.password;
        const parsed = adminUserInput.safeParse({ ...body, email });
        if (!parsed.success || !passwordInput.safeParse(password).success) {
            return NextResponse.json({ error: 'Имэйл, дүр эсвэл байгууллагын мэдээлэл буруу байна' }, { status: 400 });
        }
        const { full_name, role } = parsed.data;
        if (role === 'sales_manager' && (!full_name || full_name === email))
            return NextResponse.json({ error: 'Борлуулалтын менежерийн бодит нэрийг оруулна уу' }, { status: 400 });
        if (!await isAssignableRole(supabase, role))
            return NextResponse.json({ error: 'Сонгосон дүр олдсонгүй' }, { status: 400 });
        const shop = await resolveTargetShop(supabase, parsed.data.shop_id);
        if (!shop.id) return NextResponse.json({ error: shop.error }, { status: 400 });

        // Create user via Supabase Admin API
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: full_name || email,
            },
        });

        if (createError) {
            if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
                // Урилгаар үүссэн (нууц үггүй) бүртгэл байх магадлалтай — админ
                // жагсаалтаас "Нууц үг" товчоор нууц үг тавьж өгч болно.
                return NextResponse.json(
                    { error: 'Энэ имэйл хаягаар бүртгэл үүссэн байна. Жагсаалтаас тухайн хэрэглэгчийн "Нууц үг" товчийг ашиглан нууц үг тавьж өгнө үү.' },
                    { status: 409 },
                );
            }
            console.error('Create user error:', createError);
            return NextResponse.json({ error: 'Хэрэглэгч үүсгэх үед алдаа: ' + createError.message }, { status: 500 });
        }

        const newUserId = newUser?.user?.id;
        if (!newUserId) return NextResponse.json({ error: 'Хэрэглэгчийн бүртгэл бүрэн үүссэнгүй' }, { status: 500 });
        const provisioningError = await provisionUserAccess(supabase, {
            actorId: userId, userId: newUserId, email, fullName: full_name, role, shopId: shop.id, isNew: true,
        });
        if (provisioningError) return NextResponse.json(provisioningError, { status: provisioningError.status });

        const warnings: string[] = [];

        // Нэвтрэлт бодитоор ажиллаж буйг шууд шалгана — асуудал байвал үүсгэх
        // мөчид нь админд харагдана (хэрэглэгч рүү очиж унахаас өмнө).
        const verify = await verifyLoginWorks(email, password);
        if (!verify.ok) {
            warnings.push(`Нэвтрэлтийн шалгалт амжилтгүй (${verify.reason}) — Supabase Auth тохиргоог шалгана уу`);
        }

        await logAdminAudit({ actorId: userId, action: 'user.create', targetId: newUserId, meta: { email, role: role || 'viewer', login_verified: verify.ok } });

        return NextResponse.json({
            success: true,
            login_verified: verify.ok,
            warning: warnings.length > 0 ? warnings.join(' / ') : null,
            user: {
                id: newUserId,
                email,
                full_name: full_name || null,
                role: role || 'viewer',
                created_at: new Date().toISOString(),
            },
        }, { status: 201 });
    } catch (error) {
        console.error('POST /api/admin/users full error:', error);
        return safeErrorResponse(error, 'Хэрэглэгч үүсгэх үед алдаа гарлаа');
    }
}

/**
 * PUT /api/admin/users — Одоо байгаа хэрэглэгчийн нууц үгийг шинэчлэх (super_admin).
 *
 * "Нууц үг өгсөн ч орохгүй" гацааны гол шийдэл: урилгаар үүссэн (нууц үггүй)
 * эсвэл нууц үгээ мартсан хэрэглэгчид админ шинэ нууц үг тавьж өгнө.
 * email_confirm: true давхар тавигдана — баталгаажаагүй имэйл нэвтрэлтийг
 * блоклохоос сэргийлнэ. Дараа нь нэвтрэлт бодитоор ажиллаж буйг шалгана.
 */
export async function PUT(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const parsed = z.object({ userId: z.uuid(), password: passwordInput })
            .safeParse(await request.json().catch(() => null));
        if (!parsed.success)
            return NextResponse.json({ error: 'Хэрэглэгчийн ID болон 8–1024 тэмдэгттэй нууц үг шаардлагатай' }, { status: 400 });
        const { userId: targetUserId, password } = parsed.data;

        const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
            targetUserId,
            { password, email_confirm: true },
        );
        if (updateError || !updated?.user) {
            console.error('Password reset error:', updateError);
            return NextResponse.json(
                { error: 'Нууц үг шинэчлэх үед алдаа: ' + (updateError?.message || 'тодорхойгүй') },
                { status: 500 },
            );
        }

        const email = updated.user.email || '';
        const verify = email
            ? await verifyLoginWorks(email, password)
            : { ok: false, reason: 'no-email' };

        await logAdminAudit({
            actorId: userId,
            action: 'user.password_reset',
            targetId: targetUserId,
            meta: { email, login_verified: verify.ok },
        });

        return NextResponse.json({
            success: true,
            login_verified: verify.ok,
            warning: verify.ok
                ? null
                : `Нэвтрэлтийн шалгалт амжилтгүй (${verify.reason}) — Supabase Auth тохиргоог шалгана уу`,
        });
    } catch (error) {
        console.error('PUT /api/admin/users error:', error);
        return safeErrorResponse(error, 'Нууц үг шинэчлэх үед алдаа гарлаа');
    }
}

/**
 * DELETE /api/admin/users — Delete a user (super_admin only)
 * Uses Supabase Admin API for proper user deletion
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check super_admin
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get('userId');

        if (!z.uuid().safeParse(targetUserId).success) {
            return NextResponse.json({ error: 'Хэрэглэгчийн ID буруу байна' }, { status: 400 });
        }

        // Prevent self-deletion
        if (targetUserId === userId) {
            return NextResponse.json({ error: 'Өөрийгөө устгах боломжгүй' }, { status: 400 });
        }

        // shops.user_id cascades through user_profiles: deleting an owner would delete
        // the whole shop and all CRM data. Refuse until ownership is reassigned.
        const { data: ownedShops, error: ownerError } = await supabase.from('shops')
            .select('id').eq('user_id', targetUserId!).limit(1);
        if (ownerError) throw ownerError;
        if (ownedShops?.length)
            return NextResponse.json({ error: 'Байгууллагын эзэмшигчийг устгах боломжгүй. Эхлээд эзэмшлийг шилжүүлнэ үү' }, { status: 409 });

        // Auth deletion cascades to profile, role and membership rows.
        const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId!);

        if (deleteError) {
            console.error('Delete user error:', deleteError);
            return NextResponse.json({ error: 'Хэрэглэгч устгах үед алдаа: ' + deleteError.message }, { status: 500 });
        }

        await logAdminAudit({ actorId: userId, action: 'user.delete', targetId: targetUserId! });

        return NextResponse.json({
            success: true,
            message: 'Хэрэглэгч амжилттай устгагдлаа',
        });
    } catch (error) {
        console.error('DELETE /api/admin/users error:', error);
        return safeErrorResponse(error, 'Хэрэглэгч устгах үед алдаа гарлаа');
    }
}
