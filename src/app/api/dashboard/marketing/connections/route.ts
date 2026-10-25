import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMarketingConnections } from '@/lib/marketing/connections-load';

/**
 * GET /api/dashboard/marketing/connections — идэвхтэй төслийн маркетингийн холболтын төлөв (Лхагвагийн хурлын
 * «Холболтын төлөв»): Facebook хуудас, Instagram, Meta зарын данс (ID л), токены эх сурвалж ба хэрэглэгчийн
 * токен дуусах хоног, синкийн сүүлийн төлөв, төгрөгийн ханш хадгалсан эсэх. Токены утгыг хэзээ ч буцаахгүй.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Холболтын төлөвийг уншиж чадсангүй' }, async ({ shop }) => {
    const connections = await loadMarketingConnections(supabaseAdmin(), shop.id);
    return NextResponse.json({ connections }, { headers: { 'Cache-Control': 'private, no-store' } });
});
