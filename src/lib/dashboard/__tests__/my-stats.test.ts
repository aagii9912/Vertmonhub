import { describe, it, expect } from 'vitest';
import {
    groupLeadsByStatus,
    countActiveLeads,
    countLeadsCreatedSince,
    countViewingsBetween,
    buildTaskList,
    type LeadLite,
    type ViewingLite,
} from '../my-stats';

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
