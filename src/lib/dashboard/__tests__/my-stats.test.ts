import { describe, it, expect } from 'vitest';
import {
    groupLeadsByStatus,
    countActiveLeads,
    countLeadsCreatedSince,
    countViewingsBetween,
    buildTaskList,
    countTasks,
    pickTasks,
    type DashTask,
    type LeadLite,
    type ViewingLite,
} from '../my-stats';
import { ANONYMOUS_LEAD_LABEL } from '@/lib/leads/labels';

// Тогтмол «одоо»: 2026-07-07 14:00 (локал цаг)
const NOW = new Date(2026, 6, 7, 14, 0, 0);

function lead(overrides: Partial<LeadLite>): LeadLite {
    return { id: 'l1', status: 'new', ...overrides };
}

function viewing(overrides: Partial<ViewingLite>): ViewingLite {
    return { id: 'v1', scheduled_at: new Date(2026, 6, 7, 10, 0).toISOString(), status: 'scheduled', ...overrides };
}

describe('groupLeadsByStatus', () => {
    it('статус бүрээр тоолно', () => {
        const out = groupLeadsByStatus([
            lead({ id: '1', status: 'new' }),
            lead({ id: '2', status: 'new' }),
            lead({ id: '3', status: 'contacted' }),
            lead({ id: '4', status: 'closed_won' }),
        ]);
        expect(out).toEqual({ new: 2, contacted: 1, closed_won: 1 });
    });

    it('статусгүй мөрийг new гэж үзнэ', () => {
        expect(groupLeadsByStatus([lead({ id: '1', status: '' })])).toEqual({ new: 1 });
    });
});

describe('countActiveLeads', () => {
    it('closed_won/closed_lost-ыг хасна', () => {
        const count = countActiveLeads([
            lead({ id: '1', status: 'new' }),
            lead({ id: '2', status: 'negotiating' }),
            lead({ id: '3', status: 'closed_won' }),
            lead({ id: '4', status: 'closed_lost' }),
        ]);
        expect(count).toBe(2);
    });
});

describe('countLeadsCreatedSince', () => {
    it('өгсөн хугацаанаас хойш үүссэнийг тоолно', () => {
        const since = new Date(2026, 6, 7, 0, 0);
        const count = countLeadsCreatedSince(
            [
                lead({ id: '1', created_at: new Date(2026, 6, 7, 9, 0).toISOString() }),
                lead({ id: '2', created_at: new Date(2026, 6, 5, 9, 0).toISOString() }),
                lead({ id: '3', created_at: null }),
            ],
            since,
        );
        expect(count).toBe(1);
    });
});

describe('countViewingsBetween', () => {
    it('[from, to) цонхонд тоолж, цуцлагдсаныг хасна', () => {
        const from = new Date(2026, 6, 7, 0, 0);
        const to = new Date(2026, 6, 8, 0, 0);
        const count = countViewingsBetween(
            [
                viewing({ id: '1', scheduled_at: new Date(2026, 6, 7, 10, 0).toISOString() }),
                viewing({ id: '2', scheduled_at: new Date(2026, 6, 7, 23, 59).toISOString(), status: 'completed' }),
                viewing({ id: '3', scheduled_at: new Date(2026, 6, 7, 12, 0).toISOString(), status: 'cancelled' }),
                viewing({ id: '4', scheduled_at: new Date(2026, 6, 8, 0, 0).toISOString() }),
                viewing({ id: '5', scheduled_at: new Date(2026, 6, 6, 10, 0).toISOString() }),
            ],
            from,
            to,
        );
        expect(count).toBe(2);
    });
});

