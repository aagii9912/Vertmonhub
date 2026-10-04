import { NextResponse } from 'next/server';
import { recomputeShopScores } from '@/lib/services/CustomerScoringService';
import { withRoute } from '@/lib/api/route';

/**
 * POST /api/dashboard/customers/recompute-scores
 * Идэвхтэй shop-ийн бүх харилцагчийн чанарын оноог дахин тооцоолно.
 */
export const POST = withRoute({ module: 'customers', access: 'write', error: 'Оноо шинэчлэхэд алдаа гарлаа' }, async ({ shop: authShop }) => {
    const { updated } = await recomputeShopScores(authShop.id);

    return NextResponse.json({
        success: true,
        updated,
        message: `${updated} харилцагчийн оноог шинэчиллээ`,
    });
});
