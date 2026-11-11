import { describe, expect, it } from 'vitest';
import { buildMeetingInterestSummary, type MeetingInterestRow } from '../interest-summary';

const units = [
    { block: 'Б2', model: 'A', rooms: 2 },
    { block: 'Б1', model: 'E7', rooms: 3 },
    { block: 'Б1', model: 'E7', rooms: 3 },
];
const interest = (block: string, model: string, payment_condition: string | null, area_sqm = 58) => ({ block, model, area_sqm, floor: 5, payment_condition });
const meeting = (id: string, day: string, interests: unknown, extra: Partial<MeetingInterestRow> = {}): MeetingInterestRow =>
    ({ id, day, status: 'completed', type: 'new_customer', interests, ...extra });

const base = { from: '2026-10-01', to: '2026-10-31', status: 'completed' as const, units, meetingsSince: '2026-09-01' };

describe('buildMeetingInterestSummary', () => {
    it('ranks models and payment conditions by meetings, counting each meeting once per model and condition', () => {
        const report = buildMeetingInterestSummary({
            ...base,
            meetings: [
                // Нэг загварыг хоёр давхарт, хоёр нөхцөлөөр — загварт 1, нөхцөл тус бүрд 1.
                meeting('m1', '2026-10-02', [interest('Б2', 'A', '30%'), interest('B2', 'a', '10-30%')]),
                meeting('m2', '2026-10-03', [interest('Б2', 'A', '30 %')]),
                meeting('m3', '2026-10-04', [interest('Б1', 'E7', '50%', 89.73)], { type: 'repeat_customer' }),
                meeting('m4', '2026-10-05', [interest('Б1', 'E7', null, 89.73)]),
                meeting('m5', '2026-10-06', []),
                meeting('m6', '2026-10-07', null, { type: 'existing_buyer' }),
            ],
        });
        expect(report).toMatchObject({ meetings: 6, withInterest: 4, withoutInterest: 2, withoutPaymentCondition: 1, coverage: 'full' });
        expect(report.byModel).toEqual([
            { block: 'Б1', model: 'E7', label: 'Б1 E7 · 89.73 м² · 3 өрөө', meetings: 2, sharePct: 50 },
            { block: 'Б2', model: 'A', label: 'Б2 A · 58 м² · 2 өрөө', meetings: 2, sharePct: 50 },
        ]);
        // «30 %» = «30%»; эхэлж бичигдсэн нэрээр.
        expect(report.byPaymentCondition).toEqual([
            { label: '30%', meetings: 2, sharePct: 50 },
            { label: '10-30%', meetings: 1, sharePct: 25 },
            { label: '50%', meetings: 1, sharePct: 25 },
        ]);
        expect(report.byModelAndCondition[0]).toEqual({ model: 'Б2 A · 58 м² · 2 өрөө', paymentCondition: '30%', meetings: 2 });
        expect(report.byMeetingType).toEqual([{ type: 'Шинэ', meetings: 4 }, { type: 'Давтан', meetings: 1 }, { type: 'Захиалагч', meetings: 1 }]);
        expect(report.notes.join(' ')).toContain('2 уулзалтад сонирхсон загвар бүртгэгдээгүй');
        expect(report.notes.join(' ')).toContain('1 уулзалтад төлбөрийн нөхцөл сонгоогүй');
        expect(report.notes.join(' ')).toContain('загвар тэнцүү');
    });

    it('keeps only the range and the requested status', () => {
        const meetings = [
            meeting('in', '2026-10-31', [interest('Б2', 'A', '30%')]),
            meeting('before', '2026-09-30', [interest('Б2', 'A', '30%')]),
            meeting('after', '2026-11-01', [interest('Б2', 'A', '30%')]),
            meeting('noshow', '2026-10-10', [interest('Б1', 'E7', '50%')], { status: 'no_show' }),
        ];
        expect(buildMeetingInterestSummary({ ...base, meetings }).meetings).toBe(1);
        const all = buildMeetingInterestSummary({ ...base, status: 'all', meetings });
        expect(all.meetings).toBe(2);
        expect(all.byPaymentCondition.map(row => row.label)).toEqual(['30%', '50%']);
    });

    it('never reports unknown periods as zero', () => {
        const before = buildMeetingInterestSummary({ ...base, meetingsSince: '2026-11-05', meetings: [] });
        expect(before).toMatchObject({ coverage: 'none', meetings: 0 });
        expect(before.notes[0]).toContain('тодорхойгүй (0 биш)');
        const partial = buildMeetingInterestSummary({ ...base, meetingsSince: '2026-10-08', meetings: [meeting('m', '2026-10-09', [interest('Б2', 'A', '30%')])] });
        expect(partial.coverage).toBe('partial');
        expect(partial.notes[0]).toContain('доод хязгаар');
        expect(buildMeetingInterestSummary({ ...base, meetingsSince: null, meetings: [] }).notes[0]).toContain('бүртгэгдээгүй');
    });
});
