/**
 * Pagination туслах — dashboard-ийн list API-уудад нэгдсэн хуудаслалт.
 *
 * Зорилго: их хэмжээний өгөгдөлд `.select('*')` бүгдийг татаж санах ой
 * дүүргэхээс сэргийлэх. Хоёр горим:
 *  - Тодорхой хуудаслалт: ?page & ?pageSize (эсвэл ?limit & ?offset) өгвөл
 *    Supabase .range()-д тохирох [from, to] буцаана.
 *  - Аюулгүйн таг: параметр өгөөгүй ч MAX_PAGE_SIZE-аар хязгаарлаж
 *    катастроф OOM-оос сэргийлнэ.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 1000;

export interface Pagination {
    /** Supabase .range()-ийн эхлэл индекс (0-based, оруулна) */
    from: number;
    /** Supabase .range()-ийн төгсгөл индекс (оролцоно) */
    to: number;
    limit: number;
    offset: number;
    page: number;
    pageSize: number;
    /** Хэрэглэгч хуудаслалтыг зориуд хүссэн эсэх */
    explicit: boolean;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value) || value < min) return fallback;
    return Math.min(Math.floor(value), max);
}

/**
 * URL query параметрээс хуудаслалтыг задлана.
 * Дэмжих хэлбэрүүд: page+pageSize, limit+offset. Аль аль нь байхгүй бол
 * аюулгүйн таг (MAX_PAGE_SIZE) хэрэгжинэ.
 */
export function parsePagination(searchParams: URLSearchParams): Pagination {
    const pageRaw = searchParams.get('page');
    const pageSizeRaw = searchParams.get('pageSize');
    const limitRaw = searchParams.get('limit');
    const offsetRaw = searchParams.get('offset');

    const explicit = pageRaw !== null || pageSizeRaw !== null || limitRaw !== null || offsetRaw !== null;

    // limit/offset нь page/pageSize-аас давуу эрхтэй
    if (limitRaw !== null || offsetRaw !== null) {
        const limit = clampInt(Number(limitRaw), 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
        const offset = clampInt(Number(offsetRaw), 0, Number.MAX_SAFE_INTEGER, 0);
        return {
            from: offset,
            to: offset + limit - 1,
            limit,
            offset,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
            explicit,
        };
    }

    const pageSize = clampInt(Number(pageSizeRaw), 1, MAX_PAGE_SIZE, explicit ? DEFAULT_PAGE_SIZE : MAX_PAGE_SIZE);
    const page = clampInt(Number(pageRaw), 1, Number.MAX_SAFE_INTEGER, 1);
    const offset = (page - 1) * pageSize;

    return {
        from: offset,
        to: offset + pageSize - 1,
        limit: pageSize,
        offset,
        page,
        pageSize,
        explicit,
    };
}

/**
 * Жагсаалтын хариунд хавсаргах хуудаслалтын мета мэдээлэл.
 */
export function buildPageMeta(total: number, pagination: Pagination) {
    return {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
        hasMore: pagination.offset + pagination.pageSize < total,
    };
}
