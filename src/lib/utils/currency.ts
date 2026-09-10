/**
 * Монгол төгрөгийн нэгдсэн формат.
 * Бүх хуудас ижил формат ашиглахын тулд энэ util-ийг дуудна.
 *
 * - default: бүтэн тоо мянгатын таслалтай (жишээ: 380,000,000₮)
 * - compact: товчилсон (жишээ: 1.2 сая₮, 3.5 тэрбум₮)
 */
export function formatMNT(value: number | null | undefined, options?: { compact?: boolean }): string {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;

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
 * Толгойн тоонд 2 орон, сая-д бүхэл тоо (331 сая), ₮-ийн өмнө зай.
 */
export function formatMNTShort(value: number | null | undefined): string {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    const abs = Math.abs(safe);
    if (abs >= 1_000_000_000) return `${trimZeros((safe / 1_000_000_000).toFixed(2))} тэрбум ₮`;
    if (abs >= 1_000_000) return `${trimZeros((safe / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1))} сая ₮`;
    return `${Math.round(safe).toLocaleString('en-US')} ₮`;
}

/** «1.20» → «1.2», «1.00» → «1» */
function trimZeros(s: string): string {
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
