import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/reports/manager-performance
// Менежер тус бүрийн гүйцэтгэл (manager_performance view дээр)
// ============================================
export async function GET() {
    try {
        const denied = await requireModule('reports');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ managers: [], totals: emptyTotals() });
        }

        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('manager_performance')
            .select('*')
            .eq('shop_id', authShop.id)
            .order('total_sales', { ascending: false, nullsFirst: false });
        if (error) throw error;

        const managers = (data || []).map((m) => ({
            sales_manager: m.sales_manager,
            contract_count: Number(m.contract_count) || 0,
            closed_count: Number(m.closed_count) || 0,
            total_sales: Number(m.total_sales) || 0,
            total_collected: Number(m.total_collected) || 0,
            total_outstanding: Number(m.total_outstanding) || 0,
            collection_rate_pct: Number(m.collection_rate_pct) || 0,
            unique_customers: Number(m.unique_customers) || 0,
        }));

        const totals = managers.reduce(
            (acc, m) => {
                acc.managers += 1;
                acc.contracts += m.contract_count;
                acc.closed += m.closed_count;
                acc.sales += m.total_sales;
                acc.collected += m.total_collected;
                return acc;
            },
            { managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0 }
        );

        return NextResponse.json({ managers, totals });
    } catch (error) {
        logger.error('[ManagerPerformance API] GET error:', { error });
        return NextResponse.json(
            { error: 'Менежерийн гүйцэтгэл татахад алдаа гарлаа', managers: [], totals: emptyTotals() },
            { status: 500 }
        );
    }
}

function emptyTotals() {
    return { managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0 };
}
