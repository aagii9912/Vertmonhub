import { describe, expect, it } from 'vitest';
import {
    isTextOnlySlide, parseReportMediaPath, reportMediaUrl, WEEKLY_SLIDE_PART_SECTIONS, WEEKLY_SLIDE_SECTION_LABEL, WeeklySlideCopySchema, WeeklySlideCreateSchema, WeeklySlidePatchSchema,
} from '../weekly-slides';

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

    it('needs content, a Wednesday, a section of its part and at most nine distinct images', () => {
        const base = { meetingDate: '2026-10-14', part: 'marketing', section: 'social' };
        expect(WeeklySlideCreateSchema.parse({ ...base, title: '  Постер  ' })).toMatchObject({ title: 'Постер', note: '', imagePaths: [] });
        expect(WeeklySlideCreateSchema.safeParse({ ...base, note: '   ' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, meetingDate: '2026-10-15', title: 'x' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, part: 'sales', title: 'x' }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, imagePaths: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => path(n)) }).success).toBe(true);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, imagePaths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => path(n)) }).success).toBe(false);
        expect(WeeklySlideCreateSchema.safeParse({ ...base, imagePaths: [path(1), path(1)] }).success).toBe(false);
        expect(WeeklySlidePatchSchema.safeParse({}).success).toBe(false);
        expect(WeeklySlidePatchSchema.parse({ note: 'Дүгнэлт\r\n  ' })).toEqual({ note: 'Дүгнэлт' });
        expect(WEEKLY_SLIDE_PART_SECTIONS.marketing).toContain('callpro');
        expect(WEEKLY_SLIDE_PART_SECTIONS.sales).toContain('handover');
    });

    it('has a sales-only «Барилгын явц» section and copies only text slides of a section of the part', () => {
        expect(WEEKLY_SLIDE_SECTION_LABEL.construction).toBe('Барилгын явц');
        expect(WEEKLY_SLIDE_PART_SECTIONS.sales).toContain('construction');
        expect(WEEKLY_SLIDE_PART_SECTIONS.marketing).not.toContain('construction');
        expect(WeeklySlideCreateSchema.safeParse({ meetingDate: '2026-10-21', part: 'marketing', section: 'construction', title: 'x' }).success).toBe(false);
        expect(WeeklySlideCopySchema.parse({ meetingDate: '2026-10-21', part: 'sales', section: 'plan' })).toEqual({ meetingDate: '2026-10-21', part: 'sales', section: 'plan' });
        expect(WeeklySlideCopySchema.safeParse({ meetingDate: '2026-10-21', part: 'marketing', section: 'plan' }).success).toBe(false);
        expect(WeeklySlideCopySchema.safeParse({ meetingDate: '2026-10-21', part: 'sales', section: 'plan', title: 'x' }).success).toBe(false);
        expect(isTextOnlySlide({ image_paths: [] })).toBe(true);
        expect(isTextOnlySlide({ image_paths: [path(1)] })).toBe(false);
    });
});
