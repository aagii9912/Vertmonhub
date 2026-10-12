import { describe, expect, it } from 'vitest';
import {
    contactKey, ELYSIUM_LEAD_SOURCE, elysiumLandingPage, elysiumLeadColumns, elysiumLeadNotes, elysiumNotesSubmission, elysiumRepeatInquiryText,
    EventLeadRowSchema, findMatchingLead, matchesLead, normalizeEventLead, parseElysiumAttribution, submissionRecorded, toCandidate,
    type EventLeadRow,
} from '../elysium';

const H = 60 * 60 * 1000;
const row = (patch: Partial<EventLeadRow> = {}): EventLeadRow => ({
    id: '50000000-0000-4000-8000-000000000001',
    created_at: '2026-10-04T02:00:00.123456+00:00',
    name: 'Бат', phone: '99112233', email: '', message: 'Үнийн санал авъя', source: 'event/open-house', event_name: 'Нээлттэй хаалга', event_slug: 'open-house',
    ...patch,
});

describe('Elysium lead helpers', () => {
    it('keeps the push notes format byte for byte and maps every lead to the website source', () => {
        expect(ELYSIUM_LEAD_SOURCE).toBe('website');
        expect(elysiumLeadNotes({ message: 'Сайн байна уу', event: 'Нээлттэй хаалга', source: 'elysium/mono#contact' }))
            .toBe('Сайн байна уу\n\nАрга хэмжээ: Нээлттэй хаалга\n\nСайтын эх сурвалж: elysium/mono#contact');
        expect(elysiumLeadNotes({ message: '  ', event: null, source: 'elysium/mono#apartments' })).toBe('Сайтын эх сурвалж: elysium/mono#apartments');
        expect(elysiumLeadNotes({})).toBeNull();
    });

    it("turns Elysium's empty strings into nulls and clamps the name to the column size", () => {
        const lead = normalizeEventLead(row({ name: `  ${'а'.repeat(300)} `, email: '   ', message: '' }));
        expect(lead).toMatchObject({ ok: true, email: null, phone: '99112233', message: null, event: 'Нээлттэй хаалга' });
        if (!lead.ok) throw new Error('expected ok');
        expect(lead.name).toHaveLength(255);
        expect(lead.notes).toBe('Арга хэмжээ: Нээлттэй хаалга\n\nСайтын эх сурвалж: event/open-house');
        expect(lead.createdAtMs).toBe(Date.parse('2026-10-04T02:00:00.123Z'));
        expect(normalizeEventLead(row({ name: '' }))).toMatchObject({ ok: true, name: null });
    });

    it('keeps an unusable email or phone in the notes instead of dropping it', () => {
        const lead = normalizeEventLead(row({ email: 'bat@', message: 'Сайн уу' }));
        expect(lead).toMatchObject({ ok: true, email: null, phone: '99112233' });
        if (lead.ok) expect(lead.notes).toContain('И-мэйл: bat@');
        const long = normalizeEventLead(row({ phone: '9'.repeat(60), email: 'Bat@Example.MN' }));
        expect(long).toMatchObject({ ok: true, phone: null, email: 'Bat@Example.MN', key: { phone: null, email: 'bat@example.mn' } });
        if (long.ok) expect(long.notes).toContain(`Утас: ${'9'.repeat(60)}`);
        expect(normalizeEventLead(row({ phone: 'утасгүй', email: '' }))).toEqual({ ok: false, detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу' });
        expect(normalizeEventLead(row({ phone: '', email: '' }))).toEqual({ ok: false, detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу' });
    });

    it('does not use a phone too short to match as the contact (it would turn one request into two leads)', () => {
        expect(normalizeEventLead(row({ phone: '12345', email: '' }))).toEqual({ ok: false, detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу' });
        const withEmail = normalizeEventLead(row({ phone: '12-345', email: 'bat@example.mn' }));
        expect(withEmail).toMatchObject({ ok: true, phone: null, email: 'bat@example.mn', key: { phone: null, email: 'bat@example.mn' } });
        if (withEmail.ok) expect(withEmail.notes).toContain('Утас: 12-345');
        expect(normalizeEventLead(row({ phone: '32 1234', email: '' }))).toMatchObject({ ok: true, phone: '32 1234', key: { phone: '321234' } });
    });

    it('matches formatted phones and email case, but not tiny digit fragments', () => {
        expect(contactKey('+976 9911-2233', null)).toEqual({ phone: '99112233', email: null });
        expect(contactKey('123', ' A@B.MN ')).toEqual({ phone: null, email: 'a@b.mn' });
        const at = Date.parse('2026-10-04T02:00:00Z');
        const lead = toCandidate({ id: 'lead-1', customer_phone: '99112233', customer_email: null, created_at: '2026-10-04T02:00:05Z' });
        expect(matchesLead({ key: contactKey('+976 9911-2233', null), createdAtMs: at }, lead)).toBe(true);
        const byEmail = toCandidate({ id: 'lead-2', customer_phone: null, customer_email: 'Bat@Example.mn', created_at: '2026-10-04T02:00:05Z' });
        expect(matchesLead({ key: contactKey(null, 'bat@example.MN'), createdAtMs: at }, byEmail)).toBe(true);
        expect(matchesLead({ key: contactKey('88112233', 'other@example.mn'), createdAtMs: at }, lead)).toBe(false);
    });

    it('uses the [−24 h, +72 h] window, and 72 h before for importer-created leads', () => {
        const at = Date.parse('2026-10-04T02:00:00Z');
        const key = contactKey('99112233', null);
        const lead = (offsetMs: number, imported = false) =>
            toCandidate({ id: `lead-${offsetMs}`, customer_phone: '99112233', created_at: new Date(at + offsetMs).toISOString() }, imported);
        expect(matchesLead({ key, createdAtMs: at }, lead(-24 * H))).toBe(true);
        expect(matchesLead({ key, createdAtMs: at }, lead(-24 * H - 1))).toBe(false);
        expect(matchesLead({ key, createdAtMs: at }, lead(72 * H))).toBe(true);
        expect(matchesLead({ key, createdAtMs: at }, lead(72 * H + 1))).toBe(false);
        expect(matchesLead({ key, createdAtMs: at }, lead(-48 * H, true))).toBe(true);
        expect(matchesLead({ key, createdAtMs: at }, lead(-72 * H - 1, true))).toBe(false);
    });

    it('includes soft-deleted leads but prefers a live one, then the closest in time', () => {
        const at = Date.parse('2026-10-04T02:00:00Z');
        const key = contactKey('99112233', null);
        const deleted = toCandidate({ id: 'deleted', customer_phone: '99112233', created_at: '2026-10-04T02:00:01Z', deleted_at: '2026-10-04T05:00:00Z' });
        expect(findMatchingLead({ key, createdAtMs: at }, [deleted])).toMatchObject({ id: 'deleted', deleted: true });
        const far = toCandidate({ id: 'far', customer_phone: '99112233', created_at: '2026-10-05T02:00:00Z' });
        const near = toCandidate({ id: 'near', customer_phone: '99112233', created_at: '2026-10-04T03:00:00Z' });
        expect(findMatchingLead({ key, createdAtMs: at }, [deleted, far, near])?.id).toBe('near');
        expect(findMatchingLead({ key: contactKey('88001122', null), createdAtMs: at }, [deleted, far, near])).toBeNull();
    });

    it('treats a submission as already recorded when its message and event are in the notes or an earlier repeat entry', () => {
        expect(submissionRecorded(['Үнийн санал авъя\n\nАрга хэмжээ: Нээлттэй хаалга\n\nАжилтны нэмэлт'], { message: 'Үнийн санал авъя', event: 'Нээлттэй хаалга' })).toBe(true);
        expect(submissionRecorded(['Үнийн санал авъя'], { message: 'Үнийн санал авъя', event: 'Өөр арга хэмжээ' })).toBe(false);
        expect(submissionRecorded([null, 'Өөр мессеж'], { message: 'Шинэ асуулт', event: null })).toBe(false);
        expect(submissionRecorded([null], { message: null, event: null })).toBe(true);
    });

    it('describes a repeat inquiry with only the new contact details', () => {
        const text = elysiumRepeatInquiryText(
            { notes: 'Шинэ асуулт', phone: '+976 99112233', email: 'new@example.mn' },
            { customerPhone: '9911 2233', customerEmail: null },
        );
        expect(text).toBe('Elysium сайтаас дахин хүсэлт ирлээ.\n\nШинэ асуулт\n\nИ-мэйл: new@example.mn');
    });
});

describe('Elysium landing page attribution', () => {
    it('keeps only well-formed attribution fields and never rejects the lead', () => {
        expect(parseElysiumAttribution({
            utmSource: ' fb ', utmMedium: 'paid_social', utmCampaign: 'x'.repeat(201), utmContent: 'a\u0000b', utmId: '120210000000001',
            adsetId: '12x', adId: '99', fbclid: 'IwAR0_a-b', referrerHost: 'L.Facebook.com', pagePurpose: 'social_ad',
            pageUrl: 'https://elysium.mn/social?utm_source=fb#form', extra: 'ignored',
        })).toEqual({
            utmSource: 'fb', utmMedium: 'paid_social', utmId: '120210000000001', adId: '99', fbclid: 'IwAR0_a-b',
            referrerHost: 'l.facebook.com', pagePurpose: 'social_ad', pageUrl: 'https://elysium.mn/social',
        });
        expect(parseElysiumAttribution({ pagePurpose: 'ads', pageUrl: 'javascript:alert(1)', referrerHost: 'localhost', fbclid: 'a b' })).toEqual({});
        expect(parseElysiumAttribution(null)).toEqual({});
        expect(parseElysiumAttribution('utm_source=fb')).toEqual({});
        expect(parseElysiumAttribution([1])).toEqual({});
    });

    it('identifies the landing page from the form source', () => {
        expect(elysiumLandingPage('event/social-media-uulzalt-towloh', 'Social Media uulzalt towloh'))
            .toEqual({ key: 'event/social-media-uulzalt-towloh', name: 'Social Media uulzalt towloh' });
        expect(elysiumLandingPage('event/yarmag', '  ')).toEqual({ key: 'event/yarmag', name: 'yarmag' });
        expect(elysiumLandingPage('elysium/mono#hero', null)).toEqual({ key: 'site', name: 'Үндсэн сайт' });
        expect(elysiumLandingPage('event/Bad Slug', 'x')).toBeNull();
        expect(elysiumLandingPage('https://elysium.mn/', null)).toBeNull();
        expect(elysiumLandingPage(null, null)).toBeNull();
    });

    it('maps a Meta ad click on a landing page to Facebook Ads with campaign, ad set and ad IDs', () => {
        expect(elysiumLeadColumns({
            source: 'event/social', event: 'Social',
            attribution: { utmSource: 'ig', utmMedium: 'paid_social', utmCampaign: 'Oct', utmId: '111', adsetId: '222', adId: '333', pagePurpose: 'social_ad', pageUrl: 'https://elysium.mn/social' },
        })).toEqual({
            source: 'facebook_ads', landing_page: 'event/social', landing_page_name: 'Social', landing_page_url: 'https://elysium.mn/social',
            landing_page_purpose: 'social_ad', utm_source: 'ig', utm_medium: 'paid_social', utm_campaign: 'Oct', utm_content: null, utm_term: null,
            fbclid: null, facebook_campaign_id: '111', facebook_adset_id: '222', facebook_ad_id: '333', referrer_host: null,
        });
    });

    it('uses the page purpose without UTM and keeps Google campaign IDs out of the Meta column', () => {
        expect(elysiumLeadColumns({ source: 'event/yarmag', event: 'Ярмаг', attribution: { pagePurpose: 'event' } }))
            .toMatchObject({ source: 'event', landing_page: 'event/yarmag', landing_page_purpose: 'event' });
        expect(elysiumLeadColumns({ source: 'elysium/mono#hero', event: null, attribution: { utmSource: 'google', utmMedium: 'cpc', utmId: '555' } }))
            .toMatchObject({ source: 'google_ads', landing_page: 'site', facebook_campaign_id: null, landing_page_purpose: null });
    });

    it('keeps a plain site form on the website source (old Elysium payloads)', () => {
        expect(elysiumLeadColumns({ source: 'elysium/mono#contact', event: null, attribution: {} }))
            .toMatchObject({ source: ELYSIUM_LEAD_SOURCE, landing_page: 'site', landing_page_name: 'Үндсэн сайт', landing_page_url: null });
        expect(elysiumLeadColumns({ source: 'unknown', event: null, attribution: { pagePurpose: 'event' } }))
            .toMatchObject({ source: 'website', landing_page: null, landing_page_purpose: null });
    });

    it('reads the original page and event back from the notes for the backfill', () => {
        const notes = elysiumLeadNotes({ message: 'Цаг товлох өдөр: 2026-10-09', event: 'Elysium Residence газардах хуудас', source: 'event/yarmag' });
        expect(elysiumNotesSubmission(`${notes}\n\nСайтын эх сурвалж: elysium/mono#hero`))
            .toEqual({ source: 'event/yarmag', event: 'Elysium Residence газардах хуудас' });
        expect(elysiumNotesSubmission('Сайтын эх сурвалж: elysium/mono#hero')).toEqual({ source: 'elysium/mono#hero', event: null });
        expect(elysiumNotesSubmission('Гараар бүртгэсэн')).toEqual({ source: null, event: null });
        expect(elysiumNotesSubmission(null)).toEqual({ source: null, event: null });
    });

    it('reads event_leads rows with or without the attribution column', () => {
        expect(EventLeadRowSchema.safeParse(row()).success).toBe(true);
        const parsed = EventLeadRowSchema.parse({ ...row(), attribution: { utmSource: 'event', utmMedium: 'qr' }, event_id: null });
        expect(parsed.attribution).toEqual({ utmSource: 'event', utmMedium: 'qr' });
        expect(parsed).not.toHaveProperty('event_id');
    });
});
