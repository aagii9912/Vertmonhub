import { describe, expect, it } from 'vitest';
import {
    contactKey, ELYSIUM_LEAD_SOURCE, elysiumLeadNotes, elysiumRepeatInquiryText, findMatchingLead, matchesLead,
    normalizeEventLead, submissionRecorded, toCandidate, type EventLeadRow,
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
