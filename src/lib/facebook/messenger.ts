import crypto from 'crypto';
import { calculateBackoffDelay } from '@/lib/webhook/retryService';
import { safeEqual } from '@/lib/crypto/safe-equal';
import { graphInt, META_GRAPH_VERSION, MetaApiError } from '@/lib/facebook/daily-spend';
import { logger } from '@/lib/utils/logger';

// Meta Graph API статус кодууд: түр зуурын алдаа (rate limit / серверийн талын)
// үед дахин оролдоно. 4xx (429-аас бусад) алдааг дахин оролдох нь утгагүй —
// тэдгээр нь буруу хүсэлт (буруу recipient, токен г.м.) тул шууд унагана.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_SEND_ATTEMPTS = 3;
const SEND_TIMEOUT_MS = 20000;

/** Send API-ийн алдааг монгол мессеж болгоно. Meta-гийн хариу, URL, токен хэзээ ч орохгүй. */
function sendError(status: number | null, code: number | null, subcode: number | null): MetaApiError {
    const details = { status, code, subcode };
    if (code === 190) return new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', details);
    if (code === 10 && subcode === 2018278) {
        return new MetaApiError('Харилцагчийн сүүлийн мессежээс хойш 24 цаг өнгөрсөн тул Messenger-ээр хариу илгээх боломжгүй.', details);
    }
    if (code === 551) return new MetaApiError('Энэ харилцагч одоогоор Messenger мессеж хүлээн авах боломжгүй байна.', details);
    return new MetaApiError(`Messenger мессеж илгээж чадсангүй (HTTP ${status}${code !== null ? `, code ${code}` : ''}).`, details);
}

/**
 * Send API (Graph v26 `me/messages`) руу мессеж илгээх нэгдсэн helper. Токен зөвхөн
 * Authorization толгойд, `appsecret_proof` заавал (FACEBOOK_APP_SECRET байхгүй бол Graph-д
 * хандахгүй). Түр зуурын алдаа (429/5xx) болон сүлжээний алдаа гарвал exponential
 * backoff-оор дахин оролдоно. Бусад тохиолдолд шууд MetaApiError шиднэ.
 */
async function postMessage(pageAccessToken: string, body: Record<string, unknown>): Promise<unknown> {
    const proof = appsecretProof(pageAccessToken);
    if (!proof) throw new MetaApiError('Facebook app-ийн нууц түлхүүр (FACEBOOK_APP_SECRET) тохируулаагүй байна.');
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/messages?appsecret_proof=${proof}`;
    let lastError: MetaApiError | undefined;

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${pageAccessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                cache: 'no-store',
                signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            });
        } catch {
            // Сүлжээний алдаа — түр зуурын гэж үзэж дахин оролдоно
            lastError = new MetaApiError('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин оролдоно уу.');
            if (attempt === MAX_SEND_ATTEMPTS) break;
            await sleepBackoff(attempt, lastError);
            continue;
        }

        const json = await response.json().catch(() => null);
        if (response.ok && json && !json.error) return json;
        lastError = sendError(response.status, graphInt(json?.error?.code), graphInt(json?.error?.error_subcode));

        // Дахин оролдох боломжгүй алдаа (4xx, 429-аас бусад) — шууд унагана
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_SEND_ATTEMPTS) break;
        await sleepBackoff(attempt, lastError);
    }

    logger.warn('[Messenger] send failed', { status: lastError?.status, code: lastError?.code, subcode: lastError?.subcode });
    throw lastError;
}

async function sleepBackoff(attempt: number, error: MetaApiError): Promise<void> {
    const delay = calculateBackoffDelay(attempt, { initialDelayMs: 500, maxDelayMs: 8000 });
    logger.warn(`[Messenger] оролдлого ${attempt}/${MAX_SEND_ATTEMPTS} амжилтгүй, ${Math.round(delay)}ms-ийн дараа дахин оролдоно`, {
        status: error.status, code: error.code,
    });
    await new Promise(resolve => setTimeout(resolve, delay));
}

// Page/Instagram-ийн Graph дуудлага бүр (илгээх, профайл, Lead Ads, insights) энэ proof-ыг
// заавал авна; FACEBOOK_APP_SECRET тохируулаагүй бол null буцааж, дуудагч Graph-д хандахгүй (fail closed).
export function appsecretProof(token: string): string | null {
    // ⚠️ .trim() ЗААВАЛ — Vercel env-д сүүл newline/зай орвол OAuth (trim хийдэг)
    // ажиллах ч энэ proof буруу гарч "Invalid appsecret_proof" алдаа өгдөг
    // (subscribe + DM send хоёуланг унагадаг).
    const secret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

interface SendMessageOptions {
    recipientId: string;
    message: string;
    pageAccessToken: string;
}

export async function sendTextMessage({ recipientId, message, pageAccessToken }: SendMessageOptions) {
    return postMessage(pageAccessToken, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: message },
    });
}

export function verifyWebhook(
    mode: string | null,
    token: string | null,
    challenge: string | null,
    verifyToken: string
): string | null {
    if (mode === 'subscribe' && safeEqual(token, verifyToken)) {
        return challenge;
    }
    return null;
}
