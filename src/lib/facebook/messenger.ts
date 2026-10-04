import crypto from 'crypto';
import { calculateBackoffDelay } from '@/lib/webhook/retryService';
import { safeEqual } from '@/lib/crypto/safe-equal';

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

// Meta Graph API статус кодууд: түр зуурын алдаа (rate limit / серверийн талын)
// үед дахин оролдоно. 4xx (429-аас бусад) алдааг дахин оролдох нь утгагүй —
// тэдгээр нь буруу хүсэлт (буруу recipient, токен г.м.) тул шууд унагана.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_SEND_ATTEMPTS = 3;

/**
 * Meta Graph API руу мессеж илгээх нэгдсэн helper.
 * Түр зуурын алдаа (429/5xx) болон сүлжээний алдаа гарвал exponential
 * backoff-оор дахин оролдоно. Бусад тохиолдолд шууд алдаа шиднэ.
 */
async function postToGraph(
    pageAccessToken: string,
    body: Record<string, unknown>,
    operation: string
): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        let response: Response;
        try {
            response = await fetch(buildSendUrl(pageAccessToken), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (err) {
            // Сүлжээний алдаа — түр зуурын гэж үзэж дахин оролдоно
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt === MAX_SEND_ATTEMPTS) break;
            await sleepBackoff(attempt, operation);
            continue;
        }

        if (response.ok) {
            return response.json();
        }

        const error = await response.json().catch(() => ({}));
        const message = error?.error?.message || `HTTP ${response.status}`;

        // Дахин оролдох боломжгүй алдаа (4xx, 429-аас бусад) — шууд унагана
        if (!RETRYABLE_STATUS.has(response.status)) {
            console.error(`Facebook API error [${operation}]:`, error);
            throw new Error(`Failed to ${operation}: ${message}`);
        }

        lastError = new Error(message);
        if (attempt === MAX_SEND_ATTEMPTS) break;
        await sleepBackoff(attempt, operation);
    }

    throw new Error(`Failed to ${operation}${lastError ? `: ${lastError.message}` : ''}`);
}

async function sleepBackoff(attempt: number, operation: string): Promise<void> {
    const delay = calculateBackoffDelay(attempt, { initialDelayMs: 500, maxDelayMs: 8000 });
    console.warn(`⚠️ [${operation}] оролдлого ${attempt}/${MAX_SEND_ATTEMPTS} амжилтгүй, ${Math.round(delay)}ms-ийн дараа дахин оролдоно...`);
    await new Promise(resolve => setTimeout(resolve, delay));
}

// Meta recommends signing every Graph API call with appsecret_proof when the
// "Require App Secret Proof for Server API calls" toggle is on. Returns null
// when FACEBOOK_APP_SECRET is not configured, in which case the param is
// omitted (Meta accepts the call so long as the toggle is off).
export function appsecretProof(token: string): string | null {
    // ⚠️ .trim() ЗААВАЛ — Vercel env-д сүүл newline/зай орвол OAuth (trim хийдэг)
    // ажиллах ч энэ proof буруу гарч "Invalid appsecret_proof" алдаа өгдөг
    // (subscribe + DM send хоёуланг унагадаг).
    const secret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function buildSendUrl(pageAccessToken: string): string {
    const proof = appsecretProof(pageAccessToken);
    const base = `${GRAPH_API_URL}/me/messages?access_token=${pageAccessToken}`;
    return proof ? `${base}&appsecret_proof=${proof}` : base;
}

interface SendMessageOptions {
    recipientId: string;
    message: string;
    pageAccessToken: string;
}

export async function sendTextMessage({ recipientId, message, pageAccessToken }: SendMessageOptions) {
    return postToGraph(pageAccessToken, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: message },
    }, 'send message');
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
