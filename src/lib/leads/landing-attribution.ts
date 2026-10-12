/**
 * Landing page-ийн суваг: лид аль хуудаснаас, ямар сувгаар (эвент, сошиал зар, сошиал пост, вэб) ирсэн.
 * Elysium-ийн шууд дамжуулалт, татан авалт, нөхөх скрипт ба лидийн панел нэг дүрмийг эндээс авна
 * (client-safe, цэвэр функц). Эрэмбэ: линкийн UTM → Meta-ээс шилжсэн зочин «Сошиал зар» хуудсанд
 * → referrer/fbclid → хуудасны зориулалт → вэб. `fbclid` ганцаараа зар гэдгийг батлахгүй
 * (Facebook органик постын линкэд ч нэмдэг).
 */
import type { LeadSource } from '@/types/property';
import { SOURCE_LABEL } from './labels';

export const LANDING_PURPOSES = ['event', 'social_ad', 'general'] as const;
export type LandingPurpose = (typeof LANDING_PURPOSES)[number];
export const LANDING_PURPOSE_LABEL: Record<LandingPurpose, string> = {
    event: 'Эвент',
    social_ad: 'Сошиал зар',
    general: 'Ерөнхий',
};

export function isLandingPurpose(value: unknown): value is LandingPurpose {
    return typeof value === 'string' && (LANDING_PURPOSES as readonly string[]).includes(value);
}

/** Үндсэн сайтын (landing page биш) маягтын `landing_page` түлхүүр. */
export const ELYSIUM_SITE_PAGE = 'site';
export const ELYSIUM_SITE_PAGE_NAME = 'Үндсэн сайт';

/** Лидийн жагсаалтын «Landing page» шүүлтүүрийн сонголт (`/api/dashboard/leads/landing-pages`). */
export interface LandingPageOption {
    /** `event/<slug>` эсвэл `site` */
    key: string;
    name: string;
    url: string | null;
    purpose: LandingPurpose | null;
    leads: number;
}

/** Сувгийг юугаар тогтоосон. */
export type ChannelBasis = 'utm' | 'page' | 'referrer' | 'none';
export const CHANNEL_BASIS_LABEL: Record<ChannelBasis, string> = {
    utm: 'Линкийн UTM',
    page: 'Хуудасны зориулалт',
    referrer: 'Ирсэн сайт',
    none: 'Тодорхойгүй',
};

/** Лидийн мөрөнд хадгалагдсан дохио (leads баганын нэрээр). */
export interface LandingSignals {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    facebook_campaign_id?: string | null;
    facebook_adset_id?: string | null;
    facebook_ad_id?: string | null;
    fbclid?: string | null;
    referrer_host?: string | null;
    landing_page_purpose?: string | null;
}

const EVENT_MEDIA = new Set(['event', 'qr', 'offline', 'expo', 'booth', 'fair']);
const EVENT_SOURCES = new Set(['event', 'qr', 'expo']);
const PAID_MEDIA = new Set(['paid', 'paid_social', 'paid-social', 'paidsocial', 'cpc', 'ppc', 'cpm', 'ads', 'ad', 'sponsored']);
const SOCIAL_MEDIA = new Set(['social', 'organic', 'organic_social', 'post', 'story', 'bio']);
/** Meta-ийн `{{site_source_name}}` (fb, ig, msg, an) болон түгээмэл нэршил. */
const META_SOURCES = new Set(['fb', 'facebook', 'ig', 'instagram', 'meta', 'msg', 'messenger', 'an', 'audience_network', 'threads']);
const INSTAGRAM_SOURCES = new Set(['ig', 'instagram']);
const GOOGLE_SOURCES = new Set(['google', 'adwords', 'gads', 'youtube']);

const norm = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

/** utm_id-г Meta кампанит ажлын ID гэж үзэх эсэх: эх сурвалжгүй эсвэл Meta-ийн нэршил. */
export function isMetaUtmSource(value: string | null | undefined): boolean {
    const src = norm(value);
    return !src || META_SOURCES.has(src);
}
const isHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function isInstagramHost(host: string | null | undefined): boolean {
    return isHost(norm(host), 'instagram.com');
}

