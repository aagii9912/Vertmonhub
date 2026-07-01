import { NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import {
    getManagerYearData,
    quarterOfMonth,
    sumQuarter,
    sumYear,
} from '@/lib/sales/targets';

/**
 * GET /api/dashboard/my-target
 * Нэвтэрсэн менежерийн энэ сар / улирал / жилийн төлөвлөгөө vs. гүйцэтгэл.
 * Менежерийг user_id-аар, эс бол full_name = sales_manager нэрээр тааруулна.
 */
export async function GET() {
    try {
        const shop = await getUserShop();
        const uid = await getUserId();
        if (!shop || !uid) {
            return NextResponse.json({ hasTarget: false });
        }

        const supabase = supabaseAdmin();

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', uid)
            .maybeSingle();
        const fullName: string | null = profile?.full_name || null;

        const now = new Date();
        const year = now.getFullYear();
        const monthIdx = now.getMonth(); // 0-11
        const quarter = quarterOfMonth(monthIdx + 1);

        const yearData = await getManagerYearData(supabase, shop.id, year);

        // Эхлээд акаунтын холбоосоор (user_id), дараа нь нэрээр тааруулна
        const mine =
            yearData.find((m) => m.user_id && m.user_id === uid) ||
            (fullName ? yearData.find((m) => m.sales_manager === fullName) : undefined);

        // Төлөвлөгөө огт тохируулаагүй бол виджет харуулахгүй
        if (!mine || sumYear(mine.targets) === 0) {
            return NextResponse.json({ hasTarget: false });
        }

        return NextResponse.json({
            hasTarget: true,
            sales_manager: mine.sales_manager,
            year,
            month: monthIdx + 1,
            quarter,
            periods: {
                month: {
                    target: mine.targets[monthIdx] || 0,
                    actual: mine.actuals[monthIdx] || 0,
                    count: mine.counts[monthIdx] || 0,
                },
                quarter: {
                    target: sumQuarter(mine.targets, quarter),
                    actual: sumQuarter(mine.actuals, quarter),
                },
                year: {
                    target: sumYear(mine.targets),
                    actual: sumYear(mine.actuals),
                },
            },
        });
    } catch (error) {
        logger.error('[MyTarget API] GET error:', { error });
        return NextResponse.json({ hasTarget: false });
    }
}
