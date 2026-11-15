import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    isCalendarDate, meetingWeekRange, previousReportRange, reportPeriodName, reportRangeDays, resolveReportRange, REPORT_RANGE_MAX_DAYS,
    trailingWeeks, weekSpanLabel,
} from '../report-range';

// Vercel UTC-д ажилладаг: огнооны тооцоо цагийн бүсээс хамаарахгүй байх ёстой (`npm run test` нь Улаанбаатарын цагаар).
const tz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = tz; });

describe('Wednesday report period (report-range)', () => {
    it('defaults to the Wednesday→Tuesday week before the meeting, across month and year ends', () => {
        expect(meetingWeekRange('2026-11-18')).toEqual({ from: '2026-11-11', to: '2026-11-17' });
        expect(meetingWeekRange('2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-11-03' });
        expect(meetingWeekRange('2026-01-07')).toEqual({ from: '2025-12-31', to: '2026-01-06' });
    });

    it('compares with the previous period of the same length', () => {
        expect(previousReportRange({ from: '2026-11-11', to: '2026-11-17' })).toEqual({ from: '2026-11-04', to: '2026-11-10' });
        expect(previousReportRange({ from: '2026-11-03', to: '2026-11-16' })).toEqual({ from: '2026-10-20', to: '2026-11-02' });
        expect(previousReportRange({ from: '2026-03-01', to: '2026-03-01' })).toEqual({ from: '2026-02-28', to: '2026-02-28' });
        expect(reportRangeDays({ from: '2026-02-01', to: '2026-03-01' })).toBe(29);
    });

    it('lists whole 7-day weeks ending on the report day, never split at the month end', () => {
        expect(trailingWeeks('2026-11-17', 3)).toEqual([
            { from: '2026-10-28', to: '2026-11-03' }, { from: '2026-11-04', to: '2026-11-10' }, { from: '2026-11-11', to: '2026-11-17' },
        ]);
        expect(weekSpanLabel('2026-11-17')).toBe('Лхагва–Мягмар');
        expect(weekSpanLabel('2026-11-16')).toBe('Мягмар–Даваа');
        expect(weekSpanLabel('2026-11-15')).toBe('Даваа–Ням');
    });

    it('names a 7-day period «7 хоног» and anything else «хугацаа»', () => {
        expect(reportPeriodName({ from: '2026-11-11', to: '2026-11-17' })).toEqual({ name: '7 хоног', of: '7 хоногийн' });
        expect(reportPeriodName({ from: '2026-11-03', to: '2026-11-16' })).toEqual({ name: 'хугацаа', of: 'хугацааны' });
    });

    it('accepts a chosen period: both days, a real calendar day, from ≤ to, ≤ 92 days, not after the meeting', () => {
        expect(resolveReportRange('2026-11-18')).toEqual({ ok: true, range: { from: '2026-11-11', to: '2026-11-17' }, custom: false });
        expect(resolveReportRange('2026-11-18', '2026-11-11', '2026-11-17')).toEqual({ ok: true, range: { from: '2026-11-11', to: '2026-11-17' }, custom: false });
        expect(resolveReportRange('2026-11-18', '2026-11-10', '2026-11-16')).toEqual({ ok: true, range: { from: '2026-11-10', to: '2026-11-16' }, custom: true });
        // Хурлын өдөр хүртэл (тэр өдрийг оруулаад), нэг өдөр ч болно.
        expect(resolveReportRange('2026-11-18', '2026-11-18', '2026-11-18')).toMatchObject({ ok: true, custom: true });
        const last = new Date(Date.parse('2026-11-17T00:00:00Z') - (REPORT_RANGE_MAX_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
        expect(resolveReportRange('2026-11-18', last, '2026-11-17')).toMatchObject({ ok: true });

        const error = (from: string | null, to: string | null) => {
            const result = resolveReportRange('2026-11-18', from, to);
            return result.ok ? null : result.error;
        };
        expect(error('2026-11-10', null)).toBe('Тайлант хугацааны эхлэх, дуусах өдрийг хоёуланг нь сонгоно уу.');
        expect(error(null, '2026-11-16')).toBe('Тайлант хугацааны эхлэх, дуусах өдрийг хоёуланг нь сонгоно уу.');
        expect(error('2026-11-31', '2026-12-01')).toBe('Тайлант хугацааны огноо буруу байна.');
        expect(error('2026/11/10', '2026-11-16')).toBe('Тайлант хугацааны огноо буруу байна.');
        expect(error('2026-11-16', '2026-11-10')).toBe('Эхлэх өдөр дуусах өдрөөс хойш байж болохгүй.');
        expect(error('2026-11-12', '2026-11-19')).toBe('Тайлант хугацаа хурлын өдрөөс хойш дуусах боломжгүй.');
        expect(error(new Date(Date.parse(`${last}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), '2026-11-17')).toBe('Тайлант хугацаа 92 хоногоос урт байж болохгүй.');
    });

    it('recognises only real calendar days', () => {
        expect(isCalendarDate('2028-02-29')).toBe(true);
        expect(isCalendarDate('2026-02-29')).toBe(false);
        expect(isCalendarDate('2026-13-01')).toBe(false);
        expect(isCalendarDate('')).toBe(false);
        expect(isCalendarDate(20261117)).toBe(false);
    });
});
