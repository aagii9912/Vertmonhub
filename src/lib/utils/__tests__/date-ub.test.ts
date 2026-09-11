import { describe, it, expect } from 'vitest';
import { ubStartOfDay, ubDayRange, ubDateStr, ubMonthRange, ubParts } from '../date';

/**
 * Улаанбаатарын өдрийн хил — TZ-ээс ХАМААРАХГҮЙ (UTC instant-аар) шалгана.
 * Сервер (Vercel) UTC дээр `setHours(0,0,0,0)` = УБ 08:00 болдог алдааг дахин гаргахгүй.
 */
describe('Asia/Ulaanbaatar day boundaries', () => {
    it('УБ-ийн 07:30 (= UTC 23:30 өмнөх өдөр) нь УБ-ийн шинэ өдөрт хамаарна', () => {
        const at = new Date('2026-09-10T23:30:00Z'); // УБ 2026-09-11 07:30
        expect(ubDateStr(at)).toBe('2026-09-11');
        expect(ubParts(at)).toEqual({ year: 2026, month: 9, day: 11 });
        expect(ubStartOfDay(at).toISOString()).toBe('2026-09-10T16:00:00.000Z'); // УБ 09-11 00:00
    });

    it('ubDayRange = [УБ шөнө дунд, маргаашийн шөнө дунд)', () => {
        const { start, end } = ubDayRange(new Date('2026-09-11T05:00:00Z')); // УБ 13:00
        expect(start.toISOString()).toBe('2026-09-10T16:00:00.000Z');
        expect(end.toISOString()).toBe('2026-09-11T16:00:00.000Z');
    });

    it('ubMonthRange — сарын 1-ний УБ 00:00 (оны хил ч зөв)', () => {
        const sep = ubMonthRange(2026, 8);
        expect(sep.start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
        expect(sep.end.toISOString()).toBe('2026-09-30T16:00:00.000Z');
        const dec = ubMonthRange(2026, 11);
        expect(dec.end.toISOString()).toBe('2026-12-31T16:00:00.000Z');
    });

    it('сарын 1-ний УБ 03:00 (= UTC 19:00 өмнөх сарын сүүлийн өдөр) шинэ сард орно', () => {
        const at = new Date('2026-08-31T19:00:00Z');
        expect(ubParts(at).month).toBe(9);
    });
});
