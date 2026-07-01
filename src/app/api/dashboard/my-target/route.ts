import { NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import {
    getTeamTargets,
    getMonthlyActualsByManager,
    quarterOfMonth,
    sumQuarter,
    sumYear,
} from '@/lib/sales/targets';

/**
 * GET /api/dashboard/my-target
 * Багийн энэ сар / улирал / жилийн төлөвлөгөө vs. гүйцэтгэл.
 * Багийн гүйцэтгэл = идэвхтэй менежерүүдийн борлуулалтын нийлбэр.
 * Виджет зөвхөн идэвхтэй менежерт харагдана (бүртгэл хоосон бол бүх хэрэглэгчид).
 * Нэвтэрсэн менежерийн өөрийн хувь нэмрийг мөн буцаана.
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

        const [targets, byManager, rosterRes] = await Promise.all([
            getTeamTargets(supabase, shop.id, year),
            getMonthlyActualsByManager(supabase, shop.id, year),
            supabase.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shop.id),
        ]);

        // Төлөвлөгөө огт тохируулаагүй бол виджет харуулахгүй
        if (sumYear(targets) === 0) {
            return NextResponse.json({ hasTarget: false });
        }

        const roster = rosterRes.data || [];
        const activeRoster = roster.filter((r) => r.is_active);
        const rosterEmpty = roster.length === 0;

        // Виджетийн харагдац: идэвхтэй менежер эсэх (бүртгэл хоосон бол бүгдэд)
        const isActiveManager =
            rosterEmpty ||
            activeRoster.some((r) => (r.user_id && r.user_id === uid) || (fullName && r.name === fullName));
        if (!isActiveManager) {
            return NextResponse.json({ hasTarget: false });
        }

        // Идэвхтэй менежерүүдийн нэрс (бүртгэл хоосон бол бүх менежер)
        const activeNames = rosterEmpty
            ? new Set(byManager.keys())
            : new Set(activeRoster.map((r) => r.name));

        // Багийн гүйцэтгэл = идэвхтэй менежерүүдийн нийлбэр
        const teamActuals = Array(12).fill(0);
        for (const [name, m] of byManager) {
            if (!activeNames.has(name)) continue;
            for (let i = 0; i < 12; i++) teamActuals[i] += m.actuals[i];
        }

        // Нэвтэрсэн менежерийн өөрийн хувь нэмэр
        const mine = fullName ? byManager.get(fullName) : undefined;
        const myContribution = mine
            ? {
                  month: mine.actuals[monthIdx] || 0,
                  year: sumYear(mine.actuals),
              }
            : null;

        return NextResponse.json({
            hasTarget: true,
            year,
            month: monthIdx + 1,
            quarter,
            periods: {
                month: { target: targets[monthIdx] || 0, actual: teamActuals[monthIdx] || 0 },
                quarter: { target: sumQuarter(targets, quarter), actual: sumQuarter(teamActuals, quarter) },
                year: { target: sumYear(targets), actual: sumYear(teamActuals) },
            },
            myContribution,
        });
    } catch (error) {
        logger.error('[MyTarget API] GET error:', { error });
        return NextResponse.json({ hasTarget: false });
    }
}
