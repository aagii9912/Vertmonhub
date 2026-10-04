import { describe, expect, it } from 'vitest';
import {
    ANONYMOUS_LEAD_LABEL, SOURCES, hasAnonymousLeadContact, isAnonymousLead, isAnonymousLeadQuery, leadDisplayName, normalizeLeadName, toLeadSource,
} from '../labels';

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

describe('anonymous lead names', () => {
    it('normalizes blanks, placeholders and the display label to null', () => {
        for (const raw of [null, undefined, '', '   ', '-', '—', 'Нэргүй', 'нэргүй лид', ANONYMOUS_LEAD_LABEL, ' Facebook lead ', 'Тодорхойгүй', 42]) {
            expect(normalizeLeadName(raw)).toBeNull();
        }
    });

    it('trims and collapses whitespace in a real name', () => {
        expect(normalizeLeadName('  Г.   Энхжин ')).toBe('Г. Энхжин');
        expect(normalizeLeadName('Нэргүйбаатар')).toBe('Нэргүйбаатар');
    });

    it('displays the single label for anonymous leads only', () => {
        expect(leadDisplayName({ customer_name: null })).toBe(ANONYMOUS_LEAD_LABEL);
        expect(leadDisplayName({})).toBe(ANONYMOUS_LEAD_LABEL);
        expect(leadDisplayName(null)).toBe(ANONYMOUS_LEAD_LABEL);
        expect(leadDisplayName('Facebook lead')).toBe(ANONYMOUS_LEAD_LABEL);
        expect(leadDisplayName({ customer_name: 'Болд' })).toBe('Болд');
        expect(leadDisplayName(' Болд ')).toBe('Болд');
        expect(isAnonymousLead({ customer_name: '  ' })).toBe(true);
        expect(isAnonymousLead(null)).toBe(true);
        expect(isAnonymousLead({ customer_name: 'Болд' })).toBe(false);
    });

    it('accepts an 8+ digit phone or a valid email as anonymous contact', () => {
        expect(hasAnonymousLeadContact('9911 2233', null)).toBe(true);
        expect(hasAnonymousLeadContact('+976 9911-2233', null)).toBe(true);
        expect(hasAnonymousLeadContact('9911223', null)).toBe(false);
        expect(hasAnonymousLeadContact(null, 'bold@example.com')).toBe(true);
        expect(hasAnonymousLeadContact('123', 'not-an-email')).toBe(false);
        expect(hasAnonymousLeadContact(null, null)).toBe(false);
    });

    it('recognizes the anonymous search keyword', () => {
        expect(isAnonymousLeadQuery('нэргүй')).toBe(true);
        expect(isAnonymousLeadQuery(' Нэргүй харилцагч')).toBe(true);
        expect(isAnonymousLeadQuery('Болд')).toBe(false);
        expect(isAnonymousLeadQuery('')).toBe(false);
        expect(isAnonymousLeadQuery(null)).toBe(false);
    });
});
