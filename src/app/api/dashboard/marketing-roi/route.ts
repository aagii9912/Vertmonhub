import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMarketingRoi } from '@/lib/marketing/roi';

/** GET /api/dashboard/marketing-roi — зардлын snapshot + бодит гэрээний дүн. */
export async function GET() {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

        const db = supabaseAdmin();
        const [leads, campaigns, contracts] = await Promise.all([
            fetchAllRows((from, to) => db.from('leads')
                .select('id, source, status, facebook_campaign_id')
                .eq('shop_id', authShop.id).is('deleted_at', null).order('id').range(from, to)),
            fetchAllRows((from, to) => db.from('ad_campaigns')
                .select('external_id, name, spend, status')
                .eq('shop_id', authShop.id).eq('platform', 'facebook').order('id').range(from, to)),
            fetchAllRows((from, to) => db.from('property_contracts')
                .select('lead_id, contract_number, contract_status, total_price')
                .eq('shop_id', authShop.id).is('deleted_at', null).not('lead_id', 'is', null).order('id').range(from, to)),
        ]);
        return NextResponse.json({ roi: buildMarketingRoi(leads, campaigns, contracts) });
    } catch (error) {
        logger.error('[Marketing ROI] error', { error });
        return NextResponse.json({ error: 'ROI татахад алдаа гарлаа' }, { status: 500 });
    }
}
