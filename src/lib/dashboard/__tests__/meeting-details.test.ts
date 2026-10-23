import { describe, expect, it } from 'vitest';
import { buildMeetingDetails, firstInterest, meetingDetailWeeks, modelLabel, modelRooms, type MeetingDetailRow } from '../meeting-details';

const interest = (block: string, model: string, area_sqm: number) => [{ block, model, area_sqm, floor: 12, unit_id: null, payment_condition: '30%', quote: null }];
const meeting = (id: string, day: string, type: string | null, interests: unknown = []): MeetingDetailRow => ({ id, day, type, interests });
const units = [
    { block: 'Б1', model: 'E7', rooms: 3 }, { block: 'Б1', model: 'E7', rooms: '3' }, { block: 'Б2', model: 'A', rooms: 2 },
    // Нэг загварт өөр өөр өрөө → өрөөг харуулахгүй.
    { block: 'Б2', model: 'X', rooms: 2 }, { block: 'Б2', model: 'X', rooms: 3 }, { block: 'Б2', model: 'B', rooms: null },
];
const none = { available: true, byViewing: new Map<string, string | null>() };

describe('meeting detail weeks', () => {
    it('returns the last four Wednesday→Tuesday weeks ending at the report end', () => {
        expect(meetingDetailWeeks('2026-10-21')).toEqual([
            { label: '09/23–09/29', from: '2026-09-23', to: '2026-09-29' },
            { label: '09/30–10/06', from: '2026-09-30', to: '2026-10-06' },
            { label: '10/07–10/13', from: '2026-10-07', to: '2026-10-13' },
            { label: '10/14–10/20', from: '2026-10-14', to: '2026-10-20' },
        ]);
    });
});

describe('interest helpers', () => {
    it('reads the first interest item and ignores malformed ones', () => {
        expect(firstInterest(interest('Б1', 'E7', 89.734))).toEqual({ block: 'Б1', model: 'E7', area: 89.73 });
        expect(firstInterest([{ block: 'Б1', model: 'E7' }, ...interest('Б2', 'A', 57.87)])).toEqual({ block: 'Б1', model: 'E7', area: null });
        expect(firstInterest([])).toBeNull();
        expect(firstInterest(null)).toBeNull();
        expect(firstInterest([{ block: ' ', model: 'E7' }])).toBeNull();
        expect(firstInterest({ block: 'Б1', model: 'E7' })).toBeNull();
    });

    it('maps block + model to rooms only when the register is single-valued', () => {
        const rooms = modelRooms(units);
        expect(rooms.get('B1|E7')).toBe(3);
        expect(rooms.get('B2|A')).toBe(2);
        expect(rooms.get('B2|X')).toBeNull();
        expect(rooms.has('B2|B')).toBe(false);
        expect(modelLabel('Б1', 'E7', 89.73, 3)).toBe('Б1 E7 · 89.73 м² · 3 өрөө');
        expect(modelLabel('Б2', 'X', null, null)).toBe('Б2 X');
    });
});

describe('buildMeetingDetails', () => {
    it('groups each week by the first interest model and counts meetings without one separately', () => {
        const report = buildMeetingDetails({
            meetingDate: '2026-10-21', units, referrals: none,
            meetings: [
                meeting('a', '2026-10-14', 'new_customer', interest('Б1', 'E7', 89.73)),
                meeting('b', '2026-10-15', 'repeat_customer', interest('Б1', 'E7', 89.73)),
                meeting('c', '2026-10-16', 'existing_buyer', interest('Б1', 'E7', 85.19)),
                meeting('d', '2026-10-17', null, interest('Б2', 'A', 57.87)),
                meeting('e', '2026-10-18', 'new_customer', []),
                meeting('f', '2026-10-08', 'new_customer', interest('Б2', 'X', 60)),
                meeting('g', '2026-10-21', 'new_customer', interest('Б2', 'A', 57.87)),
            ],
        });
        expect(report.range).toEqual({ from: '2026-10-14', to: '2026-10-20' });
        expect(report.weeks.map(week => week.total)).toEqual([0, 0, 1, 5]);
        expect(report.weeks[3]).toMatchObject({
            withoutInterest: 1,
            byModel: [{ key: 'Б1|E7', label: 'Б1 E7 · 89.73 м² · 3 өрөө', count: 3 }, { key: 'Б2|A', label: 'Б2 A · 57.87 м² · 2 өрөө', count: 1 }],
        });
        expect(report.weeks[2].byModel).toEqual([{ key: 'Б2|X', label: 'Б2 X · 60 м²', count: 1 }]);
        expect(report.notes).toEqual(['1 уулзалтад сонирхсон загвар бүртгэгдээгүй («Сонголтгүй»).', '2 шинэ уулзалтад «Сэжим» сонгоогүй.']);
    });

    it('counts this week\'s new meetings by «Сэжим» and keeps unselected ones as unknown', () => {
        const meetings = [
            meeting('a', '2026-10-14', 'new_customer'), meeting('b', '2026-10-15', 'new_customer'), meeting('c', '2026-10-16', 'new_customer'),
            meeting('d', '2026-10-17', 'new_customer'), meeting('e', '2026-10-17', 'repeat_customer'), meeting('f', '2026-10-10', 'new_customer'),
        ];
        const byViewing = new Map<string, string | null>([['a', 'Ойрхон амьдардаг'], ['b', 'Ойрхон амьдардаг'], ['c', 'Facebook'], ['d', null], ['e', 'Facebook'], ['f', 'Facebook']]);
        const report = buildMeetingDetails({ meetingDate: '2026-10-21', units, meetings, referrals: { available: true, byViewing } });
        expect(report.referral).toEqual({ rows: [{ label: 'Ойрхон амьдардаг', count: 2 }, { label: 'Facebook', count: 1 }], unknown: 1, total: 4, available: true });

        const missing = buildMeetingDetails({ meetingDate: '2026-10-21', units, meetings, referrals: { available: false, byViewing } });
        expect(missing.referral).toEqual({ rows: [], unknown: 4, total: 4, available: false });
        expect(missing.notes.join(' ')).toContain('хараахан нэмэгдээгүй');
    });
});
