import { NextResponse, NextRequest } from 'next/server';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { recomputeCustomerScore } from '@/lib/services/CustomerScoringService';
import { logAttributionEvent } from '@/lib/marketing/attribution-events';
import { z } from 'zod';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { fetchAllRows } from '@/lib/utils/pagination';

const ConvertSchema = z.object({ conversion_value: z.number().finite().nonnegative().optional() });

/**
 * POST /api/dashboard/leads/[id]/convert
 * Бүртгэсэн бодит гэрээг шалгаад Lead-ийг "closed_won" болгоно. Давтан
 * хүсэлт гэрээ, attribution үйл явдал үүсгэхгүй, төлөвийг дахин бичихгүй.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const parsed = ConvertSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Буруу гэрээний дүн' }, { status: 400 });

        const supabase = supabaseAdmin();

        // Lead энэ shop-д харьяалагдаж байгааг шалгана
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, customer_id, status')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .maybeSingle();

        if (leadError) throw leadError;

        if (!lead) {
            return NextResponse.json({ error: 'Lead олдсонгүй' }, { status: 404 });
        }

        const contracts = (await fetchAllRows((from, to) => supabase
            .from('property_contracts').select('*')
            .eq('lead_id', id).eq('shop_id', authShop.id).is('deleted_at', null)
            .order('contract_date', { ascending: false }).order('id').range(from, to)))
            .filter(hasRealContractFields);
        const contract = contracts[0];
        if (!contract) {
            return NextResponse.json({
                error: 'Эхлээд дугаар, дүнтэй бодит гэрээ бүртгэнэ үү. Хоосон эсвэл цуцалсан гэрээг амжилттай борлуулалт гэж тооцохгүй.',
            }, { status: 400 });
        }
        const conversionValue = contracts.reduce((sum, row) => sum + Number(row.total_price), 0);
        if (parsed.data.conversion_value !== undefined && parsed.data.conversion_value !== conversionValue) {
            return NextResponse.json({ error: 'Борлуулалтын дүн бүртгэсэн гэрээний нийлбэртэй тохирох ёстой' }, { status: 400 });
        }
        if (lead.status === 'closed_won') {
            return NextResponse.json({ success: true, contract, message: 'Лид аль хэдийн амжилттай болсон' });
        }

        const { data: updated, error: updateError } = await supabase
            .from('leads')
            .update({
                status: 'closed_won',
                conversion_value: conversionValue,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id).eq('shop_id', authShop.id).is('deleted_at', null)
            .eq('status', lead.status)
            .select('id').maybeSingle();

        if (updateError) {
            logger.error('[Lead Convert] update failed', { error: updateError });
            return NextResponse.json({ error: 'Lead шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        }

        if (!updated) {
            return NextResponse.json({ error: 'Лидийн төлөв өөрчлөгдсөн байна. Дахин уншаад оролдоно уу.' }, { status: 409 });
        }

        // Attribution: won үйл явдал бичих (multi-touch)
        await logAttributionEvent({
            shopId: authShop.id,
            leadId: id,
            eventType: 'won',
            value: conversionValue,
        });

        // Харилцагчийн чанарын оноог дахин тооцоолно (won → funnel оноо нэмэгдэнэ)
        if (lead.customer_id) {
            try {
                await recomputeCustomerScore(lead.customer_id);
            } catch (scoreErr) {
                logger.warn('[Lead Convert] scoring failed', { error: scoreErr });
            }
        }

        return NextResponse.json({
            success: true,
            contract: contract || null,
            message: 'Lead-ийг гэрээ болгон хөрвүүллээ',
        });
    } catch (error) {
        logger.error('[Lead Convert] error', { error });
        return NextResponse.json({ error: 'Хөрвүүлэхэд алдаа гарлаа' }, { status: 500 });
    }
}
