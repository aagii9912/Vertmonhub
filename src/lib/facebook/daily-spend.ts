import crypto from 'crypto';
import { dateSchema } from '@/lib/marketing/performance';
import { logger } from '@/lib/utils/logger';

/** Бүх Graph дуудлагын нэг хувилбар (зар, Page, Instagram). */
export const META_GRAPH_VERSION = 'v26.0';
const BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export interface MetaAccount { id: string; currency: string; timezone_name: string }
export interface MetaDailyRow { campaign_id: string; campaign_name: string; spent_at: string; native_amount: string }

/**
 * Graph API-ийн алдаа. Мессеж нь хэрэглэгчид харуулах монгол текст; `code`/`subcode`/`status`
 * нь Graph-ийн тоонууд. URL, хариуны бие, токен хэзээ ч агуулахгүй.
 */
export class MetaApiError extends Error {
    readonly code: number | null;
    readonly subcode: number | null;
    readonly status: number | null;
    constructor(message: string, details: { code?: number | null; subcode?: number | null; status?: number | null } = {}) {
        super(message);
        this.name = 'MetaApiError';
        this.code = details.code ?? null;
        this.subcode = details.subcode ?? null;
        this.status = details.status ?? null;
    }
}

/** Түр зуурын алдаанд дахин оролдох хүлээлт: ихдээ 2 дахин, нийт ~4 сек. */
export const META_RETRY_DELAYS_MS = [1000, 3000] as const;
// 1/2 = түр алдаа, 4/17/32/613 = хурдны хязгаар, 80000–80014 = business use case хязгаар.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const isRateLimitCode = (code: number | null) => code !== null && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014));
export function isRetriableMetaError(status: number | null, code: number | null): boolean {
    return status === 429 || (status !== null && status >= 500) || code === 1 || code === 2 || isRateLimitCode(code);
}
/** Meta хурдны хязгаарт хүрсэн (HTTP 429, code 4/17/32/613, 80000–80014): тэр давталтыг зогсооно. */
export function isMetaRateLimitError(error: unknown): boolean {
    return error instanceof MetaApiError && (error.status === 429 || isRateLimitCode(error.code));
}

/**
 * Синкийн нийт хугацааны хязгаар: route-ийн `maxDuration`-аас аюулгүйн зайтай. `at` (Date.now()-ийн
 * цаг) нь шинэ алхам эхлүүлэх эсэхийг, `signal` нь яг тэр мөчид Graph хүсэлтийг таслахыг шийднэ.
 */
export interface MetaDeadline { readonly at: number; readonly signal: AbortSignal }
export function metaDeadline(ms: number): MetaDeadline {
    return { at: Date.now() + ms, signal: AbortSignal.timeout(ms) };
}
/** Үлдсэн хугацаа (мс); хязгааргүй бол Infinity. */
export function metaTimeLeft(deadline?: MetaDeadline | null): number {
    return deadline ? deadline.at - Date.now() : Infinity;
}
/** Алхмын өөрийн timeout ба синкийн нийт хугацааны аль эрт дуусахаар таслах signal. */
export function metaStepSignal(ms: number, deadline?: MetaDeadline | null): AbortSignal {
    const step = AbortSignal.timeout(ms);
    return deadline ? AbortSignal.any([step, deadline.signal]) : step;
}
/** Нийт хугацаа дууссан эсэх (signal таслагдсан эсвэл цаг өнгөрсөн). */
export function metaDeadlinePassed(deadline?: MetaDeadline | null): boolean {
    return !!deadline && (deadline.signal.aborted || metaTimeLeft(deadline) <= 0);
}

export interface MetaReadOptions {
    /** Бүх дахин оролдлогыг оролцуулсан хугацааны хязгаар; өгөөгүй бол 20 сек. */
    signal?: AbortSignal;
    /** false = түр алдаанд дахин оролдохгүй (олон дуудлагатай давталт өөрөө зогсоно). */
    retry?: boolean;
}

