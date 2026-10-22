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

/** API-ийн алдаатай хариу — дуудагч HTTP статусыг (ж: 404 «олдсонгүй») ялгаж харуулж болно. */
export class DashboardApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

/** JSON хүлээж буй дуудлагын богино хэлбэр. Алдаа гарвал `DashboardApiError` (Error) шиднэ. */
export async function dashboardJson<T>(input: string, init: DashboardFetchInit = {}): Promise<T> {
    const res = await dashboardFetch(input, init);
    if (!res.ok) {
        const detail = await res.json().catch(() => null as { error?: string } | null);
        throw new DashboardApiError(detail?.error || `Хүсэлт амжилтгүй (${res.status})`, res.status);
    }
    return (await res.json()) as T;
}

/** `Content-Disposition`-ийн файлын нэр (filename* эсвэл filename, URL-encode хийсэн ч). */
export function contentDispositionFilename(header: string | null): string | null {
    if (!header) return null;
    const match = /filename\*=UTF-8''([^;]+)/i.exec(header) ?? /filename="?([^";]+)"?/i.exec(header);
    if (!match) return null;
    try { return decodeURIComponent(match[1].trim()) || null; } catch { return match[1].trim() || null; }
}

/**
 * Excel зэрэг файлыг идэвхтэй байгууллагын эрхээр татна.
 * `filename` өгөөгүй бол серверийн `Content-Disposition` нэрийг (ж: «Төсөл_гэрээ_2026-10-22.xlsx») хэрэглэнэ.
 */
export async function dashboardDownload(input: string, filename?: string): Promise<void> {
    const res = await dashboardFetch(input);
    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || 'Файл татаж чадсангүй. Дахин оролдоно уу.');
    }
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? contentDispositionFilename(res.headers.get('Content-Disposition')) ?? 'download';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
