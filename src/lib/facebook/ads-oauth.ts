/**
 * «Meta Ads холбох» OAuth: нэг удаагийн code-ийг хадгалах токен болгоно (зөвхөн серверт).
 *
 *  1) code → богино хугацаат токен (POST, Graph v26). Нэг удаагийн code тул дахин оролдохгүй.
 *  2) debug_token (app токеноор): хүчинтэй, манай app-ийнх, төрөл, хугацаа, эрхүүд.
 *  3) SYSTEM_USER (Login for Business-ийн system-user тохиргоо) бол солихгүй.
 *     Бусад үед fb_exchange_token → урт хугацаат токен (сүлжээ, 5xx, 429, хурдны хязгаарт 2 удаа дахин
 *     оролддог — богино токен хүчинтэй хэвээр). Хугацаа = `expires_in`, богино токены `data_access_expires_at`-аар
 *     хязгаарлана; `expires_in` ирээгүй бол `data_access_expires_at` (урт токеныг debug_token-д явуулахгүй — тэр
 *     URL-ын query-д орно). Солилт бүтэлгүйтвэл хүчинтэй богино токеныг өөрийн хугацаатай нь буцааж
 *     `fallback`-ээр мэдэгдэнэ — холболтыг бүхэлд нь унагахгүй, callback «дахин холбоно уу» гэж анхааруулна.
 *
 * Алдаа, лог нь зөвхөн HTTP статус, Graph-ийн code/subcode/type агуулна: токен, code, URL, хариуны бие хэзээ ч биш.
 */
import { META_GRAPH_VERSION, META_RETRY_DELAYS_MS, MetaApiError, graphInt, isRetriableMetaError, metaRead } from '@/lib/facebook/daily-spend';

const TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;

/** Callback-ийн алхам: лог дээр аль алхам бүтэлгүйтсэнийг заана. */
export type MetaAdsOAuthStep =
    | 'state_cookie' | 'state_mismatch' | 'oauth_denied' | 'oauth_code' | 'permission' | 'session' | 'system_token' | 'app_config'
    | 'code_exchange' | 'debug_token' | 'token_invalid' | 'token_app_mismatch' | 'long_exchange'
    | 'ads_read' | 'encrypt' | 'shop_read' | 'shop_update';

export interface MetaGraphDetails { httpStatus: number | null; graphCode: number | null; graphSubcode: number | null; graphType: string | null }
export const NO_GRAPH_DETAILS: MetaGraphDetails = { httpStatus: null, graphCode: null, graphSubcode: null, graphType: null };

export interface MetaAdsTokenGrant {
    token: string;
    /** null = хугацаагүй (Meta expires_at = 0). */
    expiresAt: string | null;
    scopes: string[];
    kind: 'system_user' | 'long_lived' | 'short_lived';
}
export type MetaAdsExchange =
    | { ok: true; grant: MetaAdsTokenGrant; fallback: ({ step: MetaAdsOAuthStep } & MetaGraphDetails) | null }
    | ({ ok: false; result: 'token_error' | 'connection_error'; step: MetaAdsOAuthStep } & MetaGraphDetails);

interface DebugData {
    app_id?: string | number; type?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number;
    scopes?: unknown; error?: { code?: unknown; subcode?: unknown };
}

/** Graph-ийн `error.type` (жишээ нь OAuthException) — зөвхөн үсэг, бусад үед null (лог руу дурын текст оруулахгүй). */
const graphType = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z]{1,64}$/.test(value) ? value : null;
const positive = (value: unknown): number | null => {
    const n = typeof value === 'string' && /^\d{1,12}$/.test(value) ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};

/** MetaApiError-ийн лог хийж болох тоонууд (metaRead `type`-ийг дамжуулдаггүй). */
export function metaErrorDetails(error: unknown): MetaGraphDetails {
    return error instanceof MetaApiError
        ? { httpStatus: error.status, graphCode: error.code, graphSubcode: error.subcode, graphType: null }
        : NO_GRAPH_DETAILS;
}

/**
 * debug_token-ийн хугацаа: `expires_at` ба `data_access_expires_at`-ийн эрт нь (аль аль нь токеныг
 * ажиллахгүй болгоно). 0 = хугацаагүй; хоёулаа 0 бол null.
 */
export function debugTokenExpiry(data: Pick<DebugData, 'expires_at' | 'data_access_expires_at'>): string | null {
    const times = [data.expires_at, data.data_access_expires_at].map(positive).filter((v): v is number => v !== null);
    return times.length ? new Date(Math.min(...times) * 1000).toISOString() : null;
}

type TokenPost = { ok: true; token: string; expiresIn: number | null } | { ok: false; network: boolean; details: MetaGraphDetails };

