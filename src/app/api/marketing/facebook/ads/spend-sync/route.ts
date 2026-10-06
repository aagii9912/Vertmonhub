import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { metaAdsTokenSource } from '@/lib/facebook/ads-auth';
import { metaDeadline } from '@/lib/facebook/daily-spend';
import { MetaSyncInput, syncMetaSpend } from '@/lib/marketing/meta-spend';
import { META_INSIGHTS_STATUS_TABLE, syncMetaInsights } from '@/lib/marketing/meta-insights';
import { metaAdAccountKey } from '@/lib/services/MarketingOps';
import { safeErrorResponse } from '@/lib/utils/safe-error';
export const maxDuration = 180;
/** Зардал + дэлгэрэнгүй синкийн нийт хугацаа: Vercel функцийг зогсоохоос өмнө төлөвөө бичих зайтай. */
const SYNC_BUDGET_MS = (maxDuration - 25) * 1000;

export async function GET() {
    const denied = await requireModule('marketing-roi');
    if (denied) return denied;
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    try {
        const db = supabaseAdmin();
        const { data: config, error } = await db.from('shops').select('facebook_ad_account_id,meta_ads_user_access_token,meta_ads_user_token_expires_at').eq('id', shop.id).single();
        if (error) throw error;
        const accountId = metaAdAccountKey(config?.facebook_ad_account_id);
        const { data: status, error: readError } = accountId ? await db.from('meta_spend_sync').select('account_id,currency,timezone,mnt_per_unit,last_attempt_at,last_success_at,last_from,last_to,last_error').eq('shop_id', shop.id).eq('account_id', accountId).maybeSingle() : { data: null, error: null };
        if (readError) throw readError;
        // Дэлгэрэнгүй синкийн төлөв: шинэчлэл ороогүй бол зардлын хэсгийг унагахгүй.
        const insights = accountId ? await db.from(META_INSIGHTS_STATUS_TABLE).select('account_id,last_attempt_at,last_success_at,last_from,last_to,last_error,row_count,weeks,result_source').eq('shop_id', shop.id).eq('account_id', accountId).maybeSingle() : null;
        // Токены утгыг хэзээ ч буцаахгүй — зөвхөн эх сурвалж, хэрэглэгчийн токены хугацаа.
        const tokenSource = metaAdsTokenSource(config);
        return NextResponse.json({ accountId, status, connected: tokenSource !== null, tokenSource,
            expiresAt: tokenSource === 'user' ? config?.meta_ads_user_token_expires_at ?? null : null,
            insights: insights?.error ? null : insights?.data ?? null, insightsReady: !insights?.error }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch { return NextResponse.json({ error: 'Meta зардлын тохиргоог уншиж чадсангүй. Шинэчлэл суулгасан эсэхийг шалгана уу.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return denied;
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const parsed = MetaSyncInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: '93 хүртэл өдрийн зөв хугацаа, эерэг ханш оруулна уу.' }, { status: 400 });
    const db = supabaseAdmin();
    // Хоёр алхам нэг хугацааны хязгаартай: зардал удаавал дэлгэрэнгүй синк үлдсэн хугацаандаа багтаж, төлөвөө бичнэ.
    const deadline = metaDeadline(SYNC_BUDGET_MS);
    let spend: Awaited<ReturnType<typeof syncMetaSpend>>;
    try { spend = await syncMetaSpend(db, shop.id, parsed.data, deadline); }
    catch (error) { return safeErrorResponse(error, error instanceof Error ? error.message : 'Meta синк амжилтгүй боллоо.'); }
    // Хоёр дахь алхам: ad set × өдрийн үр дүн, хурлын долоо хоногийн тайлан. Алдаа нь зардлын синкийг буцаахгүй.
    const range = parsed.data.from && parsed.data.to ? { from: parsed.data.from, to: parsed.data.to } : {};
    try {
        const insights = await syncMetaInsights(db, shop.id, range, { deadline });
        return NextResponse.json({ success: true, ...spend, insights });
    } catch (error) {
        return NextResponse.json({ success: true, ...spend, insights: { error: error instanceof Error ? error.message : 'Meta дэлгэрэнгүй синк амжилтгүй боллоо.' } });
    }
}
