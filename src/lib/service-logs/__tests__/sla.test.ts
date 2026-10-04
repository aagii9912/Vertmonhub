import { describe, expect, it } from 'vitest';
import { emptyTally, isOpenOverdue, slaDeadline, slaOutcome, slaState, tallyServiceLog, toResolutionSummary, type SlaLog } from '../sla';
import { OPEN_SERVICE_STATUSES, SERVICE_LOG_STATUSES, SERVICE_LOG_TYPES, isClosedServiceStatus, serviceLogTypeLabel } from '../labels';

const log = (values: Partial<SlaLog>): SlaLog => ({ priority: 'urgent', status: 'open', created_at: '2026-10-01T00:00:00Z', resolved_at: null, ...values });
const now = new Date('2026-10-10T00:00:00Z');

/** Нэг хугацааны [start, end) дүн — тайлангийн builder-тэй ижил tallyServiceLog-оор. */
function summarize(logs: SlaLog[], range: { start: Date; end: Date }) {
    const tally = emptyTally();
    const inRange = (at: Date) => at.getTime() >= range.start.getTime() && at.getTime() < range.end.getTime() ? 'range' : null;
    for (const entry of logs) tallyServiceLog(entry, now, inRange, () => tally);
    return toResolutionSummary(tally);
}

describe('service log SLA', () => {
    it('targets 24/48/120/240 hours by priority (unknown = medium)', () => {
        expect(['urgent', 'high', 'medium', 'low', 'weird'].map(priority => slaDeadline(log({ priority })).toISOString())).toEqual([
            '2026-10-02T00:00:00.000Z', '2026-10-03T00:00:00.000Z', '2026-10-06T00:00:00.000Z', '2026-10-11T00:00:00.000Z', '2026-10-06T00:00:00.000Z',
        ]);
    });

    it('decides on time when resolved by the deadline and late at the deadline otherwise', () => {
        expect(slaOutcome(log({ status: 'resolved', resolved_at: '2026-10-01T20:00:00Z' }), now)).toEqual({ at: new Date('2026-10-01T20:00:00Z'), met: true });
        expect(slaOutcome(log({ status: 'closed', resolved_at: '2026-10-05T00:00:00Z' }), now)).toEqual({ at: new Date('2026-10-02T00:00:00Z'), met: false });
        expect(slaOutcome(log({}), now)).toEqual({ at: new Date('2026-10-02T00:00:00Z'), met: false });
        // Хугацаа нь болоогүй нээлттэй, мөн resolved_at-гүй хаагдсан хуучин мөр — тооцохгүй.
        expect(slaOutcome(log({ priority: 'low', created_at: '2026-10-09T00:00:00Z' }), now)).toBeNull();
        expect(slaOutcome(log({ status: 'closed' }), now)).toBeNull();
        // Дахин нээгдсэн хуучин resolved_at-ийг шийдвэрлэлт гэж үзэхгүй.
        expect(slaOutcome(log({ status: 'in_progress', resolved_at: '2026-10-01T02:00:00Z' }), now)).toMatchObject({ met: false });
    });

    it('summarizes a period without counting undecided requests as zero', () => {
        const range = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-08T00:00:00Z') };
        const summary = summarize([
            log({ status: 'resolved', resolved_at: '2026-10-01T12:00:00Z' }),
            log({ priority: 'high', status: 'closed', resolved_at: '2026-10-04T00:00:00Z' }),
            log({ priority: 'low', created_at: '2026-10-07T00:00:00Z' }),
        ], range);
        expect(summary).toEqual({ received: 3, resolved: 2, slaTotal: 2, slaMet: 1, onTimePct: 50, avgResolutionHours: 42 });
        expect(summarize([log({ priority: 'low', created_at: '2026-10-07T00:00:00Z' })], range)).toMatchObject({ slaTotal: 0, onTimePct: null, avgResolutionHours: null });
    });

    it('marks open overdue requests and remaining hours for the list badge', () => {
        expect(isOpenOverdue(log({}), now)).toBe(true);
        expect(isOpenOverdue(log({ status: 'resolved', resolved_at: '2026-10-05T00:00:00Z' }), now)).toBe(false);
        expect(slaState(log({}), now)).toEqual({ kind: 'overdue' });
        expect(slaState(log({ priority: 'low', created_at: '2026-10-09T00:00:00Z' }), now)).toEqual({ kind: 'open', hoursLeft: 216, warn: false });
        expect(slaState(log({ status: 'closed' }), now)).toBeNull();
    });

    it('labels every database type and splits statuses into open and closed', () => {
        expect(SERVICE_LOG_TYPES.map(serviceLogTypeLabel)).toEqual(['Лавлагаа', 'Гомдол', 'Санал', 'Засвар', 'Хүлээлцэх', 'Төлбөр', 'Бусад']);
        expect(OPEN_SERVICE_STATUSES).toEqual(['open', 'in_progress']);
        expect(SERVICE_LOG_STATUSES.filter(isClosedServiceStatus)).toEqual(['resolved', 'closed']);
        expect([null, undefined, '', 'done'].some(isClosedServiceStatus)).toBe(false);
    });
});
