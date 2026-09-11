import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAccessibleShopIds, getUserId } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { getPageInsights, getPageMessagingInsights } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';

/**
 * GET /api/marketing/facebook/insights
 * Facebook Page insights (28 хоногийн reach, impressions, engagement)
 */
export async function GET(req: NextRequest) {
    try {
        // Зөвхөн Supabase session (GoTrue). Хуучин `vertmon-session` fallback нь гарын үсэггүй
        // base64 JSON байсан тул устгав (дурын user_id-аар impersonation хийх боломжтой байв).
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const shopId = req.nextUrl.searchParams.get('shop_id');
        const period = (req.nextUrl.searchParams.get('period') || 'day') as 'day' | 'week' | 'days_28';
        const admin = supabaseAdmin();

        // Хэрэглэгчийн хандах эрхтэй төслүүдээс зорилтот shop-ыг баталгаажуулна
        const accessibleIds = await getAccessibleShopIds(userId);
        const targetShopId = shopId || accessibleIds.values().next().value;
        if (!targetShopId || !accessibleIds.has(targetShopId)) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        const { data: shops, error } = await admin
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('id', targetShopId)
            .limit(1);
        if (error || !shops?.length) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];
        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({ insights: null, message: 'Facebook Page холбогдоогүй' });
        }

        const pageToken = decryptToken(shop.facebook_page_access_token) || '';
        const result = await getPageInsights(shop.facebook_page_id, pageToken, undefined, period);

        // Transform insights for frontend
        const insightsMap: Record<string, any> = {};
        for (const metric of result.data || []) {
            const latestValue = metric.values?.[metric.values.length - 1];
            insightsMap[metric.name] = {
                title: metric.title,
                description: metric.description,
                period: metric.period,
                value: latestValue?.value || 0,
                values: metric.values || [],
            };
        }

        // Messenger харилцааны хэмжээ — pages_messaging эрхгүй бол хоосон (isolated helper)
        const messaging = await getPageMessagingInsights(shop.facebook_page_id, pageToken);
        for (const [name, value] of Object.entries(messaging)) {
            insightsMap[name] = { ...(insightsMap[name] || {}), value, values: insightsMap[name]?.values || [] };
        }

        return NextResponse.json({ insights: insightsMap });

    } catch (error: any) {
        console.error('Marketing Facebook Insights API Error:', error);
        if (error.message?.includes('190') || error.message?.includes('token')) {
            return NextResponse.json({ insights: null, error: 'Token хугацаа дууссан', token_expired: true });
        }
        // Insights permission байхгүй бол
        if (error.message?.includes('100') || error.message?.includes('permission')) {
            return NextResponse.json({
                insights: null,
                error: 'Page Insights permission шаардлагатай. Facebook App Review-д read_insights нэмнэ үү.',
                permission_required: true,
            });
        }
        return NextResponse.json({ error: 'Insights авахад алдаа гарлаа' }, { status: 500 });
    }
}
