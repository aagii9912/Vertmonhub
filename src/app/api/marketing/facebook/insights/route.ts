import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getPageInsights } from '@/lib/facebook/marketing-api';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /api/marketing/facebook/insights
 * Facebook Page insights (28 хоногийн reach, impressions, engagement)
 */
export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
        );

        const { data: { session } } = await supabase.auth.getSession();
        let userId: string | null = session?.user?.id || null;
        if (!userId) {
            const sessionCookie = cookieStore.get('vertmon-session');
            if (sessionCookie) {
                try {
                    const parsed = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
                    userId = parsed.user_id;
                } catch { /* ignore */ }
            }
        }

        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const shopId = req.nextUrl.searchParams.get('shop_id');
        const period = (req.nextUrl.searchParams.get('period') || 'day') as 'day' | 'week' | 'days_28';
        const admin = supabaseAdmin();

        let query = admin
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('user_id', userId);

        if (shopId) query = query.eq('id', shopId);

        const { data: shops, error } = await query.limit(1);
        if (error || !shops?.length) {
            return NextResponse.json({ error: 'Дэлгүүр олдсонгүй' }, { status: 404 });
        }

        const shop = shops[0];
        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({ insights: null, message: 'Facebook Page холбогдоогүй' });
        }

        const result = await getPageInsights(shop.facebook_page_id, shop.facebook_page_access_token, undefined, period);

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
