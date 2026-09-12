import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { PayBillSchema, validateBody } from '@/lib/validations/schemas';
import { payBill } from '@/lib/services/FinanceOps';

/**
 * POST /api/dashboard/procurement/bills/[id]/pay
 * Нэхэмжлэхийн төлбөр төлж, finance_transactions-д зарлага (disbursement) бичнэ.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModuleWrite('procurement');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const body = await request.json();
        const validation = validateBody(PayBillSchema, body);
        if (!validation.success) return validation.response;
        const d = validation.data;

        const r = await payBill(supabaseAdmin(), authShop.id, id, d);
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
        const { bill } = r;

        return NextResponse.json({
            success: true,
            paid_amount: bill.paid_amount,
            status: bill.status,
            message: 'Төлбөр бүртгэлээ',
        });
    } catch (error) {
        logger.error('[Bill Pay] error', { error });
        return NextResponse.json({ error: 'Төлбөр бүртгэхэд алдаа гарлаа' }, { status: 500 });
    }
}
