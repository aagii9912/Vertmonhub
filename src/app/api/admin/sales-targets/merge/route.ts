import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId, assertShopAccess } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { renameCountsText } from '@/lib/sales/manager-rename';
import { mergeSalesManagers, SalesManagerMergeSchema } from '@/lib/sales/manager-merge';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * POST /api/admin/sales-targets/merge — body { shopId, source, target } (зөвхөн super_admin).
 * Ижил хүний давхар бүртгэлийг `merge_sales_managers` RPC-ээр нэг гүйлгээнд нэгтгэнэ: source нэрийн лид, уулзалт, гэрээ,
 * өдрийн тайлан, KPI, төслийн харьяалал… target рүү шилжиж source бүртгэлээс хасагдана; admin_audit_log-д тоо бичигдэнэ.
 * 409: өөр өөр акаунттай, нэг нүд/сар давхцсан эсвэл хүснэгтийн шалгалт зөвшөөрөөгүй — юу ч өөрчлөгдөөгүй; 404: нэр алга.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!await getAdminUser()) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const parsed = SalesManagerMergeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Нэгтгэх хоёр өөр менежерийг сонгоно уу' }, { status: 400 });
        if (!await assertShopAccess(parsed.data.shopId)) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });

        const { data, error } = await mergeSalesManagers(supabaseAdmin(), parsed.data, userId);
        if (error) {
            // RPC-ийн Монгол мессежүүд хэрэглэгчид зориулагдсан (нэр, огноо орсон); бусад алдааг ерөнхий хариугаар.
            const mongolian = /[Ѐ-ӿ]/.test(error.message ?? '');
            if (error.code === '23505') return NextResponse.json({ error: mongolian ? error.message : 'Хоёр бүртгэлийн өгөгдөл давхцаж байна. Юу ч өөрчлөгдсөнгүй.' }, { status: 409 });
            if (error.code === '23514') {
                return NextResponse.json({ error: mongolian ? error.message
                    : 'Нэгтгэх боломжгүй: холбогдох бүртгэлийн шалгалт зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.' }, { status: 409 });
            }
            if (error.code === 'P0002') return NextResponse.json({ error: mongolian ? error.message : 'Менежер бүртгэлд олдсонгүй' }, { status: 404 });
            if (error.code === '22023') return NextResponse.json({ error: 'Нэгтгэх хоёр өөр менежерийг сонгоно уу' }, { status: 400 });
            if (error.code === '42501') return NextResponse.json({ error: 'Энэ төсөлд менежерийн бүртгэл нэгтгэх эрхгүй' }, { status: 403 });
            if (error.code === 'PGRST202' || error.code === '42883') {
                return NextResponse.json({ error: 'Менежер нэгтгэх өгөгдлийн сангийн шинэчлэл хийгдээгүй байна' }, { status: 503 });
            }
            return safeErrorResponse(error, 'Менежерийн бүртгэлийг нэгтгэхэд алдаа гарлаа');
        }
        return NextResponse.json({ success: true, ...data!, summary: renameCountsText(data!.counts) }, { headers: NO_STORE });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн бүртгэлийг нэгтгэхэд алдаа гарлаа');
    }
}
