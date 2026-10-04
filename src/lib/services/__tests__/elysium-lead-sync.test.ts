import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventLeadRow } from '@/lib/leads/elysium';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    tables: {} as Record<string, Row[]>,
    /** Хүснэгт → унших/бичих алдаа. */
    fail: {} as Record<string, { code?: string; message: string }>,
    insertError: null as null | { code?: string; message: string },
    source: [] as EventLeadRow[],
    sourceError: null as Error | null,
    seq: 0,
}));

vi.mock('@/lib/leads/elysium-source', async (original) => ({
    ...(await original<typeof import('@/lib/leads/elysium-source')>()),
    fetchEventLeads: vi.fn(async (range: { since: string | null; until: string }) => {
        if (state.sourceError) throw state.sourceError;
        return state.source.filter((row) => Date.parse(row.created_at) <= Date.parse(range.until)
            && (!range.since || Date.parse(row.created_at) >= Date.parse(range.since)));
    }),
    countEventLeads: vi.fn(async () => state.source.length),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { fetchEventLeads } from '@/lib/leads/elysium-source';
import { ElysiumSourceError } from '@/lib/leads/elysium-source';
import {
    ELYSIUM_MAX_ROWS_PER_RUN, elysiumSyncStatus, ElysiumSyncError, elysiumSyncWindow,
    findImportedElysiumDuplicate, setElysiumSyncEnabled, syncElysiumLeads,
} from '../ElysiumLeadSync';

const SHOP = '20000000-0000-4000-8000-000000000001';
const PROJECT = '30000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-04T04:00:00.000Z');
const H = 60 * 60 * 1000;

const time = (value: unknown) => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : value);

/** PostgREST-ийн хэрэгтэй хэсгийг дуурайсан санах ойн DB. */
function query(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'upsert' = 'select';
    let payload: Row[] = [];
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let head = false;
    let limit: number | null = null;
    let range: [number, number] | null = null;
    const rows = () => (state.tables[table] ||= []);
    const run = async (mode: 'many' | 'maybe' | 'single') => {
        const failure = state.fail[table];
        if (failure) return { data: null, error: failure, count: null };
        if (op === 'insert') {
            if (table === 'leads' && state.insertError) return { data: null, error: state.insertError };
            const inserted: Row[] = payload.map((row) => ({ id: `${table}-${++state.seq}`, deleted_at: null, ...row }));
            for (const row of inserted) {
                if (table === 'leads' && row.client_request_id
                    && rows().some((lead) => lead.shop_id === row.shop_id && lead.client_request_id === row.client_request_id)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
            }
            rows().push(...inserted);
            return { data: mode === 'many' ? inserted : inserted[0], error: null };
        }
        if (op === 'upsert') {
            const keys = (upsertOptions.onConflict || 'id').split(',');
            const saved: Row[] = [];
            for (const row of payload) {
                const existing = rows().find((item) => keys.every((key) => item[key] === row[key]));
                if (existing && upsertOptions.ignoreDuplicates) continue;
                if (existing) Object.assign(existing, row);
                else rows().push({ enabled: false, ...row });
                saved.push(existing ?? rows()[rows().length - 1]);
            }
            return { data: mode === 'many' ? saved : saved[0] ?? null, error: null };
        }
        let found = rows().filter((row) => filters.every((filter) => filter(row)));
        if (head) return { data: null, error: null, count: found.length };
        if (range) found = found.slice(range[0], range[1] + 1);
        if (limit !== null) found = found.slice(0, limit);
        if (mode === 'many') return { data: found, error: null, count: found.length };
        if (mode === 'single' && found.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not single' } };
        return { data: found[0] ?? null, error: null };
    };
    const builder = {
        select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return builder; },
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return builder; },
        gte: (key: string, value: unknown) => { filters.push((row) => (time(row[key]) as number) >= (time(value) as number)); return builder; },
        lte: (key: string, value: unknown) => { filters.push((row) => (time(row[key]) as number) <= (time(value) as number)); return builder; },
        not: (key: string, operator: string, value: unknown) => {
            if (operator === 'is' && value === null) filters.push((row) => row[key] !== null && row[key] !== undefined);
            return builder;
        },
        order: () => builder,
        limit: (count: number) => { limit = count; return builder; },
        range: (from: number, to: number) => { range = [from, to]; return builder; },
        insert: (row: Row | Row[]) => { op = 'insert'; payload = Array.isArray(row) ? row : [row]; return builder; },
        upsert: (row: Row | Row[], options: typeof upsertOptions = {}) => { op = 'upsert'; payload = Array.isArray(row) ? row : [row]; upsertOptions = options; return builder; },
        maybeSingle: () => run('maybe'),
        single: () => run('single'),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run('many').then(resolve, reject),
    };
    return builder;
}

const db = {
    from: query,
    rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn !== 'record_external_lead_sync') throw new Error(`Unexpected rpc ${fn}`);
        if (state.fail.rpc) return { data: null, error: state.fail.rpc };
        const rows = (state.tables.external_lead_sync ||= []);
        let saved = rows.find((row) => row.source === args.p_source);
        if (saved?.last_attempt_at && Date.parse(saved.last_attempt_at as string) > Date.parse(args.p_started as string)) return { data: false, error: null };
        if (!saved) { saved = { source: args.p_source, enabled: false, cursor_at: null, last_success_at: null }; rows.push(saved); }
        Object.assign(saved, {
            shop_id: args.p_shop ?? saved.shop_id, project_id: args.p_project ?? saved.project_id,
            cursor_at: args.p_cursor ?? saved.cursor_at, last_attempt_at: args.p_started,
            last_success_at: args.p_error ? saved.last_success_at : 'saved-now', last_error: args.p_error, last_result: args.p_result,
        });
        return { data: true, error: null };
    },
} as unknown as SupabaseClient;

