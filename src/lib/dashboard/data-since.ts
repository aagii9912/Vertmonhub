/**
 * Бүртгэл эхэлсэн өдрийн дүрэм (цэвэр, клиентэд аюулгүй) — өдрийн тайлангийн тоо, уулзалт хоёулаа Хабад тодорхой өдрөөс
 * бүртгэгдэж эхэлсэн: түүнээс өмнөх өдөр «0» биш, тодорхойгүй. Лхагвын албаны илтгэлийн 9, 10-р слайд нэг дүрмээр.
 */
export type PeriodCoverage = 'none' | 'partial' | 'full';

/** `since`-ээс өмнө дууссан (эсвэл бүртгэл огт алга) → none; хугацааны дунд эхэлсэн → partial; бүрэн → full. */
export function periodCoverage(since: string | null, from: string, to: string): PeriodCoverage {
    if (!since || to < since) return 'none';
    return from >= since ? 'full' : 'partial';
}

/**
 * Хугацааны тоо: none → null; partial → эхэлснээс хойшхи тоо нь доод хязгаар («N+»), олдоогүй бол null (0 биш);
 * full → тоо хэвээр (null = тэр хугацаанд нэг ч нүд оруулаагүй).
 */
export function boundedCount(count: number | null, coverage: PeriodCoverage): { value: number | null; partial: boolean } {
    if (coverage === 'none') return { value: null, partial: false };
    if (coverage === 'partial') return count ? { value: count, partial: true } : { value: null, partial: false };
    return { value: count, partial: false };
}
