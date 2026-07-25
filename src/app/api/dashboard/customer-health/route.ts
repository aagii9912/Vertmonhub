import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/customer-health
 * Харилцагчийн сангийн "эрүүл мэнд" — нийт, шинэ, идэвхгүй, дундаж чанарын оноо,
 * A/B/C түвшний хуваарилалт, дагалт хүлээгдэж буй тоо, дундаж хөрвөх хугацаа.
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ health: null });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const nowIso = new Date().toISOString();

        const [{ data: customers }, { data: convertedLeads }] = await Promise.all([
            supabase
                .from('customers')
                .select('created_at, lifecycle_stage, quality_score, quality_tier, next_followup_at')
                .eq('shop_id', shopId)
                .is('deleted_at', null),
            supabase
                .from('leads')
                .select('created_at, converted_at')
                .eq('shop_id', shopId)
                .is('deleted_at', null)
                .not('converted_at', 'is', null),
        ]);

        const rows = customers || [];
        const total = rows.length;
        const newThisMonth = rows.filter(c => c.created_at && new Date(c.created_at) >= monthStart).length;
        const dormant = rows.filter(c => c.lifecycle_stage === 'dormant').length;
        const won = rows.filter(c => c.lifecycle_stage === 'won').length;

        const scored = rows.filter(c => typeof c.quality_score === 'number');
        const avgQualityScore = scored.length
            ? Math.round(scored.reduce((s, c) => s + (c.quality_score || 0), 0) / scored.length)
            : 0;

        const tiers = { A: 0, B: 0, C: 0 };
        for (const c of rows) {
            if (c.quality_tier === 'A') tiers.A++;
            else if (c.quality_tier === 'B') tiers.B++;
            else if (c.quality_tier === 'C') tiers.C++;
        }

        const needFollowup = rows.filter(c =>
            c.next_followup_at && c.next_followup_at <= nowIso
        ).length;

        // Дундаж хөрвөх хугацаа (өдрөөр): converted_at - created_at
        const durations = (convertedLeads || [])
            .map(l => {
                if (!l.created_at || !l.converted_at) return null;
                const ms = new Date(l.converted_at).getTime() - new Date(l.created_at).getTime();
                return ms > 0 ? ms / 86400000 : null;
            })
            .filter((d): d is number => d !== null);
        const avgDaysToConvert = durations.length
            ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
            : null;

        return NextResponse.json({
            health: {
                total,
                newThisMonth,
                dormant,
                won,
                avgQualityScore,
                tiers,
                needFollowup,
                avgDaysToConvert,
            },
        });
    } catch (error) {
        logger.error('[Customer Health] error', { error });
        return NextResponse.json({ error: 'Failed to fetch customer health' }, { status: 500 });
    }
}
