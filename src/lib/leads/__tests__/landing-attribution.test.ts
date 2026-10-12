import { describe, expect, it } from 'vitest';
import { isMetaHost, landingArrival, landingLeadSource, type LandingSignals } from '../landing-attribution';

const source = (signals: LandingSignals) => landingLeadSource(signals);

describe('landing page channel rule', () => {
    it('uses explicit link parameters first', () => {
        expect(source({ utm_source: 'event', utm_medium: 'qr', landing_page_purpose: 'social_ad' })).toEqual({ source: 'event', basis: 'utm' });
        expect(source({ utm_source: 'ig', utm_medium: 'paid_social' })).toEqual({ source: 'facebook_ads', basis: 'utm' });
        expect(source({ utm_source: 'fb', utm_medium: 'paid_social', landing_page_purpose: 'event' })).toEqual({ source: 'facebook_ads', basis: 'utm' });
        expect(source({ facebook_campaign_id: '120210000000001' })).toEqual({ source: 'facebook_ads', basis: 'utm' });
        expect(source({ utm_source: 'google', utm_medium: 'cpc' })).toEqual({ source: 'google_ads', basis: 'utm' });
        expect(source({ utm_source: 'tiktok', utm_medium: 'cpc' })).toEqual({ source: 'other', basis: 'utm' });
        expect(source({ utm_source: 'facebook', utm_medium: 'social', landing_page_purpose: 'social_ad' })).toEqual({ source: 'facebook', basis: 'utm' });
        expect(source({ utm_source: 'Instagram', utm_medium: 'Social' })).toEqual({ source: 'instagram', basis: 'utm' });
        expect(source({ utm_source: 'radio' })).toEqual({ source: 'radio', basis: 'utm' });
    });

    it('does not treat a bare Google or unknown source as an ad', () => {
        expect(source({ utm_source: 'google' })).toEqual({ source: 'website', basis: 'none' });
        expect(source({ utm_source: 'newsletter', landing_page_purpose: 'event' })).toEqual({ source: 'event', basis: 'page' });
    });

    it('treats a Meta click as an ad only on a social-ad page, else as organic social', () => {
        expect(source({ referrer_host: 'l.facebook.com', landing_page_purpose: 'social_ad' })).toEqual({ source: 'facebook_ads', basis: 'page' });
        expect(source({ fbclid: 'IwAR0', landing_page_purpose: 'social_ad' })).toEqual({ source: 'facebook_ads', basis: 'page' });
        expect(source({ fbclid: 'IwAR0' })).toEqual({ source: 'facebook', basis: 'referrer' });
        expect(source({ referrer_host: 'l.instagram.com', landing_page_purpose: 'event' })).toEqual({ source: 'instagram', basis: 'referrer' });
        expect(source({ referrer_host: 'lm.facebook.com', landing_page_purpose: 'general' })).toEqual({ source: 'facebook', basis: 'referrer' });
    });

    it('falls back to the page purpose, then to website', () => {
        expect(source({ landing_page_purpose: 'event' })).toEqual({ source: 'event', basis: 'page' });
        expect(source({ landing_page_purpose: 'social_ad', referrer_host: 'google.com' })).toEqual({ source: 'facebook_ads', basis: 'page' });
        expect(source({ landing_page_purpose: 'general' })).toEqual({ source: 'website', basis: 'none' });
        expect(source({ landing_page_purpose: 'bogus' })).toEqual({ source: 'website', basis: 'none' });
        expect(source({})).toEqual({ source: 'website', basis: 'none' });
    });

    it('recognises Meta hosts without matching look-alikes', () => {
        expect(isMetaHost('facebook.com')).toBe(true);
        expect(isMetaHost('m.facebook.com')).toBe(true);
        expect(isMetaHost('instagram.com')).toBe(true);
        expect(isMetaHost('notfacebook.com')).toBe(false);
        expect(isMetaHost('facebook.com.evil.example')).toBe(false);
        expect(isMetaHost(null)).toBe(false);
    });
});

describe('landingArrival (lead panel)', () => {
    it('explains how the channel was decided', () => {
        expect(landingArrival({ source: 'facebook_ads', utm_source: 'fb', utm_medium: 'paid_social', utm_campaign: 'Elysium Oct' }))
            .toEqual({ basis: 'utm', detail: 'fb / paid_social · Elysium Oct' });
        expect(landingArrival({ source: 'event', landing_page_purpose: 'event' })).toEqual({ basis: 'page', detail: 'Эвент' });
        expect(landingArrival({ source: 'facebook', referrer_host: 'l.facebook.com' })).toEqual({ basis: 'referrer', detail: 'l.facebook.com' });
        expect(landingArrival({ source: 'website', referrer_host: 'google.com' })).toEqual({ basis: 'none', detail: 'google.com' });
    });

    it('stays silent without signals or when the stored source no longer follows the rule', () => {
        expect(landingArrival({ source: 'website' })).toBeNull();
        expect(landingArrival({ source: 'phone', landing_page_purpose: 'event' })).toBeNull();
    });
});
