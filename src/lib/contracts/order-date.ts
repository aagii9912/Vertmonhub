/**
 * Гэрээний «Захиалга өгсөн огноо» (HUB-ийн дүрэм: борлуулалтын огноо) — PATCH /api/dashboard/contracts/[id]-ийн
 * «Огноо оруулах» ба AI `create_contract` нэг дүрмээр шалгана. Клиентэд аюулгүй (цэвэр).
 */
import { ubDateStr } from '@/lib/utils/date';

/** Доод хязгаар — төлөвлөгөөний биелэлтийн тайлангийн оны хүрээ (2000–2100)-тэй ижил:
 *  «0202-10-01» мэт алдаа гэрээг бүх тайлангаас чимээгүй хасах ба дараа нь солигдохгүй. */
export const ORDER_DATE_MIN = '2000-01-01';

export type OrderDateIssue = 'format' | 'calendar' | 'too_early' | 'future';

export const ORDER_DATE_ERRORS: Record<'too_early' | 'future', string> = {
    too_early: 'Захиалга өгсөн огноо 2000 оноос өмнө байж болохгүй',
    future: 'Захиалга өгсөн огноо өнөөдрөөс хойш байж болохгүй',
};

/** YYYY-MM-DD, хуанлийн жинхэнэ өдөр (2026-02-30 биш). */
export function isCalendarDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // Date.UTC 0–99 онд 1900 нэмдэг тул setUTCFullYear-ээр («0050-10-01» → 2000 оноос өмнө, хуанлийн алдаа биш).
    const parsed = new Date(0);
    parsed.setUTCFullYear(year, month - 1, day);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** Захиалга өгсөн огнооны зөрчил эсвэл null: хэлбэр, хуанлийн өдөр, 2000-01-01-ээс өмнө, өнөөдрөөс (УБ) хойш. */
export function orderDateIssue(value: string, today: string = ubDateStr()): OrderDateIssue | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'format';
    if (!isCalendarDate(value)) return 'calendar';
    if (value < ORDER_DATE_MIN) return 'too_early';
    if (value > today) return 'future';
    return null;
}
