import { describe, expect, it } from 'vitest';
import { getLeadWorkQueues, isLeadWorkQueue } from '../work-queue';

const now = new Date('2026-09-13T06:00:00Z');
describe('lead work queues', () => {
    it('surfaces unowned, uncontacted leads with no next step together', () => {
        expect(getLeadWorkQueues({ status: 'new' }, now)).toEqual(['unassigned', 'uncontacted', 'no_followup']);
    });
    it('excludes closed leads even when their old follow-up is overdue', () => {
        expect(getLeadWorkQueues({ status: 'closed_won', next_followup_at: '2020-01-01' }, now)).toEqual([]);
        expect(getLeadWorkQueues({ status: 'closed_lost' }, now)).toEqual([]);
    });
    it('treats a scheduled viewing as a next step and flags it when overdue', () => {
        const lead = { status: 'viewing_scheduled', sales_manager_name: 'Менежер', last_contact_at: '2026-09-12', viewing_scheduled_at: '2026-09-13T07:00:00Z' };
        expect(getLeadWorkQueues(lead, now)).toEqual([]);
        expect(getLeadWorkQueues(lead, new Date('2026-09-13T08:00:00Z'))).toEqual(['overdue']);
    });
    it('uses explicit follow-up before viewing date and flags immediately after deadline', () => {
        const lead = { status: 'viewing_scheduled', sales_manager_name: 'Менежер', last_contact_at: '2026-09-12', viewing_scheduled_at: '2026-09-14', next_followup_at: '2026-09-13T05:59:59Z' };
        expect(getLeadWorkQueues(lead, now)).toEqual(['overdue']);
        expect(isLeadWorkQueue('arbitrary.filter')).toBe(false);
    });
});
