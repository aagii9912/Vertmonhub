import { decryptToken } from '@/lib/crypto/tokens';

export interface MetaAdsConnection {
    meta_ads_user_access_token?: string | null;
    meta_ads_user_token_expires_at?: string | null;
}
/** 'system' = Business Manager-ийн System User (хугацаагүй, env), 'user' = төслийн OAuth хэрэглэгчийн токен. */
export type MetaAdsTokenSource = 'system' | 'user';

/**
 * Business Manager-ийн System User токен (`META_ADS_SYSTEM_TOKEN`, зөвхөн сервер, Sensitive).
 * Тохируулсан бол бүх төсөлд хэрэглэгчийн токеноос түрүүлж ашиглана — данс бүрийг system
 * user-т оноосон байх ёстой (docs/features/META-INSIGHTS-API-2026-10-05.md).
 */
export function metaAdsSystemToken(): string | null {
    return process.env.META_ADS_SYSTEM_TOKEN?.trim() || null;
}

function metaAdsUserToken(shop: MetaAdsConnection | null | undefined): string {
    const token = decryptToken(shop?.meta_ads_user_access_token);
    if (!token) throw new Error('Meta Ads холболтоо хийнэ үү.');
    // Хугацаагүй (NULL) нь System User токен — хүчинтэй.
    if (shop?.meta_ads_user_token_expires_at &&
        (!Number.isFinite(Date.parse(shop.meta_ads_user_token_expires_at)) || Date.parse(shop.meta_ads_user_token_expires_at) <= Date.now())) {
        throw new Error('Meta Ads нэвтрэх эрх дууссан. Дахин холбоно уу.');
    }
    return token;
}

export function metaAdsToken(shop: MetaAdsConnection | null | undefined): string {
    return metaAdsSystemToken() ?? metaAdsUserToken(shop);
}

/** Аль токен ашиглагдахыг (токены утгагүйгээр) буцаана; хүчинтэй токен байхгүй бол null. */
export function metaAdsTokenSource(shop: MetaAdsConnection | null | undefined): MetaAdsTokenSource | null {
    if (metaAdsSystemToken()) return 'system';
    try { metaAdsUserToken(shop); return 'user'; }
    catch { return null; }
}
