import { describe, expect, it } from 'vitest';
import { formatStaffPhone, managerNameMissing, parseStaffPhone, staffPhoneInput } from '../staff-profile';

describe('staff phone', () => {
    it.each([
        ['99112233', '99112233'], [' 9911 2233 ', '99112233'], ['9911-2233', '99112233'],
        ['+976 9911-2233', '99112233'], ['00976 99112233', '99112233'],
    ])('normalizes %j to 8 digits', (raw, expected) => {
        expect(parseStaffPhone(raw)).toBe(expected);
    });

    it.each(['', '   ', null, undefined])('treats %j as no phone', raw => {
        expect(parseStaffPhone(raw)).toBeNull();
    });

    it.each(['9911223', '991122334', 'утас', 'abc', '+1 415 555 0100'])('rejects %j instead of silently dropping it', raw => {
        expect(parseStaffPhone(raw)).toBe(false);
    });

    it('rejects non-string payloads', () => {
        expect(staffPhoneInput.safeParse(99112233).success).toBe(false);
        expect(staffPhoneInput.safeParse({}).success).toBe(false);
    });

    it('formats normalized numbers and leaves legacy text untouched', () => {
        expect(formatStaffPhone('99112233')).toBe('9911 2233');
        expect(formatStaffPhone('+976 9911-2233')).toBe('+976 9911-2233');
        expect(formatStaffPhone(null)).toBe('');
    });
});

describe('sales manager real name', () => {
    it('applies only to sales managers', () => {
        expect(managerNameMissing('viewer', '', 'a@example.invalid')).toBe(false);
        expect(managerNameMissing('sales_manager', 'Бат', 'a@example.invalid')).toBe(false);
    });

    it.each(['', '   ', null, 'a@example.invalid', ' A@Example.Invalid '])('treats %j as a missing manager name', name => {
        expect(managerNameMissing('sales_manager', name, 'a@example.invalid')).toBe(true);
    });
});
