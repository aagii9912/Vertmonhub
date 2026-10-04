import { applyLeadScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMarketingRoi } from '@/lib/marketing/roi';
import { withRoute } from '@/lib/api/route';

/** GET /api/dashboard/marketing-roi — зардлын snapshot + бодит гэрээний дүн. */
export const GET = withRoute({ module: 'marketing-roi', error: 'ROI татахад алдаа гарлаа' }, async ({ shop: authShop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    const [leads, campaigns, contracts] = await Promise.all([
        fetchAllRows((from, to) => applyLeadScope(db.from('leads')
            .select('id, source, status, facebook_campaign_id')
            .eq('shop_id', authShop.id).is('deleted_at', null).order('id').range(from, to), scope)),
        fetchAllRows((from, to) => db.from('ad_campaigns')
            .select('external_id, name, spend, status')
            .eq('shop_id', authShop.id).eq('platform', 'facebook').order('id').range(from, to)),
        fetchAllRows((from, to) => db.from('property_contracts')
            .select('lead_id, contract_number, contract_status, total_price')
            .eq('shop_id', authShop.id).is('deleted_at', null).not('lead_id', 'is', null).order('id').range(from, to)),
    ]);
    return NextResponse.json({ roi: buildMarketingRoi(leads, campaigns, contracts) });
});
