/**
 * Dashboard API дуудлагын ганц гарц.
 *
 * Бүх `/api/dashboard/*` маршрут идэвхтэй дэлгүүрийг `x-shop-id` толгойгоор
 * авдаг. v1-д энэ толгойг 40+ газар гараар бичсэн байсан (ихэнх нь
 * `localStorage.getItem('vertmonhub_active_shop_id') || ''`), тул нэг газар
 * мартвал хүсэлт чимээгүй хоосон буцдаг байв. v2-т бүх дуудлага эндүүр явна.
 */

export const ACTIVE_SHOP_KEY = 'vertmonhub_active_shop_id';

export function getActiveShopId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(ACTIVE_SHOP_KEY);
    } catch {
        return null;
    }
}

export interface DashboardFetchInit extends Omit<RequestInit, 'headers'> {
    headers?: Record<string, string>;
    /** Идэвхтэй дэлгүүрийг дарж бичих (админ өөр дэлгүүр рүү хандахад). */
    shopId?: string | null;
}

/**
 * `fetch`-тэй ижил, гэхдээ `x-shop-id` (болон JSON body үед Content-Type)
 * автоматаар нэмэгдэнэ. Хариуг задлахгүй — дуудагч `res.ok`-г шалгана.
 */
export function dashboardFetch(input: string, init: DashboardFetchInit = {}): Promise<Response> {
    const { shopId, headers, body, ...rest } = init;
    const shop = shopId !== undefined ? shopId : getActiveShopId();

    const merged: Record<string, string> = { ...(headers ?? {}) };
    if (shop) merged['x-shop-id'] = shop;
    if (body !== undefined && typeof body === 'string' && !merged['Content-Type']) {
        merged['Content-Type'] = 'application/json';
    }

    return fetch(input, { ...rest, body, headers: merged });
}

/** JSON хүлээж буй дуудлагын богино хэлбэр. Алдаа гарвал `Error` шиднэ. */
export async function dashboardJson<T>(input: string, init: DashboardFetchInit = {}): Promise<T> {
    const res = await dashboardFetch(input, init);
    if (!res.ok) {
        const detail = await res.json().catch(() => null as { error?: string } | null);
        throw new Error(detail?.error || `Хүсэлт амжилтгүй (${res.status})`);
    }
    return (await res.json()) as T;
}

/** POST/PATCH/DELETE-д зориулсан богино хэлбэр. */
export function dashboardMutate<T>(
    input: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    payload?: unknown,
    init: DashboardFetchInit = {},
): Promise<T> {
    return dashboardJson<T>(input, {
        ...init,
        method,
        body: payload === undefined ? undefined : JSON.stringify(payload),
    });
}
