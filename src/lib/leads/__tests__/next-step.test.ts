import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeNextStep, followupAtDays } from '../next-step';

describe('describeNextStep (Ulaanbaatar calendar on a UTC server)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    // 2026-10-06 09:00 УБ.
    const now = new Date('2026-10-06T01:00:00Z');

    it('is overdue as soon as the planned time passes, like the work queues', () => {
        const step = describeNextStep({ status: 'contacted', next_followup_at: '2026-10-06T00:30:00Z' }, now);
        expect(step).toMatchObject({ kind: 'followup', action: 'Залгах', overdue: true, overdueDays: 0, when: 'Өнөөдөр 08:30 · хоцорсон' });
    });

    it('counts overdue days by Ulaanbaatar dates', () => {
        // 10-р сарын 4, 23:30 УБ — хоёр хуанлийн өдрийн өмнө.
        expect(describeNextStep({ status: 'offered', next_followup_at: '2026-10-04T15:30:00Z' }, now))
            .toMatchObject({ overdue: true, overdueDays: 2, when: '2 өдөр хоцорсон' });
    });

    it('names today, tomorrow and later days', () => {
        expect(describeNextStep({ status: 'new', next_followup_at: '2026-10-06T06:00:00Z' }, now).when).toBe('Өнөөдөр 14:00');
        // 10-р сарын 7, 00:30 УБ = 10-р сарын 6, 16:30 UTC — УБ-ээр маргааш.
        expect(describeNextStep({ status: 'new', next_followup_at: '2026-10-06T16:30:00Z' }, now).when).toBe('Маргааш 00:30');
        expect(describeNextStep({ status: 'new', next_followup_at: '2026-10-09T02:00:00Z' }, now).when).toBe('10/09 10:00');
    });

    it('uses the meeting time when a meeting is the next step', () => {
        expect(describeNextStep({ status: 'viewing_scheduled', next_followup_at: null, viewing_scheduled_at: '2026-10-06T06:00:00Z' }, now))
            .toMatchObject({ kind: 'viewing', action: 'Уулзалт', overdue: false, when: 'Өнөөдөр 14:00' });
        // Уулзалтын цаг нь зөвхөн «Уулзалт товлосон» төлөвт алхам болно.
        expect(describeNextStep({ status: 'contacted', viewing_scheduled_at: '2026-10-06T06:00:00Z' }, now).kind).toBe('none');
    });

    it('suggests an action when nothing is planned and stays quiet for closed leads', () => {
        expect(describeNextStep({ status: 'new' }, now)).toMatchObject({ kind: 'none', action: 'Залгах', when: 'Товлоогүй' });
        expect(describeNextStep({ status: 'negotiating' }, now).action).toBe('Хэлэлцээ үргэлжлүүлэх');
        expect(describeNextStep({ status: 'closed_won', next_followup_at: '2026-10-01T00:00:00Z' }, now))
            .toMatchObject({ kind: 'closed', action: 'Гэрээтэй', overdue: false });
    });
});

describe('followupAtDays', () => {
    it('plans 10:00 Ulaanbaatar time on the chosen day', () => {
        // 2026-10-06 23:30 УБ: «Маргааш» нь УБ-ийн 10-р сарын 7.
        expect(followupAtDays(1, new Date('2026-10-06T15:30:00Z'))).toBe('2026-10-07T02:00:00.000Z');
        expect(followupAtDays(7, new Date('2026-10-06T01:00:00Z'))).toBe('2026-10-13T02:00:00.000Z');
    });
});
