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