const USAGE_HEADERS = ['x-business-use-case-usage', 'x-fb-ads-insights-throttle', 'x-ad-account-usage', 'x-app-usage'] as const;
const USAGE_KEYS = new Set(['call_count', 'total_cputime', 'total_time', 'app_id_util_pct', 'acc_id_util_pct']);
/** Meta-гийн хэрэглээний толгойнуудын хамгийн их ачаалал (%), хандалт сэргэх хүлээлт (минут). */
export function metaUsage(headers: Headers): { pct: number; regainMinutes: number; header: string | null } {
    let pct = 0, regainMinutes = 0, header: string | null = null;
    for (const name of USAGE_HEADERS) {
        const raw = headers.get(name);
        if (!raw) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { continue; }
        const visit = (value: unknown, depth: number): void => {
            if (depth > 4 || !value || typeof value !== 'object') return;
            for (const [key, item] of Object.entries(value)) {
                if (typeof item === 'number' && Number.isFinite(item)) {
                    if (USAGE_KEYS.has(key) && item > pct) { pct = item; header = name; }
                    if (key === 'estimated_time_to_regain_access' && item > regainMinutes) regainMinutes = item;
                } else visit(item, depth + 1);
            }
        };
        visit(parsed, 0);
    }
    return { pct, regainMinutes, header };
}

/** Graph алдааны `code`/`error_subcode` (тоо эсвэл тоон мөр); бусад үед null. */
export const graphInt = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) ? value : typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : null;

function metaError(status: number | null, code: number | null, subcode: number | null): MetaApiError {
    const details = { status, code, subcode };
    if (code === 190) return new MetaApiError('Meta нэвтрэх эрх дууссан. Facebook холболтоо дахин холбоно уу.', details);
    if (code !== null && [10, 200, 294].includes(code)) return new MetaApiError('Meta зарын дансанд ads_read эрх шаардлагатай.', details);
    return new MetaApiError(`Meta зардал татах алдаа (HTTP ${status}${code !== null ? `, code ${code}` : ''}). Дахин оролдоно уу.`, details);
}

function pause(ms: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
        const onAbort = () => { clearTimeout(timer); resolve(false); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(true); }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Graph-д хандах Meta app: `appsecret_proof`-ийг тухайн app-ийн нууц түлхүүрээр үүсгэж, алдааг
 * хэрэглэгчид ойлгомжтой монгол мессеж болгоно. Зар = META_ADS_APP_SECRET, Page/IG = FACEBOOK_APP_SECRET.
 */
export interface MetaGraphApp {
    /** Токены appsecret_proof; нууц түлхүүр тохируулаагүй бол null (fail-closed). */
    proof(token: string): string | null;
    missingSecret: string;
    error(status: number | null, code: number | null, subcode: number | null): MetaApiError;
}
const ADS_APP: MetaGraphApp = {
    proof: token => {
        const secret = process.env.META_ADS_APP_SECRET?.trim();
        return secret ? crypto.createHmac('sha256', secret).update(token).digest('hex') : null;
    },
    missingSecret: 'Meta Ads app-ийн нууц түлхүүр тохируулаагүй байна.',
    error: metaError,
};

export function metaRead<T>(path: string, token: string, params: Record<string, string> = {}, options: MetaReadOptions = {}): Promise<T> {
    return graphRead<T>(ADS_APP, path, token, params, options);
}

/**
 * Graph GET: токен зөвхөн Authorization толгойд, `appsecret_proof` заавал, түр алдаанд хязгаартай
 * дахин оролдлого. Never log a URL, response body or token. Even Graph paging.next can contain credentials.
 */
export async function graphRead<T>(app: MetaGraphApp, path: string, token: string, params: Record<string, string> = {}, options: MetaReadOptions = {}): Promise<T> {
    const proof = app.proof(token);
    if (!proof) throw new MetaApiError(app.missingSecret);
    const url = new URL(`${BASE}/${path}`);
    for (const [key, value] of Object.entries({ ...params, appsecret_proof: proof })) url.searchParams.set(key, value);
    const abort = options.signal ?? AbortSignal.timeout(20000);
    const retries = options.retry === false ? 0 : META_RETRY_DELAYS_MS.length;
    for (let attempt = 0; ; attempt++) {
        const canRetry = attempt < retries;
        let response: Response;
        try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: abort }); }
        catch {
            if (canRetry && !abort.aborted && await pause(META_RETRY_DELAYS_MS[attempt], abort)) continue;
            throw new MetaApiError('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин синк хийнэ үү.');
        }
        const usage = metaUsage(response.headers);
        if (usage.pct > 75) {
            logger.warn('[Meta API] хэрэглээний хязгаарт ойртсон', {
                endpoint: path.split('/').pop(), header: usage.header, pct: Math.round(usage.pct), regainMinutes: usage.regainMinutes,
            });
        }
        const body = await response.json().catch(() => null);
        if (response.ok && body && !body.error) return body as T;
        const code = graphInt(body?.error?.code), subcode = graphInt(body?.error?.error_subcode);
        // Хандалт минутаар хаагдсан бол хэдэн секундын дараа дахин оролдох нь утгагүй.
        if (canRetry && usage.regainMinutes <= 0 && isRetriableMetaError(response.status, code)
            && await pause(META_RETRY_DELAYS_MS[attempt], abort)) continue;
        throw app.error(response.status, code, subcode);
    }
}
/**
 * Graph POST (нийтлэл, webhook subscribe): токен Authorization толгойд, `appsecret_proof` биед. Давхар
 * нийтлэлээс сэргийлж ДАХИН ОРОЛДОХГҮЙ. URL, хариу, токеныг хэзээ ч лог/алдаанд оруулахгүй.
 */
