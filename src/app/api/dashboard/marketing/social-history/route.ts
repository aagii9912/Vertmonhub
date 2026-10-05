import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { shiftDay } from '@/lib/facebook/marketing-api';
import { PAGE_DAILY_METRICS, PAGE_METRIC_INFO, summarizeDaily } from '@/lib/marketing/social-metrics';

const WINDOW_DAYS = 28;

/**
 * GET /api/dashboard/marketing/social-history
 * Хадгалсан Facebook нийтлэлүүд + одоо холбогдсон Page-ийн сүүлийн 28 өдрийн өдрийн үзүүлэлт
 * (`social_insights_daily`, Meta-гийн PT өдөр) ба синкийн төлөв. Өгөгдөлгүй метрик null — 0 биш.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Татахад алдаа гарлаа' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();
    const { data: shop, error: shopError } = await supabase.from('shops')
        .select('facebook_page_id, facebook_page_name').eq('id', authShop.id).single();
    if (shopError) throw new Error(shopError.message);
    const pageId: string | null = shop?.facebook_page_id ?? null;

    const { data: posts, error: postsError } = await supabase.from('social_posts')
        .select('id, platform, content, likes, comments, shares, reach, published_at, external_post_id')
        .eq('shop_id', authShop.id)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(20);
    if (postsError) throw new Error(postsError.message);
    if (!pageId) return NextResponse.json({ posts: posts ?? [], page: null, sync: null, daily: null });

    const { data: sync, error: syncError } = await supabase.from('social_insights_sync')
        .select('last_attempt_at, last_success_at, last_from, last_to, unavailable_metrics, last_error')
        .eq('shop_id', authShop.id).eq('platform', 'facebook').eq('page_id', pageId).maybeSingle();
    if (syncError) throw new Error(syncError.message);

    let daily = null;
    if (sync?.last_to) {
        const to: string = sync.last_to;
        const from = shiftDay(to, -(WINDOW_DAYS - 1));
        // 8 метрик × 28 өдөр < 1000 мөр.
        const { data: rows, error } = await supabase.from('social_insights_daily')
            .select('day, metric, value')
            .eq('shop_id', authShop.id).eq('platform', 'facebook').eq('page_id', pageId).eq('object_type', 'page')
            .gte('day', from).lte('day', to)
            .order('day', { ascending: true });
        if (error) throw new Error(error.message);
        const values = (rows ?? []).map(row => ({ day: String(row.day), metric: String(row.metric), value: Number(row.value) }));
        daily = {
            from, to,
            metrics: Object.fromEntries(PAGE_DAILY_METRICS.map(metric => {
                const info = PAGE_METRIC_INFO[metric];
                return [metric, { ...info, ...summarizeDaily(values.filter(v => v.metric === metric), info.kind) }];
            })),
        };
    }

    return NextResponse.json({
        posts: posts ?? [],
        page: { id: pageId, name: shop?.facebook_page_name ?? null },
        sync: sync ?? null,
        daily,
    });
});