const sourceRow = (index: number, patch: Partial<EventLeadRow> = {}): EventLeadRow => ({
    id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    created_at: '2026-10-04T02:00:00.000Z',
    name: `Харилцагч ${index}`, phone: `9911${String(2200 + index).padStart(4, '0')}`, email: '', message: 'Үнийн санал авъя',
    source: 'elysium/mono#contact', event_name: '', event_slug: '',
    ...patch,
});
const leads = () => state.tables.leads ?? [];
const ledger = () => state.tables.external_lead_imports ?? [];
const activities = () => state.tables.lead_activities ?? [];
const syncState = () => (state.tables.external_lead_sync ?? [])[0];

beforeEach(() => {
    vi.stubEnv('ELYSIUM_SUPABASE_URL', 'https://elysium.example.invalid');
    vi.stubEnv('ELYSIUM_SUPABASE_SERVICE_KEY', 'test-key');
    vi.stubEnv('ELYSIUM_LEAD_PROJECT_ID', PROJECT);
    vi.stubEnv('ELYSIUM_LEAD_SYNC_SECRET', 'push-secret');
    state.tables = {
        projects: [{ id: PROJECT, shop_id: SHOP, name: 'Elysium Residence' }],
        external_lead_sync: [{ source: 'elysium', enabled: true, cursor_at: null, last_attempt_at: null, last_success_at: null }],
    };
    state.fail = {};
    state.insertError = null;
    state.source = [];
    state.sourceError = null;
    state.seq = 0;
    vi.mocked(fetchEventLeads).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('syncElysiumLeads', () => {
    it('imports a request the push never delivered, backdated, keyed by event_leads.id, with a provenance entry', async () => {
        state.source = [sourceRow(1)];
        const result = await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(result).toMatchObject({ status: 'ok', read: 1, pending: 1, imported: 1, matched: 0, invalid: 0, failed: 0, sourceTotal: 1 });
        expect(leads()).toHaveLength(1);
        expect(leads()[0]).toMatchObject({
            shop_id: SHOP, project_id: PROJECT, client_request_id: sourceRow(1).id, source: 'website',
            customer_name: 'Харилцагч 1', customer_phone: '99112201', customer_email: null,
            notes: 'Үнийн санал авъя\n\nСайтын эх сурвалж: elysium/mono#contact',
            created_at: '2026-10-04T02:00:00.000Z', updated_at: '2026-10-04T02:00:00.000Z', stage_changed_at: '2026-10-04T02:00:00.000Z',
        });
        expect(activities()).toEqual([expect.objectContaining({
            lead_id: leads()[0].id, type: 'system', created_by_name: 'Elysium холболт',
            content: 'Elysium сайтаас татаж оруулав: шууд дамжуулалтаар ирээгүй хүсэлт.',
            meta: expect.objectContaining({ source: 'elysium', kind: 'import', source_id: sourceRow(1).id }),
        })]);
        expect(ledger()).toEqual([expect.objectContaining({
            source: 'elysium', source_id: sourceRow(1).id, shop_id: SHOP, project_id: PROJECT, lead_id: leads()[0].id,
            outcome: 'imported', source_name: 'Харилцагч 1', source_created_at: '2026-10-04T02:00:00.000Z',
        })]);
        // Ledger-т утас, и-мэйл хадгалахгүй.
        expect(Object.keys(ledger()[0])).not.toContain('customer_phone');
        expect(syncState()).toMatchObject({ cursor_at: '2026-10-04T03:45:00.000Z', last_error: null, last_success_at: 'saved-now', shop_id: SHOP });
        expect(syncState().last_result).toMatchObject({ trigger: 'cron', imported: 1 });
    });

    it('matches a lead the push already created (formatted phone) and inserts nothing', async () => {
        state.tables.leads = [{
            id: 'pushed', shop_id: SHOP, project_id: PROJECT, client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            customer_phone: '+976 9911-2201', customer_email: null, notes: 'Үнийн санал авъя\n\nСайтын эх сурвалж: elysium/mono#contact',
            created_at: '2026-10-04T02:00:01.000Z', deleted_at: null,
        }];
        state.source = [sourceRow(1)];
        const result = await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(result).toMatchObject({ imported: 0, matched: 1, repeats: 0 });
        expect(leads()).toHaveLength(1);
        expect(activities()).toEqual([]);
        expect(ledger()).toEqual([expect.objectContaining({ outcome: 'matched', lead_id: 'pushed', detail: null })]);
    });

    it('turns retry duplicates in one batch into one lead', async () => {
        state.source = [sourceRow(1), sourceRow(2, { phone: '99112201', created_at: '2026-10-04T02:00:30.000Z' })];
        const result = await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(result).toMatchObject({ imported: 1, matched: 1, repeats: 0 });
        expect(leads()).toHaveLength(1);
        expect(ledger().map((row) => [row.source_id, row.outcome, row.lead_id])).toEqual([
            [sourceRow(1).id, 'imported', leads()[0].id],
            [sourceRow(2).id, 'matched', leads()[0].id],
        ]);
    });

    it('recognizes a lead from the historical backfill by its key and does not log twice', async () => {
        state.tables.leads = [{ id: 'backfilled', shop_id: SHOP, project_id: PROJECT, client_request_id: sourceRow(1).id, customer_phone: '99112201', created_at: '2026-10-04T02:00:00.000Z', deleted_at: null }];
        state.source = [sourceRow(1)];
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ imported: 1, matched: 0 });
        expect(leads()).toHaveLength(1);
        expect(activities()).toEqual([]);
        expect(ledger()).toEqual([expect.objectContaining({ outcome: 'imported', lead_id: 'backfilled' })]);
    });

    it('records a key used by another project as invalid instead of attaching it', async () => {
        state.tables.leads = [{ id: 'other', shop_id: SHOP, project_id: 'other-project', client_request_id: sourceRow(1).id, created_at: '2026-10-04T02:00:00.000Z' }];
        state.source = [sourceRow(1)];
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ invalid: 1, imported: 0 });
        expect(ledger()).toEqual([expect.objectContaining({ outcome: 'invalid', lead_id: null, detail: 'Хүсэлтийн түлхүүр өөр төсөлд ашиглагдсан' })]);
    });

    it('records an unusable row once and a second run imports nothing', async () => {
        state.source = [sourceRow(1), sourceRow(2, { phone: '', email: '' })];
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ imported: 1, invalid: 1 });
        expect(ledger().find((row) => row.outcome === 'invalid')).toMatchObject({ source_id: sourceRow(2).id, detail: 'Утас, и-мэйл хоёул хоосон эсвэл буруу', lead_id: null });

        const again = await syncElysiumLeads(db, { trigger: 'cron', now: new Date(NOW.getTime() + 15 * 60 * 1000) });
        expect(again).toMatchObject({ read: 2, pending: 0, imported: 0, matched: 0, invalid: 0 });
        expect(leads()).toHaveLength(1);
        expect(ledger()).toHaveLength(2);
        expect(syncState().cursor_at).toBe('2026-10-04T04:00:00.000Z');
    });

    it('adds a different message from the same person as a repeat inquiry once, not as a new lead', async () => {
        state.source = [sourceRow(1)];
        await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        const leadId = leads()[0].id;
        state.source.push(sourceRow(2, { phone: '9911 2201', message: '3 өрөөний үнэ хэд вэ?', created_at: '2026-10-04T03:00:00.000Z' }));
        state.source.push(sourceRow(3, { phone: '99112201', message: '3 өрөөний үнэ хэд вэ?', created_at: '2026-10-04T03:10:00.000Z' }));
        const result = await syncElysiumLeads(db, { trigger: 'cron', now: new Date(NOW.getTime() + H) });
        expect(result).toMatchObject({ imported: 0, matched: 2, repeats: 1 });
        expect(leads()).toHaveLength(1);
        const repeats = activities().filter((row) => (row.meta as Row).kind === 'repeat_inquiry');
        expect(repeats).toEqual([expect.objectContaining({
            lead_id: leadId, type: 'system',
            content: 'Elysium сайтаас дахин хүсэлт ирлээ.\n\n3 өрөөний үнэ хэд вэ?\n\nСайтын эх сурвалж: elysium/mono#contact',
        })]);

        // Дараагийн ажиллалт өмнө бичсэн «дахин хүсэлт»-ийг давтахгүй (лидийн тэмдэглэл өөрчлөгдөөгүй ч).
        state.tables.external_lead_imports = ledger().filter((row) => row.source_id !== sourceRow(3).id);
        await syncElysiumLeads(db, { trigger: 'cron', now: new Date(NOW.getTime() + 2 * H) });
        expect(activities().filter((row) => (row.meta as Row).kind === 'repeat_inquiry')).toHaveLength(1);
    });

    it('does not resurrect a lead staff deleted', async () => {
        state.tables.leads = [{ id: 'spam', shop_id: SHOP, project_id: PROJECT, client_request_id: null, customer_phone: '99112201', notes: 'өөр', created_at: '2026-10-04T01:00:00.000Z', deleted_at: '2026-10-04T01:30:00.000Z' }];
        state.source = [sourceRow(1)];
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ imported: 0, matched: 1, repeats: 0 });
        expect(ledger()).toEqual([expect.objectContaining({ outcome: 'matched', lead_id: 'spam', detail: 'Устгасан лидтэй таарсан' })]);
        expect(activities()).toEqual([]);
    });

    it('records a source failure without advancing the cursor', async () => {
        state.tables.external_lead_sync[0].cursor_at = '2026-10-03T00:00:00.000Z';
        state.sourceError = new ElysiumSourceError('Elysium-ийн хүсэлтүүдийг уншиж чадсангүй.');
        await expect(syncElysiumLeads(db, { trigger: 'cron', now: NOW })).rejects.toBeInstanceOf(ElysiumSyncError);
        expect(syncState()).toMatchObject({
            cursor_at: '2026-10-03T00:00:00.000Z', last_error: 'Elysium-ийн хүсэлтүүдийг уншиж чадсангүй.', last_success_at: null,
            last_attempt_at: NOW.toISOString(),
        });
        expect(leads()).toEqual([]);
    });

    it('keeps a transiently failed row out of the ledger and rewinds the cursor before it', async () => {
        state.source = [sourceRow(1)];
        state.insertError = { code: '08006', message: 'connection failure' };
        const result = await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(result).toMatchObject({ status: 'partial', failed: 1, imported: 0 });
        expect(ledger()).toEqual([]);
        expect(syncState()).toMatchObject({ cursor_at: '2026-10-04T01:59:59.999Z', last_error: '1 хүсэлт хадгалагдсангүй; дараагийн ажиллалт дахин оролдоно.' });

        state.insertError = { code: '22001', message: 'value too long' };
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: new Date(NOW.getTime() + 60_000) })).toMatchObject({ status: 'ok', invalid: 1 });
        expect(ledger()).toEqual([expect.objectContaining({ outcome: 'invalid', detail: 'Лид хадгалах боломжгүй (22001)' })]);
    });

    it('fails clearly when the configured project is missing', async () => {
        state.tables.projects = [];
        await expect(syncElysiumLeads(db, { trigger: 'manual', now: NOW })).rejects.toMatchObject({ status: 409 });
        expect(fetchEventLeads).not.toHaveBeenCalled();
    });

    it('skips the cron when not configured or not enabled, but a manual run works while disabled', async () => {
        state.source = [sourceRow(1)];
        state.tables.external_lead_sync[0].enabled = false;
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ status: 'skipped', skipped: 'disabled' });
        expect(fetchEventLeads).not.toHaveBeenCalled();
        expect(await syncElysiumLeads(db, { trigger: 'manual', now: NOW })).toMatchObject({ status: 'ok', imported: 1 });

        vi.stubEnv('ELYSIUM_SUPABASE_SERVICE_KEY', '');
        expect(await syncElysiumLeads(db, { trigger: 'cron', now: NOW })).toMatchObject({ status: 'skipped', skipped: 'not_configured' });
        await expect(syncElysiumLeads(db, { trigger: 'manual', now: NOW })).rejects.toMatchObject({ status: 409 });
    });

    it('dry run counts what would happen and writes nothing', async () => {
        state.source = [sourceRow(1), sourceRow(2, { phone: '99112201', created_at: '2026-10-04T02:01:00.000Z' }), sourceRow(3, { phone: '', email: 'bad', created_at: '2026-10-04T02:02:00.000Z' })];
        const result = await syncElysiumLeads(db, { trigger: 'manual', dryRun: true, now: NOW });
        expect(result).toMatchObject({ dryRun: true, imported: 1, matched: 1, invalid: 1 });
        expect(result.sample.map((row) => row.outcome)).toEqual(['imported', 'matched', 'invalid']);
        expect(leads()).toEqual([]);
        expect(ledger()).toEqual([]);
        expect(activities()).toEqual([]);
        expect(syncState()).toMatchObject({ cursor_at: null, last_attempt_at: null });
    });

    it('processes at most one batch per run and continues from the first unprocessed row', async () => {
        state.source = Array.from({ length: ELYSIUM_MAX_ROWS_PER_RUN + 3 }, (_, index) => sourceRow(index + 1, {
            phone: `88${String(100000 + index)}`, created_at: new Date(Date.parse('2026-10-01T00:00:00.000Z') + index * 60_000).toISOString(),
        }));
        const first = await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(first).toMatchObject({ imported: ELYSIUM_MAX_ROWS_PER_RUN, remaining: 3 });
        const next = state.source[ELYSIUM_MAX_ROWS_PER_RUN].created_at;
        expect(syncState().cursor_at).toBe(new Date(Date.parse(next) - 1).toISOString());
        const second = await syncElysiumLeads(db, { trigger: 'cron', now: new Date(NOW.getTime() + 60_000) });
        expect(second).toMatchObject({ imported: 3, remaining: 0 });
        expect(leads()).toHaveLength(ELYSIUM_MAX_ROWS_PER_RUN + 3);
    });
});

