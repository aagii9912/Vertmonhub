import { describe, expect, it } from 'vitest';
import { nextMeetingDate, lastCompletedReviewRange, weeklyReviewRange, meetingDateSchema, WeeklyUpdateSchema, formatReviewChange, formatWeeklyReview, weeklyDiscussionItems, type WeeklyUpdate } from '../weekly-review';
import { formatWorkdayDate } from '@/lib/utils/date';
import { buildMarketingPerformance, type MarketingSpend } from '@/lib/marketing/performance';

describe('Лхагва гарагийн тайлангийн хугацаа', () => {
    it('Улаанбаатарын Лхагва гарагийг UTC өдрөөс үл хамааран сонгоно', () => {
        expect(nextMeetingDate(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
        expect(nextMeetingDate(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10-07');
        expect(weeklyReviewRange('2026-09-30')).toEqual({ from: '2026-09-23', to: '2026-09-29' });
        expect(weeklyReviewRange('2026-01-07')).toEqual({ from: '2025-12-31', to: '2026-01-06' });
        expect(formatWorkdayDate(new Date('2026-09-29T16:00:00Z'))).toBe('9-р сарын 30, Лхагва');
    });
    it('хамгийн сүүлд бүрэн дууссан Лхагва–Мягмар долоо хоногийг УБ-ийн өдрөөр сонгоно', () => {
        // УБ Мягмар 23:59 — тухайн долоо хоног дуусаагүй тул өмнөх долоо хоног.
        expect(lastCompletedReviewRange(new Date('2026-09-29T15:59:00Z'))).toEqual({ from: '2026-09-16', to: '2026-09-22' });
        // УБ Лхагва 00:00 (UTC-д Мягмар) — өчигдөр дууссан долоо хоног.
        expect(lastCompletedReviewRange(new Date('2026-09-29T16:00:00Z'))).toEqual({ from: '2026-09-23', to: '2026-09-29' });
        expect(lastCompletedReviewRange(new Date('2026-10-04T04:00:00Z'))).toEqual({ from: '2026-09-23', to: '2026-09-29' });
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
    it('өмнөх 0 суурь, алга болсон мэдээллийг өсөлтийн хувь болгохгүй', () => {
        expect(formatReviewChange(12, 8)).toBe('Өмнөх 8 · +4 (+50%)');
        expect(formatReviewChange(6, 12)).toBe('Өмнөх 12 · -6 (-50%)');
        expect(formatReviewChange(12, 0)).toContain('хувь тооцох суурь алга');
        expect(formatReviewChange(12)).toBe('Өмнөх хугацааны мэдээлэл байхгүй');
    });
    it('KPI, зардалтай лидгүй суваг, хадгалсан саадыг экспортлоно', () => {
        const marketing = marketingReport([{ id: 'spend', spent_at: '2026-09-25', channel: 'google_ads', amount: 60000, project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null }]);
        const updates = [update('Төсвөө батлуулах.')];
        const text = formatWeeklyReview({ shopName: 'Тест', meetingDate: '2026-09-30', marketing, updates, notices: [] });
        expect(text).toContain('Харьцуулах хугацаа: 2026-09-16 – 2026-09-22');
        expect(text).toContain('Хурлаар шийдэх\n• Номин: Төсвөө батлуулах.');
        expect(text).toContain('Шилжилт: 50%');
        expect(text).toContain('Нэг лидийн өртөг: 30,000₮');
        expect(text).toContain('Нэг шилжсэн лидийн өртөг: 60,000₮');
        expect(text).toContain('Нэг гэрээтэй лидийн өртөг: тооцох боломжгүй');
        expect(text).toContain('Google Ads: 0 лид');
        expect(weeklyDiscussionItems({ updates })).toEqual([{ title: 'Номин', detail: 'Төсвөө батлуулах.' }]);
    });
    it('ханшгүй дүнг өртөг гэж экспортлохгүй, хурлын асуудалд оруулна', () => {
        const marketing = marketingReport([{ id: 'fx', spent_at: '2026-09-25', channel: 'meta_ads', amount: 0, exclusion: 'missing_fx', native_amount: 20, currency: 'USD', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null }]);
        const text = formatWeeklyReview({ shopName: 'Тест', meetingDate: '2026-09-30', marketing, notices: [] });
        expect(text).toContain('Нэг лидийн өртөг: тооцох боломжгүй');
        expect(text).not.toContain('Нэг лидийн өртөг: 0₮');
        expect(text).toContain('Ханшгүй 1 зардал');
    });
    it('зардлын бүртгэлгүй болон илэрхий бүртгэсэн 0 дүнг ялгана', () => {
        const base = { shopName: 'Тест', meetingDate: '2026-09-30', notices: [] };
        expect(formatWeeklyReview({ ...base, marketing: marketingReport([]) })).toContain('Бүртгэсэн зардал: бүртгээгүй');
        const recordedZero = marketingReport([{ id: 'zero', spent_at: '2026-09-25', channel: 'facebook', amount: 0, project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null }]);
        expect(formatWeeklyReview({ ...base, marketing: recordedZero })).toContain('Нэг лидийн өртөг: 0₮');
    });
});

function marketingReport(spend: MarketingSpend[]) {
    return buildMarketingPerformance({ projects: [], activities: [], targets: [], contracts: [], spend,
        leads: [null, '2026-09-26T03:00:00Z'].map((handoff, index) => ({ id: String(index), created_at: '2026-09-25T03:00:00Z', source: 'facebook', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, marketing_channel: null, sales_handoff_at: handoff, sales_manager_name: handoff ? 'Номин' : null })),
    }, weeklyReviewRange('2026-09-30'));
}

function update(blockers: string): WeeklyUpdate {
    return { id: 'update', user_id: 'user', author_name: 'Номин', meeting_date: '2026-09-30', achievements: '', blockers, next_steps: '', updated_at: '2026-09-30T03:00:00Z' };
}
