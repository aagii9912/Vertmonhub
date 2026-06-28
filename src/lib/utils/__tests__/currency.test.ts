/**
 * formatMNT — Монгол төгрөгийн нэгдсэн формат.
 */

import { describe, it, expect } from 'vitest';
import { formatMNT } from '@/lib/utils/currency';

describe('formatMNT (default)', () => {
    it('мянгатын таслалтай бүтэн тоо', () => {
        expect(formatMNT(380000000)).toBe('380,000,000₮');
        expect(formatMNT(500)).toBe('500₮');
    });

    it('null/undefined/NaN → 0₮', () => {
        expect(formatMNT(null)).toBe('0₮');
        expect(formatMNT(undefined)).toBe('0₮');
        expect(formatMNT(NaN)).toBe('0₮');
    });

    it('бутархайг бүхэлчилнэ', () => {
        expect(formatMNT(1234.6)).toBe('1,235₮');
    });

    it('сөрөг тоо', () => {
        expect(formatMNT(-1500)).toBe('-1,500₮');
    });
});

describe('formatMNT (compact)', () => {
    it('тэрбум / сая руу товчилно', () => {
        expect(formatMNT(1_200_000_000, { compact: true })).toBe('1.2 тэрбум₮');
        expect(formatMNT(3_500_000, { compact: true })).toBe('3.5 сая₮');
    });

    it('1000-аас дээш ч сая-аас доош бол бүтэн дүн', () => {
        expect(formatMNT(1500, { compact: true })).toBe('1,500₮');
    });

    it('1000-аас доош бол энгийн формат руу унана', () => {
        expect(formatMNT(500, { compact: true })).toBe('500₮');
    });

    it('сөрөг compact', () => {
        expect(formatMNT(-2_000_000, { compact: true })).toBe('-2.0 сая₮');
    });
});
