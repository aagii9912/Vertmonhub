import { describe, it, expect } from 'vitest';
import { safeEqual } from '../safe-equal';

describe('safeEqual', () => {
    it('ижил мөр → true', () => {
        expect(safeEqual('abc', 'abc')).toBe(true);
        expect(safeEqual('', '')).toBe(true);
        expect(safeEqual('монгол', 'монгол')).toBe(true);
    });
    it('өөр урт / өөр утга / null → false', () => {
        expect(safeEqual('abc', 'abcd')).toBe(false);
        expect(safeEqual('abc', 'abd')).toBe(false);
        expect(safeEqual(null, 'abc')).toBe(false);
        expect(safeEqual('abc', undefined)).toBe(false);
        expect(safeEqual(undefined, undefined)).toBe(false);
    });
});
