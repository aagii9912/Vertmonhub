import { describe, expect, it } from 'vitest';
import { SOURCES, toLeadSource } from '../labels';

describe('toLeadSource', () => {
    it('keeps vocabulary values and maps known UTM spellings', () => {
        for (const source of SOURCES) expect(toLeadSource(source)).toBe(source);
        expect(toLeadSource(' Google ')).toBe('google_ads');
        expect(toLeadSource('fb')).toBe('facebook_ads');
        expect(toLeadSource('IG')).toBe('instagram');
    });

    it('falls back for unknown, empty or prototype names', () => {
        expect(toLeadSource('newsletter')).toBe('other');
        expect(toLeadSource('newsletter', 'website')).toBe('website');
        expect(toLeadSource(null)).toBe('other');
        expect(toLeadSource('constructor')).toBe('other');
    });
});
