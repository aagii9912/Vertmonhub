import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    buildLeadTimeline, compactLeadTimeline, TIMELINE_CONFLICT_WINDOW_DAYS,
    type BuildLeadTimelineInput, type TimelineActivityInput,
} from '../timeline';

// Серверийн (Vercel) бүс UTC — огнооны хил, эрэмбэ УБ-ийн бүсээс үл хамаарах ёстой.
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = originalTz; });

const roster = [
    { name: 'Манда', user_id: 'u-manda', is_active: true },
    { name: 'Сараа', user_id: 'u-saraa', is_active: true },
    { name: 'Дорж', user_id: null, is_active: false },
];
const lead = { id: 'lead-1', created_at: '2026-09-01T02:00:00Z', source: 'facebook', sales_manager_name: 'Манда' };

let seq = 0;
function act(type: string, at: string, by: string | null, extra: Partial<TimelineActivityInput> = {}): TimelineActivityInput {
    seq += 1;
    return { id: `a${String(seq).padStart(3, '0')}`, type, content: extra.content ?? `${type} ${seq}`, meta: extra.meta ?? {}, created_by: by, created_by_name: extra.created_by_name ?? null, created_at: at, ...extra };
}
const build = (input: Partial<BuildLeadTimelineInput>) => buildLeadTimeline({ lead, activities: [], roster, ...input });
const kinds = (t: ReturnType<typeof build>) => t.conflicts.map((c) => c.kind);

describe('buildLeadTimeline actors', () => {
    it('attributes by account link before the stored name and keeps admins out of the manager summary', () => {
        const t = build({
            activities: [
                act('call', '2026-09-02T02:00:00Z', 'u-manda', { created_by_name: 'manda@vertmon.mn' }),
                act('status', '2026-09-02T03:00:00Z', 'u-admin', { created_by_name: 'Админ Болд', content: 'Шинэ → Холбогдсон' }),
                act('call', '2026-09-02T04:00:00Z', 'u-admin', { created_by_name: 'Админ Болд' }),
                act('note', '2026-09-02T05:00:00Z', 'u-profile', { created_by_name: null }),
            ],
            profiles: [{ id: 'u-profile', full_name: 'Профайл Нэр' }],
        });
        const byId = new Map(t.events.map((e) => [e.title, e]));
        expect(t.events.find((e) => e.kind === 'call' && e.manager)).toMatchObject({ actor: 'Манда', manager: 'Манда' });
        expect(byId.get('Статус: Шинэ → Холбогдсон')).toMatchObject({ actor: 'Админ Болд', manager: null });
        expect(t.events.find((e) => e.kind === 'note')).toMatchObject({ actor: 'Профайл Нэр', manager: null });
        expect(t.managers.map((m) => [m.name, m.calls])).toEqual([['Манда', 1]]);
        expect(t.conflicts).toEqual([]);
    });

    it('never takes a linked manager by name from another account', () => {
        const t = build({ activities: [act('call', '2026-09-02T02:00:00Z', 'u-other', { created_by_name: 'Сараа' })] });
        expect(t.events[0]).toMatchObject({ actor: 'Сараа', manager: null });
        // Дансгүй (legacy) менежерийг нэрээр нь авна.
        const legacy = build({ activities: [act('call', '2026-09-02T02:00:00Z', null, { created_by_name: 'Дорж' })] });
        expect(legacy.managers.find((m) => m.name === 'Дорж')).toMatchObject({ calls: 1, isActive: false, isOwner: false });
    });
});

describe('buildLeadTimeline owners', () => {
    it('reconstructs owners from assignment history (initial from, reassignment, project change to nobody, claim)', () => {
        const t = build({
            lead: { ...lead, sales_manager_name: 'Сараа' },
            activities: [
                act('call', '2026-09-02T02:00:00Z', 'u-manda'),
                act('manager', '2026-09-03T02:00:00Z', 'u-admin', { created_by_name: 'Админ', meta: { from: 'Манда', to: null } }),
                act('manager', '2026-09-04T02:00:00Z', 'u-saraa', { meta: { action: 'claim', to: 'Сараа' } }),
                act('call', '2026-09-30T02:00:00Z', 'u-saraa'),
            ],
        });
        const asc = [...t.events].reverse();
        expect(asc.map((e) => [e.kind, e.owner])).toEqual([
            ['created', 'Манда'], ['call', 'Манда'], ['assigned', null], ['claimed', 'Сараа'], ['call', 'Сараа'],
        ]);
        expect(asc[0].detail).toBe('Facebook · Хариуцагч: Манда');
        expect(asc[2]).toMatchObject({ title: 'Хариуцагч: Манда → —', ownerChange: { from: 'Манда', to: null } });
        expect(asc.some((e) => e.offOwner)).toBe(false);
        // Хариуцагч өөрчлөгдсөн нь 14 хоногоос хол — зөрчил биш.
        expect(t.conflicts).toEqual([]);
        expect(t.managers.map((m) => [m.name, m.isOwner])).toEqual([['Сараа', true], ['Манда', false]]);
    });

    it('uses the current owner when the lead was never reassigned', () => {
        const t = build({ activities: [act('call', '2026-09-02T02:00:00Z', 'u-manda')] });
        expect(t.events.map((e) => e.owner)).toEqual(['Манда', 'Манда']);
        expect(t.owner).toBe('Манда');
    });
});

