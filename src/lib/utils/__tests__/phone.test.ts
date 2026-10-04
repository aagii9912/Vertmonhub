import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneIlikePattern } from '../phone';

describe('phone helpers', () => {
    it('normalizes every stored format to the same dedup key', () => {
        for (const raw of ['99112233', '9911-2233', '+976 9911 2233', '00976 99112233']) {
            expect(normalizePhone(raw)).toBe('99112233');
        }
        expect(normalizePhone('—')).toBeNull();
    });

    it('builds a format-agnostic search pattern from the last eight digits', () => {
        expect(phoneIlikePattern('+976 9911-2233')).toBe('%9911%2233%');
        expect(phoneIlikePattern('991122')).toBe('%9911%22%');
        expect(phoneIlikePattern('99112', 6)).toBeNull();
        expect(phoneIlikePattern('9911223', 8)).toBeNull();
        expect(phoneIlikePattern(null)).toBeNull();
    });
});
