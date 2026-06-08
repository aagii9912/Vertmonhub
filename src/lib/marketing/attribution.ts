/**
 * Маркетингийн attribution туслахууд (client-side).
 * URL-аас fbclid / utm_* параметрийг барьж cookie-д хадгалж, форм илгээлтэд хавсаргана.
 * Public lead форм нь гадна embed хийгдсэн тул эдгээрийг repo доторх форм/CTA-д ашиглана.
 */

const COOKIE_NAME = 'vh_attr';
const MAX_AGE_DAYS = 90;

export interface Attribution {
    fbclid?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    landing?: string;
    ts?: number;
}

const UTM_KEYS: (keyof Attribution)[] = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
];

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.split('; ').find(c => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function writeCookie(name: string, value: string, days: number): void {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Эхний зочлолтод URL-аас attribution барьж хадгална (давтан бичихгүй — first-touch).
 * Шинэ fbclid/utm ирвэл шинэчилнэ (сүүлийн идэвхтэй кампанит ажил).
 */
export function captureAttributionFromUrl(): Attribution {
    if (typeof window === 'undefined') return {};

    const params = new URLSearchParams(window.location.search);
    const incoming: Attribution = {};
    const fbclid = params.get('fbclid');
    if (fbclid) incoming.fbclid = fbclid;
    for (const key of UTM_KEYS) {
        const v = params.get(key);
        if (v) incoming[key] = v as never;
    }

    const existing = getStoredAttribution();

    // Шинэ маркетингийн параметр ирээгүй бол одоо байгааг хэвээр үлдээнэ
    if (Object.keys(incoming).length === 0) {
        return existing;
    }

    const merged: Attribution = {
        ...existing,
        ...incoming,
        landing: existing.landing || window.location.pathname,
        ts: Date.now(),
    };
    writeCookie(COOKIE_NAME, JSON.stringify(merged), MAX_AGE_DAYS);
    return merged;
}

/** Хадгалсан attribution-ыг унших (форм илгээхэд хавсаргахад). */
export function getStoredAttribution(): Attribution {
    const raw = readCookie(COOKIE_NAME);
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Attribution;
    } catch {
        return {};
    }
}

/** Meta browser cookie-уудыг унших (CAPI dedup/match-д). */
export function getMetaBrowserIds(): { fbp?: string; fbc?: string } {
    return {
        fbp: readCookie('_fbp') || undefined,
        fbc: readCookie('_fbc') || undefined,
    };
}
