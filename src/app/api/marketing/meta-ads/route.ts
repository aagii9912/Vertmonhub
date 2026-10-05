import { NextResponse } from 'next/server';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaAdsReport, MetaAdsRangeSchema, metaAdsRangeInput } from '@/lib/marketing/meta-ads-load';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/marketing/meta-ads?from=YYYY-MM-DD&to=YYYY-MM-DD (анхдагч: энэ сарын 1 – өнөөдөр, УБ)
 * Meta зарын огноотой тайлан: зардал (төгрөг / ханшгүй эх валют), харагдалт, товшилт, үр дүн төрлөөр,
 * кампанит ажил бүрээр. `meta_daily_spend` + `meta_ad_insights_daily`; хуучин ad_campaigns snapshot-ийг уншихгүй.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Meta зарын тайлан татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const parsed = MetaAdsRangeSchema.safeParse(metaAdsRangeInput({ from: params.get('from'), to: params.get('to') }));
    if (!parsed.success) return NextResponse.json({ error: '367 хүртэл өдрийн зөв хугацаа сонгоно уу.' }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const { report } = await loadMetaAdsReport(db, shop.id, parsed.data, scope);
    return NextResponse.json({ report }, { headers: { 'Cache-Control': 'private, no-store' } });
});
