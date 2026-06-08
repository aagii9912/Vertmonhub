import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { MergeCustomersSchema, validateBody } from '@/lib/validations/schemas';

// customer_id-аар customers-ыг лавладаг хүүхэд хүснэгтүүд — нэгтгэхэд repoint хийнэ.
// Зарим хүснэгт deployment-д байхгүй байж болзошгүй тул алдааг тус бүрд нь тэвчинэ.
const CHILD_TABLES = [
    'leads',
    'chat_history',
    'service_logs',
    'pending_messages',
    'survey_responses',
    'ai_conversations',
    'ai_analytics',
    'conversion_funnel',
    'email_logs',
];

/**
 * POST /api/dashboard/customers/merge
 * Давхардсан хоёр харилцагчийг нэг болгож нэгтгэнэ.
 * primary үлдэнэ, duplicate-ийн холбоо/мэдээлэл primary руу шилжээд устана.
 */
export async function POST(request: NextRequest) {
    try {
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

        const supabase = supabaseAdmin();

        // Хоёулаа энэ shop-д харьяалагдаж байгааг шалгана
        const { data: rows } = await supabase
            .from('customers')
            .select('*')
            .eq('shop_id', authShop.id)
            .in('id', [primaryId, duplicateId]);

        const primary = rows?.find(r => r.id === primaryId);
        const duplicate = rows?.find(r => r.id === duplicateId);

        if (!primary || !duplicate) {
            return NextResponse.json({ error: 'Харилцагч олдсонгүй' }, { status: 404 });
        }

        // 1) Хүүхэд хүснэгтүүдийн холбоог duplicate → primary руу шилжүүлнэ
        const repointWarnings: string[] = [];
        for (const table of CHILD_TABLES) {
            const { error } = await supabase
                .from(table)
                .update({ customer_id: primaryId })
                .eq('customer_id', duplicateId);
            if (error) {
                // Хүснэгт байхгүй / багана байхгүй бол алгасна
                repointWarnings.push(`${table}: ${error.message}`);
            }
        }

        // 2) Талбаруудыг нэгтгэх — primary-д дутуу утгыг duplicate-аас нөхнө
        const mergedTags = Array.from(new Set([
            ...(Array.isArray(primary.tags) ? primary.tags : []),
            ...(Array.isArray(duplicate.tags) ? duplicate.tags : []),
        ]));

        const mergedAiMemory = {
            ...(duplicate.ai_memory && typeof duplicate.ai_memory === 'object' ? duplicate.ai_memory : {}),
            ...(primary.ai_memory && typeof primary.ai_memory === 'object' ? primary.ai_memory : {}),
        };

        const mergedNotes = [primary.notes, duplicate.notes]
            .filter(Boolean)
            .join('\n')
            .trim() || null;

        const updatePayload: Record<string, unknown> = {
            name: primary.name || duplicate.name,
            phone: primary.phone || duplicate.phone,
            phone_normalized: primary.phone_normalized || duplicate.phone_normalized,
            email: primary.email || duplicate.email,
            address: primary.address || duplicate.address,
            facebook_id: primary.facebook_id || duplicate.facebook_id,
            instagram_id: primary.instagram_id || duplicate.instagram_id,
            notes: mergedNotes,
            tags: mergedTags,
            ai_memory: mergedAiMemory,
            message_count: (primary.message_count || 0) + (duplicate.message_count || 0),
        };

        // facebook_id/instagram_id-ийн unique constraint мөргөлдөхөөс сэргийлж эхлээд
        // duplicate-ийн platform id-г null болгоно
        await supabase
            .from('customers')
            .update({ facebook_id: null, instagram_id: null })
            .eq('id', duplicateId);

        const { data: merged, error: updateError } = await supabase
            .from('customers')
            .update(updatePayload)
            .eq('id', primaryId)
            .select()
            .single();

        if (updateError) {
            logger.error('[Customer Merge] update primary failed', { error: updateError });
            return NextResponse.json({ error: 'Нэгтгэх үед алдаа гарлаа' }, { status: 500 });
        }

        // 3) Duplicate-ийг устгана
        const { error: deleteError } = await supabase
            .from('customers')
            .delete()
            .eq('id', duplicateId);

        if (deleteError) {
            logger.error('[Customer Merge] delete duplicate failed', { error: deleteError });
            return NextResponse.json({ error: 'Давхардлыг устгах үед алдаа гарлаа' }, { status: 500 });
        }

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