describe('buildLeadTimeline meetings and contracts', () => {
    it('shows one meeting per viewing history entry and adds legacy viewings without history', () => {
        const t = build({
            activities: [
                act('meeting', '2026-09-05T02:00:00Z', 'u-admin', { id: 'v1-booked', created_by_name: 'Ресепшн', content: 'Уулзалт товлов · A блок', meta: { viewing_id: 'v1', scheduled_at: '2026-09-06T02:00:00Z', walk_in: false } }),
                act('meeting', '2026-09-06T03:00:00Z', 'u-manda', { id: 'v1-held', content: 'Уулзалт болов', meta: { viewing_id: 'v1', status: 'completed', scheduled_at: '2026-09-06T02:00:00Z' } }),
                // Үүсгэх үйлдэл (ViewingService / create_scoped_sales_viewing) төлөвгүй meta-тай бичигддэг.
                act('meeting', '2026-09-06T05:00:00Z', 'u-manda', { id: 'v3-booked', content: 'Уулзалт товлов', meta: { viewing_id: 'v3', scheduled_at: '2026-09-07T02:00:00Z', walk_in: false } }),
                act('meeting', '2026-09-07T03:00:00Z', 'u-manda', { id: 'v3-no-show', content: 'Уулзалтад ирээгүй', meta: { viewing_id: 'v3', status: 'no_show' } }),
            ],
            viewings: [
                { id: 'v1', scheduled_at: '2026-09-06T02:00:00Z', status: 'completed', created_at: '2026-09-05T02:00:00Z', completed_at: '2026-09-06T03:00:00Z', sales_manager_name: 'Манда' },
                { id: 'v2', scheduled_at: '2026-08-20T02:00:00Z', status: 'completed', created_at: '2026-08-19T02:00:00Z', completed_at: '2026-08-20T03:00:00Z', sales_manager_name: 'Сараа' },
                { id: 'v3', scheduled_at: '2026-09-07T02:00:00Z', status: 'no_show', created_at: '2026-09-06T05:00:00Z', completed_at: null, sales_manager_name: 'Манда' },
            ],
        });
        const meetings = t.events.filter((e) => e.kind === 'meeting');
        expect(meetings.map((e) => [e.id, e.actor, e.manager, e.contact, e.meetingStatus, e.managerInferred])).toEqual([
            ['v3-no-show', 'Манда', 'Манда', false, 'no_show', false],
            // Өөрөө товлосон нь холбоо барилт (харилцагчтай цаг тохирсон), гэхдээ болоогүй тул уулзалт биш.
            ['v3-booked', 'Манда', 'Манда', true, 'no_show', false],
            ['v1-held', 'Манда', 'Манда', true, 'completed', false],
            // Ресепшн товлосон хүчинтэй уулзалт уулзалтын менежерт (тэр үеийн хариуцагч) тооцогдоно.
            ['v1-booked', 'Ресепшн', 'Манда', true, 'completed', true],
            ['viewing:v2', 'Сараа', 'Сараа', true, 'completed', true],
        ]);
        // Түүхгүй уулзалт тухайн үеийн хариуцагчаар тамгалагддаг тул «хариуцагч биш» биш.
        expect(meetings.find((e) => e.id === 'viewing:v2')).toMatchObject({ title: 'Уулзалт болов', offOwner: false, at: '2026-08-20T03:00:00Z' });
        // Ирээгүй v3 уулзалтын тоонд орохгүй; v1-ийн товлох + болсон нь нэг уулзалт.
        expect(t.managers.find((m) => m.name === 'Манда')).toMatchObject({ meetings: 1, firstAt: '2026-09-05T02:00:00Z', lastAt: '2026-09-06T05:00:00Z' });
        expect(t.managers.find((m) => m.name === 'Сараа')).toMatchObject({ meetings: 1 });
    });

    it('drops cancelled and deleted meetings from the meeting count and deleted ones from contacts', () => {
        const t = build({
            activities: [
                act('meeting', '2026-09-02T02:00:00Z', 'u-manda', { id: 'cancelled-booked', meta: { viewing_id: 'v-cancelled', scheduled_at: '2026-09-03T02:00:00Z', walk_in: false } }),
                act('meeting', '2026-09-02T04:00:00Z', 'u-manda', { id: 'cancelled', content: 'Уулзалт цуцлагдав', meta: { viewing_id: 'v-cancelled', status: 'cancelled' } }),
                // Устгасан уулзалт (жагсаалтад байхгүй) — алдаатай бүртгэл.
                act('meeting', '2026-09-04T02:00:00Z', 'u-saraa', { id: 'deleted-booked', content: 'Уулзалт товлов', meta: { viewing_id: 'v-deleted', scheduled_at: '2026-09-05T02:00:00Z', walk_in: false } }),
            ],
            viewings: [{ id: 'v-cancelled', scheduled_at: '2026-09-03T02:00:00Z', status: 'cancelled', created_at: '2026-09-02T02:00:00Z', sales_manager_name: 'Манда' }],
        });
        expect(t.managers.map((m) => [m.name, m.meetings, m.firstAt])).toEqual([['Манда', 0, '2026-09-02T02:00:00Z'], ['Сараа', 0, null]]);
        expect(t.events.find((e) => e.id === 'deleted-booked')).toMatchObject({ contact: false, offOwner: false, meetingStatus: 'deleted', detail: 'Уулзалт устгагдсан' });
        expect(t.conflicts).toEqual([]);

        // Уулзалт уншигдаагүй бол устгасан гэж таамаглахгүй — үйлдлийн өөрийн төлөвөөр.
        const unknown = build({ activities: [act('meeting', '2026-09-04T02:00:00Z', 'u-manda', { meta: { viewing_id: 'v-x', walk_in: false } })], viewings: [], partial: ['viewings'] });
        expect(unknown.events[0]).toMatchObject({ contact: true, meetingStatus: null });
        expect(unknown.managers[0]).toMatchObject({ name: 'Манда', meetings: 1 });
    });

    it('never blames the viewing manager for an admin action after the lead was reassigned', () => {
        const t = build({
            lead: { ...lead, sales_manager_name: 'Сараа' },
            activities: [
                act('meeting', '2026-09-02T02:00:00Z', 'u-manda', { id: 'booked', meta: { viewing_id: 'v1', scheduled_at: '2026-09-08T02:00:00Z', walk_in: false } }),
                act('manager', '2026-09-03T02:00:00Z', 'u-admin', { created_by_name: 'Админ', meta: { from: 'Манда', to: 'Сараа' } }),
                act('meeting', '2026-09-08T03:00:00Z', 'u-admin', { id: 'held', created_by_name: 'Админ', content: 'Уулзалт болов', meta: { viewing_id: 'v1', status: 'completed' } }),
            ],
            viewings: [{ id: 'v1', scheduled_at: '2026-09-08T02:00:00Z', status: 'completed', created_at: '2026-09-02T02:00:00Z', completed_at: '2026-09-08T03:00:00Z', sales_manager_name: 'Манда' }],
        });
        expect(t.events.find((e) => e.id === 'held')).toMatchObject({ actor: 'Админ', manager: null, offOwner: false, managerInferred: false });
        expect(t.conflicts).toEqual([]);
        expect(t.managers.map((m) => [m.name, m.meetings, m.lastAt])).toEqual([['Сараа', 0, null], ['Манда', 1, '2026-09-02T02:00:00Z']]);
    });

    it('keeps meetings booked by reception for the owner out of the conflict checks', () => {
        const t = build({
            activities: [
                act('meeting', '2026-09-02T02:00:00Z', 'u-admin', { id: 'reception', created_by_name: 'Ресепшн', meta: { viewing_id: 'v1', scheduled_at: '2026-09-09T02:00:00Z', walk_in: false } }),
                act('call', '2026-09-03T02:00:00Z', 'u-saraa'),
            ],
            viewings: [{ id: 'v1', scheduled_at: '2026-09-09T02:00:00Z', status: 'scheduled', created_at: '2026-09-02T02:00:00Z', sales_manager_name: 'Манда' }],
        });
        expect(t.events.find((e) => e.id === 'reception')).toMatchObject({ manager: 'Манда', managerInferred: true, offOwner: false });
        // Сараа хариуцагч биш — тэмдэглэнэ; Манда өөрөө холбогдоогүй тул «зэрэг холбогдсон» биш.
        expect(kinds(t)).toEqual(['non_owner_contact']);
        expect(t.managers.find((m) => m.name === 'Манда')).toMatchObject({ meetings: 1 });
    });

    it('places date-only contracts at the Ulaanbaatar start of day and skips stub or cancelled contracts', () => {
        const t = build({
            contracts: [
                { id: 'c1', contract_number: 'MG-1', contract_status: 'active', contract_date: '2026-09-10', created_at: '2026-09-12T08:00:00Z', total_price: 450_000_000, unit_number: '1203', block_name: 'A', sales_manager: 'Манда' },
                { id: 'c2', contract_number: 'MG-2', contract_status: 'active', contract_date: '2026-09-11', created_at: '2026-09-10T17:30:00Z', total_price: 1, sales_manager: 'Манда' },
                { id: 'stub', contract_number: null, contract_status: 'active', contract_date: '2026-09-10', total_price: 0, sales_manager: 'Манда' },
                { id: 'c3', contract_number: 'MG-3', contract_status: 'cancelled', contract_date: '2026-09-10', total_price: 5, sales_manager: 'Манда' },
                // Буруу огноотой мөр алдаа шидэхгүй, огноо зохиохгүй.
                { id: 'c4', contract_number: 'MG-4', contract_status: 'closed', contract_date: 'n/a', created_at: 'n/a', total_price: 5, sales_manager: 'Манда' },
                { id: 'c5', contract_number: 'MG-5', contract_status: 'closed', contract_date: '2026-09-08T00:00:00', created_at: null, total_price: 5, sales_manager: 'Манда' },
            ],
        });
        const contracts = t.events.filter((e) => e.kind === 'contract');
        expect(contracts.map((e) => [e.id, e.at, e.dateOnly])).toEqual([
            // УБ-ийн 2026-09-11 01:30 = created_at → яг цаг.
            ['contract:c2', '2026-09-10T17:30:00Z', false],
            ['contract:c1', '2026-09-09T16:00:00.000Z', true],
            ['contract:c5', '2026-09-07T16:00:00.000Z', true],
        ]);
        expect(contracts[1]).toMatchObject({ title: 'Гэрээ MG-1', detail: 'A 1203 · 450,000,000₮', actor: 'Манда', contact: false });
    });
});

