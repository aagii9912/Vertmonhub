import { describe, expect, it } from 'vitest';
import {
    ANONYMOUS_LEAD_LABEL, SOURCES, anonymousLeadOrFilter, hasAnonymousLeadContact, isAnonymousLead, isAnonymousLeadQuery, leadDisplayName,
    meetingCustomerName, normalizeLeadName, toLeadSource,
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
        for (const raw of [null, undefined, '', '   ', '-', '—', 'нэргүй лид', ANONYMOUS_LEAD_LABEL, ' Facebook lead ', 'Тодорхойгүй', 42]) {
            expect(normalizeLeadName(raw)).toBeNull();
        }
    });

    it('trims and collapses whitespace in a real name', () => {
        expect(normalizeLeadName('  Г.   Энхжин ')).toBe('Г. Энхжин');
        expect(normalizeLeadName('Нэргүйбаатар')).toBe('Нэргүйбаатар');
    });

    it('keeps «Нэргүй» as a real Mongolian given name', () => {
        expect(normalizeLeadName('Нэргүй')).toBe('Нэргүй');
        expect(normalizeLeadName(' нэргүй ')).toBe('нэргүй');
        expect(leadDisplayName({ customer_name: 'Нэргүй' })).toBe('Нэргүй');
        expect(isAnonymousLead({ customer_name: 'Нэргүй' })).toBe(false);
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

    it('recognizes the anonymous search keyword only as a prefix of the label', () => {
        expect(isAnonymousLeadQuery('нэргүй')).toBe(true);
        expect(isAnonymousLeadQuery(' Нэргүй харилцагч')).toBe(true);
        expect(isAnonymousLeadQuery('нэргүй  х')).toBe(true);
        expect(isAnonymousLeadQuery('Нэргүй лид')).toBe(true);
        expect(isAnonymousLeadQuery('Нэргүйбаатар')).toBe(false);
        expect(isAnonymousLeadQuery('Нэргүй Бат')).toBe(false);
        expect(isAnonymousLeadQuery('нэр')).toBe(false);
        expect(isAnonymousLeadQuery('Болд')).toBe(false);
        expect(isAnonymousLeadQuery('')).toBe(false);
        expect(isAnonymousLeadQuery(null)).toBe(false);
    });

    it('builds an additive filter for every row displayed with the label', () => {
        const clauses = anonymousLeadOrFilter().split(',');
        expect(clauses).toEqual(expect.arrayContaining([
            'customer_name.is.null', 'customer_name.eq.""', 'customer_name.ilike.facebook lead', 'customer_name.ilike.-',
            'customer_name.ilike.нэргүй харилцагч',
        ]));
        // Жинхэнэ нэр «Нэргүй»-г нэргүй лид гэж тооцохгүй (нэрийн хайлт өөрөө олно).
        expect(clauses).not.toContain('customer_name.ilike.нэргүй');
        expect(anonymousLeadOrFilter('leads.customer_name')).toMatch(/^leads\.customer_name\.is\.null,/);
    });

    it('shows the label for an anonymous lead meeting but nothing for a meeting without a lead', () => {
        expect(meetingCustomerName({ customer_name: 'Болд' })).toBe('Болд');
        expect(meetingCustomerName({ customer_name: null, anonymous_lead: true })).toBe(ANONYMOUS_LEAD_LABEL);
        expect(meetingCustomerName({ customer_name: 'Facebook lead', anonymous_lead: true })).toBe(ANONYMOUS_LEAD_LABEL);
        expect(meetingCustomerName({ customer_name: null })).toBeNull();
    });
});
