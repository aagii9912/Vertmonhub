/**
 * API route тестийн дахин ашиглах helper-ууд.
 *
 * Route handler-уудыг бодит Supabase / cookie-д хүрэлгүйгээр, auth хилийг mock
 * хийж, цэвэр функц мэт дуудаж тестлэхэд зориулагдсан.
 *
 *  - makeSupabaseMock — гинжин (chainable) query builder-ийн thenable mock.
 *    `from(table)` бүр тухайн хүснэгтэд тохируулсан үр дүнг await/terminal дээр буцаана.
 *  - jsonRequest / nextGet — Request / NextRequest үүсгэгчид.
 */

import { NextRequest } from 'next/server';
import { vi } from 'vitest';

export type QueryResult = { data?: unknown; error?: unknown; count?: number };

/**
 * Гинжин query builder-ийг дуурайсан thenable Proxy.
 * Бүх метод (`select`, `eq`, `or`, `gte`, `range`, `insert`, `update`, `upsert`,
 * `single`, `maybeSingle`, ...) ижил proxy-г буцаах тул дурын дарааллаар гинжилж
 * болно. Proxy өөрөө thenable учир `await q` болон `await q.single()` хоёул
 * тохируулсан үр дүнг буцаана.
 */
function makeQuery(result: QueryResult) {
    const resolved = Promise.resolve(result);
    const proxy: Record<string | symbol, unknown> = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'then') return resolved.then.bind(resolved);
            if (prop === 'catch') return resolved.catch.bind(resolved);
            if (prop === 'finally') return resolved.finally.bind(resolved);
            // Бусад бүх метод дуудлага → ижил proxy (chaining)
            return () => proxy;
        },
    });
    return proxy;
}

/**
 * Supabase client-ийн mock. `tables` нь хүснэгтийн нэр → үр дүнгийн map.
 * Тохируулаагүй хүснэгт `{ data: [], error: null }` буцаана.
 * `from` jest.fn тул дуудлагуудыг шалгаж болно.
 */
export function makeSupabaseMock(tables: Record<string, QueryResult> = {}) {
    const from = vi.fn((table: string) => makeQuery(tables[table] ?? { data: [], error: null }));
    return { from } as unknown as ReturnType<typeof makeQueryClient>;
}

// зөвхөн төрөл гаргахад зориулсан туслах (runtime-д ашиглахгүй)
function makeQueryClient() {
    return { from: (_t: string) => makeQuery({}) };
}

/** JSON body-той Request үүсгэнэ (req.json() ашигладаг route-уудад). */
export function jsonRequest(
    url: string,
    body: unknown,
    init: { method?: string; headers?: Record<string, string> } = {}
): Request {
    return new Request(url, {
        method: init.method ?? 'POST',
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

/** GET NextRequest үүсгэнэ (request.nextUrl.searchParams ашигладаг route-уудад). */
export function nextGet(url: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(url, { headers });
}
