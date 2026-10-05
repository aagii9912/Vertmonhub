import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { LEADGEN_RETENTION_DAYS, backfillPageLeads } from '@/lib/facebook/leadgen-backfill';
import { pageGraphRead } from '@/lib/facebook/leadgen';
import { loadShopPage } from '@/lib/facebook/page-connect';
import { subscribePageToApp } from '@/lib/facebook/marketing-api';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * Facebook Lead Ads-ийн төлөв ба засвар (идэвхтэй төсөл/shop-ийн холбосон Page):
 *  GET  — leadgen webhook subscribe хийгдсэн эсэх, сүүлийн 90 хоногийн үр дүн, асуудалтай event-үүд.
 *  POST { action: 'backfill', days? } — Meta-д хадгалагдаж буй (≤90 хоног) лидийг татаж нөхнө.
 *  POST { action: 'subscribe' }       — Page-ийг webhook-д (leadgen-тэй) дахин subscribe хийнэ.
 * Лид өөрөө `/api/webhook`-ээр орно; энэ route зөвхөн хяналт, нөхөлт.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BACKFILL_BUDGET_MS = 45_000;
const SCHEMA = z.discriminatedUnion('action', [
    z.object({ action: z.literal('backfill'), days: z.number().int().min(1).max(LEADGEN_RETENTION_DAYS).optional() }),
    z.object({ action: z.literal('subscribe') }),
]);

type EventRow = { leadgen_id: string; status: 'saved' | 'skipped' | 'failed'; reason: string | null; origin: string; updated_at: string };

/** App-ийн subscribed_fields-д leadgen байгаа эсэх; шалгаж чадаагүй бол null. */
async function leadgenSubscribed(pageId: string, token: string): Promise<boolean | null> {
    const appId = process.env.FACEBOOK_APP_ID?.trim();
    if (!appId) return null;
    const result = await pageGraphRead<{ data?: Array<{ id?: string; subscribed_fields?: string[] }> }>(`${pageId}/subscribed_apps`, token, {}, AbortSignal.timeout(5000));
    if (!result.ok || !Array.isArray(result.data.data)) return null;
    const app = result.data.data.find(row => row.id === appId);
    return !!app?.subscribed_fields?.includes('leadgen');
}

export const GET = withRoute({ module: 'marketing-roi' }, async ({ shop }) => {
    const page = await loadShopPage(shop.id);
    if (!page) return NextResponse.json({ connected: false });

    const since = new Date(Date.now() - LEADGEN_RETENTION_DAYS * 86_400_000).toISOString();
    const [subscribed, events] = await Promise.all([
        leadgenSubscribed(page.pageId, page.token),
        supabaseAdmin().from('meta_leadgen_events').select('leadgen_id, status, reason, origin, updated_at')
            .eq('shop_id', shop.id).gte('updated_at', since).order('updated_at', { ascending: false }).limit(1000),
    ]);
    // Migration хийгдээгүй бол төлөвгүйгээр (хоосон) харуулна.
    if (events.error) logger.warn('[LeadAds] events unavailable', { code: events.error.code, message: events.error.message });
    const rows = (events.error ? [] : events.data ?? []) as EventRow[];
    const counts = { saved: 0, skipped: 0, failed: 0 };
    for (const row of rows) counts[row.status]++;
    return NextResponse.json({
        connected: true,
        pageName: page.pageName,
        subscribed,
        eventsAvailable: !events.error,
        counts,
        lastSavedAt: rows.find(row => row.status === 'saved')?.updated_at ?? null,
        problems: rows.filter(row => row.status !== 'saved').slice(0, 10),
    });
});

export const POST = withRoute({ module: 'marketing-roi', access: 'write' }, async ({ request, shop }) => {
    const parsed = SCHEMA.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Буруу хүсэлт', details: parsed.error.flatten() }, { status: 400 });
    if (!process.env.FACEBOOK_APP_SECRET?.trim()) {
        return NextResponse.json({ error: 'Facebook app-ийн нууц түлхүүр (FACEBOOK_APP_SECRET) тохируулаагүй байна.' }, { status: 503 });
    }
    const page = await loadShopPage(shop.id);
    if (!page) return NextResponse.json({ error: 'Facebook Page холбогдоогүй байна. Эхлээд Page-ээ холбоно уу.' }, { status: 400 });

    if (parsed.data.action === 'subscribe') {
        const result = await subscribePageToApp(page.pageId, page.token);
        return NextResponse.json(result, { status: result.success ? 200 : 502 });
    }

    const summary = await backfillPageLeads(supabaseAdmin(), { id: shop.id, pageId: page.pageId, token: page.token }, {
        days: parsed.data.days,
        deadline: Date.now() + BACKFILL_BUDGET_MS,
    });
    logger.info('[LeadAds] backfill', { shopId: shop.id, ...summary });
    return NextResponse.json(summary);
});
