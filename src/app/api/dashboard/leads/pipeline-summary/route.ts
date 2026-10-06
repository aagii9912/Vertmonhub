import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { UNCATEGORIZED_KEY } from '@/lib/leads/labels';
import { loadPipelineSummary } from '@/lib/leads/pipeline-load';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';

/**
 * GET /api/dashboard/leads/pipeline-summary?category=<uuid|none>
 * Pipeline самбарын тоо БҮХ лидээр: шат бүрийн лид, төсвийн дүн, зогссон ба дараагийн алхамгүй лид.
 * Самбар картаа хамгийн сүүлийн 1,000 лидээр л ачаалдаг тул тоо, таамгийг эндээс авна.
 * Жагсаалттай ижил `leads` модуль ба хүрээ (`applyLeadScope`); тооцоо `lib/leads/pipeline.ts`.
 */
export const GET = withRoute({ module: 'leads', error: 'Pipeline-ийн тоог гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const raw = request.nextUrl.searchParams.get('category');
    let category: string | null | undefined;
    if (!raw || raw === 'all') category = undefined;
    else if (raw === UNCATEGORIZED_KEY) category = null;
    else if (z.string().uuid().safeParse(raw).success) category = raw;
    else return NextResponse.json({ error: 'Буруу ангилал' }, { status: 400 });

    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const summary = await loadPipelineSummary(db, { shopId: shop.id, scope, category });
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'private, no-store' } });
});