export async function graphPost<T>(app: MetaGraphApp, path: string, token: string, body: Record<string, string> = {}, options: Pick<MetaReadOptions, 'signal'> = {}): Promise<T> {
    const proof = app.proof(token);
    if (!proof) throw new MetaApiError(app.missingSecret);
    let response: Response;
    try {
        response = await fetch(`${BASE}/${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ ...body, appsecret_proof: proof }),
            cache: 'no-store',
            signal: options.signal ?? AbortSignal.timeout(20000),
        });
    } catch { throw new MetaApiError('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин оролдоно уу.'); }
    const json = await response.json().catch(() => null);
    if (response.ok && json && !json.error) return json as T;
    throw app.error(response.status, graphInt(json?.error?.code), graphInt(json?.error?.error_subcode));
}
export async function fetchMetaAccount(account: string, token: string, deadline?: MetaDeadline): Promise<MetaAccount> {
    if (!/^act_\d+$/.test(account)) throw new Error('Meta зарын данс сонгоно уу.');
    const data = await metaRead<MetaAccount>(account, token, { fields: 'id,currency,timezone_name' }, { signal: metaStepSignal(20000, deadline) });
    if (data.id !== account || !/^[A-Z]{3}$/.test(data.currency)) throw new Error('Meta дансны валют тодорхойгүй байна.');
    try { new Intl.DateTimeFormat('en', { timeZone: data.timezone_name }).format(); }
    catch { throw new Error('Meta дансны цагийн бүс тодорхойгүй байна.'); }
    if (!data.timezone_name) throw new Error('Meta дансны цагийн бүс тодорхойгүй байна.');
    return data;
}
export async function fetchMetaDailySpend(account: MetaAccount, token: string, from: string, to: string, deadline?: MetaDeadline): Promise<MetaDailyRow[]> {
    const rows: MetaDailyRow[] = [], keys = new Set<string>(), cursors = new Set<string>();
    const signal = metaStepSignal(90000, deadline);
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
        const result = await metaRead<{ data: Array<Record<string, string>>; paging?: { next?: string; cursors?: { after?: string } } }>(`${account.id}/insights`, token, {
            fields: 'account_id,account_currency,campaign_id,campaign_name,date_start,date_stop,spend', level: 'campaign', time_increment: '1',
            time_range: JSON.stringify({ since: from, until: to }), limit: '500', ...(after ? { after } : {}),
        }, { signal });
        if (!Array.isArray(result.data)) throw new Error('Meta өдрийн зардлын хариу дутуу байна.');
        for (const r of result.data) {
            const key = `${r.campaign_id}:${r.date_start}`;
            if (r.account_id !== account.id.slice(4) || r.account_currency !== account.currency || !/^\d+$/.test(r.campaign_id || '') ||
                !dateSchema.safeParse(r.date_start).success || r.date_start !== r.date_stop || r.date_start < from || r.date_start > to ||
                !/^\d+(\.\d{1,6})?$/.test(r.spend || '') || Number(r.spend) >= 1e12 || keys.has(key)) {
                throw new Error('Meta өгөгдөл зөрүүтэй байна. Өмнөх зардлыг өөрчлөөгүй.');
            }
            keys.add(key);
            rows.push({ campaign_id: r.campaign_id, campaign_name: r.campaign_name || r.campaign_id, spent_at: r.date_start, native_amount: r.spend });
        }
        if (!result.paging?.next) return rows;
        // Rebuild the trusted Graph URL with a cursor; never follow arbitrary paging.next URLs.
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) throw new Error('Meta хуудаслалт бүрэн дуусаагүй байна.');
        cursors.add(after);
    }
    throw new Error('Meta өгөгдөл хэт их байна. Хугацааг багасгаж дахин оролдоно уу.');
}