describe('buildLeadTimeline conflicts', () => {
    it('flags two managers contacting within the window but not a handoff outside it', () => {
        const day = 86_400_000;
        const start = Date.parse('2026-09-02T02:00:00Z');
        const at = (days: number) => new Date(start + days * day).toISOString();
        const inside = build({
            activities: [
                act('call', at(0), 'u-manda'),
                act('manager', at(1), 'u-admin', { created_by_name: 'Админ', meta: { from: 'Манда', to: 'Сараа' } }),
                act('call', at(TIMELINE_CONFLICT_WINDOW_DAYS), 'u-saraa'),
            ],
            lead: { ...lead, sales_manager_name: 'Сараа' },
        });
        expect(inside.conflicts).toEqual([expect.objectContaining({
            kind: 'parallel_managers', managers: ['Манда', 'Сараа'], message: '2 менежер 14 хоногийн дотор холбогдсон: Манда, Сараа',
        })]);
        const outside = build({
            activities: [
                act('call', at(0), 'u-manda'),
                act('manager', at(1), 'u-admin', { created_by_name: 'Админ', meta: { from: 'Манда', to: 'Сараа' } }),
                act('call', new Date(start + TIMELINE_CONFLICT_WINDOW_DAYS * day + 1).toISOString(), 'u-saraa'),
            ],
            lead: { ...lead, sales_manager_name: 'Сараа' },
        });
        expect(outside.conflicts).toEqual([]);
        // Тэмдэглэл холбоо барилт биш.
        const notes = build({ activities: [act('call', at(0), 'u-manda'), act('note', at(1), 'u-saraa')] });
        expect(notes.conflicts).toEqual([]);
    });

    it('flags contacts by a manager who is not the owner at that time', () => {
        const t = build({
            activities: [
                act('call', '2026-09-02T02:00:00Z', 'u-saraa'),
                act('quote', '2026-09-03T02:00:00Z', 'u-saraa', { meta: { amount: 400_000_000 } }),
                act('call', '2026-09-03T03:00:00Z', 'u-manda'),
            ],
        });
        expect(t.events.filter((e) => e.offOwner).map((e) => e.kind)).toEqual(['quote', 'call']);
        expect(kinds(t)).toEqual(['non_owner_contact', 'parallel_managers']);
        expect(t.conflicts[0]).toMatchObject({ managers: ['Сараа', 'Манда'], message: 'Сараа хариуцагч биш (хариуцагч: Манда) байхад 2 удаа холбогдсон' });
    });

    it('compares each manager’s latest quote per unit', () => {
        const t = build({
            activities: [
                act('quote', '2026-09-02T02:00:00Z', 'u-manda', { meta: { amount: 460_000_000, unit_label: 'A-1203' } }),
                act('quote', '2026-09-03T02:00:00Z', 'u-manda', { meta: { amount: 450_000_000, unit_label: 'a - 1203' } }),
                act('quote', '2026-09-20T02:00:00Z', 'u-saraa', { meta: { amount: 430_000_000, unit_label: ' A-1203' } }),
                act('quote', '2026-09-21T02:00:00Z', 'u-saraa', { meta: { amount: 300_000_000, unit_label: 'B-0501' } }),
                act('quote', '2026-09-22T02:00:00Z', 'u-admin', { created_by_name: 'Админ', meta: { amount: 1, unit_label: 'B-0501' } }),
            ],
        });
        const quote = t.conflicts.find((c) => c.kind === 'quote_mismatch');
        expect(t.conflicts.filter((c) => c.kind === 'quote_mismatch')).toHaveLength(1);
        expect(quote).toMatchObject({ managers: ['Манда', 'Сараа'], message: 'Үнийн санал зөрүүтэй (A-1203): Манда 450,000,000₮ · Сараа 430,000,000₮' });
        expect(t.managers.find((m) => m.name === 'Манда')).toMatchObject({ quotes: 2, lastQuote: { amount: 450_000_000, unitLabel: 'a - 1203' } });
        const same = build({
            activities: [
                act('quote', '2026-09-02T02:00:00Z', 'u-manda', { meta: { amount: 450_000_000 } }),
                act('quote', '2026-09-20T02:00:00Z', 'u-saraa', { meta: { amount: 450_000_000 } }),
            ],
        });
        expect(kinds(same)).not.toContain('quote_mismatch');
        const quoteEvent = same.events.find((e) => e.kind === 'quote');
        expect(quoteEvent).toMatchObject({ title: 'Үнийн санал · 450,000,000₮', amount: 450_000_000, contact: true });
    });

    it('raises a duplicate-phone conflict only for other managers’ leads', () => {
        const other = build({ duplicates: { count: 2, managers: ['Сараа'], masked: true, leads: [] } });
        expect(other.conflicts).toEqual([{ kind: 'duplicate_phone', managers: ['Сараа'], at: null, message: 'Энэ утсаар өөр 2 лид бүртгэлтэй (Сараа)' }]);
        expect(build({ duplicates: { count: 1, managers: ['Манда'], masked: false, leads: [] } }).conflicts).toEqual([]);
        expect(build({ duplicates: { count: 51, managers: ['Сараа'], masked: true, leads: [], truncated: true } }).conflicts[0].message)
            .toBe('Энэ утсаар өөр 51+ лид бүртгэлтэй (Сараа)');
    });
});

describe('compactLeadTimeline', () => {
    it('keeps the AI payload small and drops record ids', () => {
        const activities = Array.from({ length: 80 }, (_, i) => act(i % 2 ? 'call' : 'quote', new Date(Date.parse('2026-09-02T02:00:00Z') + i * 3_600_000).toISOString(), i % 3 ? 'u-manda' : 'u-saraa', {
            content: 'Урт тайлбар '.repeat(30), meta: i % 2 ? {} : { amount: 400_000_000 + i, unit_label: 'A-1203' },
        }));
        const compact = compactLeadTimeline(build({ activities }));
        expect(compact.recent_events).toHaveLength(12);
        expect(JSON.stringify(compact).length).toBeLessThan(3500);
        expect(JSON.stringify(compact)).not.toContain('"id"');
    });
});
