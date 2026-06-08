import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/** GET /api/dashboard/procurement/summary — Худалдан авалтын ерөнхий үзүүлэлт */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ summary: null });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartIso = monthStart.toISOString().slice(0, 10);
        const todayIso = new Date().toISOString().slice(0, 10);

        const [{ data: bills }, { data: txns }] = await Promise.all([
            supabase
                .from('vendor_bills')
                .select('total_amount, paid_amount, status, due_date')
                .eq('shop_id', shopId)
                .neq('status', 'cancelled'),
            supabase
                .from('finance_transactions')
                .select('amount')
                .eq('shop_id', shopId)
                .eq('type', 'disbursement')
                .gte('txn_date', monthStartIso),
        ]);

        const rows = bills || [];
        const totalBills = rows.length;
        const totalPayable = rows.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
        const outstanding = rows.reduce((s, b) => s + ((Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0)), 0);
        const overdueAmount = rows
            .filter(b => b.status !== 'paid' && b.due_date && b.due_date < todayIso)
            .reduce((s, b) => s + ((Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0)), 0);
        const monthSpend = (txns || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);

        return NextResponse.json({
            summary: { totalBills, totalPayable, outstanding, overdueAmount, monthSpend },
        });
    } catch (error) {
        logger.error('[Procurement Summary] error', { error });
        return NextResponse.json({ error: 'Тойм татахад алдаа гарлаа' }, { status: 500 });
    }
}
