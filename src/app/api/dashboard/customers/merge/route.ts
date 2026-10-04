import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { MergeCustomersSchema, validateBody } from '@/lib/validations/schemas';
import { mergeCustomers } from '@/lib/services/CustomerOps';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { withRoute } from '@/lib/api/route';

// customer_id-аар customers-ыг лавладаг хүүхэд хүснэгтүүд — нэгтгэхэд repoint хийнэ.
// Зарим хүснэгт deployment-д байхгүй байж болзошгүй тул алдааг тус бүрд нь тэвчинэ.
/**
 * POST /api/dashboard/customers/merge
 * Давхардсан хоёр харилцагчийг нэг болгож нэгтгэнэ.
 * primary үлдэнэ, duplicate-ийн холбоо/мэдээлэл primary руу шилжээд устана.
 */
export const POST = withRoute({ module: 'customers', access: 'write', error: 'Нэгтгэх үед алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const body = await request.json();
    const validation = validateBody(MergeCustomersSchema, body);
    if (!validation.success) {
        return validation.response;
    }
    const { primaryId, duplicateId } = validation.data;

    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    const r = await mergeCustomers(db, authShop.id, primaryId, duplicateId, scope);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const { merged, repointWarnings } = r;

    logger.info('[Customer Merge] success', {
        shopId: authShop.id,
        primaryId,
        duplicateId,
        repointWarnings: repointWarnings.length,
    });

    return NextResponse.json({
        customer: merged,
        message: 'Харилцагчдыг амжилттай нэгтгэлээ',
    });
});
