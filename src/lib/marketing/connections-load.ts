import type { SupabaseClient } from '@supabase/supabase-js';
import { metaAdsSystemToken, metaAdsTokenSource } from '@/lib/facebook/ads-auth';
import { META_INSIGHTS_STATUS_TABLE } from './meta-insights';
import { tokenDaysLeft, type ConnectionSync, type MarketingConnections } from './connections';

/**
 * Идэвхтэй төслийн (shop) маркетингийн холболтын төлөв. Токены утгыг уншдаг ч буцаахгүй — зөвхөн эх
 * сурвалж (`metaAdsTokenSource`), хэрэглэгчийн токены дуусах хугацаа. Унших алдааг шиднэ (хоосон төлөв гэж
 * нуухгүй); зөвхөн дэлгэрэнгүй синкийн хүснэгт суулгаагүй бол `ads.insights` = null.
 */
type SyncRow = { last_attempt_at: string | null; last_success_at: string | null; last_from: string | null; last_to: string | null; last_error: string | null };
const SYNC_COLUMNS = 'last_attempt_at,last_success_at,last_from,last_to,last_error';

const sync = (row: SyncRow | null | undefined): ConnectionSync | null => row ? {
    lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
    from: row.last_from ? String(row.last_from).slice(0, 10) : null, to: row.last_to ? String(row.last_to).slice(0, 10) : null, error: row.last_error,
} : null;
const missingTable = (error: { code?: string; message?: string }) => error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find .*table/i.test(error.message ?? '');
const fail = (what: string) => new Error(`${what} уншиж чадсангүй`);

export async function loadMarketingConnections(db: SupabaseClient, shopId: string, now = new Date()): Promise<MarketingConnections> {
    const { data: shop, error } = await db.from('shops')
        .select('facebook_page_id,facebook_page_name,facebook_page_access_token,instagram_business_account_id,instagram_username,facebook_ad_account_id,meta_ads_user_access_token,meta_ads_user_token_expires_at')
        .eq('id', shopId).single();
    if (error) throw fail('Төслийн Meta тохиргоог');
    const pageId: string | null = shop?.facebook_page_id || null;
    const instagramId: string | null = shop?.instagram_business_account_id || null;
    const accountId = shop?.facebook_ad_account_id ? `act_${String(shop.facebook_ad_account_id).replace(/^act_/, '')}` : null;

    const [pageSync, instagramSync, insights, spend] = await Promise.all([
        pageId ? db.from('social_insights_sync').select(SYNC_COLUMNS).eq('shop_id', shopId).eq('platform', 'facebook').eq('page_id', pageId).maybeSingle() : null,
        // `syncShopInstagram` төлвөө page_id = IG ID-аар хадгална — өмнө холбосон өөр аккаунтын мөрийг авахгүй.
        instagramId ? db.from('social_insights_sync').select(SYNC_COLUMNS).eq('shop_id', shopId).eq('platform', 'instagram').eq('page_id', instagramId).maybeSingle() : null,
        accountId ? db.from(META_INSIGHTS_STATUS_TABLE).select(SYNC_COLUMNS).eq('shop_id', shopId).eq('account_id', accountId).maybeSingle() : null,
        accountId ? db.from('meta_spend_sync').select(`${SYNC_COLUMNS},currency,mnt_per_unit`).eq('shop_id', shopId).eq('account_id', accountId).maybeSingle() : null,
    ]);
    if (pageSync?.error || instagramSync?.error) throw fail('Сошиал синкийн төлөвийг');
    if (spend?.error) throw fail('Meta зардлын синкийн төлөвийг');
    if (insights?.error && !missingTable(insights.error)) throw fail('Meta дэлгэрэнгүй синкийн төлөвийг');

    const source = metaAdsTokenSource(shop);
    const hasUserToken = !!shop?.meta_ads_user_access_token;
    const spendRow = spend?.data as (SyncRow & { currency: string | null; mnt_per_unit: number | string | null }) | null | undefined;
    const rate = spendRow?.mnt_per_unit === null || spendRow?.mnt_per_unit === undefined ? null : Number(spendRow.mnt_per_unit);
    return {
        // Page токенгүй мөр холбогдоогүй (синк ажиллахгүй).
        page: { connected: !!pageId && !!shop?.facebook_page_access_token, name: shop?.facebook_page_name ?? null, sync: sync(pageSync?.data as SyncRow | null) },
        instagram: { connected: !!instagramId, username: shop?.instagram_username ?? null, sync: sync(instagramSync?.data as SyncRow | null) },
        ads: {
            accountId,
            tokenSource: source,
            tokenDaysLeft: source === 'user' ? tokenDaysLeft(shop?.meta_ads_user_token_expires_at, now) : null,
            tokenExpired: !source && hasUserToken && !metaAdsSystemToken(),
            insights: insights?.error ? null : sync(insights?.data as SyncRow | null),
            spend: sync(spendRow),
            currency: spendRow?.currency ?? null,
            mntPerUnit: spendRow?.currency === 'MNT' ? 1 : Number.isFinite(rate) && rate! > 0 ? rate : null,
        },
    };
}
