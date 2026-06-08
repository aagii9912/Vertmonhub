import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { recomputeShopScores } from '@/lib/services/CustomerScoringService';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/dashboard/customers/recompute-scores
 * Идэвхтэй shop-ийн бүх харилцагчийн чанарын оноог дахин тооцоолно.
 */
export async function POST() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { updated } = await recomputeShopScores(authShop.id);

        return NextResponse.json({
            success: true,
            updated,
            message: `${updated} харилцагчийн оноог шинэчиллээ`,
        });
    } catch (error) {
        logger.error('[Recompute Scores] error', { error });
        return NextResponse.json({ error: 'Оноо шинэчлэхэд алдаа гарлаа' }, { status: 500 });
    }
}
