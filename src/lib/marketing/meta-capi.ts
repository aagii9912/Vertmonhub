/**
 * Meta Conversions API (server-side). Pixel-ийн нэмэлт болж сервер талаас event илгээж,
 * iOS/cookie алдагдлыг нөхнө. Зөвхөн PIXEL_ID + META_CAPI_ACCESS_TOKEN тохируулсан үед ажиллана.
 * Best-effort — алдаа гарвал үндсэн урсгалыг тасалдуулахгүй (энэ функц хэзээ ч throw хийхгүй).
 *
 * Graph v26: токен зөвхөн `Authorization` толгойд, URL-д хэзээ ч орохгүй. Лог-д зөвхөн HTTP статус
 * ба Graph-ийн code/subcode — URL, хариуны бие, токен орохгүй.
 */

import { createHash, createHmac } from 'crypto';
import { graphInt, META_GRAPH_VERSION } from '@/lib/facebook/daily-spend';
import { logger } from '@/lib/utils/logger';
import { normalizePhone } from '@/lib/utils/phone';

/** Meta хариуг хүлээх дээд хугацаа — лидийн хариуг удаан саатуулахгүй. */
const CAPI_TIMEOUT_MS = 5000;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * CAPI токены `appsecret_proof`. Events Manager-ээс үүсгэсэн dataset/system user токен ихэвчлэн
 * FACEBOOK_APP_SECRET-ийн app-д хамаардаггүй — өөр app-ийн proof явуулбал Meta хүсэлтийг бүхэлд нь
 * буцаана. Тиймээс зөвхөн токены app-ийн нууцыг META_CAPI_APP_SECRET-д тусад нь тохируулсан үед нэмнэ.
 */
function capiProof(token: string): string | null {
    const secret = process.env.META_CAPI_APP_SECRET?.trim();
    return secret ? createHmac('sha256', secret).update(token).digest('hex') : null;
}

/** И-мэйлийг нормчилж hash хийх (trim + lowercase). */
function hashEmail(email?: string | null): string | undefined {
    if (!email) return undefined;
    const norm = email.trim().toLowerCase();
    return norm ? sha256(norm) : undefined;
}

/** Утсыг E.164 маягийн цифр болгож (Монгол: 976 код) hash хийх. */
function hashPhone(phone?: string | null): string | undefined {
    const local = normalizePhone(phone);
    if (!local) return undefined;
    return sha256(local.length === 8 ? `976${local}` : local); // дотоод дугаар → улсын код нэмэх
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
    try {
        // ⚠️ .trim() — Vercel env-ийн сүүл newline proof-ийг буруу болгоно.
        const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim();
        const accessToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();
        if (!pixelId || !accessToken) return;
        if (!/^\d+$/.test(pixelId)) {
            logger.warn('[Meta CAPI] NEXT_PUBLIC_FACEBOOK_PIXEL_ID тоо биш — event илгээгээгүй');
            return;
        }

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

        const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`);
        const proof = capiProof(accessToken);
        if (proof) url.searchParams.set('appsecret_proof', proof);

        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
            signal: AbortSignal.timeout(CAPI_TIMEOUT_MS),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json && !json.error) return;
        logger.warn('[Meta CAPI] non-OK response', {
            status: res.status,
            code: graphInt(json?.error?.code),
            subcode: graphInt(json?.error?.error_subcode),
        });
    } catch (error) {
        // Алдааны мессеж/cause-д URL орж болзошгүй тул зөвхөн төрлийг (TimeoutError, TypeError …) бичнэ.
        logger.warn('[Meta CAPI] send failed', { reason: error instanceof Error ? error.name : typeof error });
    }
}
