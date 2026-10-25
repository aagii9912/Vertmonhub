import { describe, expect, it } from 'vitest';
import { isCalendarDate, orderDateIssue } from '../order-date';

describe('order date rule (PATCH order_date + AI create_contract)', () => {
    it('accepts real calendar days from 2000-01-01 up to today', () => {
        expect(orderDateIssue('2026-10-15', '2026-10-26')).toBeNull();
        expect(orderDateIssue('2026-10-26', '2026-10-26')).toBeNull();
        expect(orderDateIssue('2000-01-01', '2026-10-26')).toBeNull();
        expect(orderDateIssue('2024-02-29', '2026-10-26')).toBeNull();
    });

    it('names each problem', () => {
        expect(orderDateIssue('2026-10-5', '2026-10-26')).toBe('format');
        expect(orderDateIssue('15.10.2026', '2026-10-26')).toBe('format');
        expect(orderDateIssue('2026-02-30', '2026-10-26')).toBe('calendar');
        expect(orderDateIssue('2025-02-29', '2026-10-26')).toBe('calendar');
        expect(orderDateIssue('0202-10-01', '2026-10-26')).toBe('too_early');
        expect(orderDateIssue('2026-10-27', '2026-10-26')).toBe('future');
    });

    it('checks the calendar without time-zone drift', () => {
        expect(isCalendarDate('2026-12-31')).toBe(true);
        expect(isCalendarDate('2026-13-01')).toBe(false);
        expect(isCalendarDate('2026-04-31')).toBe(false);
    });
});
