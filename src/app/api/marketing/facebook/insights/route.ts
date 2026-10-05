import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { fetchPageDailyInsights, metaInsightToday, shiftDay } from '@/lib/facebook/marketing-api';
import { loadShopPage } from '@/lib/facebook/page-connect';
import { isMetaPermissionError, isMetaTokenError } from '@/lib/facebook/page-graph';
import { MetaApiError } from '@/lib/facebook/daily-spend';
import { PAGE_DAILY_METRICS, PAGE_METRIC_INFO, summarizeDaily } from '@/lib/marketing/social-metrics';

const DAYS = new Set([7, 28]);

/**
 * GET /api/marketing/facebook/insights?days=28
 * Page-ийн сүүлийн 7/28 дууссан өдрийн үзүүлэлт (Graph v26, Meta-гийн PT өдөр). Нэмж болох метрикийг
 * нийлбэрээр, давхардалгүй/төлөвийн метрикийг сүүлийн өдрөөр нь; Meta-гийн өгөөгүйг null.
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Insights авахад алдаа гарлаа' }, async ({ request, shop }) => {
    const page = await loadShopPage(shop.id);
    if (!page) return NextResponse.json({ insights: null, message: 'Facebook Page холбогдоогүй' });
    const requested = Number(request.nextUrl.searchParams.get('days'));
    const days = DAYS.has(requested) ? requested : 28;
    const to = shiftDay(metaInsightToday(), -1);
    const from = shiftDay(to, -(days - 1));
    try {
        const { rows, unavailable } = await fetchPageDailyInsights(page.pageId, page.token, from, to);
        const metrics = Object.fromEntries(PAGE_DAILY_METRICS.map(metric => {
            const series = rows.filter(row => row.metric === metric).map(row => ({ day: row.day, value: row.value }))
                .sort((a, b) => a.day.localeCompare(b.day));
            const info = PAGE_METRIC_INFO[metric];
            return [metric, { ...info, ...summarizeDaily(series, info.kind), series }];
        }));
        return NextResponse.json({ insights: { from, to, days, metrics, unavailable } });
    } catch (error) {
        if (isMetaTokenError(error)) return NextResponse.json({ insights: null, error: 'Token хугацаа дууссан', token_expired: true });
        if (isMetaPermissionError(error)) {
            return NextResponse.json({
                insights: null,
                error: 'Page insights-ийн эрх (read_insights) олгогдоогүй байна. Page-ээ дахин холбож эрхийг зөвшөөрнө үү.',
                permission_required: true,
            });
        }
        if (error instanceof MetaApiError) return NextResponse.json({ insights: null, error: error.message }, { status: 502 });
        throw error;
    }
});
