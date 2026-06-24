import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/reports/meetings
// Сарын уулзалтын нэгтгэл (төрөл + санхүүжилтийн суваг)
// meeting_monthly_summary view дээр
// ============================================
export async function GET() {
    try {
        const denied = await requireModule('reports');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ months: [], totals: emptyTotals() });
        }

        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('meeting_monthly_summary')
            .select('*')
            .eq('shop_id', authShop.id)
            .order('month', { ascending: false });
        if (error) throw error;

        const months = (data || []).map((r) => ({
            month: r.month,
            total_meetings: Number(r.total_meetings) || 0,
            new_customer: Number(r.new_customer) || 0,
            repeat_customer: Number(r.repeat_customer) || 0,
            existing_buyer: Number(r.existing_buyer) || 0,
            completed: Number(r.completed) || 0,
            fin_bank_loan: Number(r.fin_bank_loan) || 0,
            fin_cash: Number(r.fin_cash) || 0,
            fin_mortgage: Number(r.fin_mortgage) || 0,
            fin_leasing: Number(r.fin_leasing) || 0,
            fin_barter: Number(r.fin_barter) || 0,
        }));

        const totals = months.reduce(
            (a, m) => ({
                total: a.total + m.total_meetings,
                new_customer: a.new_customer + m.new_customer,
                repeat_customer: a.repeat_customer + m.repeat_customer,
                existing_buyer: a.existing_buyer + m.existing_buyer,
                completed: a.completed + m.completed,
                bank_loan: a.bank_loan + m.fin_bank_loan,
                cash: a.cash + m.fin_cash,
                mortgage: a.mortgage + m.fin_mortgage,
                leasing: a.leasing + m.fin_leasing,
                barter: a.barter + m.fin_barter,
            }),
            emptyTotals()
        );

        return NextResponse.json({ months, totals });
    } catch (error) {
        logger.error('[Meetings API] GET error:', { error });
        return NextResponse.json(
            { error: 'Уулзалтын тайлан татахад алдаа гарлаа', months: [], totals: emptyTotals() },
            { status: 500 }
        );
    }
}

function emptyTotals() {
    return { total: 0, new_customer: 0, repeat_customer: 0, existing_buyer: 0, completed: 0, bank_loan: 0, cash: 0, mortgage: 0, leasing: 0, barter: 0 };
}
