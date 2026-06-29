import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/finance/ar-aging — Авлагын насжилт (AR aging)
 * payment_schedules-ийн төлөгдөөгүй үлдэгдлийг due_date-аар bucket-лэнэ.
 */
export async function GET() {
    try {
        const denied = await requireModule('finance');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ aging: null });
        }

        const supabase = supabaseAdmin();

        // Бүх installment-ийг татна — payment_schedules нь нэгж тутамд олон мөртэй
        // тул ~1000 мөрийн хязгаараар тасрахаас сэргийлж fetchAllRows ашиглана.
        const schedules = await fetchAllRows<{ amount: number | null; paid_amount: number | null; due_date: string | null; status: string | null }>(
            (from, to) => supabase
                .from('payment_schedules')
                .select('amount, paid_amount, due_date, status')
                .eq('shop_id', authShop.id)
                .in('status', ['pending', 'partial', 'overdue'])
                .range(from, to));

        const buckets = {
            current: 0,   // хугацаа болоогүй
            d1_30: 0,
            d31_60: 0,
            d61_90: 0,
            d90_plus: 0,
            total: 0,
        };

        const now = Date.now();
        for (const s of schedules || []) {
            const outstanding = (Number(s.amount) || 0) - (Number(s.paid_amount) || 0);
            if (outstanding <= 0) continue;
            buckets.total += outstanding;

            if (!s.due_date) {
                buckets.current += outstanding;
                continue;
            }
            const daysOverdue = Math.floor((now - new Date(s.due_date).getTime()) / 86400000);
            if (daysOverdue <= 0) buckets.current += outstanding;
            else if (daysOverdue <= 30) buckets.d1_30 += outstanding;
            else if (daysOverdue <= 60) buckets.d31_60 += outstanding;
            else if (daysOverdue <= 90) buckets.d61_90 += outstanding;
            else buckets.d90_plus += outstanding;
        }

        return NextResponse.json({ aging: buckets });
    } catch (error) {
        logger.error('[Finance AR Aging] error', { error });
        return NextResponse.json({ error: 'AR aging татахад алдаа гарлаа' }, { status: 500 });
    }
}
