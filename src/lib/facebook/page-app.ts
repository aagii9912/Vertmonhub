/**
 * Facebook Page, Instagram, Messenger DM, Lead Ads, webhook-ийн Meta апп (зөвхөн сервер).
 *
 * 2026-10-13: хуучин апп (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET) Meta-д хаагдсан — app токеноор Graph
 * «API access blocked» (code 200) хариулдаг, тиймээс Page холболт бүтэхгүй байв. Анхдагчаар
 * Meta Ads холболтод ажилладаг, Published «Vertmon Hub» аппыг (META_ADS_APP_ID / META_ADS_APP_SECRET)
 * ашиглана. `META_PAGE_APP=legacy` бол хуучин аппыг (буцаах арга).
 *
 * Page токен, `appsecret_proof`, OAuth, `subscribed_apps` бүгд нэг аппынх байх ёстой: өөр аппын proof-ыг
 * Graph «Invalid appsecret_proof» гэж татгалзана.
 */
export interface MetaPageApp {
    id: string;
    secret: string;
    source: 'ads' | 'legacy';
    /** Facebook Login for Business-ийн тохиргоо (Page, Instagram-ийн эрхүүдтэй). Байхгүй бол `scope` параметр. */
    loginConfigId: string | null;
}

const env = (name: string) => process.env[name]?.trim() || '';

export function metaPageApp(): MetaPageApp | null {
    const mode = env('META_PAGE_APP').toLowerCase();
    if (mode !== 'legacy' && env('META_ADS_APP_ID') && env('META_ADS_APP_SECRET')) {
        return { id: env('META_ADS_APP_ID'), secret: env('META_ADS_APP_SECRET'), source: 'ads', loginConfigId: env('META_PAGE_LOGIN_CONFIG_ID') || null };
    }
    if (env('FACEBOOK_APP_ID') && env('FACEBOOK_APP_SECRET')) {
        return {
            id: env('FACEBOOK_APP_ID'), secret: env('FACEBOOK_APP_SECRET'), source: 'legacy',
            loginConfigId: env('FACEBOOK_LOGIN_USE_CONFIG').toLowerCase() === 'true' ? env('FACEBOOK_LOGIN_CONFIG_ID') || null : null,
        };
    }
    return null;
}

/** Page токены `appsecret_proof`-ийн нууц: Page апп, эс бөгөөс хуучин FACEBOOK_APP_SECRET (зөвхөн нууц тохируулсан орчинд). */
export function metaPageAppSecret(): string | null {
    return metaPageApp()?.secret || env('FACEBOOK_APP_SECRET') || null;
}

/**
 * Webhook (X-Hub-Signature-256) болон data deletion-ий signed_request-ийг шалгах нууцууд. Шилжилтийн үед
 * хуучин аппын subscription ч илгээж болох тул манай хоёр аппын аль нэгнийх таарвал хүчинтэй.
 */
export function metaWebhookSecrets(): string[] {
    return [...new Set([metaPageApp()?.secret, env('META_ADS_APP_SECRET'), env('FACEBOOK_APP_SECRET')].filter((secret): secret is string => !!secret))];
}

export const META_PAGE_APP_MISSING = 'Facebook Page-ийн апп (META_ADS_APP_ID/SECRET эсвэл FACEBOOK_APP_ID/SECRET) тохируулаагүй байна.';