describe('elysiumSyncWindow (UTC server)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'UTC'; });
    afterEach(() => { process.env.TZ = originalTz; });

    it('waits 15 minutes for the push and re-reads one day before the cursor', () => {
        expect(elysiumSyncWindow(new Date('2026-10-04T16:05:00.000Z'), null)).toEqual({ since: null, until: '2026-10-04T15:50:00.000Z' });
        expect(elysiumSyncWindow(new Date('2026-10-04T16:05:00.000Z'), '2026-10-04T15:35:00.000Z'))
            .toEqual({ since: '2026-10-03T15:35:00.000Z', until: '2026-10-04T15:50:00.000Z' });
    });

    it('passes the bounds to the Elysium read', async () => {
        state.tables.external_lead_sync[0].cursor_at = '2026-10-04T03:30:00.000Z';
        await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        expect(fetchEventLeads).toHaveBeenCalledWith({ since: '2026-10-03T03:30:00.000Z', until: '2026-10-04T03:45:00.000Z' });
    });
});

describe('findImportedElysiumDuplicate (push guard)', () => {
    const importLead = () => {
        state.tables.leads = [{ id: 'imported', shop_id: SHOP, project_id: PROJECT, client_request_id: sourceRow(1).id, customer_phone: '99112201', notes: 'Үнийн санал авъя', created_at: '2026-10-02T06:00:00.000Z', deleted_at: null }];
        state.tables.external_lead_imports = [{ source: 'elysium', source_id: sourceRow(1).id, shop_id: SHOP, project_id: PROJECT, lead_id: 'imported', outcome: 'imported', source_created_at: '2026-10-02T06:00:00.000Z' }];
    };
    const input = (patch: Record<string, unknown> = {}) => ({
        shopId: SHOP, projectId: PROJECT, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', phone: '+976 9911 2201', email: null,
        message: 'Үнийн санал авъя', event: null, notes: 'Үнийн санал авъя', now: NOW, ...patch,
    });

    it('returns a lead the pull imported within 72 hours for the same phone', async () => {
        importLead();
        expect(await findImportedElysiumDuplicate(db, input())).toEqual({ leadId: 'imported' });
        expect(activities()).toEqual([]);
        expect(await findImportedElysiumDuplicate(db, input({ phone: '88001122' }))).toBeNull();
        expect(await findImportedElysiumDuplicate(db, input({ now: new Date('2026-10-05T07:00:00.000Z') }))).toBeNull();
    });

    it('records a changed message on the imported lead', async () => {
        importLead();
        expect(await findImportedElysiumDuplicate(db, input({ message: 'Шинэ асуулт', notes: 'Шинэ асуулт' }))).toEqual({ leadId: 'imported' });
        expect(activities()).toEqual([expect.objectContaining({ lead_id: 'imported', type: 'system', content: 'Elysium сайтаас дахин хүсэлт ирлээ.\n\nШинэ асуулт' })]);
    });

    it('lets the normal replay answer a request id that is already stored, and fails open on errors', async () => {
        importLead();
        state.tables.leads.push({ id: 'pushed', shop_id: SHOP, project_id: PROJECT, client_request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: '2026-10-04T03:00:00.000Z' });
        expect(await findImportedElysiumDuplicate(db, input())).toBeNull();
        state.tables.leads.pop();
        state.fail.external_lead_imports = { code: '42P01', message: 'relation does not exist' };
        expect(await findImportedElysiumDuplicate(db, input())).toBeNull();
    });
});

