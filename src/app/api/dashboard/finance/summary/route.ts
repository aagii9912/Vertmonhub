import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { financeSummary } from '@/lib/services/FinanceOps';

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

        return NextResponse.json({ summary: await financeSummary(supabaseAdmin(), authShop.id) });
    } catch (error) {
        logger.error('[Finance Summary] error', { error });
        return NextResponse.json({ error: 'Тойм татахад алдаа гарлаа' }, { status: 500 });
    }
}