async function postToken(params: Record<string, string>): Promise<TokenPost> {
    let response: Response;
    try {
        response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
            cache: 'no-store',
            signal: AbortSignal.timeout(20000),
        });
    } catch { return { ok: false, network: true, details: NO_GRAPH_DETAILS }; }
    const body = await response.json().catch(() => null);
    if (response.ok && typeof body?.access_token === 'string' && body.access_token) {
        return { ok: true, token: body.access_token, expiresIn: positive(body.expires_in) };
    }
    return { ok: false, network: false, details: {
        httpStatus: response.status, graphCode: graphInt(body?.error?.code), graphSubcode: graphInt(body?.error?.error_subcode), graphType: graphType(body?.error?.type),
    } };
}

/**
 * fb_exchange_token: түр алдаанд (сүлжээ, HTTP 5xx/429, Graph-ийн 1/2/хурдны хязгаар) `META_RETRY_DELAYS_MS`-ээр
 * дахин оролдоно — богино токен хүчинтэй хэвээр тул code шиг нэг удаагийнх биш.
 */
async function postTokenWithRetry(params: Record<string, string>): Promise<TokenPost> {
    for (let attempt = 0; ; attempt++) {
        const result = await postToken(params);
        if (result.ok || attempt >= META_RETRY_DELAYS_MS.length) return result;
        if (!result.network && !isRetriableMetaError(result.details.httpStatus, result.details.graphCode)) return result;
        await new Promise(resolve => setTimeout(resolve, META_RETRY_DELAYS_MS[attempt]));
    }
}

/** Unix секундын хугацааг ISO болгоно; хугацаагүй (0, буруу) бол null. */
const expiry = (seconds: unknown): string | null => {
    const value = positive(seconds);
    return value === null ? null : new Date(value * 1000).toISOString();
};

type Debug = { ok: true; data: DebugData } | ({ ok: false; result: 'token_error' | 'connection_error'; step: MetaAdsOAuthStep } & MetaGraphDetails);

/**
 * debug_token: Graph `input_token`-ийг зөвхөн query-гээр авдаг тул энэ ганц дуудлагад хэрэглэгчийн (богино) токен
 * URL-д ордог — урт токеныг энд явуулахгүй; Sentry Graph-ийн URL-ыг бичихгүй (`lib/utils/sentry-meta.ts`).
 */
async function debugToken(appId: string, appSecret: string, token: string): Promise<Debug> {
    let data: DebugData | undefined;
    try { data = (await metaRead<{ data?: DebugData }>('debug_token', `${appId}|${appSecret}`, { input_token: token })).data; }
    catch (error) {
        const details = metaErrorDetails(error);
        // HTTP хариу ирсэн (Graph татгалзсан) бол токены алдаа; ирээгүй бол сүлжээ / хугацаа.
        return { ok: false, result: details.httpStatus !== null ? 'token_error' : 'connection_error', step: 'debug_token', ...details };
    }
    if (data?.is_valid !== true) {
        return { ok: false, result: 'token_error', step: 'token_invalid', ...NO_GRAPH_DETAILS, graphCode: graphInt(data?.error?.code), graphSubcode: graphInt(data?.error?.subcode) };
    }
    if (String(data.app_id ?? '') !== appId) return { ok: false, result: 'token_error', step: 'token_app_mismatch', ...NO_GRAPH_DETAILS };
    return { ok: true, data };
}

export async function exchangeMetaAdsCode(input: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<MetaAdsExchange> {
    const { appId, appSecret } = input;
    const short = await postToken({ client_id: appId, client_secret: appSecret, redirect_uri: input.redirectUri, code: input.code });
    if (!short.ok) return { ok: false, result: short.network ? 'connection_error' : 'token_error', step: 'code_exchange', ...short.details };

    const debug = await debugToken(appId, appSecret, short.token);
    if (!debug.ok) return debug;
    const scopes = Array.isArray(debug.data.scopes) ? debug.data.scopes.filter((s): s is string => typeof s === 'string') : [];
    // Login for Business-ийн system-user тохиргоо хугацаагүй (expires_at = 0) SYSTEM_USER токен өгдөг —
    // түүнийг богино хугацаат user токен шиг солихгүй.
    if (debug.data.type === 'SYSTEM_USER') {
        return { ok: true, grant: { token: short.token, expiresAt: debugTokenExpiry(debug.data), scopes, kind: 'system_user' }, fallback: null };
    }
    const shortGrant: MetaAdsTokenGrant = { token: short.token, expiresAt: debugTokenExpiry(debug.data), scopes, kind: 'short_lived' };

    const long = await postTokenWithRetry({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.token });
    if (!long.ok) return { ok: true, grant: shortGrant, fallback: { step: 'long_exchange', ...long.details } };
    // Өгөгдөлд хандах эрх (`data_access_expires_at`) дууссаны дараа урт токен ч уншиж чадахгүй — хугацааны дээд хязгаар.
    const dataAccess = expiry(debug.data.data_access_expires_at);
    const ownExpiry = long.expiresIn !== null ? new Date(Date.now() + long.expiresIn * 1000).toISOString() : null;
    const expiresAt = ownExpiry && dataAccess ? (ownExpiry < dataAccess ? ownExpiry : dataAccess) : ownExpiry ?? dataAccess;
    return { ok: true, grant: { token: long.token, expiresAt, scopes, kind: 'long_lived' }, fallback: null };
}
