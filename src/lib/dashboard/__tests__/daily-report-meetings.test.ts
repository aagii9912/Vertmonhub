import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    dailyMeetingInputError, dailyMeetingPhone, dailyMeetingScheduledAt, DailyMeetingRequestSchema,
} from '../daily-report-meetings';

// Vercel UTC-ээр ажилладаг: уулзалтын цаг серверийн бүсээс үл хамаарах ёстой.
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = originalTz; });

describe('daily report meeting input', () => {
    it('reads the meeting time as Ulaanbaatar local time', () => {
        // УБ 2026-10-19 07:30 = UTC 2026-10-18 23:30 (сервер UTC-д өдөр нь өөр).
        const now = new Date('2026-10-18T23:30:00.000Z');
        expect(dailyMeetingScheduledAt('2026-10-19', null, now)).toBe(now.toISOString());
        expect(dailyMeetingScheduledAt('2026-10-19', '07:05', now)).toBe('2026-10-18T23:05:00.000Z');
        expect(dailyMeetingScheduledAt('2026-10-18', undefined, now)).toBe('2026-10-18T04:00:00.000Z');
        expect(dailyMeetingScheduledAt('2026-10-18', '00:10', now)).toBe('2026-10-17T16:10:00.000Z');
    });

    it('normalizes phones to 8–15 digits', () => {
        expect(dailyMeetingPhone('+976 9911-2233')).toBe('99112233');
        expect(dailyMeetingPhone('9911 223')).toBeNull();
        expect(dailyMeetingPhone('1234567890123456')).toBeNull();
        expect(dailyMeetingPhone(null)).toBeNull();
    });

    it('parses each action strictly with Mongolian errors', () => {
        expect(DailyMeetingRequestSchema.parse({ action: 'record', date: '2026-10-19', manager: ' Сараа ', customer_phone: '99112233', notes: '  ' }))
            .toEqual({ action: 'record', date: '2026-10-19', manager: 'Сараа', meeting_type: 'new_customer', customer_phone: '99112233',
                anonymous: false, notes: null, feedback: null, interest_level: null });
        const extra = DailyMeetingRequestSchema.safeParse({ action: 'reassign', date: '2026-10-19', viewing_id: '00000000-0000-4000-8000-000000000001', manager: 'Сараа', status: 'completed' });
        expect(extra.success).toBe(false);
        if (!extra.success) expect(dailyMeetingInputError(extra.error)).toBe('Уулзалтын мэдээллийг шалгана уу');
        const phone = DailyMeetingRequestSchema.safeParse({ action: 'record', date: '2026-10-19', manager: 'Сараа', customer_phone: '991' });
        expect(phone.success).toBe(false);
        if (!phone.success) expect(dailyMeetingInputError(phone.error)).toBe('Утасны дугаараа бүтнээр оруулна уу');
        expect(DailyMeetingRequestSchema.safeParse({ action: 'complete', date: '2026-10-19', viewing_id: '00000000-0000-4000-8000-000000000001', status: 'cancelled' }).success).toBe(false);
    });
});