describe('buildTaskList', () => {
    it('өнөөдрийн follow-up + өнөөдрийн уулзалтыг dueAt-аар эрэмбэлнэ', () => {
        const tasks = buildTaskList(
            [
                lead({
                    id: 'f1',
                    customer_name: 'Батаа',
                    next_followup_at: new Date(2026, 6, 7, 16, 0).toISOString(),
                }),
            ],
            [
                viewing({
                    id: 'v1',
                    customer_name: 'Сараа',
                    scheduled_at: new Date(2026, 6, 7, 9, 0).toISOString(),
                }),
            ],
            NOW,
        );
        expect(tasks.map((t) => t.id)).toEqual(['v1', 'f1']);
        expect(tasks[0].type).toBe('viewing');
        expect(tasks[1].type).toBe('followup');
    });

    it('өчигдрийн follow-up хоцорсон гэж тэмдэглэгдэнэ, өнөөдрийнх үгүй', () => {
        const tasks = buildTaskList(
            [
                lead({ id: 'late', next_followup_at: new Date(2026, 6, 5, 10, 0).toISOString() }),
                lead({ id: 'today', next_followup_at: new Date(2026, 6, 7, 18, 0).toISOString() }),
            ],
            [],
            NOW,
        );
        const late = tasks.find((t) => t.id === 'late');
        const today = tasks.find((t) => t.id === 'today');
        expect(late?.overdue).toBe(true);
        expect(today?.overdue).toBe(false);
    });

    it('өнөөдөр (УБ) дуудлага бүртгэгдсэн follow-up-ийг тэмдэглэнэ (давхар дуудлага нэмэхгүй)', () => {
        const tasks = buildTaskList(
            [
                lead({ id: 'called', next_followup_at: new Date(2026, 6, 7, 10, 0).toISOString(), last_contact_at: new Date(2026, 6, 7, 0, 30).toISOString() }),
                lead({ id: 'yesterday', next_followup_at: new Date(2026, 6, 7, 10, 0).toISOString(), last_contact_at: new Date(2026, 6, 6, 23, 30).toISOString() }),
                lead({ id: 'never', next_followup_at: new Date(2026, 6, 7, 10, 0).toISOString() }),
            ],
            [],
            NOW,
        );
        expect(Object.fromEntries(tasks.map((t) => [t.id, t.contactedToday]))).toEqual({ called: true, yesterday: false, never: false });
    });

    it('маргаашийн follow-up болон хаагдсан лид орохгүй', () => {
        const tasks = buildTaskList(
            [
                lead({ id: 'tomorrow', next_followup_at: new Date(2026, 6, 8, 10, 0).toISOString() }),
                lead({
                    id: 'won',
                    status: 'closed_won',
                    next_followup_at: new Date(2026, 6, 7, 10, 0).toISOString(),
                }),
                lead({ id: 'none', next_followup_at: null }),
            ],
            [],
            NOW,
        );
        expect(tasks).toHaveLength(0);
    });

    it('өнөөдөр бус, цуцлагдсан, болсон уулзалт орохгүй; цаг нь өнгөрсөн нь хоцорсон', () => {
        const tasks = buildTaskList(
            [],
            [
                viewing({ id: 'past-hour', scheduled_at: new Date(2026, 6, 7, 9, 0).toISOString() }),
                viewing({ id: 'future-hour', scheduled_at: new Date(2026, 6, 7, 17, 0).toISOString() }),
                viewing({ id: 'tomorrow', scheduled_at: new Date(2026, 6, 8, 9, 0).toISOString() }),
                viewing({ id: 'cancelled', status: 'cancelled', scheduled_at: new Date(2026, 6, 7, 11, 0).toISOString() }),
                viewing({ id: 'completed', status: 'completed', scheduled_at: new Date(2026, 6, 7, 11, 0).toISOString() }),
            ],
            NOW,
        );
        expect(tasks.map((t) => t.id)).toEqual(['past-hour', 'future-hour']);
        expect(tasks.find((t) => t.id === 'past-hour')?.overdue).toBe(true);
        expect(tasks.find((t) => t.id === 'future-hour')?.overdue).toBe(false);
    });

    it('нэргүй лидийн уулзалтад шошго, лидгүй уулзалтад ерөнхий нэр харуулна', () => {
        const tasks = buildTaskList(
            [],
            [
                viewing({ id: 'anon', customer_name: null, anonymous_lead: true }),
                viewing({ id: 'anon-room', customer_name: null, anonymous_lead: true, property_name: 'A-101' }),
                viewing({ id: 'no-lead', customer_name: null }),
            ],
            NOW,
        );
        const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
        expect(byId.anon).toMatchObject({ title: ANONYMOUS_LEAD_LABEL, subtitle: `Уулзалт · ${ANONYMOUS_LEAD_LABEL}` });
        expect(byId['anon-room']).toMatchObject({ title: 'A-101', subtitle: `Уулзалт · ${ANONYMOUS_LEAD_LABEL}` });
        expect(byId['no-lead']).toMatchObject({ title: 'Үзүүлэлт', subtitle: 'Уулзалт' });
    });

    it('хувийн ажлууд (user_tasks) нэгтгэгдэж, дараалалдаа орно', () => {
        const tasks = buildTaskList(
            [lead({ id: 'f1', next_followup_at: new Date(2026, 6, 7, 16, 0).toISOString() })],
            [],
            NOW,
            [
                { id: 'p-today', title: 'Танилцуулга бэлтгэх', due_at: new Date(2026, 6, 7, 11, 0).toISOString() },
                { id: 'p-late', title: 'Гэрээ хэвлүүлэх', due_at: new Date(2026, 6, 6, 10, 0).toISOString(), note: 'МG-101' },
                { id: 'p-tomorrow', title: 'Маргааш', due_at: new Date(2026, 6, 8, 10, 0).toISOString() },
                { id: 'p-nodue', title: 'Хугацаагүй', due_at: null },
            ],
        );
        expect(tasks.map((t) => t.id)).toEqual(['p-late', 'p-today', 'f1']);
        const late = tasks.find((t) => t.id === 'p-late');
        expect(late?.type).toBe('personal');
        expect(late?.overdue).toBe(true);
        expect(late?.subtitle).toContain('МG-101');
        expect(tasks.find((t) => t.id === 'p-today')?.overdue).toBe(false);
        expect(tasks.find((t) => t.id === 'p-today')?.href).toBe('/dashboard/tasks');
    });
});

