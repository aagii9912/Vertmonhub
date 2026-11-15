/**
 * Лхагвын тайлангийн (хурлын хуудас, хуулах текст, борлуулалтын хоёр слайд) «доод хязгаар»-ын тэмдэг.
 *
 * Эзэмшигч 2026-11-15-нд тайлангийн «+» тэмдгүүдийг авахуулсан («хэрэггүй»): тоо, дүн, хувь тэмдэггүй гарна.
 * Тодорхойгүй утга «—» хэвээр (0 гэж бичихгүй), шалтгаан нь (огноогүй гэрээ, оруулаагүй блок, бүртгэл дундаас эхэлсэн)
 * тайлбар, слайдын тэмдэглэлд үлдэнэ. Буцааж асаах бол `WEEKLY_LOWER_BOUND_MARK`-ийг '+' болгоно.
 *
 * Бусад хуудас («Төлөвлөгөөний биелэлт», үйл ажиллагааны тайлан, Захирлын самбар, AI, имэйл) өөрийн «+»-ийг хэвээр
 * хэрэглэнэ (`contract-dates.ts`, `plan-performance.ts`).
 */
export const WEEKLY_LOWER_BOUND_MARK: string = '';

/** Доод хязгаартай утгын ард залгах тэмдэг (одоо хоосон). */
export const weeklyMark = (lowerBound: boolean | number | null | undefined): string => (lowerBound ? WEEKLY_LOWER_BOUND_MARK : '');

/** Хугацааны гэрээний тоо: огноогүй гэрээтэй, хугацаанд нэг ч олдоогүй бол «—» (тодорхойгүй), эс бөгөөс тоо. */
export function weeklyContractCount(count: number, undated: number): string {
    if (undated && !count) return '—';
    return `${count.toLocaleString('en-US')}${weeklyMark(undated)}`;
}

/** Хугацааны гэрээний дүн — `weeklyContractCount`-тай ижил дүрэм. */
export function weeklyContractAmount(amount: number, count: number, undated: number, format: (value: number) => string): string {
    if (undated && !count) return '—';
    return `${format(amount)}${weeklyMark(undated)}`;
}

/** Төлөвлөгөөний биелэлтийн утга: дүнгүй бол «—». */
export function weeklyPlanValue(value: number | null, lowerBound: boolean, format: (value: number) => string): string {
    return value === null ? '—' : `${format(value)}${weeklyMark(lowerBound)}`;
}
