import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/finance/summary — Санхүүгийн ерөнхий үзүүлэлт
 * Орлого/цуглуулалт/авлага нь property_contracts дээр суурилна, мөнгөн урсгал
 * finance_transactions-аас.
 */
export async function GET() {
    try {
        const denied = await requireModule('finance');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ summary: null });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartIso = monthStart.toISOString().slice(0, 10);

        const [{ data: contracts }, { data: txns }] = await Promise.all([
            supabase
                .from('property_contracts')
                .select('total_price, paid_amount, balance, vat_amount, contract_status')
                .eq('shop_id', shopId)
                .is('deleted_at', null),
            supabase
                .from('finance_transactions')
                .select('type, amount, txn_date')
                .eq('shop_id', shopId)
                .gte('txn_date', monthStartIso),
        ]);

        const rows = contracts || [];
        const activeRows = rows.filter(c => c.contract_status !== 'cancelled');

        const totalRevenue = activeRows.reduce((s, c) => s + (Number(c.total_price) || 0), 0);
        const totalCollected = activeRows.reduce((s, c) => s + (Number(c.paid_amount) || 0), 0);
        const totalReceivable = activeRows.reduce((s, c) => s + (Number(c.balance) || 0), 0);
        const totalVat = activeRows.reduce((s, c) => s + (Number(c.vat_amount) || 0), 0);
        const collectionRate = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;

        const monthReceipts = (txns || [])
            .filter(t => t.type === 'receipt')
            .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const monthDisbursements = (txns || [])
            .filter(t => t.type === 'disbursement')
            .reduce((s, t) => s + (Number(t.amount) || 0), 0);

        return NextResponse.json({
            summary: {
                totalRevenue,
                totalCollected,
                totalReceivable,
                totalVat,
                collectionRate,
                monthReceipts,
                monthDisbursements,
                monthNetCash: monthReceipts - monthDisbursements,
                contractCount: activeRows.length,
            },
        });
    } catch (error) {
        logger.error('[Finance Summary] error', { error });
        return NextResponse.json({ error: 'Тойм татахад алдаа гарлаа' }, { status: 500 });
    }
}
