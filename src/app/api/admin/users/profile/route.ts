import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { logAdminAudit } from '@/lib/admin/audit';
import {
    LINKED_MANAGER_RENAME_ERROR, MANAGER_NAME_REQUIRED, STAFF_PHONE_ERROR, managerNameMissing, staffPhoneInput,
} from '@/lib/admin/staff-profile';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const input = z.object({
    userId: z.uuid(),
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: staffPhoneInput.optional(),
}).strict();

type Profile = { id: string; email: string; full_name: string | null; phone: string | null };

/**
 * PATCH /api/admin/users/profile — ажилтны профайлын нэр, утсыг засна (super_admin).
 *
 * Утсыг үргэлж засна (хоосон бол арилгана). Нэрийг менежерийн бүртгэлтэй (идэвхгүй мөр ч)
 * холбогдсон акаунтад солихгүй (409): ERP, KPI, лидийн хариуцагч roster-ийн нэрээр
 * холбогддог, идэвхгүй холбоос дахин идэвхжихдээ хуучин нэрээрээ сэргэдэг. Профайлын нэр
 * зөрвөл нэг акаунт хоёр нэрээр бүртгэгдэж салбарлана. Ийм нэрийг Борлуулалтын
 * төлөвлөгөө хэсэгт удирдана.
 *
 * Профайлгүй Auth акаунт (OAuth бүртгэл г.м. — профайлыг Auth trigger үүсгэдэггүй):
 * Auth-аас баталгаажуулж, Auth-ийн имэйлтэй профайлыг энд үүсгэнэ.
 */
export async function PATCH(request: NextRequest) {
    try {
        const actorId = await getUserId();
        if (!actorId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });

        const parsed = input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            const phoneIssue = parsed.error.issues.some(issue => issue.path[0] === 'phone');
            return NextResponse.json({ error: phoneIssue ? STAFF_PHONE_ERROR : 'Хэрэглэгч, нэр эсвэл утасны мэдээлэл буруу байна' }, { status: 400 });
        }
        const { userId, full_name, phone } = parsed.data;
        if (full_name === undefined && phone === undefined)
            return NextResponse.json({ error: 'Өөрчлөх нэр эсвэл утас оруулна уу' }, { status: 400 });

        const db = supabaseAdmin();
        const { data: stored, error: profileError } = await db.from('user_profiles')
            .select('id, email, full_name, phone').eq('id', userId).maybeSingle();
        if (profileError) throw profileError;
        let profile: Profile | null = stored;
        const createProfile = !profile;
        if (!profile) {
            const { data: auth, error: authError } = await db.auth.admin.getUserById(userId);
            if (authError && authError.status !== 404) throw authError;
            if (!auth?.user) return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 });
            const email = auth.user.email?.trim().toLowerCase();
            if (!email) return NextResponse.json({ error: 'Имэйлгүй акаунтад профайл үүсгэх боломжгүй' }, { status: 409 });
            profile = { id: userId, email, full_name: null, phone: null };
        }

        const patch: { full_name?: string; phone?: string | null } = {};
        if (full_name !== undefined && full_name !== (profile.full_name || '').trim()) {
            const [roleResult, linkResult] = await Promise.all([
                db.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
                // Идэвхгүй мөрийг ч тооцно: provisioning акаунтын холбоосыг is_active-аас үл
                // хамааран олж, хуучин нэрээр нь дахин идэвхжүүлдэг.
                db.from('sales_managers').select('shop_id').eq('user_id', userId).limit(1),
            ]);
            if (roleResult.error) throw roleResult.error;
            if (linkResult.error) throw linkResult.error;
            if (linkResult.data?.length) return NextResponse.json({ error: LINKED_MANAGER_RENAME_ERROR }, { status: 409 });
            if (managerNameMissing(roleResult.data?.role, full_name, profile.email))
                return NextResponse.json({ error: MANAGER_NAME_REQUIRED }, { status: 400 });
            patch.full_name = full_name;
        }
        if (phone !== undefined && phone !== (profile.phone ?? null)) patch.phone = phone;

        const current = { id: profile.id, full_name: profile.full_name ?? null, phone: profile.phone ?? null };
        if (!Object.keys(patch).length) return NextResponse.json({ success: true, unchanged: true, user: current });

        const now = new Date().toISOString();
        // Шинэ профайлыг insert-ээр үүсгэнэ: зэрэг үүссэн профайлыг чимээгүй дарж бичихгүй.
        const { data: updated, error } = createProfile
            ? await db.from('user_profiles').insert({ id: userId, email: profile.email, ...patch, updated_at: now })
                .select('id, full_name, phone').maybeSingle()
            : await db.from('user_profiles').update({ ...patch, updated_at: now })
                .eq('id', userId).select('id, full_name, phone').maybeSingle();
        if (error?.code === '23505')
            return NextResponse.json({ error: 'Профайл зэрэг үүссэн эсвэл ижил имэйлтэй өөр профайл байна. Жагсаалтыг шинэчлээд дахин оролдоно уу.' }, { status: 409 });
        if (error) throw error;
        if (!updated) return NextResponse.json({ error: 'Хэрэглэгчийн профайл олдсонгүй' }, { status: 404 });

        // Утас нь хувийн мэдээлэл тул audit-д утгыг нь бичихгүй.
        await logAdminAudit({
            actorId, action: 'user.profile_update', targetId: userId, meta: {
                fields: Object.keys(patch),
                ...(createProfile ? { created: true } : {}),
                ...(patch.full_name !== undefined ? { full_name: { from: profile.full_name ?? null, to: patch.full_name } } : {}),
            },
        });
        return NextResponse.json({ success: true, user: updated });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн профайл хадгалахад алдаа гарлаа');
    }
}
