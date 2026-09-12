import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { getManagerPerformance, emptyTotals } from '@/lib/reports/manager-performance';

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

        const { managers, totals } = await getManagerPerformance(supabaseAdmin(), authShop.id);
        return NextResponse.json({ managers, totals });
    } catch (error) {
        logger.error('[ManagerPerformance API] GET error:', { error });
        return NextResponse.json(
            { error: 'Менежерийн гүйцэтгэл татахад алдаа гарлаа', managers: [], totals: emptyTotals() },
            { status: 500 }
        );
    }
}
