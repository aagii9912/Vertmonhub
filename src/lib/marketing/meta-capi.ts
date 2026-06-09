/**
 * Meta Conversions API (server-side). Pixel-ийн нэмэлт болж сервер талаас event илгээж,
 * iOS/cookie алдагдлыг нөхнө. Зөвхөн PIXEL_ID + META_CAPI_ACCESS_TOKEN тохируулсан үед ажиллана.
 * Best-effort — алдаа гарвал үндсэн урсгалыг тасалдуулахгүй.
 */

import { createHash } from 'crypto';
import { logger } from '@/lib/utils/logger';

const GRAPH_VERSION = 'v21.0';

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** И-мэйлийг нормчилж hash хийх (trim + lowercase). */
function hashEmail(email?: string | null): string | undefined {
    if (!email) return undefined;
    const norm = email.trim().toLowerCase();
    return norm ? sha256(norm) : undefined;
}

/** Утсыг E.164 маягийн цифр болгож (Монгол: 976 код) hash хийх. */
function hashPhone(phone?: string | null): string | undefined {
    if (!phone) return undefined;
    let d = String(phone).replace(/\D/g, '');
    if (!d) return undefined;
    if (d.length === 8) d = `976${d}`;            // дотоод дугаар → улсын код нэмэх
    else if (d.length === 11 && d.startsWith('976')) { /* аль хэдийн зөв */ }
    return sha256(d);
}

/** fbclid-аас Meta-ийн `fbc` параметр бүтээх. */
export function buildFbc(fbclid?: string | null, ts: number = Date.now()): string | undefined {
    if (!fbclid) return undefined;
    return `fb.1.${ts}.${fbclid}`;
}

export interface CapiUserData {
    email?: string | null;
    phone?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    clientIp?: string | null;
    userAgent?: string | null;
}

export interface CapiEventParams {
    eventName: string;            // 'Lead', 'Purchase', ...
    eventId?: string;             // browser pixel-тэй dedup хийх id
    eventSourceUrl?: string | null;
    userData: CapiUserData;
    customData?: Record<string, unknown>;
}

/**
 * Meta CAPI руу нэг event илгээх. Тохиргоо байхгүй бол чимээгүй буцна.
 */
export async function sendMetaCapiEvent(params: CapiEventParams): Promise<void> {
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
    if (!pixelId || !accessToken) return;

    const ud = params.userData;
    const userData: Record<string, unknown> = {};
    const em = hashEmail(ud.email);
    const ph = hashPhone(ud.phone);
    if (em) userData.em = em;
    if (ph) userData.ph = ph;
    if (ud.fbc) userData.fbc = ud.fbc;
    if (ud.fbp) userData.fbp = ud.fbp;
    if (ud.clientIp) userData.client_ip_address = ud.clientIp;
    if (ud.userAgent) userData.client_user_agent = ud.userAgent;

    const payload = {
        data: [{
            event_name: params.eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            ...(params.eventId ? { event_id: params.eventId } : {}),
            ...(params.eventSourceUrl ? { event_source_url: params.eventSourceUrl } : {}),
            user_data: userData,
            ...(params.customData ? { custom_data: params.customData } : {}),
        }],
    };

    try {
        const res = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger.warn('[Meta CAPI] non-OK response', { status: res.status, body: text.slice(0, 300) });
        }
    } catch (error) {
        logger.warn('[Meta CAPI] send failed', { error });
    }
}
