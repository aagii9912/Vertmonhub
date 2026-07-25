import { NextResponse, NextRequest } from 'next/server';
import { auditFor } from '@/lib/api/context';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { recomputeCustomerScore } from '@/lib/services/CustomerScoringService';
import { logAttributionEvent } from '@/lib/marketing/attribution-events';

/**
 * POST /api/dashboard/leads/[id]/convert
 * Lead-ийг "closed_won" болгож гэрээ үүсгэнэ. Гэрээний stub-ийг DB trigger
 * (create_contract_on_lead_won) автоматаар үүсгэдэг тул энд давхар үүсгэхгүй —
 * статусыг шинэчилж, үүссэн гэрээг буцаана. Идемпотент.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const conversionValue = typeof body?.conversion_value === 'number' ? body.conversion_value : undefined;

        const supabase = supabaseAdmin();

        // Lead энэ shop-д харьяалагдаж байгааг шалгана
        const { data: lead } = await supabase
            .from('leads')
            .select('id, customer_id, status')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (!lead) {
            return NextResponse.json({ error: 'Lead олдсонгүй' }, { status: 404 });
        }

        // Статусыг closed_won болгоно. converted_at болон гэрээний stub-ийг trigger үүсгэнэ.
        const updatePayload: Record<string, unknown> = {
            status: 'closed_won',
            updated_at: new Date().toISOString(),
        };
        if (conversionValue !== undefined) {
            updatePayload.conversion_value = conversionValue;
        }

        const { error: updateError } = await supabase
            .from('leads')
            .update(updatePayload)
            .eq('id', id);

        if (updateError) {
            logger.error('[Lead Convert] update failed', { error: updateError });
            return NextResponse.json({ error: 'Lead шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        }

        // Trigger-ээс үүссэн гэрээг авна
        const { data: contract } = await supabase
            .from('property_contracts')
            .select('*')
            .eq('lead_id', id)
            .maybeSingle();

        // Attribution: won үйл явдал бичих (multi-touch)
        await logAttributionEvent({
            shopId: authShop.id,
            leadId: id,
            eventType: 'won',
            value: conversionValue ?? (contract ? Number(contract.total_price) || null : null),
        });

        // Харилцагчийн чанарын оноог дахин тооцоолно (won → funnel оноо нэмэгдэнэ)
        if (lead.customer_id) {
            try {
                await recomputeCustomerScore(lead.customer_id);
            } catch (scoreErr) {
                logger.warn('[Lead Convert] scoring failed', { error: scoreErr });
            }
        }

        await auditFor(request, authShop.id, {
            entity: 'lead', action: 'convert',
            summary: `Лийдийг гэрээ болгон хөрвүүлэв${contract ? ` (гэрээ ${contract.id})` : ''}`,
            after: { contract_id: contract?.id ?? null, conversion_value: conversionValue ?? null },
        });

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
