import { describe, expect, it } from 'vitest';
import { parseReportMediaPath, reportMediaUrl, WEEKLY_SLIDE_PART_SECTIONS, WeeklySlideCreateSchema, WeeklySlidePatchSchema } from '../weekly-slides';

const shop = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const path = (n: number, ext = 'jpg') => `${shop}/${user}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.${ext}`;

describe('weekly slide rules', () => {
    it('accepts only <shop>/<user>/<uuid>.<jpg|png> media paths', () => {
        expect(parseReportMediaPath(path(1))).toEqual({ path: path(1), shopId: shop, userId: user, ext: 'jpg' });
        for (const bad of [path(1, 'svg'), path(1, 'JPG'), `${path(1)}.png`, `../${path(1)}`, `${shop}/${user}/x.png`, `${shop}/${path(1)}`, 42, null]) {
            expect(parseReportMediaPath(bad)).toBeNull();
        }
        expect(reportMediaUrl(path(1))).toBe(`/api/dashboard/weekly-slides/media?path=${encodeURIComponent(path(1))}`);
    });

    it('needs content, a Wednesday, a section of its part and at most six distinct images', () => {
        const base = { meetingDate: '2026-10-14', part: 'marketing', section: 'social' };
        expect(WeeklySlideCreateSchema.parse({ ...base, title: '  Постер  ' })).toMatchObject({ title: 'Постер', note: '', imagePaths: [] });
        expect(WeeklySlideCreateSchema.safeParse({ ...base, note: '   ' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, meetingDate: '2026-10-15', title: 'x' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, part: 'sales', title: 'x' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, imagePaths: [1, 2, 3, 4, 5, 6, 7].map(n => path(n)) }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, imagePaths: [path(1), path(1)] }).success).toBe(false);
        expect(WeeklySlidePatchSchema.safeParse({}).success).toBe(false);
        expect(WeeklySlidePatchSchema.parse({ note: 'Дүгнэлт\r\n  ' })).toEqual({ note: 'Дүгнэлт' });
        expect(WEEKLY_SLIDE_PART_SECTIONS.marketing).toContain('callpro');
        expect(WEEKLY_SLIDE_PART_SECTIONS.sales).toContain('handover');
    });
});
