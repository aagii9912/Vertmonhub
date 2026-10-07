import { NextResponse } from 'next/server';
import { applyLeadScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMarketingRoi, type RoiContract, type RoiLead } from '@/lib/marketing/roi';
import { loadMetaAdsReport, MetaAdsRangeSchema, metaAdsRangeInput } from '@/lib/marketing/meta-ads-load';
import { withRoute } from '@/lib/api/route';

/**
 * GET /api/dashboard/marketing-roi?from=YYYY-MM-DD&to=YYYY-MM-DD (анхдагч: энэ сарын 1 – өнөөдөр, УБ)
 * Meta кампанит ажлын ROI: огноотой зардал (meta_daily_spend, төгрөг / ханшгүй эх валют), үр дүн төрлөөр
 * (meta_ad_insights_daily), тухайн хугацаанд үүссэн CRM лид ба тэдгээрийн хүчинтэй гэрээ.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'ROI татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const parsed = MetaAdsRangeSchema.safeParse(metaAdsRangeInput({ from: params.get('from'), to: params.get('to') }));
    if (!parsed.success) return NextResponse.json({ error: '367 хүртэл өдрийн зөв хугацаа сонгоно уу.' }, { status: 400 });
    const range = parsed.data;
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const [meta, leads, contracts] = await Promise.all([
        loadMetaAdsReport(db, shop.id, range, scope),
        fetchAllRows<RoiLead>((from, to) => applyLeadScope(db.from('leads')
            .select('id,created_at,source,marketing_channel,facebook_campaign_id,marketing_campaign_id')
            .eq('shop_id', shop.id).is('deleted_at', null)
            .gte('created_at', `${range.from}T00:00:00+08:00`).lte('created_at', `${range.to}T23:59:59.999999+08:00`)
            .order('id').range(from, to), scope)),
        fetchAllRows<RoiContract>((from, to) => db.from('property_contracts')
            .select('lead_id,contract_number,contract_status,total_price')
            .eq('shop_id', shop.id).is('deleted_at', null).not('lead_id', 'is', null).order('id').range(from, to)),
    ]);
    return NextResponse.json({ roi: buildMarketingRoi({ range, leads, activities: meta.activities, contracts, meta: meta.report }) },
        { headers: { 'Cache-Control': 'private, no-store' } });
});
