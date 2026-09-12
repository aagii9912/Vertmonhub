import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { MergeCustomersSchema, validateBody } from '@/lib/validations/schemas';
import { mergeCustomers } from '@/lib/services/CustomerOps';

// customer_id-аар customers-ыг лавладаг хүүхэд хүснэгтүүд — нэгтгэхэд repoint хийнэ.
// Зарим хүснэгт deployment-д байхгүй байж болзошгүй тул алдааг тус бүрд нь тэвчинэ.
/**
 * POST /api/dashboard/customers/merge
 * Давхардсан хоёр харилцагчийг нэг болгож нэгтгэнэ.
 * primary үлдэнэ, duplicate-ийн холбоо/мэдээлэл primary руу шилжээд устана.
 */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = validateBody(MergeCustomersSchema, body);
        if (!validation.success) {
            return validation.response;
        }
        const { primaryId, duplicateId } = validation.data;

        const r = await mergeCustomers(supabaseAdmin(), authShop.id, primaryId, duplicateId);
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
    } catch (error) {
        logger.error('[Customer Merge] error', { error });
        return NextResponse.json({ error: 'Нэгтгэх үед алдаа гарлаа' }, { status: 500 });
    }
}
