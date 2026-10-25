/**
 * Sentry-д Meta Graph-ийн URL-ын query орохгүй: `graphRead` нь `appsecret_proof`-ийг, debug_token нь хэрэглэгчийн
 * токеныг (`input_token`) query-д тавьдаг, харин Sentry-ийн fetch instrumentation span-д (`url.full`, `url.query`),
 * breadcrumb-д (`http.query`) бүтэн URL бичдэг. Тиймээс серверт Graph-ийн хүсэлтийг огт бичихгүй
 * (`ignoreOutgoingRequests`), өөр замаар орж ирсэн нь breadcrumb/span-аас query-гээ хасна. Цэвэр модуль.
 */
const META_GRAPH_HOSTS = new Set(['graph.facebook.com', 'graph.instagram.com']);

/** Meta Graph-ийн хүсэлт эсэх (бүтэн URL). */
export function isMetaGraphUrl(url: unknown): boolean {
    if (typeof url !== 'string') return false;
    try { return META_GRAPH_HOSTS.has(new URL(url).hostname); } catch { return false; }
}

/** Query, fragment-гүй URL / зам. */
const withoutQuery = (value: string) => value.split(/[?#]/, 1)[0];
const QUERY_KEYS = ['url.query', 'url.fragment', 'http.query', 'http.fragment'];
const URL_KEYS = ['url', 'url.full', 'http.url', 'http.target', 'url.path'];

/** Breadcrumb (fetch/http): Graph-ийн URL бол query-г хасна; бусдад хүрэхгүй. */
export function scrubMetaBreadcrumb<T extends { data?: Record<string, unknown> }>(breadcrumb: T): T {
    const data = breadcrumb.data;
    if (!data || !isMetaGraphUrl(data.url)) return breadcrumb;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (QUERY_KEYS.includes(key)) continue;
        clean[key] = typeof value === 'string' && URL_KEYS.includes(key) ? withoutQuery(value) : value;
    }
    return { ...breadcrumb, data: clean };
}

/** Span: Graph руу хийсэн хүсэлт бол URL, зам, тайлбараас query-г хасна. */
export function scrubMetaSpan<T extends { data?: Record<string, unknown>; description?: string }>(span: T): T {
    const data = span.data;
    if (!data) return span;
    const meta = Object.values(data).some(isMetaGraphUrl) || META_GRAPH_HOSTS.has(String(data['server.address'] ?? data['net.peer.name'] ?? ''));
    if (!meta) return span;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (QUERY_KEYS.includes(key)) continue;
        clean[key] = typeof value === 'string' && URL_KEYS.includes(key) ? withoutQuery(value) : value;
    }
    return { ...span, data: clean, ...(span.description ? { description: withoutQuery(span.description) } : {}) };
}
