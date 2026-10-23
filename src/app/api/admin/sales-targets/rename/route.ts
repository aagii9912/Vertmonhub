import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId, assertShopAccess } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { renameCountsText, renameSalesManager, SalesManagerRenameSchema } from '@/lib/sales/manager-rename';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * POST /api/admin/sales-targets/rename — body { shopId, oldName, newName } (зөвхөн super_admin).
 * Менежерийн бүртгэлийн нэр ба тэр нэрийг түлхүүр болгосон бүх бүртгэлийг (лид, уулзалт, гэрээ, өдрийн тайлан, KPI…)
 * `rename_sales_manager` RPC-ээр нэг гүйлгээнд солино, admin_audit_log-д хүснэгт бүрийн тоог бичнэ.
 * 409: шинэ нэр бүртгэлд байна, тэр нэрийн өгөгдөл давхцана эсвэл аль нэг хүснэгтийн шалгалт (23514, RPC хүснэгтийг нэрлэнэ)
 * зөвшөөрөөгүй — юу ч өөрчлөгдөөгүй; 404: хуучин нэр бүртгэлд алга.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!await getAdminUser()) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const parsed = SalesManagerRenameSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Менежерийн шинэ нэр 1–120 тэмдэгт, одоогийн нэрээс өөр байна' }, { status: 400 });
        }
        if (!await assertShopAccess(parsed.data.shopId)) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });

        const { data, error } = await renameSalesManager(supabaseAdmin(), parsed.data, userId);
        if (error) {
            // RPC-ийн Mongolian мессежүүд нь хэрэглэгчид зориулагдсан (нэр орсон); бусад алдааг ерөнхий хариугаар.
            if (error.code === '23505') return NextResponse.json({ error: error.message || 'Шинэ нэртэй менежер бүртгэлд байна' }, { status: 409 });
            if (error.code === '23514') {
                // RPC шалгалтын алдааг Монгол мессежээр (хүснэгтийн нэртэй) ороодог; англи constraint текстийг дамжуулахгүй.
                const message = /[\u0400-\u04FF]/.test(error.message ?? '') ? error.message
                    : 'Нэр солих боломжгүй: холбогдох бүртгэлийн шалгалт шинэ нэрийг зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.';
                return NextResponse.json({ error: message }, { status: 409 });
            }
            if (error.code === 'P0002') return NextResponse.json({ error: error.message || 'Менежер бүртгэлд олдсонгүй' }, { status: 404 });
            if (error.code === '22023') return NextResponse.json({ error: error.message || 'Менежерийн шинэ нэр буруу байна' }, { status: 400 });
            if (error.code === '42501') return NextResponse.json({ error: 'Энэ төсөлд менежерийн нэр солих эрхгүй' }, { status: 403 });
            if (error.code === 'PGRST202' || error.code === '42883') {
                return NextResponse.json({ error: 'Менежерийн нэр солих өгөгдлийн сангийн шинэчлэл хийгдээгүй байна' }, { status: 503 });
            }
            return safeErrorResponse(error, 'Менежерийн нэрийг солиход алдаа гарлаа');
        }
        return NextResponse.json({ success: true, ...data!, summary: renameCountsText(data!.counts) }, { headers: NO_STORE });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн нэрийг солиход алдаа гарлаа');
    }
}
