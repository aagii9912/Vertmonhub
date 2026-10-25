/**
 * «Meta зардал татах» нэг удаад 93 хүртэл өдөр (серверийн `MetaSyncInput`, lib/marketing/meta-spend.ts).
 * Урт хугацааг дуусах өдрөөр нь тогтоож сүүлийн 93 өдрийг татна; `clamped` нь хэрэглэгчид мэдэгдэхэд.
 * Огноо дутуу/буруу эсвэл дараалал алдагдсан бол хэвээр буцаана — сервер 400-аар тайлбарлана.
 * Календарийн огноон дээрх цэвэр тооцоо (UTC шөнө дунд), серверийн цагийн бүсээс хамаарахгүй.
 */
export const META_SYNC_MAX_DAYS = 93;

export interface MetaSyncRange { from: string; to: string; clamped: boolean }

const DAY_MS = 86_400_000;
const utcDay = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(utcDay(value)) && new Date(utcDay(value)).toISOString().startsWith(value);

export function metaSyncRange(range: { from: string; to: string }): MetaSyncRange {
    if (!isDay(range.from) || !isDay(range.to) || range.to < range.from) return { from: range.from, to: range.to, clamped: false };
    const earliest = new Date(utcDay(range.to) - (META_SYNC_MAX_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
    return range.from >= earliest ? { from: range.from, to: range.to, clamped: false } : { from: earliest, to: range.to, clamped: true };
}
