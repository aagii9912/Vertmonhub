import { NextResponse } from 'next/server';
import { getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getPageInfo, getPageInsights, getPageSubscribedApps, subscribePageToApp } from '@/lib/facebook/marketing-api';
import { decryptToken } from '@/lib/crypto/tokens';
import { logger } from '@/lib/utils/logger';

interface Check {
    ok: boolean;
    detail?: string;
    data?: unknown;
}

/**
 * GET /api/marketing/facebook/health
 * Холболтын эрүүл мэндийн шалгалт — test mode зөв тохирсон эсэхийг батлах гол
 * хэрэгсэл. token / page / webhook_subscription / insights чадварыг тус бүрд нь
 * шалгаж { connected, allOk, checks } буцаана. insights шалгалт нь end-to-end
 * метрикийн нотолгоо.
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = supabaseAdmin();
        const { data: shop } = await admin
            .from('shops')
            .select('id, facebook_page_id, facebook_page_access_token')
            .eq('id', authShop.id)
            .single();

        const pageId = shop?.facebook_page_id || null;
        const token = decryptToken(shop?.facebook_page_access_token);

        if (!pageId || !token) {
            return NextResponse.json({
                connected: false,
                allOk: false,
                checks: {
                    token: { ok: false, detail: 'Facebook Page холбогдоогүй' },
                    page: { ok: false },
                    webhook_subscription: { ok: false },
                    insights: { ok: false },
                },
            });
        }

        const checks: Record<string, Check> = {
            token: { ok: false },
            page: { ok: false },
            webhook_subscription: { ok: false },
            insights: { ok: false },
        };

        // 1) token — debug_token (validity, scopes, expiry)
        try {
            const appId = process.env.FACEBOOK_APP_ID?.trim();
            const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
            if (appId && appSecret) {
                const url = `https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`;
                const res = await fetch(url);
                const json = await res.json();
                const d = json.data;
                if (d?.is_valid) {
                    checks.token = { ok: true, data: { scopes: d.scopes, type: d.type, expires_at: d.expires_at } };
                    // expires_at (0 = хэзээ ч дуусахгүй → null) cache хийнэ
                    const expiresAt = d.expires_at && d.expires_at > 0
                        ? new Date(d.expires_at * 1000).toISOString()
                        : null;
                    await admin.from('shops').update({ facebook_token_expires_at: expiresAt }).eq('id', authShop.id);
                } else {
                    checks.token = { ok: false, detail: d?.error?.message || 'Token хүчингүй' };
                }
            } else {
                checks.token = { ok: false, detail: 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET тохируулаагүй' };
            }
        } catch (e) {
            checks.token = { ok: false, detail: String(e) };
        }

        // 2) page — getPageInfo
        try {
            const info = await getPageInfo(pageId, token);
            checks.page = { ok: true, data: { name: info.name, followers_count: info.followers_count } };
        } catch (e) {
            checks.page = { ok: false, detail: String(e) };
        }

        // 3) webhook_subscription — хэрэв subscribe хийгдээгүй бол оролдоод (idempotent)
        // яг ямар Graph алдаа гарч байгааг surface хийнэ. Амжилттай бол ok болж засагдана.
        try {
            let apps = await getPageSubscribedApps(pageId, token);
            if (apps.length === 0) {
                const sub = await subscribePageToApp(pageId, token);
                apps = await getPageSubscribedApps(pageId, token);
                checks.webhook_subscription = apps.length > 0
                    ? { ok: true, data: apps, detail: 'subscribed just now' }
                    : { ok: false, detail: `subscribe failed: ${sub.error || 'unknown error'}` };
            } else {
                checks.webhook_subscription = { ok: true, data: apps };
            }
        } catch (e) {
            checks.webhook_subscription = { ok: false, detail: String(e) };
        }

        // 4) insights — хүчинтэй метрикээр (page_impressions нь v21-д устгагдсан)
        try {
            const result = await getPageInsights(pageId, token, ['page_impressions_unique', 'page_post_engagements'], 'days_28');
            checks.insights = (result.data?.length || 0) > 0
                ? { ok: true, data: result.data }
                : { ok: false, detail: 'Insights дуудлага амжилттай ч өгөгдөл хоосон (Page-д сүүлийн үед reach/engagement алга)' };
        } catch (e) {
            checks.insights = { ok: false, detail: String(e) };
        }

        const allOk = Object.values(checks).every((c) => c.ok);
        return NextResponse.json({ connected: true, allOk, checks });
    } catch (error) {
        logger.error('[FB Health] error', { error });
        return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
    }
}