/** Facebook, Instagram, Messenger, Threads-ийн домэйн (l.facebook.com, lm.facebook.com г.м.). */
export function isMetaHost(host: string | null | undefined): boolean {
    const value = norm(host);
    return !!value && ['facebook.com', 'fb.com', 'fb.me', 'messenger.com', 'instagram.com', 'threads.net'].some((domain) => isHost(value, domain));
}

/** utm_source нь толь бичгийн утга яг таарвал (tv, radio, board…). Нэршлийн alias-ыг энд хэрэглэхгүй. */
function vocabularySource(src: string): LeadSource | null {
    return src && src !== 'website' && Object.hasOwn(SOURCE_LABEL, src) ? src as LeadSource : null;
}

/** Лидийн эх үүсвэр (`leads.source`) ба түүнийг юугаар тогтоосон. */
export function landingLeadSource(signals: LandingSignals): { source: LeadSource; basis: ChannelBasis } {
    const medium = norm(signals.utm_medium);
    const src = norm(signals.utm_source);
    const metaIds = !!(signals.facebook_campaign_id || signals.facebook_adset_id || signals.facebook_ad_id);

    if (EVENT_MEDIA.has(medium) || EVENT_SOURCES.has(src)) return { source: 'event', basis: 'utm' };
    if (PAID_MEDIA.has(medium) || metaIds) {
        if (GOOGLE_SOURCES.has(src)) return { source: 'google_ads', basis: 'utm' };
        if (!src || metaIds || META_SOURCES.has(src)) return { source: 'facebook_ads', basis: 'utm' };
        return { source: vocabularySource(src) ?? 'other', basis: 'utm' };
    }
    if (SOCIAL_MEDIA.has(medium) || META_SOURCES.has(src)) {
        if (INSTAGRAM_SOURCES.has(src)) return { source: 'instagram', basis: 'utm' };
        if (!src || META_SOURCES.has(src)) return { source: 'facebook', basis: 'utm' };
        return { source: vocabularySource(src) ?? 'other', basis: 'utm' };
    }
    const known = vocabularySource(src);
    if (known) return { source: known, basis: 'utm' };

    const purpose = isLandingPurpose(signals.landing_page_purpose) ? signals.landing_page_purpose : null;
    if (isMetaHost(signals.referrer_host) || signals.fbclid) {
        // «Сошиал зар» хуудсанд Meta-ээс шилжсэн зочин = зар. Бусад хуудсанд органик гэж үзнэ.
        if (purpose === 'social_ad') return { source: 'facebook_ads', basis: 'page' };
        return { source: isInstagramHost(signals.referrer_host) ? 'instagram' : 'facebook', basis: 'referrer' };
    }
    if (purpose === 'event') return { source: 'event', basis: 'page' };
    if (purpose === 'social_ad') return { source: 'facebook_ads', basis: 'page' };
    return { source: 'website', basis: 'none' };
}

/**
 * Лидийн панелд «Ирсэн зам»: тогтоосон үндэслэл ба түүхий утга. Эх үүсвэрийг дараа нь өөрчилсөн
 * (дүрмийн үр дүнтэй таарахгүй) эсвэл ямар ч дохио байхгүй бол null.
 */
export function landingArrival(lead: LandingSignals & { source?: string | null }): { basis: ChannelBasis; detail: string | null } | null {
    const hasSignal = !!(lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.facebook_campaign_id
        || lead.fbclid || lead.referrer_host || lead.landing_page_purpose);
    if (!hasSignal) return null;
    const { source, basis } = landingLeadSource(lead);
    if (lead.source && lead.source !== source) return null;
    const utm = [lead.utm_source, lead.utm_medium].filter(Boolean).join(' / ');
    const detail = basis === 'utm'
        ? [utm, lead.utm_campaign].filter(Boolean).join(' · ') || (lead.facebook_campaign_id ? `Meta кампанит ажил ${lead.facebook_campaign_id}` : null)
        : basis === 'page'
            ? [isLandingPurpose(lead.landing_page_purpose) ? LANDING_PURPOSE_LABEL[lead.landing_page_purpose] : null, lead.referrer_host].filter(Boolean).join(' · ') || null
            : basis === 'referrer'
                ? lead.referrer_host || (lead.fbclid ? 'Facebook/Instagram линк' : null)
                : lead.referrer_host || null;
    return { basis, detail };
}
