import { describe, expect, it } from 'vitest';
import { nextMeetingDate, weeklyReviewRange, meetingDateSchema, WeeklyUpdateSchema, formatWeeklyReview } from '../weekly-review';
import { formatWorkdayDate } from '@/lib/utils/date';

describe('Лхагва гарагийн тайлангийн хугацаа', () => {
    it('Улаанбаатарын Лхагва гарагийг UTC өдрөөс үл хамааран сонгоно', () => {
        expect(nextMeetingDate(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
        expect(nextMeetingDate(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10-07');
        expect(weeklyReviewRange('2026-09-30')).toEqual({ from: '2026-09-23', to: '2026-09-29' });
        expect(weeklyReviewRange('2026-01-07')).toEqual({ from: '2025-12-31', to: '2026-01-06' });
        expect(formatWorkdayDate(new Date('2026-09-29T16:00:00Z'))).toBe('9-р сарын 30, Лхагва');
    });
    it('буруу өдөр, хоосон тэмдэглэл, бусдын ID-г зөвшөөрөхгүй', () => {
        expect(meetingDateSchema.safeParse('2026-09-31').success).toBe(false);
        expect(meetingDateSchema.safeParse('2026-09-29').success).toBe(false);
        const valid = { meetingDate: '2026-09-30', achievements: '  Ажлаа дуусгасан  ', blockers: '', nextSteps: '' };
        expect(WeeklyUpdateSchema.parse(valid).achievements).toBe('Ажлаа дуусгасан');
        expect(WeeklyUpdateSchema.safeParse({ ...valid, user_id: 'another-user' }).success).toBe(false);
        expect(WeeklyUpdateSchema.safeParse({ ...valid, achievements: ' ' }).success).toBe(false);
        expect(WeeklyUpdateSchema.safeParse({ ...valid, blockers: 'x'.repeat(4001) }).success).toBe(false);
    });
    it('байхгүй эх үүсвэрийг 0 болгож экспортлохгүй', () => {
        const text = formatWeeklyReview({ shopName: 'Тест', meetingDate: '2026-09-30', notices: ['Маркетинг: түр боломжгүй.'], updates: [] });
        expect(text).toContain('2026-09-23 – 2026-09-29');
        expect(text).toContain('Маркетинг: түр боломжгүй.');
        expect(text).toContain('Борлуулалтын мэдээлэл энэ тайланд байхгүй.');
        expect(text).not.toContain('Шинэ лид: 0');
    });
});
