import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { updateUserProjects } from '@/lib/admin/user-projects';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const input = z.object({
    userId: z.uuid(),
    shopIds: z.array(z.guid()).max(100),
}).strict();

/**
 * PUT /api/admin/users/projects — Ажилтны хандах төслүүдийг (shop = төсөл) тохируулна.
 *
 * Нэмсэн төсөлд гишүүнчлэл үүснэ. Борлуулалтын менежерийг тухайн төслийн бүртгэлд
 * (roster) профайлын нэрээр холбож, ганц төсөлтэй бол төслийн лидийг шууд хариуцуулна.
 * Хассан төсөлд гишүүнчлэл устаж, менежерийн холбоос салж идэвхгүй болно (лид нь нэрээрээ
 * үлдэх тул админ дахин хуваарилна). Эзэмшигчийн төслийг эндээс хасахгүй.
 */
export async function PUT(request: NextRequest) {
    try {
        const actorId = await getUserId();
        if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });

        const parsed = input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Хэрэглэгч эсвэл төсөл буруу байна' }, { status: 400 });
        // Дүрэм нь AI `set_user_projects`-тэй нэг (`updateUserProjects`).
        const result = await updateUserProjects(supabaseAdmin(), { actorId, userId: parsed.data.userId, shopIds: parsed.data.shopIds });
        if (!result.ok) {
            const { ok: _ok, status, ...body } = result;
            return NextResponse.json(body, { status });
        }
        return NextResponse.json({ success: true, added: result.added, removed: result.removed });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн төслийн эрх хадгалахад алдаа гарлаа');
    }
}
