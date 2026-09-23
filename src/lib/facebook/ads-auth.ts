import { decryptToken } from '@/lib/crypto/tokens';

export interface MetaAdsConnection {
    meta_ads_user_access_token?: string | null;
    meta_ads_user_token_expires_at?: string | null;
}

export function metaAdsToken(shop: MetaAdsConnection | null | undefined): string {
    const token = decryptToken(shop?.meta_ads_user_access_token);
    if (!token) throw new Error('Meta Ads холболтоо хийнэ үү.');
    if (shop?.meta_ads_user_token_expires_at &&
        (!Number.isFinite(Date.parse(shop.meta_ads_user_token_expires_at)) || Date.parse(shop.meta_ads_user_token_expires_at) <= Date.now())) {
        throw new Error('Meta Ads нэвтрэх эрх дууссан. Дахин холбоно уу.');
    }
    return token;
}
