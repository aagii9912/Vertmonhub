import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { PayBillSchema, validateBody } from '@/lib/validations/schemas';

/**
 * POST /api/dashboard/procurement/bills/[id]/pay
 * Нэхэмжлэхийн төлбөр төлж, finance_transactions-д зарлага (disbursement) бичнэ.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const body = await request.json();
        const validation = validateBody(PayBillSchema, body);
        if (!validation.success) return validation.response;
        const d = validation.data;

        const supabase = supabaseAdmin();

        const { data: bill } = await supabase
            .from('vendor_bills')
            .select('id, total_amount, paid_amount, project_id, status')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (!bill) return NextResponse.json({ error: 'Нэхэмжлэх олдсонгүй' }, { status: 404 });

        const newPaid = (Number(bill.paid_amount) || 0) + d.amount;
        const newStatus = newPaid >= Number(bill.total_amount) ? 'paid' : 'partial';

        const { error: updateError } = await supabase
            .from('vendor_bills')
            .update({ paid_amount: newPaid, status: newStatus })
            .eq('id', id);

        if (updateError) throw updateError;

        // Кассын дэвтэрт зарлага бичнэ
        const { error: txnError } = await supabase
            .from('finance_transactions')
            .insert({
                shop_id: authShop.id,
                txn_date: d.paid_date || new Date().toISOString().slice(0, 10),
                type: 'disbursement',
                amount: d.amount,
                method: d.method || null,
                project_id: bill.project_id || null,
                note: 'Нийлүүлэгчийн нэхэмжлэх төлбөр',
            });
        if (txnError) {
            logger.warn('[Bill Pay] finance_transactions insert failed', { error: txnError });
        }

        return NextResponse.json({
            success: true,
            paid_amount: newPaid,
            status: newStatus,
            message: 'Төлбөр бүртгэлээ',
        });
    } catch (error) {
        logger.error('[Bill Pay] error', { error });
        return NextResponse.json({ error: 'Төлбөр бүртгэхэд алдаа гарлаа' }, { status: 500 });
    }
}
