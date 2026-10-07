/**
 * Монгол төгрөгийн нэгдсэн формат.
 * Бүх хуудас ижил формат ашиглахын тулд энэ util-ийг дуудна.
 *
 * - default: бүтэн тоо мянгатын таслалтай (жишээ: 380,000,000₮)
 * - compact: товчилсон (жишээ: 1.2 сая₮, 3.5 тэрбум₮)
 *
 * Дүн байхгүй (null / undefined / NaN / ±Infinity) бол «—» буцаана: дутуу өгөгдлийг
 * «0₮» болгож тэгтэй андуурахгүй. Бодит 0 нь «0₮» хэвээр.
 */
const MISSING_AMOUNT = '—';

/** Хадгалсан дүнг тоо болгоно; хоосон, тоон бус утга бол null (DB numeric string-ийг ч хүлээн авна). */
function finiteAmount(value: number | null | undefined): number | null {
    if (value === null || value === undefined || (value as unknown) === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function formatMNT(value: number | null | undefined, options?: { compact?: boolean }): string {
    const safe = finiteAmount(value);
    if (safe === null) return MISSING_AMOUNT;

    if (options?.compact) {
        const abs = Math.abs(safe);
        if (abs >= 1_000_000_000) return `${(safe / 1_000_000_000).toFixed(1)} тэрбум₮`;
        if (abs >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)} сая₮`;
        if (abs >= 1_000) return `${Math.round(safe).toLocaleString('en-US')}₮`;
    }

    return `${Math.round(safe).toLocaleString('en-US')}₮`;
}

/**
 * v2 KPI формат — «1.24 тэрбум ₮», «331 сая ₮», «980,000 ₮».
 * Толгойн тоонд 2 орон, сая-д бүхэл тоо (331 сая), ₮-ийн өмнө зай. Дүнгүй бол «—».
 */
export function formatMNTShort(value: number | null | undefined): string {
    const safe = finiteAmount(value);
    if (safe === null) return MISSING_AMOUNT;
    const abs = Math.abs(safe);
    if (abs >= 1_000_000_000) return `${trimZeros((safe / 1_000_000_000).toFixed(2))} тэрбум ₮`;
    if (abs >= 1_000_000) return `${trimZeros((safe / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1))} сая ₮`;
    return `${Math.round(safe).toLocaleString('en-US')} ₮`;
}

/** «1.20» → «1.2», «1.00» → «1» */
function trimZeros(s: string): string {
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