describe('elysiumSyncStatus / setElysiumSyncEnabled', () => {
    it('reports configuration flags, totals and recent rows without secrets', async () => {
        state.source = [sourceRow(1), sourceRow(2, { phone: '', email: '' })];
        await syncElysiumLeads(db, { trigger: 'cron', now: NOW });
        const status = await elysiumSyncStatus(db);
        expect(status).toMatchObject({
            config: { pushConfigured: true, pullConfigured: true }, project: { id: PROJECT, name: 'Elysium Residence' },
            storageReady: true, totals: { imported: 1, matched: 0, invalid: 1 }, settleMinutes: 15,
        });
        expect(status.recent).toHaveLength(2);
        expect(status.invalid).toEqual([expect.objectContaining({ source_id: sourceRow(2).id })]);
        expect(JSON.stringify(status)).not.toContain('test-key');
    });

    it('reports missing storage instead of failing', async () => {
        state.fail.external_lead_sync = { code: '42P01', message: 'relation does not exist' };
        expect(await elysiumSyncStatus(db)).toMatchObject({ storageReady: false, totals: null });
    });

    it('enables only a configured pull, and always allows disabling', async () => {
        expect(await setElysiumSyncEnabled(db, false, 'admin')).toEqual({ enabled: false });
        expect(syncState()).toMatchObject({ enabled: false, updated_by: 'admin' });
        vi.stubEnv('ELYSIUM_SUPABASE_URL', '');
        await expect(setElysiumSyncEnabled(db, true, 'admin')).rejects.toMatchObject({ status: 409 });
    });
});