describe('task links and trimming', () => {
    it('opens the lead card from a follow-up and from a meeting with a lead', () => {
        const tasks = buildTaskList(
            [lead({ id: 'f1', status: 'contacted', next_followup_at: new Date(2026, 6, 7, 9, 0).toISOString() })],
            [viewing({ id: 'v1', scheduled_at: new Date(2026, 6, 7, 16, 0).toISOString(), lead_id: 'l9' }), viewing({ id: 'v2', scheduled_at: new Date(2026, 6, 7, 17, 0).toISOString() })],
            NOW,
        );
        expect(tasks.find((t) => t.id === 'f1')).toMatchObject({ href: '/dashboard/leads?lead=f1', leadId: 'f1' });
        expect(tasks.find((t) => t.id === 'v1')).toMatchObject({ href: '/dashboard/leads?lead=l9', leadId: 'l9' });
        expect(tasks.find((t) => t.id === 'v2')).toMatchObject({ href: '/dashboard/viewings', leadId: null });
    });

    it('never drops a meeting when the list is trimmed and counts every task', () => {
        const at = (h: number) => new Date(2026, 6, 7, h, 0).toISOString();
        const followups: DashTask[] = Array.from({ length: 5 }, (_, i) => ({ type: 'followup', id: `f${i}`, title: '', subtitle: '', dueAt: at(8 + i), overdue: i < 2, href: '' }));
        const meeting: DashTask = { type: 'viewing', id: 'v1', title: '', subtitle: '', dueAt: at(18), overdue: false, href: '' };
        const all = [...followups, meeting];
        expect(pickTasks(all, 3).map((t) => t.id)).toEqual(['f0', 'f1', 'v1']);
        expect(countTasks(all)).toEqual({ all: 6, followup: 5, viewing: 1, personal: 0, overdue: 2 });
    });
});
