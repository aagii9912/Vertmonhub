import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { syncShopSocial } from '@/lib/marketing/socialSync';

/**
 * POST /api/dashboard/marketing/sync-social
 * Facebook page-ийн organic post болон insights-ийг татаж `social_posts` /
 * `social_insights`-д хадгална (trend боломжтой болгоно). Бодит ажлыг
 * `syncShopSocial` (cron-той хуваалцдаг) гүйцэтгэнэ.
 */
export async function POST() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const { data: shop } = await supabase
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('id', authShop.id)
            .single();

        if (!shop?.facebook_page_id || !shop?.facebook_page_access_token) {
            return NextResponse.json({ error: 'Facebook page холбогдоогүй' }, { status: 400 });
        }

        const { postsStored } = await syncShopSocial(supabase, shop);
        return NextResponse.json({ success: true, postsStored, message: `${postsStored} нийтлэл хадгаллаа` });
    } catch (error) {
        logger.error('[Sync Social] error', { error });
        return NextResponse.json({ error: 'Sync хийхэд алдаа гарлаа' }, { status: 500 });
    }
}
