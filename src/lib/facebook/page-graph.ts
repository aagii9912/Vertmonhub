/**
 * Facebook Page / Instagram Graph дуудлага (Graph v26, `FACEBOOK_APP_SECRET`-ийн `appsecret_proof`).
 * Зарын `metaRead`-тэй ижил цөм (`graphRead`/`graphPost`): токен URL-д орохгүй, түр алдаанд хязгаартай
 * дахин оролдлого, URL/хариу/токен лог руу орохгүй. Зөвхөн сервер.
 */
import { appsecretProof } from '@/lib/facebook/messenger';
import { graphPost, graphRead, MetaApiError, type MetaGraphApp, type MetaReadOptions } from '@/lib/facebook/daily-spend';

/** Graph-ийн эрхийн алдаа: 10 = permission, 200–299 = permission/token-ийн эрх, 294 = ads. */
const PERMISSION_CODES = new Set([10, 200, 294]);

function pageError(status: number | null, code: number | null, subcode: number | null): MetaApiError {
    const details = { status, code, subcode };
    if (code === 190) return new MetaApiError('Facebook холболтын эрх дууссан. Page-ээ дахин холбоно уу.', details);
    if (code !== null && (PERMISSION_CODES.has(code) || (code > 200 && code < 300))) {
        return new MetaApiError('Facebook-ийн эрх дутуу байна (read_insights, pages_read_engagement). Page-ээ дахин холбоно уу.', details);
    }
    if (code === 100) return new MetaApiError('Facebook энэ үзүүлэлт эсвэл талбарыг өгөхгүй байна (code 100).', details);
    return new MetaApiError(`Facebook Graph алдаа (HTTP ${status}${code !== null ? `, code ${code}` : ''}). Дахин оролдоно уу.`, details);
}

const PAGE_APP: MetaGraphApp = {
    proof: appsecretProof,
    missingSecret: 'Facebook app-ийн нууц түлхүүр (FACEBOOK_APP_SECRET) тохируулаагүй байна.',
    error: pageError,
};

export function pageRead<T>(path: string, token: string, params: Record<string, string> = {}, options: MetaReadOptions = {}): Promise<T> {
    return graphRead<T>(PAGE_APP, path, token, params, options);
}

export function pagePost<T>(path: string, token: string, body: Record<string, string> = {}): Promise<T> {
    return graphPost<T>(PAGE_APP, path, token, body);
}

/** Токен дууссан/хүчингүй (code 190) — хэрэглэгч Page-ээ дахин холбох ёстой. */
export function isMetaTokenError(error: unknown): boolean {
    return error instanceof MetaApiError && error.code === 190;
}

/** Эрх дутуу (read_insights, pages_read_engagement, instagram_manage_insights …). */
export function isMetaPermissionError(error: unknown): boolean {
    return error instanceof MetaApiError && error.code !== null && (PERMISSION_CODES.has(error.code) || (error.code > 200 && error.code < 300));
}

/** Хүчингүй/хасагдсан метрик, талбар (code 100) — тэр метрикийг «байхгүй» гэж тэмдэглэнэ. */
export function isMetaInvalidParamError(error: unknown): boolean {
    return error instanceof MetaApiError && error.code === 100;
}
